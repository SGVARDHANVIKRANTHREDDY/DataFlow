import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000/api/v1";
const IS_PROD = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || { message: "Registration failed" } },
        { status: response.status }
      );
    }

    const { access_token, refresh_token } = data;
    const res = NextResponse.json({ success: true });

    const cookieBase = {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax" as const,
      path: "/",
    };

    res.cookies.set("access_token", access_token, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 7,
    });

    res.cookies.set("refresh_token", refresh_token, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (err) {
    console.error("[auth/register] Error:", err);
    return NextResponse.json(
      { error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}
