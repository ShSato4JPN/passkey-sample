/**
 * 期限切れ challenge の掃除（Cron 用エンドポイント）。
 *
 * 中断された ceremony（options を呼んだが verify に来なかった）で残る
 * 孤児レコードを定期削除する。動作上の実害は無いが溜まるので掃除する。
 *
 * 保護:
 *   Authorization: Bearer <CRON_SECRET> を要求。
 *   - ローカル: docker-compose の cron コンテナがこのヘッダ付きで叩く
 *   - 本番(Vercel): CRON_SECRET を設定すると Vercel Cron が自動でこのヘッダを付与
 *
 * Vercel Cron 設定例(vercel.json):
 *   { "crons": [{ "path": "/api/cron/cleanup-challenges", "schedule": "0 * * * *" }] }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 常に動的実行（キャッシュさせない）
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET が未設定です" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { count } = await prisma.challenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return NextResponse.json({ deleted: count, at: new Date().toISOString() });
}
