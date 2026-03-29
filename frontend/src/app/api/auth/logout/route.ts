import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });
  // Clear both cookies by setting maxAge=0
  res.cookies.set("access_token",  "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("refresh_token", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
