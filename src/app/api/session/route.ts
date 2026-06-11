import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkPasscode, cookieOptions, createSessionToken, isAuthorized, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  passcode: z.string().min(1)
});

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isAuthorized(request) });
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !checkPasscode(parsed.data.passcode)) {
    return NextResponse.json({ error: "Invalid passcode." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), cookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
