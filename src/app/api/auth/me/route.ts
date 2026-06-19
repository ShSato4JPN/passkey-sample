/** 現在のログイン状態を返す（クライアントの初期表示用） */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/session";
import { getUserById } from "@/lib/store";

export async function GET() {
  const userId = await getCurrentUserId();
  const user = userId ? getUserById(userId) : undefined;

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true, username: user.username });
}
