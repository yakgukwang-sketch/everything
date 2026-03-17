import type { Context, Next } from "hono";
import type { Bindings, SellerRow } from "./types";

// ===== Password Hashing (PBKDF2, Workers-compatible) =====

const PBKDF2_ITERATIONS = 10_000; // Workers CPU 10ms limit
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function deriveKey(password: string, salt: ArrayBuffer): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(password, salt.buffer);
  return `${bufToHex(salt.buffer)}:${bufToHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = hexToBuf(saltHex);
  const derived = await deriveKey(password, salt);
  return bufToHex(derived) === hashHex;
}

// ===== JWT (HMAC-SHA256) =====

const JWT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return base64url(sig);
}

export async function createJWT(payload: { seller_id: number; email: string }, secret: string): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64urlEncode(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRY,
  }));
  const signature = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export async function verifyJWT(token: string, secret: string): Promise<{ seller_id: number; email: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = await hmacSign(`${header}.${body}`, secret);
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(base64urlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { seller_id: payload.seller_id, email: payload.email };
  } catch {
    return null;
  }
}

// ===== Hono Middleware =====

export async function sellerAuth(c: Context<{ Bindings: Bindings }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "로그인이 필요합니다" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ success: false, error: "유효하지 않은 토큰입니다" }, 401);
  }

  // Attach seller info to context
  c.set("seller_id" as never, payload.seller_id as never);
  c.set("seller_email" as never, payload.email as never);
  await next();
}
