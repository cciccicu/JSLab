#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="${1:-/opt/ccicc.icu}"
ARCHIVE="${2:-/tmp/jslab-cloud-2.0.0.zip}"
APP_NAME="${PM2_APP_NAME:-ccicc-icu}"
PLUGIN_ID="jslab-cloud"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATABASE="$INSTALL_DIR/data/site.db"
BACKUP="$INSTALL_DIR/data/site.db.before-${PLUGIN_ID}-${TIMESTAMP}.bak"
STOPPED=0

rollback() {
  local exit_code=$?
  trap - ERR
  printf '插件部署失败，正在恢复数据库…\n' >&2
  if [[ -f "$BACKUP" ]]; then
    cp -a "$BACKUP" "$DATABASE"
  fi
  rm -rf -- "$INSTALL_DIR/plugins/$PLUGIN_ID"
  if (( STOPPED )); then
    pm2 restart "$APP_NAME" --update-env || true
  fi
  exit "$exit_code"
}

trap rollback ERR

[[ "$(id -u)" == 0 ]] || { printf '请以 root 运行。\n' >&2; exit 1; }
[[ -d "$INSTALL_DIR" ]] || { printf '安装目录不存在：%s\n' "$INSTALL_DIR" >&2; exit 1; }
[[ -f "$ARCHIVE" ]] || { printf '插件包不存在：%s\n' "$ARCHIVE" >&2; exit 1; }
[[ ! -e "$INSTALL_DIR/plugins/$PLUGIN_ID" ]] || { printf '插件目录已存在，拒绝首次安装。\n' >&2; exit 1; }

pm2 stop "$APP_NAME"
STOPPED=1
cp -a "$DATABASE" "$BACKUP"

cd "$INSTALL_DIR"
node dist/cli/ccicc.js plugin install --file "$ARCHIVE"
pm2 restart "$APP_NAME" --update-env
pm2 save
STOPPED=0

for attempt in {1..20}; do
  if curl -fsS "http://127.0.0.1:3000/$PLUGIN_ID" >/dev/null; then
    trap - ERR
    printf '插件部署成功。数据库备份：%s\n' "$BACKUP"
    exit 0
  fi
  sleep 1
done

printf '插件页面健康检查失败。\n' >&2
false
