/**
 * BFF Proxy Route
 *
 * All API calls from the browser go through this Next.js proxy.
 * The proxy reads the HttpOnly access_token cookie (browser cannot)
 * and attaches it as an Authorization header to the backend request.
 *
 * This means:
 * - Browser JS never has access to the token
 * - CSRF protection: SameSite=Lax + same-origin requests only
 * - Token rotation: handled transparently at the cookie layer
 *
 * Usage from frontend: fetch("/api/proxy/datasets") → hits FastAPI /api/v1/datasets
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000/api/v1";

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const token = req.cookies.get("access_token")?.value;
  const path  = params.path.join("/");
  const url   = `${BACKEND_URL}/${path}${req.nextUrl.search}`;

  const incomingCt = req.headers.get("content-type") || "";
  const headers: Record<string, string> = {};
  
  if (incomingCt.includes("application/json")) {
    headers["Content-Type"] = "application/json";
  }

  // CSRF Protection: Block external mutating cross-origin attacks
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (req.headers.get("x-requested-with") !== "XMLHttpRequest") {
      return NextResponse.json({ error: { message: "Invalid CSRF origin" } }, { status: 403 });
    }
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Forward idempotency key if present
  const idemKey = req.headers.get("Idempotency-Key");
  if (idemKey) headers["Idempotency-Key"] = idemKey;

  // Read body for mutating methods
  let body: BodyInit | null = null;
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // Stream form data directly
      body = await req.blob();
      // Don't set Content-Type — let fetch set boundary automatically
      delete headers["Content-Type"];
    } else {
      body = await req.text();
    }
  }

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    // Handle 401: try token refresh then retry once
    if (response.status === 401) {
      const refreshToken = req.cookies.get("refresh_token")?.value;
      if (refreshToken) {
        const refreshRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshRes.ok) {
          const { access_token, refresh_token: newRefresh } = await refreshRes.json();

          // Retry original request with new token
          const retryResponse = await fetch(url, {
            method: req.method,
            headers: { ...headers, Authorization: `Bearer ${access_token}` },
            body,
          });

          const IS_PROD = process.env.NODE_ENV === "production";
          const cookieBase = { httpOnly: true, secure: IS_PROD, sameSite: "lax" as const, path: "/" };

          const data = await retryResponse.text();
          const proxied = new NextResponse(data, { status: retryResponse.status, headers: { "Content-Type": retryResponse.headers.get("content-type") || "application/json" } });

          proxied.cookies.set("access_token",  access_token, { ...cookieBase, maxAge: 60 * 60 * 24 * 7 });
          proxied.cookies.set("refresh_token", newRefresh,   { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
          return proxied;
        }
      }

      // Refresh failed — clear cookies
      const unauthorizedRes = NextResponse.json(
        { error: { message: "Session expired. Please log in again." } },
        { status: 401 }
      );
      unauthorizedRes.cookies.set("access_token",  "", { httpOnly: true, maxAge: 0, path: "/" });
      unauthorizedRes.cookies.set("refresh_token", "", { httpOnly: true, maxAge: 0, path: "/" });
      return unauthorizedRes;
    }

    // Stream response back to browser
    const responseData = await response.text();
    return new NextResponse(responseData, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    console.error(`[proxy/${path}] Error:`, err);
    return NextResponse.json(
      { error: { message: "Backend unavailable" } },
      { status: 503 }
    );
  }
}

export const GET    = handler;
export const POST   = handler;
export const PUT    = handler;
export const PATCH  = handler;
export const DELETE = handler;
