"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRegisterArchivedAction } from "@/server/actions/registers";

export function RestoreRegisterButton({ registerId, registerName }: { registerId: string; registerName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startTransition(async () => {
          const state = await setRegisterArchivedAction(registerId, false);
          if (state.ok) {
            toast.success(`“${registerName}” restored.`);
            router.push(`/registers/${registerId}`);
            router.refresh();
          } else {
            toast.error(state.message ?? "Could not restore the register.");
          }
        });
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
      Restore
    </Button>
  );
}
