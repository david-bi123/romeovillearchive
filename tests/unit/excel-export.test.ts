import { describe, expect, it } from "vitest";
import type { RegisterField } from "@/lib/db/schema";
import { emptySlot, type ValueSlot } from "@/lib/field-values";
import {
  EXPORT_SCOPE_LABELS,
  buildExportColumns,
  exportFilename,
  guardSpreadsheetCell,
  rowToCells,
  toCsv,
} from "@/lib/excel/export";

function makeField(overrides: Partial<RegisterField> & { fieldType: RegisterField["fieldType"]; name: string }): RegisterField {
  return {
    id: `field-${Math.floor(Math.random() * 1e9)}`,
    registerId: "register-1",
    fieldKey: "field_key",
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

describe("guardSpreadsheetCell", () => {
  it("prefixes formula-triggering characters with an apostrophe", () => {
    expect(guardSpreadsheetCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(guardSpreadsheetCell("+1234")).toBe("'+1234");
    expect(guardSpreadsheetCell("-cmd")).toBe("'-cmd");
    expect(guardSpreadsheetCell("@mention")).toBe("'@mention");
    expect(guardSpreadsheetCell("\tstart")).toBe("'\tstart");
    expect(guardSpreadsheetCell("\rstart")).toBe("'\rstart");
  });

  it("leaves ordinary text, numbers and empties untouched", () => {
    expect(guardSpreadsheetCell("hello")).toBe("hello");
    expect(guardSpreadsheetCell("1234")).toBe("1234");
    expect(guardSpreadsheetCell("a=b")).toBe("a=b");
    expect(guardSpreadsheetCell(42)).toBe("42");
    expect(guardSpreadsheetCell(null)).toBe("");
    expect(guardSpreadsheetCell(undefined)).toBe("");
  });
});

describe("buildExportColumns", () => {
  const fields = [
    makeField({ fieldType: "text", name: "Title" }),
    makeField({ fieldType: "integer", name: "Qty" }),
  ];

  it("wraps fields with serial/timestamps when meta is included", () => {
    const columns = buildExportColumns(fields, true);
    expect(columns.map((c) => c.key)).toEqual(["__serial", fields[0].id, fields[1].id, "__created", "__updated"]);
    expect(columns[0].label).toBe("S/N");
    expect(columns[columns.length - 2].label).toBe("Created");
    expect(columns[columns.length - 1].label).toBe("Last updated");
    expect(columns[0].field).toBeNull();
  });

  it("emits only the register fields when meta is excluded", () => {
    const columns = buildExportColumns(fields, false);
    expect(columns.map((c) => c.label)).toEqual(["Title", "Qty"]);
    expect(columns.every((c) => c.field !== null)).toBe(true);
  });
});

describe("rowToCells", () => {
  const title = makeField({ fieldType: "text", name: "Title" });
  const qty = makeField({ fieldType: "integer", name: "Qty" });
  const signed = makeField({ fieldType: "date", name: "Signed" });
  const due = makeField({ fieldType: "datetime", name: "Due" });
  const approved = makeField({ fieldType: "boolean", name: "Approved" });
  const columns = buildExportColumns([title, qty, signed, due, approved], true);

  const slot = (partial: Partial<ValueSlot>): ValueSlot => ({ ...emptySlot(), ...partial });

  const row = {
    id: "record-1",
    serial: 7,
    createdAt: new Date("2024-01-15T10:00:00Z"),
    updatedAt: new Date("2024-01-16T11:30:00Z"),
    values: {
      [title.id]: slot({ valueText: "Indenture" }),
      [qty.id]: slot({ valueNumber: 3 }),
      [signed.id]: slot({ valueDate: new Date(Date.UTC(2024, 1, 1)) }),
      [due.id]: slot({ valueDate: new Date(Date.UTC(2024, 5, 20, 9, 45)) }),
      [approved.id]: slot({ valueBoolean: true }),
    },
  };

  it("maps meta columns and typed slots to raw cells", () => {
    expect(rowToCells(columns, row)).toEqual([
      7,
      "Indenture",
      3,
      "01 Feb 2024",
      new Date(Date.UTC(2024, 5, 20, 9, 45)),
      "Yes",
      row.createdAt,
      row.updatedAt,
    ]);
  });

  it("returns null for missing values and renders booleans Yes/No", () => {
    const emptyRow = { ...row, values: {} };
    const cells = rowToCells(columns, emptyRow);
    expect(cells[1]).toBeNull();
    expect(cells[2]).toBeNull();
    expect(cells[5]).toBeNull();

    const noRow = {
      ...row,
      values: { ...row.values, [approved.id]: slot({ valueBoolean: false }) },
    };
    expect(rowToCells(columns, noRow)[5]).toBe("No");
  });
});

describe("toCsv", () => {
  const title = makeField({ fieldType: "text", name: 'Title, "legal"' });
  const columns = buildExportColumns([title], true);

  it("starts with a UTF-8 BOM and uses CRLF line endings", () => {
    const csv = toCsv(columns, []);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes separators and doubles embedded quotes", () => {
    const row = {
      id: "r1",
      serial: 1,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      values: { [title.id]: { ...emptySlot(), valueText: 'says "hi", ok' } },
    };
    const csv = toCsv(columns, [row]);
    const lines = csv.slice(1).split("\r\n"); // drop BOM
    expect(lines[0]).toContain('"Title, ""legal"""');
    expect(lines[1]).toContain('"says ""hi"", ok"');
  });

  it("guards formula injection in header and body cells", () => {
    const evil = makeField({ fieldType: "text", name: "=EVIL()" });
    const cols = buildExportColumns([evil], false);
    const row = {
      id: "r1",
      serial: 1,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      values: { [evil.id]: { ...emptySlot(), valueText: "=HYPERLINK(\"x\")" } },
    };
    const csv = toCsv(cols, [row]);
    expect(csv).toContain("'=EVIL()");
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("exportFilename", () => {
  const stamp = new Date().toISOString().slice(0, 10);

  it("builds a safe dated filename with the requested extension", () => {
    expect(exportFilename("Indenture & Records", "csv", "filtered")).toBe(
      `Indenture-Records-filtered-${stamp}.csv`,
    );
    expect(exportFilename("Owners", "xlsx", "")).toBe(`Owners-${stamp}.xlsx`);
    expect(exportFilename("Owners", "csv", "selected")).toBe(
      `Owners-selected-${stamp}.csv`,
    );
  });

  it("never emits path separators or shell characters", () => {
    const name = exportFilename("../../etc/passwd; rm -rf", "csv", "");
    expect(name).not.toMatch(/[/\\;]/);
    expect(name.endsWith(".csv")).toBe(true);
  });
});

describe("EXPORT_SCOPE_LABELS", () => {
  it("documents every scope", () => {
    expect(Object.keys(EXPORT_SCOPE_LABELS).sort()).toEqual(["all", "filtered", "selected"]);
    expect(EXPORT_SCOPE_LABELS.all).toContain("every record");
  });
});
