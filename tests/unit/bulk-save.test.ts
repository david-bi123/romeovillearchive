import { describe, expect, it } from "vitest";
import { bulkSavePayloadSchema } from "@/server/actions/shared";

/**
 * The spreadsheet save-all payload must reject oversized or malformed
 * batches before any row is touched.
 */
describe("bulkSavePayloadSchema", () => {
  it("accepts a normal editing session", () => {
    const parsed = bulkSavePayloadSchema.safeParse({
      updates: [{ recordId: "rec-1", dataVersion: 3, values: { fieldA: "hello" } }],
      creates: [{ values: { fieldA: "new row" } }],
      deletes: ["rec-9"],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults missing groups to empty", () => {
    const parsed = bulkSavePayloadSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ updates: [], creates: [], deletes: [] });
    }
  });

  it("rejects oversized batches and bad versions", () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      recordId: `rec-${i}`,
      dataVersion: 1,
      values: {},
    }));
    expect(bulkSavePayloadSchema.safeParse({ updates: tooMany }).success).toBe(false);
    expect(
      bulkSavePayloadSchema.safeParse({
        updates: [{ recordId: "rec-1", dataVersion: 0, values: {} }],
      }).success,
    ).toBe(false);
  });
});
