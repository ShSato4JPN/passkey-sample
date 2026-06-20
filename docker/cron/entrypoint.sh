#!/bin/sh
# cron コンテナのエントリポイント。
# busybox crond で、掃除用エンドポイントを定期的に叩くだけのシンプルな cron サーバー。
set -e

# curl を用意（alpine には標準で入っていない）
apk add --no-cache curl >/dev/null 2>&1

SCHEDULE="${CRON_SCHEDULE:-*/5 * * * *}"

# crontab を生成。
#   - 認証ヘッダ付きで TARGET_URL を叩く
#   - 出力は pid1(crond) の stdout に流して `docker compose logs` で見えるようにする
cat > /etc/crontabs/root <<EOF
$SCHEDULE curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${TARGET_URL}" >> /proc/1/fd/1 2>&1
EOF

echo "[cron] schedule='${SCHEDULE}' target='${TARGET_URL}'"

# -f: フォアグラウンド, -l 8: 実行ログを出す
exec crond -f -l 8
