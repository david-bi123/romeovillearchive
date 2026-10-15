import { formatBytes, formatNumber } from "@/lib/utils";
import { getUploadLimits } from "@/lib/env";
import { SESSION_TTL_MS } from "@/lib/auth/session";
import { INVITATION_TTL_HOURS, PASSWORD_RESET_TTL_MINUTES } from "@/lib/auth/tokens";
import { previewBootstrapState } from "@/server/actions/auth";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function daysFromMs(ms: number): number {
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export async function AboutSection() {
  const bootstrap = await previewBootstrapState();
  const limits = getUploadLimits();

  return (
    <div className="max-w-md divide-y divide-border">
      <Row label="Session lifetime" value={`${daysFromMs(SESSION_TTL_MS)} days`} />
      <Row label="Invitation link validity" value={`${INVITATION_TTL_HOURS} hours`} />
      <Row label="Password reset link validity" value={`${PASSWORD_RESET_TTL_MINUTES} minutes`} />
      <Row label="Maximum upload size" value={formatBytes(limits.maxUploadBytes)} />
      <Row label="Maximum rows per import" value={formatNumber(limits.maxImportRows)} />
      <Row
        label="Initial setup"
        value={bootstrap.initialized ? "Complete" : "Pending"}
      />
      <Row
        label="Email delivery"
        value={bootstrap.mailjetConfigured ? "Configured" : "Not configured"}
      />
    </div>
  );
}
