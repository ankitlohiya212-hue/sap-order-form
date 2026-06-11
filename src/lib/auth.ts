import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "sap_order_entry_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function requiredPasscode(): string {
  const passcode = process.env.ORDER_ENTRY_PASSCODE;
  if (!passcode) {
    throw new Error("ORDER_ENTRY_PASSCODE is not configured.");
  }
  return passcode;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload: string): string {
  return createHmac("sha256", requiredPasscode()).update(payload).digest("hex");
}

export function checkPasscode(passcode: string): boolean {
  return safeEqual(passcode, requiredPasscode());
}

export function createSessionToken(): string {
  const issuedAt = String(Date.now());
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature || !/^\d+$/.test(issuedAt)) {
    return false;
  }
  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) {
    return false;
  }
  return safeEqual(signature, sign(issuedAt));
}

export function isAuthorized(request: NextRequest): boolean {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}
