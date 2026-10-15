import { NextResponse } from "next/server";
import { assertRateLimit } from "@/lib/rate-limit";
import { getBootstrapState, triggerSuperAdminActivation, verifyBootstrapSecret } from "@/server/bootstrap";
import { generateRequestId } from "@/lib/auth/tokens";

export const runtime = "nodejs";

/**
 * Bootstrap endpoint for the initial super administrator.
 *
 * POST  { resend?: boolean } with header `x-bootstrap-secret: <BOOTSTRAP_SECRET>`
 * GET   returns the current bootstrap state (no secrets, no tokens).
 *
 * GET never sends email. POST is rate limited and refused entirely without the
 * secret outside of local development, so an anonymous visitor cannot ask the
 * server to mail (or replace) the initial administrator.
 */
export async function GET(request: Request) {
  if (!verifyBootstrapSecret(request.headers.get("x-bootstrap-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = await getBootstrapState();
  return NextResponse.json({ ...state, requestId: generateRequestId() });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  if (!verifyBootstrapSecret(request.headers.get("x-bootstrap-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  try {
    await assertRateLimit("bootstrap", ip);
  } catch (error) {
    const retryAfter = (error as { status?: number }).status === 429 ? 429 : 429;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Too many requests" },
      { status: retryAfter },
    );
  }

  let resend = false;
  try {
    const body = (await request.json()) as { resend?: unknown };
    resend = body.resend === true;
  } catch {
    resend = false;
  }

  const outcome = await triggerSuperAdminActivation({ resend, ip });

  const status =
    outcome.status === "initialized"
      ? 409
      : outcome.status === "rejected"
        ? 429
        : outcome.status === "email_failed"
          ? 502
          : 200;

  return NextResponse.json({ ...outcome, requestId: generateRequestId() }, { status });
}