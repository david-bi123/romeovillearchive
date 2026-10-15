import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db, rawRows } from "@/lib/db";
import { auditLogs, recordValues, records, registerAccess, registerFields, registers, sessions, users } from "@/lib/db/schema";
import { hashToken, generateToken } from "@/lib/auth/tokens";
import type { Session } from "@/lib/auth/session";
import { revokeAllSessions, countActiveSessions, purgeExpiredSessions } from "@/lib/auth/session";
import {
  addField,
  createRegister,
  deleteField,
  deleteRegister,
  getFields,
  getRegisterOrThrow,
  listRegisterGrants,
  listRegisters,
  setRegisterArchived,
  updateField,
  updateRegister,
} from "@/server/registers";
import {
  archiveRecords,
  createRecord,
  getRecordById,
  listRecords,
  restoreRecords,
  updateRecord,
} from "@/server/records";
import { describeWithDb, uniqueId } from "./helpers/db";

/**
 * Full-stack (server module) integration tests.
 *
 * Everything runs against TEST_DATABASE_URL through the same code paths the
 * app uses. Data is identified by fresh UUIDs and removed in afterAll so the
 * suite is idempotent and repeatable.
 */
describeWithDb("server modules against a real database", () => {
  const suffix = uniqueId().slice(0, 8);
  const userId = uniqueId();
  const sessionIds: string[] = [];
  const registerIds: string[] = [];

  const session: Session = {
    id: uniqueId(),
    user: {
      id: userId,
      email: `it-${suffix}@example.test`,
      fullName: "Integration Tester",
      role: "super_admin",
      status: "active",
    },
    expiresAt: new Date(Date.now() + 60_000),
  };

  let mainRegisterId = "";
  let listRegisterId = "";
  const fieldIds: Record<string, string> = {};

  beforeAll(async () => {
    await db.insert(users).values({
      id: userId,
      email: session.user.email,
      fullName: session.user.fullName,
      role: "super_admin",
      status: "active",
    });
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(inArray(auditLogs.registerId, registerIds));
    await db.delete(auditLogs).where(eq(auditLogs.actorUserId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(registers).where(inArray(registers.id, registerIds));
    await db.delete(users).where(eq(users.id, userId));
  });

  /* ------------------------------ user + session ------------------------ */

  it("creates, reads and updates a user row", async () => {
    const [created] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(created.email).toBe(session.user.email);
    expect(created.role).toBe("super_admin");
    expect(created.status).toBe("active");

    await db.update(users).set({ fullName: "Updated Name" }).where(eq(users.id, userId));
    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    expect(updated.fullName).toBe("Updated Name");
  });

  it("tracks session activity and revocation", async () => {
    const token = generateToken();
    await db.insert(sessions).values({
      id: uniqueId(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
      ip: "127.0.0.1",
      userAgent: "vitest",
    });
    sessionIds.push(token);

    expect(await countActiveSessions(userId)).toBe(1);

    await revokeAllSessions(userId);
    expect(await countActiveSessions(userId)).toBe(0);
  });

  it("purges sessions that expired more than a day ago", async () => {
    const expiredId = uniqueId();
    await db.insert(sessions).values({
      id: expiredId,
      userId,
      tokenHash: hashToken(generateToken()),
      expiresAt: new Date(Date.now() - 2 * 86_400_000),
    });

    const removed = await purgeExpiredSessions();
    expect(removed).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(sessions).where(eq(sessions.id, expiredId));
    expect(rows).toHaveLength(0);
  });

  /* -------------------------------- registers --------------------------- */

  it("creates a register with fields, slug and creator access", async () => {
    const name = `IT Main Register ${suffix}`;
    const register = await createRegister(
      {
        name,
        description: "Integration test register",
        fields: [
          { name: "Title", fieldType: "text", required: true, options: [], showInTable: true, showInCard: true, editable: true },
          { name: "Amount", fieldType: "decimal", required: false, options: [], showInTable: true, showInCard: true, editable: true },
          { name: "Status", fieldType: "select", required: false, options: ["Open", "Closed"], showInTable: true, showInCard: true, editable: true },
        ],
      },
      session,
    );
    mainRegisterId = register.id;
    registerIds.push(register.id);

    expect(register.slug).toBe(`it-main-register-${suffix}`);
    expect(register.status).toBe("active");
    expect(register.serialCounter).toBe(0);
    expect(register.recordCount).toBe(0);

    const fields = await getFields(register.id);
    expect(fields.map((f) => f.name)).toEqual(["Title", "Amount", "Status"]);
    expect(fields[0].fieldKey).toBe("title");
    expect(fields.map((f) => f.displayOrder)).toEqual([1, 2, 3]);
    expect(fields[2].options).toEqual(["Open", "Closed"]);

    const grants = await listRegisterGrants(register.id);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ targetType: "user", targetId: userId, canView: true, canCreate: true });

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, register.id));
    expect(audits.some((row) => row.action === "register.created")).toBe(true);
  });

  it("rejects invalid field definitions", async () => {
    await expect(
      createRegister(
        {
          name: `IT Invalid ${suffix}`,
          fields: [{ name: "Status", fieldType: "select", required: false, options: [], showInTable: true, showInCard: true, editable: true }],
        },
        session,
      ),
    ).rejects.toMatchObject({ status: 422, code: "validation" });

    await expect(
      createRegister(
        {
          name: `IT Reserved ${suffix}`,
          fields: [{ name: "ID", fieldType: "text", required: false, options: [], showInTable: true, showInCard: true, editable: true }],
        },
        session,
      ),
    ).rejects.toMatchObject({ status: 422, code: "validation" });
  });

  it("updates register details and writes an audit entry", async () => {
    const updated = await updateRegister(mainRegisterId, { description: "Updated description" }, session);
    expect(updated.description).toBe("Updated description");

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, mainRegisterId));
    expect(audits.some((row) => row.action === "register.updated")).toBe(true);
  });

  it("adds, updates and deletes fields", async () => {
    const added = await addField(
      mainRegisterId,
      { name: "Notes", fieldType: "long_text", required: false, options: [], showInTable: false, showInCard: true, editable: true },
      session,
    );
    expect(added.displayOrder).toBe(4);
    expect(added.fieldKey).toBe("notes");

    const { field: renamed, dataLossRisk } = await updateField(
      mainRegisterId,
      added.id,
      { name: "Notes", fieldType: "long_text", required: true, options: [], showInTable: false, showInCard: true, editable: true },
      session,
    );
    expect(renamed.required).toBe(true);
    expect(dataLossRisk).toBe(false);

    // A type change needs explicit confirmation even with no stored values.
    await expect(
      updateField(
        mainRegisterId,
        added.id,
        { name: "Notes", fieldType: "text", required: true, options: [], showInTable: false, showInCard: true, editable: true },
        session,
      ),
    ).rejects.toMatchObject({ status: 409, code: "type_change_confirmation_required" });

    const removed = await deleteField(mainRegisterId, added.id, session);
    expect(removed).toEqual({ removed: true, affectedValues: 0 });
    const fields = await getFields(mainRegisterId);
    expect(fields.some((f) => f.id === added.id)).toBe(false);
  });

  it("searches and archives registers through listRegisters", async () => {
    const target = await createRegister({ name: `IT Search Target ${suffix}`, fields: [] }, session);
    registerIds.push(target.id);

    const searchToken = `Search Target ${suffix}`;
    const found = await listRegisters({ search: searchToken });
    expect(found.map((r) => r.id)).toEqual([target.id]);
    expect((await listRegisters({ search: `No Such Register ${suffix}` }))).toHaveLength(0);

    await setRegisterArchived(target.id, true, session);
    const active = await listRegisters({ search: searchToken });
    expect(active).toHaveLength(0);
    const withArchived = await listRegisters({ search: searchToken, includeArchived: true });
    expect(withArchived).toHaveLength(1);
    expect(withArchived[0].status).toBe("archived");
    expect(withArchived[0].archivedAt).not.toBeNull();

    await setRegisterArchived(target.id, false, session);
    const restored = await getRegisterOrThrow(target.id);
    expect(restored.status).toBe("active");
    expect(restored.archivedAt).toBeNull();
  });

  /* --------------------------------- records ---------------------------- */

  it("allocates sequential serials when creating records", async () => {
    const fields = await getFields(mainRegisterId);
    const first = await createRecord(
      mainRegisterId,
      fields,
      { [fields[0].id]: "First indenture", [fields[1].id]: 1500.5, [fields[2].id]: "Open" },
      session,
    );
    expect(first).toMatchObject({ ok: true, serial: 1 });

    const second = await createRecord(
      mainRegisterId,
      fields,
      { [fields[0].id]: "Second indenture", [fields[1].id]: 2000, [fields[2].id]: "Closed" },
      session,
    );
    expect(second).toMatchObject({ ok: true, serial: 2 });

    const register = await getRegisterOrThrow(mainRegisterId);
    expect(register.serialCounter).toBe(2);
    expect(register.recordCount).toBe(2);

    fieldIds.title = fields[0].id;
    fieldIds.amount = fields[1].id;
    fieldIds.status = fields[2].id;
  });

  it("refuses to create a record that fails validation", async () => {
    const fields = await getFields(mainRegisterId);
    const result = await createRecord(mainRegisterId, fields, { [fields[0].id]: "" }, session);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[fields[0].id]).toBe("Title is required");
    }
  });

  it("updates a record and bumps dataVersion", async () => {
    const fields = await getFields(mainRegisterId);
    const created = await createRecord(
      mainRegisterId,
      fields,
      { [fields[0].id]: "Versioned record" },
      session,
    );
    if (!created.ok) throw new Error("record should have been created");
    const recordId = created.recordId;

    const before = await getRecordById(recordId);
    expect(before?.record.dataVersion).toBe(1);

    const update = await updateRecord(
      recordId,
      fields,
      { [fields[0].id]: "Versioned record v2" },
      1,
      session,
    );
    expect(update.ok).toBe(true);

    const after = await getRecordById(recordId);
    expect(after?.record.dataVersion).toBe(2);
    expect(after?.values[fields[0].id].valueText).toBe("Versioned record v2");

    // Stale version from a previous editor.
    const stale = await updateRecord(recordId, fields, { [fields[0].id]: "Stale" }, 1, session);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.message).toContain("changed by someone else");
    }
    const unchanged = await getRecordById(recordId);
    expect(unchanged?.values[fields[0].id].valueText).toBe("Versioned record v2");
  });

  it("lets exactly one of two concurrent updates win", async () => {
    const fields = await getFields(mainRegisterId);
    const created = await createRecord(mainRegisterId, fields, { [fields[0].id]: "Race record" }, session);
    if (!created.ok) throw new Error("record should have been created");

    const attempts = await Promise.allSettled([
      updateRecord(created.recordId, fields, { [fields[0].id]: "Race A" }, 1, session),
      updateRecord(created.recordId, fields, { [fields[0].id]: "Race B" }, 1, session),
    ]);

    const winners = attempts.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value.ok,
    );
    expect(winners).toHaveLength(1);

    for (const outcome of attempts) {
      if (outcome.status === "rejected") {
        // The loser may surface as the thrown 409 from the guarded UPDATE.
        expect(outcome.reason).toMatchObject({ status: 409, code: "version_conflict" });
      } else if (!outcome.value.ok) {
        expect(outcome.value.message).toContain("changed by someone else");
      }
    }
  });

  it("archives and restores records, keeping recordCount in sync", async () => {
    const page = await listRecords({ registerId: mainRegisterId, pageSize: 25 }, await getFields(mainRegisterId));
    const serialOne = page.items.find((item) => item.serial === 1);
    const serialTwo = page.items.find((item) => item.serial === 2);
    if (!serialOne || !serialTwo) throw new Error("expected serials 1 and 2");

    const countBefore = (await getRegisterOrThrow(mainRegisterId)).recordCount;
    const archived = await archiveRecords([serialOne.id, serialTwo.id], session);
    expect(archived).toEqual({ deleted: 2 });

    let register = await getRegisterOrThrow(mainRegisterId);
    const countAfterArchive = register.recordCount;
    expect(countAfterArchive).toBe(countBefore - 2);

    const withoutArchived = await listRecords(
      { registerId: mainRegisterId, pageSize: 25 },
      await getFields(mainRegisterId),
    );
    expect(withoutArchived.items.some((item) => item.id === serialOne.id)).toBe(false);

    const withArchived = await listRecords(
      { registerId: mainRegisterId, pageSize: 25, includeArchived: true },
      await getFields(mainRegisterId),
    );
    const archivedItem = withArchived.items.find((item) => item.id === serialOne.id);
    expect(archivedItem?.status).toBe("archived");

    const restored = await restoreRecords([serialOne.id, serialTwo.id], session);
    expect(restored).toEqual({ restored: 2 });

    register = await getRegisterOrThrow(mainRegisterId);
    expect(register.recordCount).toBe(countAfterArchive + 2);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.registerId, mainRegisterId));
    expect(audits.some((row) => row.action === "records.bulk_deleted")).toBe(true);
    expect(audits.some((row) => row.action === "record.restored")).toBe(true);
  });

  /* --------------------------- list / query suite ----------------------- */

  it("paginates, sorts, searches and filters records", async () => {
    const name = `IT List Register ${suffix}`;
    const register = await createRegister(
      {
        name,
        fields: [
          { name: "Label", fieldType: "text", required: false, options: [], showInTable: true, showInCard: true, editable: true },
          { name: "Amount", fieldType: "integer", required: false, options: [], showInTable: true, showInCard: true, editable: true },
        ],
      },
      session,
    );
    listRegisterId = register.id;
    registerIds.push(register.id);

    const fields = await getFields(listRegisterId);
    const labelField = fields.find((f) => f.name === "Label")!;
    const amountField = fields.find((f) => f.name === "Amount")!;

    // 30 records in a single insert — serials 1..30 with searchable text.
    const recordRows = Array.from({ length: 30 }, (_, index) => {
      const serial = index + 1;
      let searchText = `row-${serial}`;
      if (serial === 1) searchText += " 100% pure";
      if (serial === 2) searchText += " a_b";
      if (serial === 3) searchText += " axb";
      return { id: uniqueId(), registerId: listRegisterId, serial, searchText };
    });
    await db.insert(records).values(recordRows);

    const labelValues = recordRows.map((row, index) => ({
      id: uniqueId(),
      recordId: row.id,
      fieldId: labelField.id,
      valueText: `row-${index + 1}`,
    }));
    const amountValues = recordRows.map((row, index) => ({
      id: uniqueId(),
      recordId: row.id,
      fieldId: amountField.id,
      valueNumber: (index + 1) * 10,
    }));
    await db.insert(recordValues).values([...labelValues, ...amountValues]);

    // ---- pagination ----
    const page1 = await listRecords({ registerId: listRegisterId, page: 1, pageSize: 25 }, fields);
    expect(page1.total).toBe(30);
    expect(page1.items).toHaveLength(25);
    expect(page1.pageCount).toBe(2);
    expect(page1.page).toBe(1);

    const page2 = await listRecords({ registerId: listRegisterId, page: 2, pageSize: 25 }, fields);
    expect(page2.items).toHaveLength(5);
    const ids1 = new Set(page1.items.map((item) => item.id));
    expect(page2.items.some((item) => ids1.has(item.id))).toBe(false);

    // Unsupported page sizes fall back to 50; page numbers clamp to >= 1.
    const coerced = await listRecords({ registerId: listRegisterId, pageSize: 7, page: 0 }, fields);
    expect(coerced.pageSize).toBe(50);
    expect(coerced.page).toBe(1);

    // ---- sorting ----
    const asc = await listRecords(
      { registerId: listRegisterId, sort: { key: "serial", dir: "asc" }, pageSize: 25 },
      fields,
    );
    expect(asc.items[0].serial).toBe(1);

    const byField = await listRecords(
      { registerId: listRegisterId, sort: { key: amountField.id, dir: "desc" }, pageSize: 25 },
      fields,
    );
    expect(byField.items[0].values[amountField.id].valueNumber).toBe(300);
    expect(byField.items[0].serial).toBe(30);

    // ---- search (incl. LIKE metacharacter escaping) ----
    const search = await listRecords({ registerId: listRegisterId, search: "row-1", pageSize: 25 }, fields);
    expect(search.total).toBe(11); // row-1, row-10 .. row-19

    const percent = await listRecords({ registerId: listRegisterId, search: "100%" }, fields);
    expect(percent.total).toBe(1);

    const underscore = await listRecords({ registerId: listRegisterId, search: "a_b" }, fields);
    expect(underscore.total).toBe(1); // literal a_b, not axb

    const miss = await listRecords({ registerId: listRegisterId, search: "no-such-token" }, fields);
    expect(miss.total).toBe(0);

    // ---- field filters ----
    const gte = await listRecords(
      { registerId: listRegisterId, filters: [{ fieldId: amountField.id, op: "gte", value: "250" }] },
      fields,
    );
    expect(gte.total).toBe(6); // amounts 250..300

    const eq = await listRecords(
      { registerId: listRegisterId, filters: [{ fieldId: labelField.id, op: "eq", value: "row-7" }] },
      fields,
    );
    expect(eq.total).toBe(1);
    expect(eq.items[0].serial).toBe(7);

    const contains = await listRecords(
      { registerId: listRegisterId, filters: [{ fieldId: labelField.id, op: "contains", value: "row-1" }] },
      fields,
    );
    expect(contains.total).toBe(11);
  });

  /* ------------------------------- deletion ----------------------------- */

  it("deletes an empty register outright and refuses one with records", async () => {
    const empty = await createRegister({ name: `IT Empty ${suffix}`, fields: [] }, session);
    registerIds.push(empty.id);
    expect(await deleteRegister(empty.id, session, {})).toEqual({ deleted: true });

    // The main register still holds records: force is required (super admin).
    await expect(deleteRegister(mainRegisterId, session, {})).rejects.toMatchObject({
      status: 409,
      code: "records_exist",
    });

    expect(await deleteRegister(mainRegisterId, session, { force: true })).toEqual({
      deleted: true,
    });
    // Already gone — cleanup's batch delete simply skips it.
    await expect(getRegisterOrThrow(mainRegisterId)).rejects.toMatchObject({ status: 404 });
  });

  it("leaves no orphaned rows behind after register deletion", async () => {
    const leftover = await rawRows<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM record_values v
          INNER JOIN register_fields f ON f.id = v.field_id
          WHERE f.register_id = ${mainRegisterId}`,
    );
    expect(Number(leftover[0]?.n ?? 0)).toBe(0);

    const accessRows = await db
      .select()
      .from(registerAccess)
      .where(eq(registerAccess.registerId, mainRegisterId));
    expect(accessRows).toHaveLength(0);

    const fieldRows = await db
      .select()
      .from(registerFields)
      .where(eq(registerFields.registerId, mainRegisterId));
    expect(fieldRows).toHaveLength(0);
  });
});
