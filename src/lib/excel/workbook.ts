import * as XLSX from "xlsx";

/**
 * Spreadsheet reading (SheetJS).
 *
 * Workbooks are treated as untrusted input:
 *  - formulas are never executed or evaluated, only their cached values are read;
 *  - HTML cells are not materialized;
 *  - the row/column counts are capped by the caller before any insert happens;
 *  - macros are irrelevant here because we never run them and only accept
 *    .xlsx / .xls / .xlsm data as plain byte streams.
 */

export type SheetSummary = {
  name: string;
  rowCount: number;
  colCount: number;
  empty: boolean;
};

export type ExtractedSheet = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  /** Data rows below the header row, as raw cell values. */
  rows: unknown[][];
  /** 1-based worksheet row number for each entry in `rows`. */
  rowNumbers: number[];
  truncated: boolean;
  warnings: string[];
};

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm"] as const;

export function isAcceptedFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Cheap magic-byte sniff so a renamed .exe cannot enter the parser. */
export function looksLikeSpreadsheet(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const zip = buffer.subarray(0, 4).toString("latin1"); // xlsx / xlsm / xlsb (PK zip)
  if (zip === "PK\u0003\u0004") return true;
  // Legacy OLE2 compound file (.xls)
  const ole = buffer.subarray(0, 8).toString("latin1");
  if (ole.startsWith("\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")) return true;
  return false;
}

export function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellText: true,
    sheetStubs: false,
    dense: false,
  });
}

export function listSheets(workbook: XLSX.WorkBook): SheetSummary[] {
  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const range = worksheet?.["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
    const rowCount = range ? range.e.r - range.s.r + 1 : 0;
    const colCount = range ? range.e.c - range.s.c + 1 : 0;
    return {
      name,
      rowCount,
      colCount,
      empty: rowCount === 0 || colCount === 0,
    };
  });
}

export function sheetInfo(workbook: XLSX.WorkBook, sheetName: string): SheetSummary | null {
  return listSheets(workbook).find((sheet) => sheet.name === sheetName) ?? null;
}

/**
 * Reads the worksheet as an array of arrays.
 * `headerRow` is 1-based and points at the row containing column labels.
 */
export function extractRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  headerRow: number,
  options: { maxRows?: number } = {},
): ExtractedSheet {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet "${sheetName}" was not found in the workbook.`);

  const maxRows = options.maxRows ?? 50_000;
  const warnings: string[] = [];

  const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
  // Physical (0-based) index of the first row returned by sheet_to_json.
  const rangeStartRow = range ? range.s.r : 0;

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
    range: worksheet["!ref"],
  }) as unknown[][];

  const requestedHeaderIndex = Math.max(0, headerRow - 1) - rangeStartRow;
  const headerIndex = Math.min(Math.max(0, requestedHeaderIndex), Math.max(0, matrix.length - 1));
  if (headerIndex !== requestedHeaderIndex) {
    warnings.push("The selected header row is outside the data range, so the first available row was used.");
  }

  const headerSource = matrix[headerIndex] ?? [];
  const headers = normalizeHeaders(headerSource);

  if (headers.every((header) => header === "" || /^Column \d+$/.test(header))) {
    warnings.push(
      "The selected header row appears to contain no labels — check that the header row is set correctly, otherwise the first data row will be treated as column names.",
    );
  }

  const dataSlice = matrix.slice(headerIndex + 1);
  const truncated = dataSlice.length > maxRows;
  const usable = truncated ? dataSlice.slice(0, maxRows) : dataSlice;
  if (truncated) {
    warnings.push(`Only the first ${maxRows} rows are processed; the worksheet contains more rows.`);
  }

  const rows: unknown[][] = [];
  const rowNumbers: number[] = [];
  usable.forEach((row, index) => {
    const physicalRow = rangeStartRow + headerIndex + 2 + index;
    if (isBlankRow(row)) return;
    rows.push(row);
    rowNumbers.push(physicalRow);
  });

  return {
    sheetName,
    headerRow: rangeStartRow + headerIndex + 1,
    headers,
    rows,
    rowNumbers,
    truncated,
    warnings,
  };
}

export function isBlankRow(row: unknown[] | undefined): boolean {
  if (!row) return true;
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

/** Deterministic, collision-safe label for a spreadsheet column. */
export function normalizeHeader(cell: unknown, index: number, seen?: Map<string, number>): string {
  const raw =
    cell === null || cell === undefined
      ? ""
      : String(cell)
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);

  if (!seen) return raw || `Column ${index + 1}`;

  if (!raw) return `Column ${index + 1}`;
  const count = seen.get(raw.toLowerCase()) ?? 0;
  seen.set(raw.toLowerCase(), count + 1);
  return count === 0 ? raw : `${raw} (${count + 1})`;
}

export function normalizeHeaders(cells: unknown[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, index) => normalizeHeader(cell, index, seen));
}

export function readWorkbookRowLimitCheck(buffer: Buffer, maxRows: number): {
  ok: boolean;
  rows: number;
  message?: string;
} {
  try {
    const workbook = readWorkbook(buffer);
    const sheets = listSheets(workbook);
    const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
    if (totalRows > maxRows * 10) {
      return {
        ok: false,
        rows: totalRows,
        message: `The workbook contains about ${totalRows} rows which exceeds the configured limit of ${maxRows} rows per import.`,
      };
    }
    return { ok: true, rows: totalRows };
  } catch (error) {
    return {
      ok: false,
      rows: 0,
      message: error instanceof Error ? error.message : "The file could not be read.",
    };
  }
}

export { XLSX };
