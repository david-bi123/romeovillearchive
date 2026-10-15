import { describe, expect, it } from "vitest";
import {
  cleanText,
  fieldKeyFrom,
  formatBytes,
  formatDate,
  formatNumber,
  isReservedFieldKey,
  relativeTime,
  safeFilename,
  slugify,
  titleCase,
  truncate,
} from "@/lib/utils";

describe("slugify", () => {
  it("slugifies names in a stable, URL safe way", () => {
    expect(slugify("Indenture Records")).toBe("indenture-records");
    expect(slugify("  Indenture   Records  ")).toBe("indenture-records");
    expect(slugify("Owners & Tenants (2024)")).toBe("owners-tenants-2024");
    expect(slugify("EM-DASH — SEPARATOR")).toBe("em-dash-separator");
  });

  it("strips accents", () => {
    expect(slugify("Caf\u00e9 R\u00e9sum\u00e9")).toBe("cafe-resume");
  });

  it("always returns a non-empty value", () => {
    expect(slugify("")).toBe("register");
    expect(slugify("!!!")).toBe("register");
    expect(slugify("___")).toBe("register");
    expect(slugify("\u03a9\u03a9")).toBe("register");
  });

  it("caps the length at 60 characters", () => {
    expect(slugify("a".repeat(200))).toHaveLength(60);
  });
});

describe("fieldKeyFrom", () => {
  it("normalizes display names into snake_case keys", () => {
    expect(fieldKeyFrom("Full Name", new Set())).toBe("full_name");
    expect(fieldKeyFrom("  Property Title  ", new Set())).toBe("property_title");
    expect(fieldKeyFrom("Caf\u00e9", new Set())).toBe("cafe");
    expect(fieldKeyFrom("A & B", new Set())).toBe("a_b");
  });

  it("appends an incrementing suffix on collision", () => {
    expect(fieldKeyFrom("Full Name", new Set())).toBe("full_name");
    expect(fieldKeyFrom("Full Name", new Set(["full_name"]))).toBe("full_name_2");
    expect(fieldKeyFrom("Full Name", new Set(["full_name", "full_name_2"]))).toBe("full_name_3");
    expect(fieldKeyFrom("full name", new Set(["full_name"]))).toBe("full_name_2");
  });

  it("falls back to 'field' for unusable names", () => {
    expect(fieldKeyFrom("!!!", new Set())).toBe("field");
    expect(fieldKeyFrom("!!!", new Set(["field"]))).toBe("field_2");
  });

  it("caps keys at 48 characters", () => {
    expect(fieldKeyFrom("a".repeat(200), new Set())).toHaveLength(48);
  });
});

describe("isReservedFieldKey", () => {
  it("blocks internal and prototype-polluting keys, case-insensitively", () => {
    for (const key of ["id", "record_id", "serial", "created_at", "updated_at", "status_id"]) {
      expect(isReservedFieldKey(key)).toBe(true);
      expect(isReservedFieldKey(key.toUpperCase())).toBe(true);
    }
    expect(isReservedFieldKey("__proto__")).toBe(true);
    expect(isReservedFieldKey("constructor")).toBe(true);
    expect(isReservedFieldKey("prototype")).toBe(true);
    expect(isReservedFieldKey("title")).toBe(false);
    expect(isReservedFieldKey("identity")).toBe(false);
  });
});

describe("safeFilename", () => {
  it("keeps safe names and normalizes whitespace", () => {
    expect(safeFilename("My Export 2024", ".csv")).toBe("My-Export-2024.csv");
    expect(safeFilename("report", "xlsx")).toBe("report.xlsx");
  });

  it("strips a stale extension before adding the new one", () => {
    expect(safeFilename("report.csv", ".xlsx")).toBe("report.xlsx");
    expect(safeFilename("report.csv", ".csv")).toBe("report.csv");
  });

  it("removes traversal, separators and shell characters", () => {
    const result = safeFilename("../../etc/passwd; rm -rf", ".csv");
    expect(result).not.toMatch(/[/\\;]/);
    expect(result.endsWith(".csv")).toBe(true);
    expect(safeFilename("a&b|c`d", ".csv")).toBe("abcd.csv");
  });

  it("falls back to 'export' when nothing survives", () => {
    expect(safeFilename("///", ".csv")).toBe("export.csv");
    expect(safeFilename("///", "csv")).toBe("export.csv");
  });

  it("caps the stem at 80 characters", () => {
    expect(safeFilename("x".repeat(200), ".csv").length).toBeLessThanOrEqual(80 + 4);
  });
});

describe("formatBytes", () => {
  it("renders bytes and one-decimal units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10240)).toBe("10 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");
  });
});

describe("formatNumber", () => {
  it("groups numbers using en-GB", () => {
    expect(formatNumber(1234567.5)).toBe("1,234,567.5");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-1234)).toBe("-1,234");
  });
});

describe("formatDate", () => {
  it("renders DMY dates with an em dash for missing values", () => {
    expect(formatDate(new Date(2024, 1, 1))).toBe("01 Feb 2024");
    expect(formatDate("2024-02-01T12:00:00")).toBe("01 Feb 2024");
    expect(formatDate(null)).toBe("\u2014");
    expect(formatDate(undefined)).toBe("\u2014");
    expect(formatDate("")).toBe("\u2014");
    expect(formatDate("not-a-date")).toBe("\u2014");
  });

  it("adds a 24h clock on request", () => {
    const formatted = formatDate(new Date(2024, 1, 1, 14, 30), true);
    expect(formatted).toContain("01 Feb 2024");
    expect(formatted).toContain("14:30");
  });
});

describe("relativeTime", () => {
  it("describes recent times", () => {
    expect(relativeTime(new Date())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 5 * 60_000))).toBe("5m ago");
    expect(relativeTime(new Date(Date.now() - 90 * 60_000))).toBe("2h ago");
  });

  it("describes days, months and years", () => {
    expect(relativeTime(new Date(Date.now() - 3 * 86_400_000))).toBe("3d ago");
    expect(relativeTime(new Date(Date.now() - 25 * 86_400_000))).toBe("25d ago");
    expect(relativeTime(new Date(Date.now() - 45 * 86_400_000))).toBe("2mo ago");
    expect(relativeTime(new Date(Date.now() - 400 * 86_400_000))).toBe("1y ago");
  });

  it("accepts ISO strings and never reports future drift as positive time", () => {
    expect(relativeTime(new Date(Date.now() - 61_000).toISOString())).toBe("1m ago");
    expect(relativeTime(new Date(Date.now() + 600_000))).toBe("just now");
  });
});

describe("truncate", () => {
  it("keeps short strings intact and elides long ones", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell\u2026");
    expect(truncate("hello world", 5)).toHaveLength(5);
  });
});

describe("cleanText", () => {
  it("trims, normalizes CRLF and applies the cap", () => {
    expect(cleanText("  hello  ")).toBe("hello");
    expect(cleanText("a\r\nb")).toBe("a\nb");
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText(42)).toBe("42");
    expect(cleanText("  ")).toBe("");
  });
});

describe("titleCase", () => {
  it("turns snake/kebab keys into readable labels", () => {
    expect(titleCase("created_at")).toBe("Created At");
    expect(titleCase("field-key")).toBe("Field Key");
    expect(titleCase("already fine")).toBe("Already Fine");
  });
});
