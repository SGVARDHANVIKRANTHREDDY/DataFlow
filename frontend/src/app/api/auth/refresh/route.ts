import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000/api/v1";
const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: { message: "No refresh token" } },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Refresh failed — clear cookies and force re-login
      const res = NextResponse.json(
        { error: { message: "Session expired" } },
        { status: 401 }
      );
      res.cookies.set("access_token",  "", { httpOnly: true, maxAge: 0, path: "/" });
      res.cookies.set("refresh_token", "", { httpOnly: true, maxAge: 0, path: "/" });
      return res;
    }

    const { access_token, refresh_token } = data;
    const res = NextResponse.json({ success: true });

    const cookieBase = { httpOnly: true, secure: IS_PROD, sameSite: "lax" as const, path: "/" };
    res.cookies.set("access_token",  access_token,  { ...cookieBase, maxAge: 60 * 60 * 24 * 7 });
    res.cookies.set("refresh_token", refresh_token, { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });

    return res;
  } catch (err) {
    console.error("[auth/refresh] Error:", err);
    return NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 });
  }
}
