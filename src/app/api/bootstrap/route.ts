import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getBootstrapPayload } from "@/lib/google-sheets";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getBootstrapPayload());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load sheet data." },
      { status: 500 }
    );
  }
}
