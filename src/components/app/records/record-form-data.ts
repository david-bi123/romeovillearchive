import type { RegisterField } from "@/lib/db/schema";

export const RECORD_VALUE_PREFIX = "value:";

export function fieldValueName(fieldId: string): string {
  return `${RECORD_VALUE_PREFIX}${fieldId}`;
}

export function readRecordFormValues(
  fields: RegisterField[],
  formData: FormData,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const name = fieldValueName(field.id);
    if (field.fieldType === "multi_select") {
      input[field.id] = formData.getAll(name).map((entry) => String(entry));
      continue;
    }
    const raw = formData.get(name);
    input[field.id] = raw === null ? "" : String(raw);
  }
  return input;
}

export function readBulkFieldValue(field: RegisterField, formData: FormData): unknown {
  if (field.fieldType === "multi_select") {
    return formData.getAll("value").map((entry) => String(entry));
  }
  const raw = formData.get("value");
  return raw === null ? "" : String(raw);
}

export function splitDefaultValue(fieldType: RegisterField["fieldType"], raw: string | null | undefined): string[] {
  if (!raw) return [];
  if (fieldType !== "multi_select") return [raw];
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function defaultAsBoolean(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string") {
    return ["true", "yes", "y", "1", "on"].includes(raw.trim().toLowerCase());
  }
  return false;
}
