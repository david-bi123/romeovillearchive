"use client";

import { useState } from "react";
import { ListFilter, X } from "lucide-react";
import type { FilterClause, FilterOp } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FILTER_OPS } from "@/components/app/records/url-state";

const VALUELESS_OPS = new Set<FilterOp>(["empty", "not_empty"]);

export function ActiveFilterBadges({
  fields,
  filters,
  onRemove,
  onClear,
}: {
  fields: RegisterField[];
  filters: FilterClause[];
  onRemove: (index: number) => void;
  onClear: () => void;
}) {
  if (filters.length === 0) return null;
  const fieldName = (fieldId: string) =>
    fields.find((field) => field.id === fieldId)?.name ?? "Unknown column";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Filters:</span>
      {filters.map((filter, index) => (
        <Badge key={`${filter.fieldId}-${filter.op}-${index}`} variant="secondary" className="gap-1">
          {fieldName(filter.fieldId)} {FILTER_OPS.find((op) => op.value === filter.op)?.label ?? filter.op}
          {filter.value ? ` "${filter.value}"` : ""}
          <button
            type="button"
            aria-label="Remove filter"
            className="rounded-full hover:text-foreground"
            onClick={() => onRemove(index)}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClear}>
        Clear all
      </Button>
    </div>
  );
}

export function FilterDialog({
  fields,
  onApply,
}: {
  fields: RegisterField[];
  onApply: (filters: FilterClause[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState("");
  const [op, setOp] = useState<FilterOp>("contains");
  const [value, setValue] = useState("");

  const apply = () => {
    if (!fieldId) return;
    const clause: FilterClause = {
      fieldId,
      op,
      ...(VALUELESS_OPS.has(op) || !value.trim() ? {} : { value: value.trim() }),
    };
    onApply([clause]);
    setOpen(false);
    setFieldId("");
    setOp("contains");
    setValue("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter className="size-4" />
          Filter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filter records</DialogTitle>
          <DialogDescription>
            Filters are added to the URL, so a filtered view can be shared or exported as-is.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Column</Label>
            <Select value={fieldId} onValueChange={setFieldId}>
              <SelectTrigger aria-label="Column to filter">
                <SelectValue placeholder="Choose a column…" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select
              value={op}
              onValueChange={(next) => setOp(next as FilterOp)}
            >
              <SelectTrigger aria-label="Filter condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!VALUELESS_OPS.has(op) ? (
            <div className="space-y-1.5">
              <Label htmlFor="filter-value">Value</Label>
              <Input
                id="filter-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Value to match against"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!fieldId}>
            Apply filter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
