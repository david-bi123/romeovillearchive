import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, rawCount, rawRows } from "@/lib/db";
import {
  registerAccess,
  registerFields,
  registers,
  records,
  type Register,
  type RegisterField,
} from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { fieldKeyFrom, isReservedFieldKey, slugify, titleCase } from "@/lib/utils";
import type { Session } from "@/lib/auth/session";
import { AppError } from "@/lib/auth/guard";
import { FIELD_TYPES } from "@/lib/db/schema";

/* --------------------------------- zod ---------------------------------- */

export const selectOptionSchema = z
  .string()
  .trim()
  .min(1, "Option cannot be empty")
  .max(120, "Option must be at most 120 characters");

export const fieldInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  fieldType: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  helpText: z.string().trim().max(300).optional().nullable(),
  defaultValue: z.string().max(500).optional().nullable(),
  options: z.array(selectOptionSchema).max(500).optional().default([]),
  showInTable: z.boolean().default(true),
  showInCard: z.boolean().default(true),
  editable: z.boolean().default(true),
});

export type FieldInput = z.infer<typeof fieldInputSchema>;

export const registerInputSchema = z.object({
  name: z.string().trim().min(2, "Register name must be at least 2 characters").max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  icon: z.string().trim().max(64).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value such as #0F5132")
    .optional()
    .nullable(),
  defaultStatus: z.string().trim().max(120).optional().nullable(),
  fields: z.array(fieldInputSchema).max(120).optional().default([]),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

/* ------------------------------ slug helpers ----------------------------- */

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = await db
      .select({ id: registers.id })
      .from(registers)
      .where(eq(registers.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}-${suffix++}`;
    if (suffix > 500) throw new AppError("Could not allocate a unique register address", 409, "conflict");
  }
}

function validateFieldDefinition(input: FieldInput, taken: Set<string>): { key: string } {
  if (input.fieldType === "select" || input.fieldType === "multi_select") {
    if (!input.options || input.options.length === 0) {
      throw new AppError(`"${input.name}" needs at least one option`, 422, "validation");
    }
    const unique = new Set(input.options.map((option) => option.trim()));
    if (unique.size !== input.options.length) {
      throw new AppError(`"${input.name}" has duplicate options`, 422, "validation");
    }
  }
  const provisionalKey = fieldKeyFrom(input.name, new Set());
  if (isReservedFieldKey(provisionalKey)) {
    throw new AppError(
      `"${input.name}" cannot be used because it collides with a reserved column name`,
      422,
      "validation",
    );
  }
  const key = fieldKeyFrom(input.name, taken);
  if (taken.has(key)) {
    throw new AppError(`Duplicate column name "${input.name}"`, 422, "validation");
  }
  taken.add(key);
  return { key };
}

/* --------------------------------- create -------------------------------- */

export async function createRegister(input: RegisterInput, session: Session): Promise<Register> {
  const taken = new Set<string>();
  for (const field of input.fields) {
    validateFieldDefinition(field, taken);
  }

  const slug = await uniqueSlug(input.name);
  const registerId = crypto.randomUUID();

  await db.insert(registers).values({
    id: registerId,
    name: input.name,
    slug,
    description: input.description ?? null,
    category: input.category ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    createdByUserId: session.user.id,
  });

  let order = 1;
  for (const field of input.fields) {
    await insertField(registerId, field, order++);
  }

  // The creator always retains access to what they created.
  await db.insert(registerAccess).values({
    id: crypto.randomUUID(),
    registerId,
    targetType: "user",
    targetId: session.user.id,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canImport: true,
    canExport: true,
    createdByUserId: session.user.id,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.REGISTER_CREATED,
    entityType: "register",
    entityId: registerId,
    registerId,
    summary: `Created register "${input.name}"`,
    metadata: { fields: input.fields.map((field) => ({ name: field.name, type: field.fieldType })) },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  const created = await db.select().from(registers).where(eq(registers.id, registerId)).limit(1);
  return created[0];
}

async function insertField(registerId: string, field: FieldInput, order: number): Promise<string> {
  const existing = await db
    .select({ key: registerFields.fieldKey })
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId));
  const taken = new Set(existing.map((row) => row.key));
  const { key } = validateFieldDefinition(field, taken);

  const id = crypto.randomUUID();
  await db.insert(registerFields).values({
    id,
    registerId,
    fieldKey: key,
    name: field.name,
    fieldType: field.fieldType,
    required: field.required,
    helpText: field.helpText ?? null,
    options: (field.options?.length ? field.options : null) as never,
    defaultValue: field.defaultValue ?? null,
    displayOrder: order,
    showInTable: field.showInTable,
    showInCard: field.showInCard,
    editable: field.editable,
  });
  return id;
}

/* --------------------------------- update -------------------------------- */

export async function updateRegister(
  registerId: string,
  patch: Partial<Pick<RegisterInput, "name" | "description" | "category" | "icon" | "color">>,
  session: Session,
): Promise<Register> {
  const existing = await getRegisterOrThrow(registerId);
  const values: Partial<typeof registers.$inferInsert> = {};
  if (patch.name !== undefined && patch.name !== existing.name) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.icon !== undefined) values.icon = patch.icon;
  if (patch.color !== undefined) values.color = patch.color;

  if (Object.keys(values).length > 0) {
    await db.update(registers).set(values).where(eq(registers.id, registerId));
  }

  await recordAudit({
    action: AUDIT_ACTIONS.REGISTER_UPDATED,
    entityType: "register",
    entityId: registerId,
    registerId,
    summary: `Updated register "${existing.name}"`,
    metadata: { changed: Object.keys(values), before: { name: existing.name }, after: { name: values.name ?? existing.name } },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return getRegisterOrThrow(registerId);
}

export async function setRegisterArchived(
  registerId: string,
  archived: boolean,
  session: Session,
): Promise<Register> {
  const register = await getRegisterOrThrow(registerId);
  await db
    .update(registers)
    .set(
      archived
        ? { status: "archived", archivedAt: new Date() }
        : { status: "active", archivedAt: null },
    )
    .where(eq(registers.id, registerId));

  await recordAudit({
    action: archived ? AUDIT_ACTIONS.REGISTER_ARCHIVED : AUDIT_ACTIONS.REGISTER_RESTORED,
    entityType: "register",
    entityId: registerId,
    registerId,
    summary: `${archived ? "Archived" : "Restored"} register "${register.name}"`,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return getRegisterOrThrow(registerId);
}

/**
 * Permanent deletion. Refuses while records still exist unless `force` is set
 * by a super administrator who explicitly confirms, and never touches
 * unrelated registers (foreign keys are scoped to the register only).
 */
export async function deleteRegister(
  registerId: string,
  session: Session,
  options: { force?: boolean },
): Promise<{ deleted: true }> {
  const register = await getRegisterOrThrow(registerId);
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(records)
    .where(eq(records.registerId, registerId));
  const total = Number(count ?? 0);

  if (total > 0 && !options.force) {
    throw new AppError(
      `This register still contains ${total} record${total === 1 ? "" : "s"}. Archive it instead, or confirm permanent deletion.`,
      409,
      "records_exist",
    );
  }
  if (total > 0 && session.user.role !== "super_admin") {
    throw new AppError("Only the super administrator can permanently delete registers with records.", 403, "forbidden");
  }

  await db.delete(registers).where(eq(registers.id, registerId));

  await recordAudit({
    action: AUDIT_ACTIONS.REGISTER_DELETED,
    entityType: "register",
    entityId: registerId,
    registerId,
    summary: `Permanently deleted register "${register.name}" (${total} records)`,
    metadata: { name: register.name, records: total },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { deleted: true };
}

/** Duplicates the structure (fields + permissions) without copying records. */
export async function duplicateRegister(
  registerId: string,
  session: Session,
  nameSuffix = " (copy)",
): Promise<Register> {
  const source = await getRegisterOrThrow(registerId);
  const fields = await getFields(registerId);

  const newRegister = await createRegister(
    {
      name: `${source.name}${nameSuffix}`.slice(0, 160),
      description: source.description,
      category: source.category,
      icon: source.icon,
      color: source.color,
      defaultStatus: null,
      fields: fields.map((field) => ({
        name: field.name,
        fieldType: field.fieldType,
        required: field.required,
        helpText: field.helpText,
        defaultValue: field.defaultValue,
        options: (field.options as string[] | null) ?? [],
        showInTable: field.showInTable,
        showInCard: field.showInCard,
        editable: field.editable,
      })),
    },
    session,
  );

  return newRegister;
}

/* --------------------------------- fields -------------------------------- */

export const updateFieldSchema = fieldInputSchema.extend({
  showInTable: z.boolean(),
  showInCard: z.boolean(),
  editable: z.boolean(),
});

export async function addField(
  registerId: string,
  input: FieldInput,
  session: Session,
): Promise<RegisterField> {
  await getRegisterOrThrow(registerId);
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${registerFields.displayOrder}), 0)` })
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId));

  const id = await insertField(registerId, input, Number(maxOrder ?? 0) + 1);

  await recordAudit({
    action: AUDIT_ACTIONS.FIELD_ADDED,
    entityType: "field",
    entityId: id,
    registerId,
    summary: `Added column "${input.name}"`,
    metadata: { name: input.name, type: input.fieldType, required: input.required },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  const created = await db.select().from(registerFields).where(eq(registerFields.id, id)).limit(1);
  return created[0];
}

export async function updateField(
  registerId: string,
  fieldId: string,
  input: FieldInput,
  session: Session,
  options: { allowTypeChange?: boolean } = {},
): Promise<{ field: RegisterField; dataLossRisk: boolean }> {
  const existing = await getFieldOrThrow(registerId, fieldId);
  const typeChanged = existing.fieldType !== input.fieldType;
  const optionsChanged =
    JSON.stringify((existing.options as string[] | null) ?? []) !==
    JSON.stringify(input.options ?? []);

  if (typeChanged && !options.allowTypeChange) {
    const impacted = await countValuesForField(fieldId);
    throw new AppError(
      `Changing "${existing.name}" from ${existing.fieldType} to ${input.fieldType} affects ${impacted} stored value${impacted === 1 ? "" : "s"} and cannot be undone automatically. Confirm the conversion to continue.`,
      409,
      "type_change_confirmation_required",
    );
  }

  if (typeChanged || optionsChanged) {
    const problems = await auditExistingValuesForConversion(existing, input);
    if (problems.length > 0 && !options.allowTypeChange) {
      throw new AppError(
        `Conversion would reject ${problems.length} existing value${problems.length === 1 ? "" : "s"} (for example: ${problems[0]}). Confirm to continue.`,
        409,
        "type_change_confirmation_required",
      );
    }
  }

  const taken = new Set<string>();
  validateFieldDefinition(input, taken);

  await db
    .update(registerFields)
    .set({
      name: input.name,
      fieldType: input.fieldType,
      required: input.required,
      helpText: input.helpText ?? null,
      options: (input.options?.length ? input.options : null) as never,
      defaultValue: input.defaultValue ?? null,
      showInTable: input.showInTable,
      showInCard: input.showInCard,
      editable: input.editable,
    })
    .where(eq(registerFields.id, fieldId));

  await recordAudit({
    action: AUDIT_ACTIONS.FIELD_UPDATED,
    entityType: "field",
    entityId: fieldId,
    registerId,
    summary: `Updated column "${existing.name}"`,
    metadata: {
      before: { name: existing.name, type: existing.fieldType, required: existing.required },
      after: { name: input.name, type: input.fieldType, required: input.required },
    },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  const updated = await db.select().from(registerFields).where(eq(registerFields.id, fieldId)).limit(1);
  return { field: updated[0], dataLossRisk: typeChanged };
}

/**
 * Removes a column. Existing values are archived in the audit metadata (small
 * sample) and the physical values are removed with the field — the register
 * itself and every other column are untouched.
 */
export async function deleteField(
  registerId: string,
  fieldId: string,
  session: Session,
): Promise<{ removed: true; affectedValues: number }> {
  const field = await getFieldOrThrow(registerId, fieldId);
  const affected = await countValuesForField(fieldId);

  await db.delete(registerFields).where(eq(registerFields.id, fieldId));

  await recordAudit({
    action: AUDIT_ACTIONS.FIELD_DELETED,
    entityType: "field",
    entityId: fieldId,
    registerId,
    summary: `Deleted column "${field.name}" (values discarded: ${affected})`,
    metadata: {
      name: field.name,
      type: field.fieldType,
      affectedValues: affected,
      reversible: false,
    },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { removed: true, affectedValues: affected };
}

export async function reorderFields(
  registerId: string,
  orderedFieldIds: string[],
  session: Session,
): Promise<void> {
  await getRegisterOrThrow(registerId);
  const existing = await getFields(registerId);
  const existingIds = new Set(existing.map((field) => field.id));
  if (
    orderedFieldIds.length !== existing.length ||
    orderedFieldIds.some((id) => !existingIds.has(id))
  ) {
    throw new AppError("Column order must list every column exactly once", 422, "validation");
  }

  let order = 1;
  for (const id of orderedFieldIds) {
    await db.update(registerFields).set({ displayOrder: order++ }).where(eq(registerFields.id, id));
  }

  await recordAudit({
    action: AUDIT_ACTIONS.FIELD_UPDATED,
    entityType: "register",
    entityId: registerId,
    registerId,
    summary: "Reordered columns",
    metadata: { order: orderedFieldIds },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });
}

async function countValuesForField(fieldId: string): Promise<number> {
  return rawCount(sql`SELECT COUNT(*) AS count FROM record_values WHERE field_id = ${fieldId}`);
}

async function auditExistingValuesForConversion(
  field: RegisterField,
  next: FieldInput,
): Promise<string[]> {
  const rows = await rawRows<{ value_text: string | null }>(
    sql`SELECT value_text FROM record_values WHERE field_id = ${field.id} AND value_text IS NOT NULL LIMIT 500`,
  );

  const { coerceValue } = await import("@/lib/field-values");
  const problems: string[] = [];
  for (const row of rows) {
    const value = row.value_text;
    if (!value) continue;
    const probe = { ...field, fieldType: next.fieldType, options: (next.options ?? null) as never };
    const result = coerceValue(probe, value);
    if (!result.ok && problems.length < 5) problems.push(value);
  }
  return problems;
}

/* --------------------------------- reads --------------------------------- */

export async function getRegisterOrThrow(registerId: string, includeArchived = true): Promise<Register> {
  const rows = await db
    .select()
    .from(registers)
    .where(includeArchived ? eq(registers.id, registerId) : and(eq(registers.id, registerId), eq(registers.status, "active")))
    .limit(1);
  const register = rows[0];
  if (!register) throw new AppError("Register not found", 404, "not_found");
  return register;
}

export async function getFields(registerId: string): Promise<RegisterField[]> {
  return db
    .select()
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId))
    .orderBy(asc(registerFields.displayOrder), asc(registerFields.id));
}

export async function getFieldOrThrow(
  registerId: string,
  fieldId: string,
): Promise<RegisterField> {
  const rows = await db
    .select()
    .from(registerFields)
    .where(and(eq(registerFields.id, fieldId), eq(registerFields.registerId, registerId)))
    .limit(1);
  const field = rows[0];
  if (!field) throw new AppError("Column not found in this register", 404, "not_found");
  return field;
}

export async function listRegisters(options: {
  includeArchived?: boolean;
  search?: string;
  category?: string;
} = {}): Promise<Register[]> {
  const conditions = [];
  if (!options.includeArchived) conditions.push(eq(registers.status, "active"));
  if (options.search) {
    const term = `%${options.search.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(sql`${registers.name} LIKE ${term}`);
  }
  if (options.category) conditions.push(eq(registers.category, options.category));

  const where = conditions.length ? and(...conditions) : undefined;
  return db
    .select()
    .from(registers)
    .where(where)
    .orderBy(desc(registers.updatedAt), asc(registers.name));
}

export async function getRegistersWithCounts(options: {
  includeArchived?: boolean;
  search?: string;
  userId: string;
  role: string;
}): Promise<(Register & { fieldCount: number })[]> {
  const list = await listRegisters({
    includeArchived: options.includeArchived,
    search: options.search,
  });

  if (list.length === 0) return [];

  const fieldCounts = await db
    .select({ registerId: registerFields.registerId, count: sql<number>`COUNT(*)` })
    .from(registerFields)
    .where(sql`register_id IN (${sql.join(
      list.map((register) => sql`${register.id}`),
      sql`, `,
    )})`)
    .groupBy(registerFields.registerId);

  const countsByRegister = new Map(fieldCounts.map((row) => [row.registerId, Number(row.count)]));
  return list.map((register) => ({
    ...register,
    fieldCount: countsByRegister.get(register.id) ?? 0,
  }));
}

/* ------------------------------- access rows ------------------------------ */

export async function setRegisterGrant(
  registerId: string,
  grant: { targetType: "role" | "user"; targetId: string; permissions: Record<string, boolean> },
  session: Session,
): Promise<void> {
  await getRegisterOrThrow(registerId);

  const existing = await db
    .select({ id: registerAccess.id })
    .from(registerAccess)
    .where(
      and(
        eq(registerAccess.registerId, registerId),
        eq(registerAccess.targetType, grant.targetType),
        eq(registerAccess.targetId, grant.targetId),
      ),
    )
    .limit(1);

  const values = {
    canView: grant.permissions.view ?? false,
    canCreate: grant.permissions.create ?? false,
    canEdit: grant.permissions.edit ?? false,
    canDelete: grant.permissions.delete ?? false,
    canImport: grant.permissions.import ?? false,
    canExport: grant.permissions.export ?? false,
    createdByUserId: session.user.id,
  };

  if (existing[0]) {
    await db.update(registerAccess).set(values).where(eq(registerAccess.id, existing[0].id));
  } else {
    await db.insert(registerAccess).values({
      id: crypto.randomUUID(),
      registerId,
      targetType: grant.targetType,
      targetId: grant.targetId,
      ...values,
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.ACCESS_GRANT_CHANGED,
    entityType: "register_access",
    entityId: registerId,
    registerId,
    summary: `Updated access for ${grant.targetType} ${grant.targetId}`,
    metadata: { grant },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });
}

export async function listRegisterGrants(registerId: string) {
  return db.select().from(registerAccess).where(eq(registerAccess.registerId, registerId));
}

export function humanizeFieldKey(key: string): string {
  return titleCase(key);
}


