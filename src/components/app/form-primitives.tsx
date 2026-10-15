import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

export function FormMessage({
  message,
  errors,
}: {
  message?: string;
  errors?: Record<string, string>;
}) {
  const hasErrors = errors && Object.values(errors).some(Boolean);
  if (!message && !hasErrors) return null;

  return (
    <div className="space-y-2">
      {message ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {hasErrors ? (
        <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {Object.entries(errors ?? {}).map(([key, value]) =>
            value ? (
              <li key={key}>
                <span className="font-medium">{titleCaseKey(key)}:</span> {value}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert className="border-success/30 bg-success-soft text-success">
      <CheckCircle2 className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
  required,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function titleCaseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
