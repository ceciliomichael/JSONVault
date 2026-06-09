import { createHmac, timingSafeEqual } from "node:crypto";

export function signJsonPayload(payload: unknown, secret: string): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyJsonPayload<T>(value: string, secret: string): T | null {
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(encodedPayload)) as T;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return encodeBase64Url(
    createHmac("sha256", secret).update(encodedPayload).digest(),
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}
