import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";

export function humanizeAction(action: string): string {
  return titleCase(action.replace(/[._]+/g, " "));
}

function actionTone(action: string): "default" | "success" | "warning" | "destructive" | "secondary" | "info" {
  if (/(fail|error|invalid|delete|revoke|disable)/.test(action)) return "destructive";
  if (/(create|invite|accept|activate)/.test(action)) return "success";
  if (/(update|edit|change|archive|restore|import|export|send)/.test(action)) return "info";
  if (/(login|logout|session|password)/.test(action)) return "secondary";
  return "default";
}

export function ActionBadge({ action }: { action: string }) {
  return (
    <Badge variant={actionTone(action)} title={action}>
      {humanizeAction(action)}
    </Badge>
  );
}
