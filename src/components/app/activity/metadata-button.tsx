"use client";

import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

export function MetadataButton({
  metadata,
  action,
}: {
  metadata: unknown;
  action: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`View metadata for ${action}`}
        onClick={() => setOpen(true)}
      >
        <Braces className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Event metadata</DialogTitle>
            <DialogDescription>
              Additional structured context recorded with this {action} event.
              Secrets are never stored here.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
