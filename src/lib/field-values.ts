import type { FieldType, RegisterField } from "@/lib/db/schema";

/**
 * Typed value handling for dynamic (user defined) fields.
 *
 * Every value is validated against the field's declared type and stored in the
 * matching typed column of `record_values` — never as an arbitrary string.
 * The same coercion is used by forms, inline edits and the Excel importer so
 * the rules cannot diverge between entry paths.
 */

export type ValueSlot = {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBoolean: boolean | null;
  valueJson: string[] | null;
};

export type CoerceResult =
  | { ok: true; value: ValueSlot }
  | { ok: false; error: string };

export const FIELD_LIMITS: Record<FieldType, number> = {
  text: 1000,
  long_text: 16000,
  integer: 18,
  decimal: 32,
  date: 10,
  datetime: 26,
  boolean: 8,
  select: 1000,
  multi_select: 4000,
  email: 254,
  phone: 40,
  url: 2048,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()\-.]{4,29}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

export function emptySlot(): ValueSlot {
  return {
    valueText: null,
    valueNumber: null,
    valueDate: null,
    valueBoolean: null,
    valueJson: null,
  };
}

export function isSlotEmpty(slot: ValueSlot): boolean {
  return (
    slot.valueText === null &&
    slot.valueNumber === null &&
    slot.valueDate === null &&
    slot.valueBoolean === null &&
    (slot.valueJson === null || slot.valueJson.length === 0)
  );
}

export function isFieldEmpty(field: RegisterField, raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string" && raw.trim() === "") return true;
  if (Array.isArray(raw) && raw.length === 0) return true;
  if (typeof raw === "boolean" && field.fieldType === "boolean") return false;
  return false;
}

export function readSelectOptions(field: RegisterField): string[] {
  const raw = field.options as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "value" in item) {
        return String((item as { value: unknown }).value).trim();
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

/* -------------------------------- parsing -------------------------------- */

/**
 * Parses a date-like cell or string.
 *
 * Accepts Date objects, Excel serial numbers (1900 system), ISO strings and
 * the common `d/m/y` vs `m/d/y` forms. When a numeric string like 01/02/2024
 * is ambiguous and no preference is provided, it is interpreted as DMY (the
 * organisation's locale) and flagged so the importer can surface a warning.
 */
export function parseDateValue(
  input: unknown,
  options: { preferMonthFirst?: boolean } = {},
): { date: Date | null; ambiguous?: boolean; error?: string } {
  if (input === null || input === undefined || input === "") return { date: null };

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return { date: null, error: "Invalid date" };
    return { date: input };
  }

  if (typeof input === "number" && Number.isFinite(input)) {
    // Excel serial date (1900 leap-year bug accounted for by SheetJS epoch math)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(input * 86400000);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return { date: null, error: "Invalid date" };
    return { date };
  }

  const raw = String(input).trim();
  if (!raw) return { date: null };

  // ISO 8601 (with or without time)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso;
    const date = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)),
    );
    if (Number.isNaN(date.getTime())) return { date: null, error: "Invalid date" };
    return { date };
  }

  // d/m/y or m/d/y
  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const [, a, b, yRaw] = slash;
    let year = Number(yRaw);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const first = Number(a);
    const second = Number(b);

    let day: number;
    let month: number;
    const ambiguous = first <= 12 && second <= 12 && first !== second;
    const monthFirst = options.preferMonthFirst ?? false;

    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      month = first;
      day = second;
    } else if (monthFirst) {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { date: null, error: `"${raw}" is not a valid date` };
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    return { date, ambiguous: ambiguous && monthFirst === false && first <= 12 && second <= 12 };
  }

  // Textual formats handled by Date parsing as a last resort
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(raw)) return { date: parsed };

  return { date: null, error: `"${raw}" could not be read as a date` };
}

function parseNumber(input: unknown): { value: number | null; error?: string } {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { value: null, error: "not a finite number" };
    return { value: input };
  }
  const raw = String(input).replace(/,/g, "").trim();
  if (!raw) return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { value: null, error: `"${raw}" is not a number` };
  return { value };
}

function parseBoolean(input: unknown): boolean | null {
  if (typeof input === "boolean") return input;
  const raw = String(input).trim().toLowerCase();
  if (["true", "yes", "y", "1", "active", "ok", "on"].includes(raw)) return true;
  if (["false", "no", "n", "0", "inactive", "off"].includes(raw)) return false;
  if (!raw) return null;
  return null;
}

/* ------------------------------- coercion -------------------------------- */

/**
 * Validates and converts a raw input for a field. Empty input yields a valid
 * empty slot; `required` enforcement happens in `validateFieldInput`.
 */
export function coerceValue(field: RegisterField, raw: unknown): CoerceResult {
  const type: FieldType = field.fieldType;

  if (type === "multi_select") {
    let items: unknown[] = [];
    if (Array.isArray(raw)) items = raw;
    else if (typeof raw === "string" && raw.trim()) {
      items = raw
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean);
    } else if (raw !== null && raw !== undefined && String(raw).trim()) {
      items = [raw];
    }
    const values = items.map((item) => String(item).trim()).filter(Boolean);
    const options = readSelectOptions(field);
    if (options.length > 0) {
      const invalid = values.find((value) => !options.includes(value));
      if (invalid) return { ok: false, error: `"${invalid}" is not one of the available options` };
    }
    if (values.join(", ").length > FIELD_LIMITS.multi_select) {
      return { ok: false, error: `Selection is too long (max ${FIELD_LIMITS.multi_select} characters)` };
    }
    return { ok: true, value: { ...emptySlot(), valueJson: values.length ? values : null } };
  }

  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: true, value: emptySlot() };
  }

  switch (type) {
    case "text":
    case "long_text": {
      const text = String(raw).replace(/\r\n/g, "\n").trim();
      if (text.length > FIELD_LIMITS[type]) {
        return { ok: false, error: `Must be at most ${FIELD_LIMITS[type]} characters` };
      }
      return { ok: true, value: { ...emptySlot(), valueText: text } };
    }
    case "email": {
      const text = String(raw).trim().toLowerCase();
      if (text.length > FIELD_LIMITS.email) return { ok: false, error: "Email address is too long" };
      if (!EMAIL_RE.test(text)) return { ok: false, error: `"${text}" is not a valid email address` };
      return { ok: true, value: { ...emptySlot(), valueText: text } };
    }
    case "phone": {
      const text = String(raw).replace(/[\s()-]/g, "").trim();
      const display = String(raw).trim();
      if (display.length > FIELD_LIMITS.phone) return { ok: false, error: "Phone number is too long" };
      if (!PHONE_RE.test(text)) return { ok: false, error: `"${display}" is not a valid phone number` };
      return { ok: true, value: { ...emptySlot(), valueText: display } };
    }
    case "url": {
      const text = String(raw).trim();
      if (text.length > FIELD_LIMITS.url) return { ok: false, error: "URL is too long" };
      if (!URL_RE.test(text)) return { ok: false, error: `"${text}" is not a valid http(s) URL` };
      return { ok: true, value: { ...emptySlot(), valueText: text } };
    }
    case "select": {
      const text = String(raw).trim();
      const options = readSelectOptions(field);
      if (options.length > 0 && !options.includes(text)) {
        return { ok: false, error: `"${text}" is not one of the available options` };
      }
      if (text.length > FIELD_LIMITS.select) return { ok: false, error: "Selection is too long" };
      return { ok: true, value: { ...emptySlot(), valueText: text } };
    }
    case "integer": {
      const { value, error } = parseNumber(raw);
      if (error) return { ok: false, error: `"${String(raw).trim()}" is not a whole number` };
      if (value === null) return { ok: true, value: emptySlot() };
      if (!Number.isInteger(value)) {
        return { ok: false, error: `"${String(raw).trim()}" is not a whole number` };
      }
      if (!Number.isSafeInteger(value)) return { ok: false, error: "Number is too large" };
      return { ok: true, value: { ...emptySlot(), valueNumber: value } };
    }
    case "decimal": {
      const { value, error } = parseNumber(raw);
      if (error) return { ok: false, error: `"${String(raw).trim()}" is not a valid number` };
      if (value === null) return { ok: true, value: emptySlot() };
      if (Math.abs(value) >= 1e15) return { ok: false, error: "Number is too large" };
      return { ok: true, value: { ...emptySlot(), valueNumber: value } };
    }
    case "date": {
      const parsed = parseDateValue(raw);
      if (parsed.error) return { ok: false, error: parsed.error };
      if (!parsed.date) return { ok: true, value: emptySlot() };
      return {
        ok: true,
        value: { ...emptySlot(), valueDate: startOfUtcDay(parsed.date) },
      };
    }
    case "datetime": {
      const parsed = parseDateValue(raw);
      if (parsed.error) return { ok: false, error: parsed.error };
      if (!parsed.date) return { ok: true, value: emptySlot() };
      return { ok: true, value: { ...emptySlot(), valueDate: parsed.date } };
    }
    case "boolean": {
      const value = parseBoolean(raw);
      if (value === null) {
        return { ok: false, error: `"${String(raw).trim()}" is not a yes/no value` };
      }
      return { ok: true, value: { ...emptySlot(), valueBoolean: value } };
    }
    default:
      return { ok: false, error: "Unsupported field type" };
  }
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/* ---------------------------- record validation --------------------------- */

export type ValidatedValues = {
  slots: ValueSlot[];
  errors: { fieldId: string; message: string }[];
};

/**
 * Validates a complete set of submitted values against a register's fields.
 * Unknown field ids are ignored (mass-assignment protection).
 */
export function validateRecordValues(
  fields: RegisterField[],
  input: Record<string, unknown>,
): ValidatedValues {
  const slots: ValueSlot[] = [];
  const errors: { fieldId: string; message: string }[] = [];

  for (const field of fields) {
    const raw = input[field.id];
    if (raw === undefined) continue;

    if (isFieldEmpty(field, raw)) {
      if (field.required) {
        errors.push({ fieldId: field.id, message: `${field.name} is required` });
        continue;
      }
      if (field.defaultValue && field.defaultValue.length > 0) {
        const fallback = coerceValue(field, field.defaultValue);
        if (fallback.ok) {
          slots.push(fallback.value);
          continue;
        }
      }
      slots.push(emptySlot());
      continue;
    }

    const result = coerceValue(field, raw);
    if (!result.ok) {
      errors.push({ fieldId: field.id, message: `${field.name}: ${result.error}` });
      continue;
    }
    if (field.required && isSlotEmpty(result.value)) {
      errors.push({ fieldId: field.id, message: `${field.name} is required` });
      continue;
    }
    slots.push(result.value);
  }

  return { slots, errors };
}

/** Zod-style record of fieldId -> message, convenient for form error maps. */
export function toErrorMap(errors: { fieldId: string; message: string }[]): Record<string, string> {
  return Object.fromEntries(errors.map((error) => [error.fieldId, error.message]));
}

/* -------------------------------- display -------------------------------- */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatSlotForDisplay(field: RegisterField, slot: ValueSlot): string {
  if (isSlotEmpty(slot)) return "";
  switch (field.fieldType) {
    case "date":
      return slot.valueDate ? DATE_FMT.format(slot.valueDate) : "";
    case "datetime":
      return slot.valueDate ? DATETIME_FMT.format(slot.valueDate) : "";
    case "boolean":
      if (slot.valueBoolean === null) return "";
      return slot.valueBoolean ? "Yes" : "No";
    case "multi_select":
      return (slot.valueJson ?? []).join(", ");
    case "integer":
    case "decimal":
      return slot.valueNumber === null ? "" : String(slot.valueNumber);
    default:
      return slot.valueText ?? "";
  }
}

/** Value for an HTML input of the corresponding type. */
export function slotToFormValue(field: RegisterField, slot: ValueSlot): unknown {
  if (isSlotEmpty(slot)) return field.fieldType === "multi_select" ? [] : "";
  switch (field.fieldType) {
    case "date": {
      if (!slot.valueDate) return "";
      const d = slot.valueDate;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
    case "datetime": {
      if (!slot.valueDate) return "";
      return slot.valueDate.toISOString().slice(0, 16);
    }
    case "boolean":
      return slot.valueBoolean === null ? "" : String(slot.valueBoolean);
    case "multi_select":
      return slot.valueJson ?? [];
    case "integer":
    case "decimal":
      return slot.valueNumber === null ? "" : String(slot.valueNumber);
    default:
      return slot.valueText ?? "";
  }
}

/** Stable text representation used for search text and exports. */
export function slotToPlainString(field: RegisterField, slot: ValueSlot): string {
  if (field.fieldType === "date" && slot.valueDate) {
    return `${slot.valueDate.getUTCFullYear()}-${String(slot.valueDate.getUTCMonth() + 1).padStart(2, "0")}-${String(slot.valueDate.getUTCDate()).padStart(2, "0")}`;
  }
  return formatSlotForDisplay(field, slot);
}

export function compareSlots(a: ValueSlot, b: ValueSlot, type: FieldType): number {
  const aEmpty = isSlotEmpty(a);
  const bEmpty = isSlotEmpty(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // empty values last
  if (bEmpty) return -1;

  switch (type) {
    case "integer":
    case "decimal":
      return (a.valueNumber ?? 0) - (b.valueNumber ?? 0);
    case "boolean":
      return Number(a.valueBoolean ?? false) - Number(b.valueBoolean ?? false);
    case "date":
    case "datetime":
      return (a.valueDate?.getTime() ?? 0) - (b.valueDate?.getTime() ?? 0);
    default:
      return String(a.valueText ?? "").localeCompare(String(b.valueText ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
  }
}
