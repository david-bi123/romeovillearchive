import { describe, expect, it } from "vitest";
import type { RegisterField } from "@/lib/db/schema";
import { XLSX, readWorkbook } from "@/lib/excel/workbook";
import { detectHeaderRow, proposeTargetMapping } from "@/lib/import/engine";

function buildWorkbook(aoa: unknown[][]): ReturnType<typeof readWorkbook> {
  const sheet = XLSX.utils.aoa_to_sheet(aoa as never[][]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return readWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

function makeField(
  overrides: Partial<RegisterField> & { name: string; fieldType: RegisterField["fieldType"] },
): RegisterField {
  return {
    id: `field-${Math.floor(Math.random() * 1e9)}`,
    registerId: "register-1",
    fieldKey: overrides.name.toLowerCase().replace(/\W+/g, "_"),
    required: false,
    helpText: null,
    options: null,
    defaultValue: null,
    displayOrder: 1,
    showInTable: true,
    showInCard: true,
    editable: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("detectHeaderRow", () => {
  it("finds the first row that is mostly non-numeric text", () => {
    const workbook = buildWorkbook([
      [2024, 10, 15],
      ["Name", "Email", "Amount"],
      ["Alice", "a@example.com", 5],
    ]);
    expect(detectHeaderRow(workbook, "Sheet1")).toBe(2);
  });

  it("returns row 1 when the first row already looks like labels", () => {
    const workbook = buildWorkbook([
      ["Name", "Email"],
      ["Alice", "a@example.com"],
    ]);
    expect(detectHeaderRow(workbook, "Sheet1")).toBe(1);
  });

  it("skips blank rows while scanning", () => {
    const workbook = buildWorkbook([
      [null, null, null],
      ["Name", "Email", "Amount"],
      ["Alice", "a@example.com", 5],
    ]);
    expect(detectHeaderRow(workbook, "Sheet1")).toBe(2);
  });

  it("falls back to the first row when nothing qualifies within ten rows", () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 12; i++) rows.push([1, 2, 3]);
    const workbook = buildWorkbook(rows);
    expect(detectHeaderRow(workbook, "Sheet1")).toBe(1);
  });

  it("returns 1 for an unknown sheet instead of throwing", () => {
    const workbook = buildWorkbook([["Name"], ["Alice"]]);
    expect(detectHeaderRow(workbook, "Missing")).toBe(1);
  });
});

describe("proposeTargetMapping", () => {
  const title = makeField({ name: "Title", fieldType: "text" });
  const notes = makeField({ name: "Notes", fieldType: "text" });
  const fields = [title, notes];

  it("maps matching headers in order", () => {
    const entries = proposeTargetMapping(["Title", "Notes"], fields);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ action: "map", fieldId: title.id, excelIndex: 0 });
    expect(entries[1]).toMatchObject({ action: "map", fieldId: notes.id, excelIndex: 1 });
  });

  it("creates a profile-driven entry for unknown headers", () => {
    const entries = proposeTargetMapping(["Email address"], fields);
    expect(entries[0].action).toBe("create");
    expect(entries[0].excelIndex).toBe(0);
    expect(entries[0].create).toMatchObject({ name: "Email address", fieldType: "email" });
    expect(entries[0].fieldId).toBeNull();
  });

  it("notes header-hint type mismatches against the register column", () => {
    const entries = proposeTargetMapping(["Notes"], fields);
    expect(entries[0].action).toBe("map");
    expect(entries[0].notes.some((note) => note.includes("long_text"))).toBe(true);
  });
});
