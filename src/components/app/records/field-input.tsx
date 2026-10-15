"use client";

import { useState } from "react";
import type { FieldType, RegisterField } from "@/lib/db/schema";
import { readSelectOptions } from "@/lib/field-values";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  defaultAsBoolean,
  splitDefaultValue,
} from "@/components/app/records/record-form-data";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  long_text: "Long text",
  integer: "Whole number",
  decimal: "Decimal number",
  date: "Date",
  datetime: "Date & time",
  boolean: "Yes / no",
  select: "Select (one)",
  multi_select: "Multi select",
  email: "Email",
  phone: "Phone",
  url: "URL",
};

const EMPTY_OPTION = "__rv_empty__";

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "true" : "";
  return String(value);
}

export function FieldInput({
  field,
  name,
  defaultValue,
  error,
  disabled,
}: {
  field: RegisterField;
  name: string;
  defaultValue?: unknown;
  error?: string;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(() => {
    const text = asText(defaultValue);
    return text || EMPTY_OPTION;
  });
  const [checked, setChecked] = useState(() => defaultAsBoolean(defaultValue));
  const [multi, setMulti] = useState<string[]>(() => {
    if (Array.isArray(defaultValue)) return defaultValue.map(String);
    return splitDefaultValue(field.fieldType, asText(defaultValue) || null);
  });

  const options = readSelectOptions(field);
  const hint = field.helpText || undefined;

  const body = (() => {
    switch (field.fieldType) {
      case "long_text":
        return (
          <Textarea
            id={name}
            name={name}
            defaultValue={asText(defaultValue)}
            rows={4}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "integer":
        return (
          <Input
            id={name}
            name={name}
            type="number"
            step={1}
            inputMode="numeric"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "decimal":
        return (
          <Input
            id={name}
            name={name}
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "date":
        return (
          <Input
            id={name}
            name={name}
            type="date"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "datetime":
        return (
          <Input
            id={name}
            name={name}
            type="datetime-local"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "email":
        return (
          <Input
            id={name}
            name={name}
            type="email"
            autoComplete="off"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "phone":
        return (
          <Input
            id={name}
            name={name}
            type="tel"
            autoComplete="off"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "url":
        return (
          <Input
            id={name}
            name={name}
            type="url"
            autoComplete="off"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
      case "boolean":
        return (
          <div className="flex h-9 items-center gap-2">
            <input type="hidden" name={name} value={checked ? "true" : "false"} />
            <Checkbox
              id={name}
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
              disabled={disabled}
              aria-label={field.name}
            />
            <Label htmlFor={name} className="cursor-pointer text-sm text-muted-foreground">
              {checked ? "Yes" : "No"}
            </Label>
          </div>
        );
      case "select":
        return (
          <>
            <input type="hidden" name={name} value={selected === EMPTY_OPTION ? "" : selected} />
            <Select
              value={selected}
              onValueChange={(value) => setSelected(value)}
              disabled={disabled}
            >
              <SelectTrigger id={name} aria-invalid={error ? true : undefined}>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_OPTION}>— None —</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        );
      case "multi_select":
        return (
          <div className="flex flex-col gap-2 rounded-md border border-input p-3">
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground">No options configured for this column.</p>
            ) : (
              options.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 text-sm",
                    disabled && "pointer-events-none opacity-50",
                  )}
                >
                  <Checkbox
                    name={name}
                    value={option}
                    checked={multi.includes(option)}
                    onCheckedChange={(value) =>
                      setMulti((prev) =>
                        value === true
                          ? [...prev, option]
                          : prev.filter((item) => item !== option),
                      )
                    }
                    disabled={disabled}
                  />
                  {option}
                </label>
              ))
            )}
          </div>
        );
      default:
        return (
          <Input
            id={name}
            name={name}
            type="text"
            autoComplete="off"
            defaultValue={asText(defaultValue)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        );
    }
  })();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm">
        {field.name}
        {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {body}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
