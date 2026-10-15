import { describe, expect, it } from "vitest";
import type { FieldType, RegisterField } from "@/lib/db/schema";
import {
  coerceValue,
  compareSlots,
  emptySlot,
  formatSlotForDisplay,
  isSlotEmpty,
  parseDateValue,
  readSelectOptions,
  slotToFormValue,
  toErrorMap,
  validateRecordValues,
} from "@/lib/field-values";

function makeField(
  overrides: Partial<RegisterField> & { fieldType: FieldType; name?: string },
): RegisterField {
  const index = Math.floor(Math.random() * 1e9);
  return {
    id: `field-${index}`,
    registerId: "register-1",
    fieldKey: `field_key_${index}`,
    name: overrides.name ?? "Field",
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

function ok(result: ReturnType<typeof coerceValue>) {
  if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
  return result.value;
}

describe("coerceValue", () => {
  it("returns an empty slot for empty input on every type", () => {
    const types: FieldType[] = [
      "text",
      "integer",
      "decimal",
      "date",
      "datetime",
      "boolean",
      "select",
      "multi_select",
      "email",
      "phone",
      "url",
      "long_text",
    ];
    for (const type of types) {
      const field = makeField({ fieldType: type });
      expect(ok(coerceValue(field, "")).valueText).toBeNull();
      expect(ok(coerceValue(field, "   ")).valueText).toBeNull();
      expect(isSlotEmpty(ok(coerceValue(field, null)))).toBe(true);
      expect(isSlotEmpty(ok(coerceValue(field, undefined)))).toBe(true);
    }
  });

  it("coerces text: trims, normalizes CRLF and enforces the length limit", () => {
    const field = makeField({ fieldType: "text" });
    expect(ok(coerceValue(field, "  Hello  ")).valueText).toBe("Hello");
    expect(ok(coerceValue(field, "a\r\nb")).valueText).toBe("a\nb");
    expect(ok(coerceValue(field, "a".repeat(1000))).valueText).toHaveLength(1000);
    const tooLong = coerceValue(field, "a".repeat(1001));
    expect(tooLong).toEqual({ ok: false, error: "Must be at most 1000 characters" });
  });

  it("enforces the long_text limit separately", () => {
    const field = makeField({ fieldType: "long_text" });
    expect(ok(coerceValue(field, "a".repeat(16000))).valueText).toHaveLength(16000);
    expect(coerceValue(field, "a".repeat(16001)).ok).toBe(false);
  });

  it("coerces integers, rejecting fractions and unsafe magnitudes", () => {
    const field = makeField({ fieldType: "integer" });
    expect(ok(coerceValue(field, "42")).valueNumber).toBe(42);
    expect(ok(coerceValue(field, "1,234")).valueNumber).toBe(1234);
    expect(ok(coerceValue(field, -7)).valueNumber).toBe(-7);
    expect(coerceValue(field, "4.5")).toEqual({
      ok: false,
      error: '"4.5" is not a whole number',
    });
    expect(coerceValue(field, "abc").ok).toBe(false);
    expect(coerceValue(field, 9007199254740992)).toEqual({
      ok: false,
      error: "Number is too large",
    });
  });

  it("coerces decimals, stripping thousands separators", () => {
    const field = makeField({ fieldType: "decimal" });
    expect(ok(coerceValue(field, "3.14")).valueNumber).toBeCloseTo(3.14);
    expect(ok(coerceValue(field, "1,000.5")).valueNumber).toBe(1000.5);
    expect(coerceValue(field, "xyz")).toEqual({
      ok: false,
      error: '"xyz" is not a valid number',
    });
    expect(coerceValue(field, "1e15")).toEqual({ ok: false, error: "Number is too large" });
  });

  it("coerces dates as DMY and truncates to the start of the UTC day", () => {
    const field = makeField({ fieldType: "date" });
    const value = ok(coerceValue(field, "01/02/2024")).valueDate;
    expect(value).toEqual(new Date(Date.UTC(2024, 1, 1)));

    const fromDateTime = ok(coerceValue(field, "2024-02-01T15:45:00")).valueDate;
    expect(fromDateTime).toEqual(new Date(Date.UTC(2024, 1, 1)));

    expect(coerceValue(field, "not a date").ok).toBe(false);
  });

  it("coerces datetimes keeping the time of day", () => {
    const field = makeField({ fieldType: "datetime" });
    const value = ok(coerceValue(field, "2024-02-01T15:45:00")).valueDate;
    expect(value?.toISOString()).toBe("2024-02-01T15:45:00.000Z");
    expect(coerceValue(field, "40/50/2024").ok).toBe(false);
  });

  it("coerces booleans from words and flags unknown words", () => {
    const field = makeField({ fieldType: "boolean" });
    expect(ok(coerceValue(field, "Yes")).valueBoolean).toBe(true);
    expect(ok(coerceValue(field, "no")).valueBoolean).toBe(false);
    expect(ok(coerceValue(field, "1")).valueBoolean).toBe(true);
    expect(ok(coerceValue(field, "0")).valueBoolean).toBe(false);
    expect(ok(coerceValue(field, false)).valueBoolean).toBe(false);
    expect(coerceValue(field, "maybe")).toEqual({
      ok: false,
      error: '"maybe" is not a yes/no value',
    });
  });

  it("validates select options when options exist", () => {
    const field = makeField({ fieldType: "select", options: ["Open", "Closed"] });
    expect(ok(coerceValue(field, "Open")).valueText).toBe("Open");
    expect(ok(coerceValue(field, "  Open  ")).valueText).toBe("Open");
    expect(coerceValue(field, "open")).toEqual({
      ok: false,
      error: '"open" is not one of the available options',
    });
    expect(coerceValue(field, "Other").ok).toBe(false);
  });

  it("allows free text for select fields without configured options", () => {
    const field = makeField({ fieldType: "select", options: null });
    expect(ok(coerceValue(field, "anything goes")).valueText).toBe("anything goes");
  });

  it("coerces multi_select from arrays and delimited strings", () => {
    const field = makeField({ fieldType: "multi_select", options: ["Red", "Blue", "Green"] });
    expect(ok(coerceValue(field, ["Red", "Blue"])).valueJson).toEqual(["Red", "Blue"]);
    expect(ok(coerceValue(field, "Red, Blue")).valueJson).toEqual(["Red", "Blue"]);
    expect(ok(coerceValue(field, [])).valueJson).toBeNull();
    expect(isSlotEmpty(ok(coerceValue(field, [])))).toBe(true);
    expect(coerceValue(field, "Red,Yellow")).toEqual({
      ok: false,
      error: '"Yellow" is not one of the available options',
    });
  });

  it("enforces the multi_select length limit", () => {
    const field = makeField({ fieldType: "multi_select" });
    const long = "x".repeat(4001);
    expect(coerceValue(field, long)).toEqual({
      ok: false,
      error: "Selection is too long (max 4000 characters)",
    });
    expect(ok(coerceValue(field, "x".repeat(4000))).valueJson).toHaveLength(1);
  });

  it("validates email format, case and length", () => {
    const field = makeField({ fieldType: "email" });
    expect(ok(coerceValue(field, " User@Example.COM ")).valueText).toBe("user@example.com");
    expect(coerceValue(field, "nope")).toEqual({
      ok: false,
      error: '"nope" is not a valid email address',
    });
    expect(coerceValue(field, "a".repeat(250) + "@example.com")).toEqual({
      ok: false,
      error: "Email address is too long",
    });
  });

  it("validates phone numbers, keeping the display formatting", () => {
    const field = makeField({ fieldType: "phone" });
    const value = ok(coerceValue(field, "(020) 123-4567"));
    expect(value.valueText).toBe("(020) 123-4567");
    expect(ok(coerceValue(field, "+233 24 123 4567")).valueText).toBe("+233 24 123 4567");
    expect(coerceValue(field, "12")).toEqual({
      ok: false,
      error: '"12" is not a valid phone number',
    });
    expect(coerceValue(field, "abc").ok).toBe(false);
    expect(coerceValue(field, "1".repeat(41))).toEqual({
      ok: false,
      error: "Phone number is too long",
    });
  });

  it("accepts only http(s) URLs", () => {
    const field = makeField({ fieldType: "url" });
    expect(ok(coerceValue(field, " https://example.com/x ")).valueText).toBe(
      "https://example.com/x",
    );
    expect(coerceValue(field, "ftp://example.com").ok).toBe(false);
    expect(coerceValue(field, "www.example.com").ok).toBe(false);
  });
});

describe("isSlotEmpty / readSelectOptions", () => {
  it("treats a null and an empty JSON list as empty", () => {
    expect(isSlotEmpty(emptySlot())).toBe(true);
    expect(isSlotEmpty({ ...emptySlot(), valueJson: [] })).toBe(true);
    expect(isSlotEmpty({ ...emptySlot(), valueJson: ["a"] })).toBe(false);
    expect(isSlotEmpty({ ...emptySlot(), valueBoolean: false })).toBe(false);
    expect(isSlotEmpty({ ...emptySlot(), valueNumber: 0 })).toBe(false);
    expect(isSlotEmpty({ ...emptySlot(), valueText: "" })).toBe(false);
  });

  it("reads options from strings and {value} objects", () => {
    const field = makeField({ fieldType: "select", options: [" a ", "b", { value: "c" }, ""] });
    expect(readSelectOptions(field)).toEqual(["a", "b", "c"]);
    expect(readSelectOptions(makeField({ fieldType: "select", options: null }))).toEqual([]);
    expect(
      readSelectOptions(makeField({ fieldType: "select", options: "not-an-array" as never })),
    ).toEqual([]);
  });
});

describe("parseDateValue", () => {
  it("reads ambiguous numeric dates as DMY by default and flags them", () => {
    const result = parseDateValue("01/02/2024");
    expect(result.date).toEqual(new Date(Date.UTC(2024, 1, 1)));
    expect(result.ambiguous).toBe(true);
  });

  it("honours preferMonthFirst for ambiguous dates and stops flagging them", () => {
    const result = parseDateValue("01/02/2024", { preferMonthFirst: true });
    expect(result.date).toEqual(new Date(Date.UTC(2024, 0, 2)));
    expect(result.ambiguous).toBe(false);
  });

  it("does not flag unambiguous orderings", () => {
    expect(parseDateValue("25/12/2024")).toMatchObject({
      date: new Date(Date.UTC(2024, 11, 25)),
      ambiguous: false,
    });
    expect(parseDateValue("12/25/2024")).toMatchObject({
      date: new Date(Date.UTC(2024, 11, 25)),
      ambiguous: false,
    });
    expect(parseDateValue("05/05/2024")).toMatchObject({
      date: new Date(Date.UTC(2024, 4, 5)),
      ambiguous: false,
    });
    expect(parseDateValue("05-03-2024").ambiguous).toBe(true);
  });

  it("expands two digit years around the 50 pivot", () => {
    expect(parseDateValue("01/02/24").date).toEqual(new Date(Date.UTC(2024, 1, 1)));
    expect(parseDateValue("01/02/74").date).toEqual(new Date(Date.UTC(1974, 1, 1)));
  });

  it("rejects impossible calendar values", () => {
    expect(parseDateValue("40/50/2024").error).toContain("not a valid date");
    expect(parseDateValue("32/01/2024").error).toContain("not a valid date");
  });

  it("parses ISO strings with and without a time", () => {
    expect(parseDateValue("2024-03-05T10:30:00").date).toEqual(
      new Date(Date.UTC(2024, 2, 5, 10, 30, 0)),
    );
    expect(parseDateValue("2024-03-05").date).toEqual(new Date(Date.UTC(2024, 2, 5)));
    expect(parseDateValue("2024-03-05 10:30").date).toEqual(
      new Date(Date.UTC(2024, 2, 5, 10, 30, 0)),
    );
  });

  it("parses Excel serial dates (1900 system)", () => {
    // 45292 = 1 January 2024 in the 1900 date system.
    expect(parseDateValue(45292).date).toEqual(new Date(Date.UTC(2024, 0, 1)));
  });

  it("passes Date objects through and rejects invalid ones", () => {
    const date = new Date(Date.UTC(2024, 5, 1));
    expect(parseDateValue(date)).toEqual({ date });
    expect(parseDateValue(new Date("nonsense"))).toEqual({ date: null, error: "Invalid date" });
  });

  it("treats null, undefined and blank strings as empty", () => {
    expect(parseDateValue(null)).toEqual({ date: null });
    expect(parseDateValue(undefined)).toEqual({ date: null });
    expect(parseDateValue("")).toEqual({ date: null });
    expect(parseDateValue("   ")).toEqual({ date: null });
  });

  it("reports unparseable text", () => {
    expect(parseDateValue("hello").error).toContain("could not be read as a date");
    expect(parseDateValue("hello").date).toBeNull();
  });
});

describe("validateRecordValues", () => {
  const title = makeField({ fieldType: "text", name: "Title", required: true });
  const amount = makeField({ fieldType: "decimal", name: "Amount" });
  const notes = makeField({ fieldType: "long_text", name: "Notes", defaultValue: "n/a" });
  const fields = [title, amount, notes];

  it("collects slots for valid input in field order", () => {
    const result = validateRecordValues(fields, { [title.id]: "Report", [amount.id]: 250 });
    expect(result.errors).toEqual([]);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].valueText).toBe("Report");
    expect(result.slots[1].valueNumber).toBe(250);
  });

  it("skips field ids missing from the input entirely", () => {
    const result = validateRecordValues(fields, { unknown_field: "ignored" });
    expect(result.errors).toEqual([]);
    expect(result.slots).toEqual([]);
  });

  it("reports required fields left empty", () => {
    const result = validateRecordValues(fields, { [title.id]: "", [amount.id]: 1 });
    expect(result.errors).toEqual([{ fieldId: title.id, message: "Title is required" }]);
    expect(result.slots).toHaveLength(1);
  });

  it("prefixes coercion failures with the field name", () => {
    const result = validateRecordValues(fields, { [title.id]: "Ok", [amount.id]: "abc" });
    expect(result.errors).toEqual([
      { fieldId: amount.id, message: 'Amount: "abc" is not a valid number' },
    ]);
  });

  it("falls back to the default value for empty optional fields", () => {
    const result = validateRecordValues(fields, { [title.id]: "Ok", [notes.id]: "" });
    expect(result.errors).toEqual([]);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[1].valueText).toBe("n/a");
  });

  it("maps errors to a form error record", () => {
    const { errors } = validateRecordValues(fields, { [title.id]: "" });
    expect(toErrorMap(errors)).toEqual({ [title.id]: "Title is required" });
  });
});

describe("formatSlotForDisplay", () => {
  it("formats dates and datetimes in en-GB UTC form", () => {
    const dateField = makeField({ fieldType: "date" });
    const dateTimeField = makeField({ fieldType: "datetime" });
    expect(
      formatSlotForDisplay(dateField, { ...emptySlot(), valueDate: new Date(Date.UTC(2024, 1, 1)) }),
    ).toBe("01 Feb 2024");
    const dateTime = formatSlotForDisplay(dateTimeField, {
      ...emptySlot(),
      valueDate: new Date(Date.UTC(2024, 1, 1, 10, 30)),
    });
    expect(dateTime).toContain("01 Feb 2024");
    expect(dateTime).toContain("10:30");
  });

  it("formats booleans, lists, numbers and text", () => {
    expect(
      formatSlotForDisplay(makeField({ fieldType: "boolean" }), {
        ...emptySlot(),
        valueBoolean: true,
      }),
    ).toBe("Yes");
    expect(
      formatSlotForDisplay(makeField({ fieldType: "boolean" }), {
        ...emptySlot(),
        valueBoolean: false,
      }),
    ).toBe("No");
    expect(
      formatSlotForDisplay(makeField({ fieldType: "multi_select" }), {
        ...emptySlot(),
        valueJson: ["a", "b"],
      }),
    ).toBe("a, b");
    expect(
      formatSlotForDisplay(makeField({ fieldType: "integer" }), {
        ...emptySlot(),
        valueNumber: 42,
      }),
    ).toBe("42");
    expect(
      formatSlotForDisplay(makeField({ fieldType: "text" }), { ...emptySlot(), valueText: "hi" }),
    ).toBe("hi");
    expect(formatSlotForDisplay(makeField({ fieldType: "text" }), emptySlot())).toBe("");
    expect(
      formatSlotForDisplay(makeField({ fieldType: "boolean" }), emptySlot()),
    ).toBe("");
  });
});

describe("slotToFormValue", () => {
  it("produces HTML input friendly values", () => {
    expect(
      slotToFormValue(makeField({ fieldType: "date" }), {
        ...emptySlot(),
        valueDate: new Date(Date.UTC(2024, 1, 1)),
      }),
    ).toBe("2024-02-01");
    expect(
      slotToFormValue(makeField({ fieldType: "datetime" }), {
        ...emptySlot(),
        valueDate: new Date(Date.UTC(2024, 1, 1, 15, 45)),
      }),
    ).toBe("2024-02-01T15:45");
    expect(
      slotToFormValue(makeField({ fieldType: "boolean" }), { ...emptySlot(), valueBoolean: true }),
    ).toBe("true");
    expect(
      slotToFormValue(makeField({ fieldType: "boolean" }), { ...emptySlot(), valueBoolean: false }),
    ).toBe("false");
    expect(
      slotToFormValue(makeField({ fieldType: "multi_select" }), {
        ...emptySlot(),
        valueJson: ["a"],
      }),
    ).toEqual(["a"]);
    expect(
      slotToFormValue(makeField({ fieldType: "integer" }), { ...emptySlot(), valueNumber: 7 }),
    ).toBe("7");
  });

  it("returns empty defaults for empty slots", () => {
    expect(slotToFormValue(makeField({ fieldType: "text" }), emptySlot())).toBe("");
    expect(slotToFormValue(makeField({ fieldType: "multi_select" }), emptySlot())).toEqual([]);
    expect(slotToFormValue(makeField({ fieldType: "date" }), emptySlot())).toBe("");
  });
});

describe("compareSlots", () => {
  const text = makeField({ fieldType: "text" }).fieldType;
  const integer = makeField({ fieldType: "integer" }).fieldType;

  it("sorts empty values last", () => {
    const filled = { ...emptySlot(), valueText: "a" };
    expect(compareSlots(emptySlot(), filled, text)).toBe(1);
    expect(compareSlots(filled, emptySlot(), text)).toBe(-1);
    expect(compareSlots(emptySlot(), emptySlot(), text)).toBe(0);
  });

  it("compares numbers numerically", () => {
    expect(compareSlots({ ...emptySlot(), valueNumber: 1 }, { ...emptySlot(), valueNumber: 2 }, integer)).toBeLessThan(0);
    expect(compareSlots({ ...emptySlot(), valueNumber: 100 }, { ...emptySlot(), valueNumber: 20 }, integer)).toBeGreaterThan(0);
  });

  it("compares text naturally (Item 2 before Item 10)", () => {
    expect(
      compareSlots(
        { ...emptySlot(), valueText: "Item 2" },
        { ...emptySlot(), valueText: "Item 10" },
        text,
      ),
    ).toBeLessThan(0);
    expect(
      compareSlots(
        { ...emptySlot(), valueText: "a" },
        { ...emptySlot(), valueText: "A" },
        text,
      ),
    ).toBe(0);
  });

  it("compares booleans false < true and dates chronologically", () => {
    expect(
      compareSlots(
        { ...emptySlot(), valueBoolean: false },
        { ...emptySlot(), valueBoolean: true },
        "boolean",
      ),
    ).toBeLessThan(0);
    expect(
      compareSlots(
        { ...emptySlot(), valueDate: new Date(Date.UTC(2024, 0, 1)) },
        { ...emptySlot(), valueDate: new Date(Date.UTC(2025, 0, 1)) },
        "date",
      ),
    ).toBeLessThan(0);
  });
});
