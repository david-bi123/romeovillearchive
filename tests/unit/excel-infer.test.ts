import { describe, expect, it } from "vitest";
import { inferColumnType, normalizeHeaderKey, profileColumn, proposeMapping } from "@/lib/excel/infer";

describe("inferColumnType", () => {
  it("keeps leading-zero identifiers and overlong digit strings as text", () => {
    expect(inferColumnType("Code", ["01234", "007"])).toBe("text");
    expect(inferColumnType("Reference", ["99999999999999999999"])).toBe("text");
    expect(inferColumnType("Code", ["01234", "56789"])).toBe("text");
  });

  it("detects emails, URLs and phone numbers", () => {
    expect(inferColumnType("Contact", ["a@example.com", "b@example.co.uk"])).toBe("email");
    expect(inferColumnType("Link", ["https://example.com", "http://a.b/c"])).toBe("url");
    expect(inferColumnType("Mobile", ["+233241234567", "+233205551234"])).toBe("phone");
  });

  it("detects dates and leaves non-date numeric text alone", () => {
    expect(inferColumnType("Signed", ["01/02/2024", "25/12/2023"])).toBe("date");
    expect(inferColumnType("Year", ["2024", "2025"])).not.toBe("integer");
    expect(inferColumnType("Qty", ["10", "20", "30"])).toBe("integer");
    expect(inferColumnType("Amount", ["1,234.5", "99.75"])).toBe("decimal");
  });

  it("detects boolean words but not bare 0/1", () => {
    expect(inferColumnType("Approved", ["Yes", "No", "Yes"])).toBe("boolean");
    expect(inferColumnType("Flag", ["true", "false"])).toBe("boolean");
    expect(inferColumnType("Count", ["0", "1"])).not.toBe("boolean");
  });

  it("suggests select for low cardinality free text", () => {
    const values = ["Open", "Closed", "Open", "Closed", "Open", "Closed", "Open", "Closed"];
    expect(inferColumnType("Status", values)).toBe("select");
  });

  it("falls back to long_text above 300 characters and text below", () => {
    expect(inferColumnType("Notes", ["x".repeat(301)])).toBe("long_text");
    expect(inferColumnType("Name", ["short value", "other value"])).toBe("text");
  });

  it("uses header hints when the column has no values", () => {
    expect(inferColumnType("Email address", [])).toBe("email");
    expect(inferColumnType("Remarks", [])).toBe("long_text");
    expect(inferColumnType("Whatever", [])).toBe("text");
    expect(inferColumnType("Status", [])).toBe("select");
  });
});

describe("normalizeHeaderKey", () => {
  it("normalizes case, spaces and punctuation", () => {
    expect(normalizeHeaderKey("First Name")).toBe("first_name");
    expect(normalizeHeaderKey("  E-Mail  ")).toBe("e_mail");
    expect(normalizeHeaderKey("Property/Title!")).toBe("property_title");
    expect(normalizeHeaderKey("A & B")).toBe("a_b");
    expect(normalizeHeaderKey("___")).toBe("");
  });

  it("leaves leading-zero identifiers intact", () => {
    expect(normalizeHeaderKey("0123")).toBe("0123");
    expect(normalizeHeaderKey("Ref 007")).toBe("ref_007");
  });
});

describe("profileColumn", () => {
  it("flags leading zeros and keeps the column as text", () => {
    const profile = profileColumn("File No", ["0123", "0456", ""]);
    expect(profile.suggestedType).toBe("text");
    expect(profile.identifierRisk).toBe(true);
    expect(profile.warnings.some((w) => w.includes("leading zeros"))).toBe(true);
    expect(profile.totalValues).toBe(2);
    expect(profile.blankCount).toBe(1);
  });

  it("flags ambiguous day/month order", () => {
    const profile = profileColumn("Date", ["01/02/2024", "03/04/2024"]);
    expect(profile.ambiguousDates).toBe(true);
    expect(profile.warnings.some((w) => w.includes("Ambiguous day/month order"))).toBe(true);
  });

  it("flags date-like values that cannot be parsed", () => {
    const profile = profileColumn("Date", ["15/13/2024"]);
    expect(profile.warnings.some((w) => w.includes("could not be parsed"))).toBe(true);
  });

  it("warns when the derived key collides with a reserved column name", () => {
    const profile = profileColumn("Created At", []);
    expect(profile.suggestedKey).toBe("created_at");
    expect(profile.warnings.some((w) => w.includes("reserved column name"))).toBe(true);
  });

  it("suggests sorted options for select columns", () => {
    const profile = profileColumn("Status", ["Open", "Closed", "Open", "Closed", "Open", "Closed", "Open", "Closed"]);
    expect(profile.suggestedType).toBe("select");
    expect(profile.suggestedOptions).toEqual(["Closed", "Open"]);
  });

  it("captures sample values and distinct counts", () => {
    const profile = profileColumn("Name", ["a", "b", "a", null, undefined]);
    expect(profile.sampleValues).toEqual(["a", "b", "a"]);
    expect(profile.distinctCount).toBe(2);
    expect(profile.totalValues).toBe(3);
    expect(profile.blankCount).toBe(2);
  });
});

describe("proposeMapping", () => {
  const fields = [
    { id: "f1", fieldKey: "title", name: "Title", fieldType: "text" as const },
    { id: "f2", fieldKey: "amount", name: "Budget Amount", fieldType: "decimal" as const },
    { id: "f3", fieldKey: "notes", name: "Notes", fieldType: "text" as const },
  ];

  it("maps headers to fields regardless of case and spacing", () => {
    const entries = proposeMapping(["TITLE", "budget amount"], fields);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ action: "map", fieldId: "f1", fieldKey: "title" });
    expect(entries[1]).toMatchObject({ action: "map", fieldId: "f2", fieldKey: "amount" });
    expect(entries[0].excelIndex).toBe(0);
    expect(entries[1].excelIndex).toBe(1);
  });

  it("proposes creating a field for headers with no match when profiles are given", () => {
    const entries = proposeMapping(["Unknown Col"], fields, [profileColumn("Unknown Col", [])]);
    expect(entries[0].action).toBe("create");
    expect(entries[0].fieldId).toBeNull();
    expect(entries[0].create).toMatchObject({ name: "Unknown Col", fieldType: "text" });
  });

  it("ignores unmatched headers without profiles", () => {
    const entries = proposeMapping(["Unknown Col"], fields);
    expect(entries[0].action).toBe("ignore");
    expect(entries[0].create).toBeNull();
  });

  it("notes when the spreadsheet type differs from the register column", () => {
    const entries = proposeMapping(["Notes"], fields, [profileColumn("Notes", [])]);
    expect(entries[0].action).toBe("map");
    // profileColumn("Notes") suggests long_text via the header hint, field is text.
    expect(entries[0].notes.some((note) => note.includes("long_text"))).toBe(true);
  });

  it("never maps two spreadsheet columns onto the same field", () => {
    const entries = proposeMapping(["Title", "title"], fields, [
      profileColumn("Title", []),
      profileColumn("title", []),
    ]);
    expect(entries[0].action).toBe("map");
    expect(entries[1].action).toBe("create");
    expect(entries[1].fieldId).toBeNull();
  });

  it("carries profile warnings through into the mapping notes", () => {
    const profile = profileColumn("Created At", []);
    const entries = proposeMapping(["Created At"], fields, [profile]);
    expect(entries[0].notes).toEqual(profile.warnings);
  });
});
