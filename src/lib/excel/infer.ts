import type { FieldType } from "@/lib/db/schema";
import { fieldKeyFrom, isReservedFieldKey } from "@/lib/utils";
import { parseDateValue } from "@/lib/field-values";

/**
 * Column profiling and type inference used by the import wizard.
 *
 * The suggestions are a starting point the user can correct before anything is
 * written to the database. The inference rules deliberately favour "keep it as
 * text" whenever a value could be an identifier (leading zeros, long digit
 * strings) because silently converting 01234 to 1234 destroys data.
 */

export type ColumnProfile = {
  header: string;
  suggestedKey: string;
  suggestedName: string;
  suggestedType: FieldType;
  suggestedOptions: string[];
  sampleValues: string[];
  totalValues: number;
  blankCount: number;
  distinctCount: number;
  warnings: string[];
  /** True when at least one value had a leading zero or exceeded safe precision. */
  identifierRisk: boolean;
  ambiguousDates: boolean;
  lossyNumbers: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d*(?:\.\d+)?$/;
const URL_RE = /^https?:\/\/\S+$/i;
const PHONE_LIKE_RE = /^\+?\d[\d\s()-]{6,}$/;
const LEADING_ZERO_RE = /^0\d+$/;
const YES = new Set(["yes", "y", "true", "active"]);
const NO = new Set(["no", "n", "false", "inactive"]);

/**
 * Headers that strongly suggest a count/identifier rather than a date.
 * Used to break the tie when a column holds bare spreadsheet numbers, which
 * are otherwise ambiguous between counts (1..102) and Excel serial dates.
 */
const INTEGER_HEADER_HINT = /\b(no\.?|s\/?n|#|count|qty|quantity|number|serial|year|age|index|rank)\b/i;
const DATE_HEADER_HINT = /\b(date|day|received|completed|issued|when|timestamp)\b/i;

/** Excel serial for 1982-01-01: below this, bare numbers are counts, not dates. */
const MODERN_SERIAL_FLOOR = 30000;

const HEADER_TYPE_HINTS: { match: RegExp; type: FieldType }[] = [
  { match: /\b(email|e-mail|mail)\b/i, type: "email" },
  { match: /\b(phone|tel|mobile|contact|whatsapp)\b/i, type: "phone" },
  { match: /\b(url|link|website|site)\b/i, type: "url" },
  { match: /\b(date|day|received|completed|issued|when|timestamp)\b/i, type: "date" },
  { match: /\b(status|state|stage|type|category|kind|classification)\b/i, type: "select" },
  { match: /\b(remarks?|notes?|comments?|description|address|details)\b/i, type: "long_text" },
  { match: /\b(amount|fee|price|total|value|area|quantity|size|balance)\b/i, type: "decimal" },
  { match: /\b(qty|quantity|count|number|no\.?|#)\b/i, type: "integer" },
  { match: /\b(approved|active|paid|done|completed\?)\b/i, type: "boolean" },
];

function text(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

export function inferColumnType(header: string, values: unknown[]): FieldType {
  const nonEmpty = values.filter((value) => text(value) !== "");
  if (nonEmpty.length === 0) {
    const hint = HEADER_TYPE_HINTS.find((entry) => entry.match.test(header));
    return hint ? hint.type : "text";
  }

  const strings = nonEmpty.map((value) => text(value));

  // Identifiers: leading zeros or digit strings too long for exact arithmetic.
  const hasLeadingZero = strings.some((value) => LEADING_ZERO_RE.test(value));
  const overlongDigits = strings.some(
    (value) => INTEGER_RE.test(value) && value.replace(/^-/, "").length > 15,
  );
  if (hasLeadingZero || overlongDigits) return "text";

  // Dates. Genuine Date objects and date-like strings are unambiguous, but
  // bare spreadsheet numbers are treacherous: 5 could be a count or the
  // serial for 1900-01-05, while 45755 is almost certainly a real Excel date.
  // Small numbers, or numbers under a count-like header, are treated as
  // numbers so counts are never silently stored as 1900s dates. The wizard
  // still lets the user override the suggestion either way.
  const hasDateObjects = nonEmpty.some((value) => value instanceof Date);
  const allBareNumbers =
    nonEmpty.length > 0 && nonEmpty.every((value) => typeof value === "number");
  const maxBareNumber = allBareNumbers ? Math.max(...nonEmpty.map((value) => Number(value))) : NaN;
  const numbersArePlausibleDates =
    !allBareNumbers ||
    hasDateObjects ||
    (!INTEGER_HEADER_HINT.test(header) && maxBareNumber >= MODERN_SERIAL_FLOOR);
  const dateHits = nonEmpty.filter((value) => parseDateValue(value).date !== null);
  if (numbersArePlausibleDates && dateHits.length === nonEmpty.length && dateHits.length > 0) {
    const allMidnight = nonEmpty.every((value) => {
      const parsed = parseDateValue(value).date;
      if (!parsed || !(value instanceof Date)) return true;
      return (
        parsed.getUTCHours() === 0 &&
        parsed.getUTCMinutes() === 0 &&
        parsed.getUTCSeconds() === 0 &&
        parsed.getUTCMilliseconds() === 0
      );
    });
    return allMidnight ? "date" : "datetime";
  }

  // Booleans (words only — 0/1 is ambiguous with integers)
  const boolHits = nonEmpty.filter(
    (value) => YES.has(String(value).toLowerCase()) || NO.has(String(value).toLowerCase()),
  );
  if (boolHits.length === nonEmpty.length && nonEmpty.length > 0) return "boolean";

  // Email / URL / phone
  if (nonEmpty.every((value) => EMAIL_RE.test(String(value)))) return "email";
  if (nonEmpty.every((value) => URL_RE.test(String(value)))) return "url";
  if (nonEmpty.every((value) => PHONE_LIKE_RE.test(String(value).replace(/[\s()-]/g, "")))) {
    return "phone";
  }

  // Numbers
  if (nonEmpty.every((value) => INTEGER_RE.test(String(value)))) return "integer";
  if (nonEmpty.every((value) => DECIMAL_RE.test(String(value).replace(/,/g, "")))) {
    return "decimal";
  }

  // Low cardinality strings → select
  const distinct = new Set(strings.map((value) => value.toLowerCase()));
  if (
    nonEmpty.length >= 4 &&
    distinct.size >= 2 &&
    distinct.size <= 20 &&
    distinct.size / nonEmpty.length <= 0.5
  ) {
    return "select";
  }

  const longest = strings.reduce((max, value) => Math.max(max, value.length), 0);
  return longest > 300 ? "long_text" : "text";
}

export function profileColumn(header: string, values: unknown[]): ColumnProfile {
  const nonEmpty = values.filter((value) => text(value) !== "");
  const strings = nonEmpty.map((value) => text(value));
  const warnings: string[] = [];

  const hasLeadingZero = strings.some((value) => LEADING_ZERO_RE.test(value));
  const lossyNumbers = strings.some((value) => {
    if (!INTEGER_RE.test(value)) return false;
    try {
      return BigInt(value).toString() !== value;
    } catch {
      return true;
    }
  });

  const dateResults = nonEmpty.map((value) => parseDateValue(value));
  const ambiguousDates = dateResults.some((result) => result.ambiguous);
  const dateFailures = dateResults.filter(
    (result, index) =>
      result.date === null &&
      strings[index] !== "" &&
      /\d/.test(strings[index]) &&
      /[/.-]/.test(strings[index]),
  );

  if (hasLeadingZero) {
    warnings.push("Values with leading zeros detected — the column is kept as text so identifiers stay intact.");
  }
  if (lossyNumbers) {
    warnings.push("Some numbers exceed 15 digits and may lose precision if stored as numbers — kept as text.");
  }
  const allBareNumbers = nonEmpty.length > 0 && nonEmpty.every((value) => typeof value === "number");
  if (
    allBareNumbers &&
    Math.max(...nonEmpty.map((value) => Number(value))) < MODERN_SERIAL_FLOOR &&
    DATE_HEADER_HINT.test(header)
  ) {
    warnings.push(
      "Small numbers under a date-like name — confirm whether this column holds counts or dates before importing.",
    );
  }
  if (ambiguousDates) {
    warnings.push("Ambiguous day/month order detected — dates are read as day/month/year.");
  }
  if (dateFailures.length > 0) {
    warnings.push(`${dateFailures.length} value(s) look like dates but could not be parsed and will be rejected.`);
  }

  const suggestedType = inferColumnType(header, values);
  const suggestedOptions =
    suggestedType === "select"
      ? Array.from(new Set(strings)).sort((a, b) => a.localeCompare(b)).slice(0, 50)
      : [];

  const taken = new Set<string>();
  const suggestedKey = fieldKeyFrom(header, taken);
  if (isReservedFieldKey(suggestedKey)) {
    warnings.push(`"${header}" collides with a reserved column name and will be renamed automatically.`);
  }

  const distinct = new Set(strings.map((value) => value.toLowerCase()));

  return {
    header,
    suggestedKey,
    suggestedName: header.slice(0, 160),
    suggestedType,
    suggestedOptions,
    sampleValues: strings.slice(0, 5),
    totalValues: nonEmpty.length,
    blankCount: values.length - nonEmpty.length,
    distinctCount: distinct.size,
    warnings,
    identifierRisk: hasLeadingZero || lossyNumbers,
    ambiguousDates,
    lossyNumbers,
  };
}

/* --------------------------------- mapping -------------------------------- */

export type MappingAction = "map" | "create" | "ignore";

export type MappingEntry = {
  excelIndex: number;
  header: string;
  action: MappingAction;
  fieldId: string | null;
  fieldKey: string | null;
  /** Only present for `create` — the field definition to add on import. */
  create: {
    name: string;
    fieldType: FieldType;
    required: boolean;
    options: string[];
    helpText: string | null;
    showInTable: boolean;
    showInCard: boolean;
    editable: boolean;
  } | null;
  notes: string[];
};

export type TargetField = {
  id: string;
  fieldKey: string;
  name: string;
  fieldType: FieldType;
};

/** Normalizes a header so equivalent spellings map to the same field. */
export function normalizeHeaderKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Proposes an initial mapping by comparing spreadsheet headers with the target
 * register's fields using normalized names and stable field keys.
 */
export function proposeMapping(
  headers: string[],
  fields: TargetField[],
  profiles?: ColumnProfile[],
): MappingEntry[] {
  const byKey = new Map<string, TargetField>();
  const byName = new Map<string, TargetField>();
  for (const field of fields) {
    byKey.set(normalizeHeaderKey(field.fieldKey), field);
    byName.set(normalizeHeaderKey(field.name), field);
  }

  const usedFieldIds = new Set<string>();

  return headers.map((header, excelIndex) => {
    const profile = profiles?.[excelIndex];
    const notes: string[] = [...(profile?.warnings ?? [])];
    const normalized = normalizeHeaderKey(header);

    const match =
      byName.get(normalized) ??
      byKey.get(normalized) ??
      fields.find((field) => normalizeHeaderKey(field.name) === normalized) ??
      null;

    if (match && !usedFieldIds.has(match.id)) {
      usedFieldIds.add(match.id);
      if (match.fieldType !== profile?.suggestedType && profile) {
        notes.push(
          `Header suggests ${profile.suggestedType} but the register column is ${match.fieldType} — values will be validated against ${match.fieldType}.`,
        );
      }
      return {
        excelIndex,
        header,
        action: "map" as const,
        fieldId: match.id,
        fieldKey: match.fieldKey,
        create: null,
        notes,
      };
    }

    if (profile) {
      return {
        excelIndex,
        header,
        action: "create" as const,
        fieldId: null,
        fieldKey: profile.suggestedKey,
        create: {
          name: profile.suggestedName,
          fieldType: profile.suggestedType,
          required: false,
          options: profile.suggestedOptions,
          helpText: null,
          showInTable: true,
          showInCard: true,
          editable: true,
        },
        notes,
      };
    }

    return {
      excelIndex,
      header,
      action: "ignore" as const,
      fieldId: null,
      fieldKey: null,
      create: null,
      notes,
    };
  });
}
