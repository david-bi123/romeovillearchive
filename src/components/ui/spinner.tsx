import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("h-4 w-4 animate-spin", className)}
      {...props}
    />
  );
}

function ButtonLoading({ className, children, ...props }: ButtonProps) {
  return (
    <Button className={className} {...props} disabled>
      <Spinner />
      {children ?? "Loading…"}
    </Button>
  );
}

export { Spinner, ButtonLoading };
