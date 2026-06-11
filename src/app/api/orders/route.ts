import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { submitOrderToSheet } from "@/lib/google-sheets";
import { OrderValidationError } from "@/lib/order-logic";

export const runtime = "nodejs";

const schema = z.object({
  partyCode: z.string().min(1),
  lines: z.array(
    z.object({
      itemCode: z.string().min(1),
      quantity: z.union([z.string(), z.number()])
    })
  )
});

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order payload." }, { status: 400 });
  }
  try {
    const result = await submitOrderToSheet(parsed.data.partyCode, parsed.data.lines);
    return NextResponse.json({ ok: true, order: result });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit order." },
      { status: 500 }
    );
  }
}
