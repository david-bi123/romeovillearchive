"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRegisterAccess } from "@/lib/auth/guard";
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
import { toActionState, type ActionState } from "@/server/actions/shared";

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
