import { describe, expect, it } from "vitest";
import {
  XLSX,
  extractRows,
  isAcceptedFilename,
  isBlankRow,
  listSheets,
  looksLikeSpreadsheet,
  normalizeHeaders,
  readWorkbook,
  readWorkbookRowLimitCheck,
} from "@/lib/excel/workbook";

function buildWorkbook(aoa: unknown[][]): ReturnType<typeof readWorkbook> {
  const sheet = XLSX.utils.aoa_to_sheet(aoa as never[][]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return readWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

describe("isAcceptedFilename", () => {
  it("accepts xlsx / xls / xlsm case-insensitively and nothing else", () => {
    expect(isAcceptedFilename("book.xlsx")).toBe(true);
    expect(isAcceptedFilename("BOOK.XLSX")).toBe(true);
    expect(isAcceptedFilename("book.xls")).toBe(true);
    expect(isAcceptedFilename("book.xlsm")).toBe(true);
    expect(isAcceptedFilename("book.csv")).toBe(false);
    expect(isAcceptedFilename("book.exe")).toBe(false);
    expect(isAcceptedFilename("xlsx")).toBe(false);
    expect(isAcceptedFilename("book.xlsx.bak")).toBe(false);
  });
});

describe("looksLikeSpreadsheet", () => {
  it("recognises the ZIP magic bytes of xlsx/xlsm files", () => {
    const zip = Buffer.concat([Buffer.from("PK\u0003\u0004", "latin1"), Buffer.from("rest")]);
    expect(looksLikeSpreadsheet(zip)).toBe(true);
  });

  it("recognises legacy OLE2 compound files (.xls)", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x01]);
    expect(looksLikeSpreadsheet(ole)).toBe(true);
  });

  it("rejects executables, text and tiny buffers", () => {
    expect(looksLikeSpreadsheet(Buffer.from("MZ\u0090\u0000windows-pe"))).toBe(false);
    expect(looksLikeSpreadsheet(Buffer.from("just some text, long enough"))).toBe(false);
    expect(looksLikeSpreadsheet(Buffer.from("PK"))).toBe(false);
  });
});

describe("readWorkbook / listSheets", () => {
  it("round-trips a workbook written in memory", () => {
    const workbook = buildWorkbook([
      ["Name", "Amount"],
      ["Alice", 10],
      ["Bob", 20],
    ]);
    expect(workbook.SheetNames).toEqual(["Sheet1"]);

    const sheets = listSheets(workbook);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ name: "Sheet1", rowCount: 3, colCount: 2, empty: false });
  });

  it("reports sheets without a used range as empty", () => {
    const workbook = buildWorkbook([[]]);
    expect(listSheets(workbook)[0].empty).toBe(true);
  });
});

describe("extractRows", () => {
  const aoa = [
    ["Title", "Email", "Email", "Amount"],
    ["First", "a@example.com", "b@example.com", 10],
    [],
    ["Second", "c@example.com", "d@example.com", 20],
  ];

  it("reads headers from the requested header row and skips blank rows", () => {
    const result = extractRows(buildWorkbook(aoa), "Sheet1", 1);
    expect(result.headerRow).toBe(1);
    expect(result.headers).toEqual(["Title", "Email", "Email (2)", "Amount"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rowNumbers).toEqual([2, 4]); // physical worksheet rows, blank row 3 skipped
    expect(result.truncated).toBe(false);
  });

  it("honours a header row below row 1", () => {
    const result = extractRows(buildWorkbook(aoa), "Sheet1", 2);
    expect(result.headerRow).toBe(2);
    expect(result.headers).toEqual(["First", "a@example.com", "b@example.com", "10"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rowNumbers).toEqual([4]);
  });

  it("clamps a header row outside the data range and warns", () => {
    const result = extractRows(buildWorkbook(aoa), "Sheet1", 99);
    expect(result.warnings.some((w) => w.includes("outside the data range"))).toBe(true);
    expect(result.headerRow).toBeLessThanOrEqual(4);
  });

  it("warns when the selected header row contains no labels", () => {
    const result = extractRows(buildWorkbook([[null, null], ["a", "b"]]), "Sheet1", 1);
    expect(result.headers).toEqual(["Column 1", "Column 2"]);
    expect(result.warnings.some((w) => w.includes("no labels"))).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it("truncates at maxRows and says so", () => {
    const result = extractRows(buildWorkbook(aoa), "Sheet1", 1, { maxRows: 1 });
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("Only the first 1 rows"))).toBe(true);
  });

  it("throws for an unknown sheet", () => {
    expect(() => extractRows(buildWorkbook(aoa), "Missing", 1)).toThrow(/not found/);
  });
});

describe("normalizeHeaders", () => {
  it("collapses whitespace, falls back to Column N and de-duplicates", () => {
    expect(normalizeHeaders(["  First   Name  ", null, undefined, "First Name"])).toEqual([
      "First Name",
      "Column 2",
      "Column 3",
      "First Name (2)",
    ]);
    expect(normalizeHeaders(["name", "NAME"])).toEqual(["name", "NAME (2)"]);
  });
});

describe("isBlankRow", () => {
  it("treats null, undefined and whitespace-only cells as blank", () => {
    expect(isBlankRow([])).toBe(true);
    expect(isBlankRow([null, undefined])).toBe(true);
    expect(isBlankRow(["  ", ""])).toBe(true);
    expect(isBlankRow(["a", null])).toBe(false);
    expect(isBlankRow(undefined)).toBe(true);
  });
});

describe("readWorkbookRowLimitCheck", () => {
  it("accepts workbooks within the row budget", () => {
    const rows: unknown[][] = [["Header"], ...Array.from({ length: 5 }, (_, i) => [`row ${i}`])];
    const result = readWorkbookRowLimitCheck(buildBuffer(rows), 100);
    expect(result).toEqual({ ok: true, rows: 6 });
  });

  it("rejects workbooks far beyond the row budget", () => {
    const rows: unknown[][] = [["Header"], ...Array.from({ length: 30 }, (_, i) => [`row ${i}`])];
    const result = readWorkbookRowLimitCheck(buildBuffer(rows), 2);
    expect(result.ok).toBe(false);
    expect(result.rows).toBe(31);
    expect(result.message).toContain("exceeds the configured limit");
  });

  it("reports unreadable files instead of throwing", () => {
    // A truncated ZIP header: SheetJS throws rather than parsing, and the
    // helper converts that into a friendly failure result. (Plain text would
    // be accepted as CSV by SheetJS, so it is not a good "corrupt" sample.)
    const corruptZip = Buffer.concat([
      Buffer.from("PK\u0003\u0004", "latin1"),
      Buffer.from("garbage-bytes-here"),
    ]);
    const result = readWorkbookRowLimitCheck(corruptZip, 100);
    expect(result.ok).toBe(false);
    expect(result.rows).toBe(0);
    expect(result.message).toBeTruthy();
  });
});

function buildBook(aoa: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa as never[][]), "Sheet1");
  return book;
}

function buildBuffer(aoa: unknown[][]): Buffer {
  return XLSX.write(buildBook(aoa), { type: "buffer", bookType: "xlsx" }) as Buffer;
}
