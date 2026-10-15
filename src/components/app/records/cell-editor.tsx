"use client";

import type { RegisterField } from "@/lib/db/schema";
import { readSelectOptions } from "@/lib/field-values";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Compact controlled editor for one spreadsheet cell. Values follow the same
 * conventions as the full record form: strings for scalars ("true"/"" for
 * booleans), string[] for multi-select. The parent converts back on save.
 */
export function CellEditor({
  field,
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  field: RegisterField;
  value: unknown;
  onChange: (next: unknown) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const text = Array.isArray(value) ? value.map(String).join(", ") : (value ?? "").toString();
  const common = {
    "aria-label": field.name,
    "aria-invalid": invalid ? true : undefined,
    autoFocus,
    className: cn(
      "h-8 w-full min-w-[7rem] rounded-md border border-input bg-surface px-2 text-sm shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      invalid && "border-destructive",
    ),
  } as const;

  switch (field.fieldType) {
    case "integer":
      return (
        <Input
          {...common}
          type="number"
          step={1}
          inputMode="numeric"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "decimal":
      return (
        <Input
          {...common}
          type="number"
          step="any"
          inputMode="decimal"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "date":
      return (
        <Input
          {...common}
          type="date"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "datetime":
      return (
        <Input
          {...common}
          type="datetime-local"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "boolean": {
      const checked = text === "true";
      return (
        <span className="flex h-8 items-center justify-center">
          <Checkbox
            checked={checked}
            onCheckedChange={(next) => onChange(next === true ? "true" : "")}
            aria-label={field.name}
          />
        </span>
      );
    }
    case "select": {
      const options = readSelectOptions(field);
      return (
        <select
          aria-label={field.name}
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={cn(common.className, "cursor-pointer pr-1")}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    case "multi_select":
      return (
        <Input
          {...common}
          type="text"
          autoComplete="off"
          placeholder="a, b"
          title="Separate multiple values with commas"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "email":
      return (
        <Input
          {...common}
          type="email"
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "phone":
      return (
        <Input
          {...common}
          type="tel"
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "url":
      return (
        <Input
          {...common}
          type="url"
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          {...common}
          type="text"
          autoComplete="off"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
