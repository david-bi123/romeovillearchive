"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { forbidden, requireRegisterAccess } from "@/lib/auth/guard";
import {
  archiveRecords,
  bulkSetField,
  createRecord,
  filterRecordIdsForRegister,
  getRecordById,
  restoreRecords,
  updateRecord,
} from "@/server/records";
import {
  readBulkFieldValue,
  readRecordFormValues,
} from "@/components/app/records/record-form-data";
import { bulkSavePayloadSchema, toActionState, type ActionState } from "@/server/actions/shared";

const MAX_BULK_IDS = 500;

function parseIdsCsv(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return [
    ...new Set(
      text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_BULK_IDS);
}

function revalidateRecordPaths(registerId: string, recordId?: string) {
  revalidatePath(`/registers/${registerId}`);
  if (recordId) revalidatePath(`/registers/${registerId}/records/${recordId}`);
  revalidatePath("/registers");
  revalidatePath("/dashboard");
}

export async function createRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    if (!registerId) return { ok: false, message: "Register not found." };

    const { session, fields } = await requireRegisterAccess(registerId, "create");
    const input = readRecordFormValues(fields, formData);
    const result = await createRecord(registerId, fields, input, session);

    if (!result.ok) {
      return {
        ok: false,
        message: result.message ?? "Please fix the highlighted fields.",
        errors: result.errors,
      };
    }

    revalidateRecordPaths(registerId);
    redirect(`/registers/${registerId}/records/${result.recordId}?created=1`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return toActionState(error);
  }
}

export async function updateRecordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    const recordId = String(formData.get("recordId") ?? "");
    if (!registerId || !recordId) return { ok: false, message: "Record not found." };

    const { session, fields } = await requireRegisterAccess(registerId, "edit");

    const existing = await getRecordById(recordId);
    if (!existing || existing.record.registerId !== registerId) {
      return { ok: false, message: "Record not found." };
    }

    const expectedVersion = Number(formData.get("dataVersion"));
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return {
        ok: false,
        message: "This record's version token is missing. Reload the page and try again.",
      };
    }

    const input = readRecordFormValues(fields, formData);
    const result = await updateRecord(recordId, fields, input, expectedVersion, session);

    if (!result.ok) {
      return {
        ok: false,
        message: result.message ?? "Please fix the highlighted fields.",
        errors: result.errors,
      };
    }

    revalidateRecordPaths(registerId, recordId);
    return { ok: true, message: `Record #${result.serial} saved.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function archiveRecordsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    if (!registerId) return { ok: false, message: "Register not found." };

    const { session } = await requireRegisterAccess(registerId, "delete");

    const ids = parseIdsCsv(formData.get("ids"));
    if (ids.length === 0) {
      return { ok: false, message: "Select at least one record to archive." };
    }

    const owned = await filterRecordIdsForRegister(ids, registerId);
    if (owned.length === 0) {
      return { ok: false, message: "None of the selected records belong to this register." };
    }

    const { deleted } = await archiveRecords(owned, session);
    revalidateRecordPaths(registerId);
    return {
      ok: true,
      message: `Moved ${deleted} record${deleted === 1 ? "" : "s"} to the archive.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function restoreRecordsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    if (!registerId) return { ok: false, message: "Register not found." };

    const { session } = await requireRegisterAccess(registerId, "delete");

    const ids = parseIdsCsv(formData.get("ids"));
    if (ids.length === 0) {
      return { ok: false, message: "Select at least one record to restore." };
    }

    const owned = await filterRecordIdsForRegister(ids, registerId);
    if (owned.length === 0) {
      return { ok: false, message: "None of the selected records belong to this register." };
    }

    const { restored } = await restoreRecords(owned, session);
    revalidateRecordPaths(registerId);
    return {
      ok: true,
      message: `Restored ${restored} record${restored === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function bulkSetFieldAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    if (!registerId) return { ok: false, message: "Register not found." };

    const { session, fields } = await requireRegisterAccess(registerId, "edit");

    const ids = parseIdsCsv(formData.get("ids"));
    if (ids.length === 0) {
      return { ok: false, message: "Select at least one record." };
    }

    const fieldId = String(formData.get("fieldId") ?? "");
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      return { ok: false, message: "Choose a valid column to update." };
    }

    const owned = await filterRecordIdsForRegister(ids, registerId);
    if (owned.length === 0) {
      return { ok: false, message: "None of the selected records belong to this register." };
    }

    const rawValue = readBulkFieldValue(field, formData);
    const { updated } = await bulkSetField(owned, field, rawValue, session);
    revalidateRecordPaths(registerId);
    return {
      ok: true,
      message: `Updated "${field.name}" on ${updated} record${updated === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------ bulk save-all ----------------------------- */

/**
 * Saves a whole spreadsheet-style editing session in one call: updated rows
 * (with per-row optimistic concurrency), new rows and archived rows.
 *
 * Every row is validated and applied individually through the same functions
 * as single-record writes, so validation, concurrency and auditing behave
 * identically. Failures are reported per row; successful rows are kept.
 */
export async function bulkSaveRecordsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const registerId = String(formData.get("registerId") ?? "");
    if (!registerId) return { ok: false, message: "Register not found." };

    let payload: z.infer<typeof bulkSavePayloadSchema>;
    try {
      payload = bulkSavePayloadSchema.parse(
        JSON.parse(String(formData.get("payload") ?? "{}")),
      );
    } catch {
      return { ok: false, message: "The changes could not be read. Reload and try again." };
    }

    const changeCount = payload.updates.length + payload.creates.length + payload.deletes.length;
    if (changeCount === 0) return { ok: false, message: "No changes to save." };

    const { session, fields, permissions } = await requireRegisterAccess(registerId);
    if ((payload.updates.length > 0 || payload.creates.length > 0) && !permissions.edit) {
      throw forbidden("You do not have permission to edit records in this register.");
    }
    if (payload.deletes.length > 0 && !permissions.delete) {
      throw forbidden("You do not have permission to remove records from this register.");
    }

    const mentionedIds = [
      ...payload.updates.map((update) => update.recordId),
      ...payload.deletes,
    ];
    const owned = new Set(await filterRecordIdsForRegister(mentionedIds, registerId));

    const errors: Record<string, string> = {};
    let saved = 0;

    for (const update of payload.updates) {
      if (!owned.has(update.recordId)) {
        errors[`update:${update.recordId}`] = "This record does not belong to this register.";
        continue;
      }
      const result = await updateRecord(
        update.recordId,
        fields,
        update.values,
        update.dataVersion,
        session,
      );
      if (result.ok) {
        saved += 1;
      } else if (result.errors && Object.keys(result.errors).length > 0) {
        const first = Object.entries(result.errors)[0];
        const field = fields.find((candidate) => candidate.id === first[0]);
        errors[`update:${update.recordId}`] =
          `${field?.name ?? "A column"}: ${first[1]}`;
      } else {
        errors[`update:${update.recordId}`] =
          result.message ?? "This row could not be saved.";
      }
    }

    payload.creates.forEach(async () => undefined);
    for (const [index, create] of payload.creates.entries()) {
      const result = await createRecord(registerId, fields, create.values, session);
      if (result.ok) {
        saved += 1;
      } else if (result.errors && Object.keys(result.errors).length > 0) {
        const first = Object.entries(result.errors)[0];
        const field = fields.find((candidate) => candidate.id === first[0]);
        errors[`create:${index}`] = `${field?.name ?? "A column"}: ${first[1]}`;
      } else {
        errors[`create:${index}`] =
          result.message ?? "This row could not be added.";
      }
    }

    if (payload.deletes.length > 0) {
      const ownedDeletes = payload.deletes.filter((id) => owned.has(id));
      for (const id of payload.deletes) {
        if (!owned.has(id)) errors[`delete:${id}`] = "This record does not belong to this register.";
      }
      if (ownedDeletes.length > 0) {
        const { deleted } = await archiveRecords(ownedDeletes, session);
        saved += deleted;
      }
    }

    revalidateRecordPaths(registerId);

    const failed = Object.keys(errors).length;
    if (failed === 0) {
      return { ok: true, message: `All ${saved} change${saved === 1 ? "" : "s"} saved.` };
    }
    return {
      ok: false,
      message: `Saved ${saved} change${saved === 1 ? "" : "s"}, ${failed} still need${failed === 1 ? "s" : ""} attention.`,
      errors,
    };
  } catch (error) {
    return toActionState(error);
  }
}
