/** ログアウト（セッション破棄） */

import { NextResponse } from "next/server";
import { logout } from "@/lib/session";

export async function POST() {
  await logout();
  return NextResponse.json({ ok: true });
}
