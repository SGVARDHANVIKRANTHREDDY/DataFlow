/**
 * POST /api/auth/login
 *
 * SECURITY FIX: Tokens NEVER touch the browser JS context.
 * - access_token  → HttpOnly, Secure, SameSite=Lax cookie (7 days)
 * - refresh_token → HttpOnly, Secure, SameSite=Lax cookie (30 days)
 *
 * Why HttpOnly:
 *   - Inaccessible to JavaScript (document.cookie returns nothing)
 *   - XSS attack → cannot steal tokens even with full JS execution
 *   - Supply chain compromise → tokens remain safe
 *
 * Why this route exists (BFF pattern — Backend For Frontend):
 *   - Next.js API route runs in Node.js, not the browser
 *   - It calls the FastAPI backend, receives tokens
 *   - Sets them as HttpOnly cookies on the browser
 *   - Browser never sees raw token strings
 *
 * FAANG equivalent: Google uses this exact pattern for all OAuth flows.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000/api/v1";
const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Call FastAPI backend
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || { message: "Login failed" } },
        { status: response.status }
      );
    }

    const { access_token, refresh_token } = data;

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { error: { message: "Invalid token response from server" } },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ success: true });

    // Set HttpOnly cookies — tokens never accessible to browser JS
    const cookieBase = {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax" as const,
      path: "/",
    };

    res.cookies.set("access_token", access_token, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    res.cookies.set("refresh_token", refresh_token, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (err) {
    console.error("[auth/login] Error:", err);
    return NextResponse.json(
      { error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}
