import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object") {
    console.log("[pixl:client]", JSON.stringify(body));
  }
  return NextResponse.json({ ok: true });
}
