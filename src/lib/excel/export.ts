import * as XLSX from "xlsx";
import type { RegisterField } from "@/lib/db/schema";
import { formatSlotForDisplay, type ValueSlot } from "@/lib/field-values";
import { safeFilename } from "@/lib/utils";

/**
 * Export to CSV and XLSX.
 *
 * Security: every string cell is neutralised against spreadsheet formula
 * injection (cells beginning with = + - @ TAB or CR are prefixed with an
 * apostrophe) and only permitted columns are ever emitted — internal ids,
 * versions and authentication data are not exported.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function guardSpreadsheetCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) return `'${text}`;
  // Guard against a leading apostrophe being interpreted as text-escape only
  // when combined with a formula char — already handled above.
  return text;
}

export type ExportColumn = {
  key: string;
  label: string;
  field: RegisterField | null;
};

export type ExportRow = {
  id: string;
  serial: number;
  values: Record<string, ValueSlot>;
  createdAt: Date;
  updatedAt: Date;
};

export function buildExportColumns(fields: RegisterField[], includeMeta: boolean): ExportColumn[] {
  const columns: ExportColumn[] = [];
  if (includeMeta) {
    columns.push({ key: "__serial", label: "S/N", field: null });
  }
  for (const field of fields) {
    columns.push({ key: field.id, label: field.name, field });
  }
  if (includeMeta) {
    columns.push({ key: "__created", label: "Created", field: null });
    columns.push({ key: "__updated", label: "Last updated", field: null });
  }
  return columns;
}

export function rowToCells(columns: ExportColumn[], row: ExportRow): (string | number | Date | boolean | null)[] {
  return columns.map((column) => {
    if (column.key === "__serial") return row.serial;
    if (column.key === "__created") return row.createdAt;
    if (column.key === "__updated") return row.updatedAt;
    if (!column.field) return null;

    const slot = row.values[column.key];
    if (!slot) return null;

    switch (column.field.fieldType) {
      case "integer":
      case "decimal":
        return slot.valueNumber ?? null;
      case "date":
        return slot.valueDate ? formatSlotForDisplay(column.field, slot) : null;
      case "datetime":
        return slot.valueDate ?? null;
      case "boolean":
        return slot.valueBoolean === null ? null : slot.valueBoolean ? "Yes" : "No";
      default:
        return formatSlotForDisplay(column.field, slot) || null;
    }
  });
}

/* ----------------------------------- CSV ---------------------------------- */

export function toCsv(
  columns: ExportColumn[],
  rows: ExportRow[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const guarded = guardSpreadsheetCell(value);
    if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
    return guarded;
  };

  const header = columns.map((column) => escape(column.label)).join(",");
  const body = rows.map((row) => rowToCells(columns, row).map(escape).join(","));
  // UTF-8 BOM so Excel opens the file with correct encoding.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

/* ---------------------------------- XLSX ---------------------------------- */

export function toXlsx(
  columns: ExportColumn[],
  rows: ExportRow[],
  sheetName: string,
): Buffer {
  const aoa: (string | number | Date | boolean | null)[][] = [
    columns.map((column) => guardSpreadsheetCell(column.label)),
    ...rows.map((row) =>
      rowToCells(columns, row).map((cell) => {
        if (typeof cell === "string") return guardSpreadsheetCell(cell);
        return cell;
      }),
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.min(48, Math.max(10, column.label.length + 4)),
  }));
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  const safeSheet = sheetName.replace(/[*:/\\?[\]]/g, "").slice(0, 31) || "Register";
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheet);

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
}

export function exportFilename(registerName: string, kind: "csv" | "xlsx", scope: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = scope ? `-${scope}` : "";
  return safeFilename(`${registerName}${suffix}-${stamp}`, kind === "csv" ? ".csv" : ".xlsx");
}

export type ExportScope = "all" | "filtered" | "selected";

export const EXPORT_SCOPE_LABELS: Record<ExportScope, string> = {
  all: "every record in this register",
  filtered: "the records matching your current search and filters",
  selected: "the records you selected",
};

export { XLSX };
