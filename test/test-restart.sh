#!/bin/sh
# Prüft, ob ein Serverneustart den Spielstand aus dem Event-Log wiederherstellt.

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
cd "$ROOT" || exit 1

if [ ! -f .output/server/index.mjs ]; then
  echo "Kein Build gefunden. Vorher 'npm run build' ausführen." >&2
  exit 1
fi

PORT=${TEST_PORT:-3000}
DATA=$(mktemp -d)
LOG1=$(mktemp)
LOG2=$(mktemp)
SRV=""

cleanup() {
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  [ -n "$SRV" ] && wait "$SRV" 2>/dev/null
  rm -rf "$DATA" "$LOG1" "$LOG2"
}
trap cleanup EXIT INT TERM

boot() {
  DATA_DIR="$DATA" DRACULA_PIN=1897 ADMIN_PIN=0666 NITRO_PORT="$PORT" \
    node .output/server/index.mjs > "$1" 2>&1 &
  SRV=$!
  i=0
  while [ $i -lt 60 ]; do
    curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health" && return 0
    kill -0 "$SRV" 2>/dev/null || return 1
    i=$((i+1)); sleep 0.25
  done
  return 1
}

halt() {
  kill "$SRV" 2>/dev/null
  wait "$SRV" 2>/dev/null
  SRV=""
}

echo "=== Durchgang 1: Spielstand aufbauen ==="
boot "$LOG1" || { echo "Server startet nicht:" >&2; cat "$LOG1" >&2; exit 1; }
TEST_PORT="$PORT" node ./test/test-restart-part1.mjs
RC=$?
halt
[ $RC -ne 0 ] && exit $RC

echo "--- Zeilen im Event-Log ---"
wc -l < "$DATA/events.jsonl"

echo ""
echo "=== Durchgang 2: nach Neustart ==="
boot "$LOG2" || { echo "Server startet nicht:" >&2; cat "$LOG2" >&2; exit 1; }
grep "\[game\]" "$LOG2"
TEST_PORT="$PORT" node ./test/test-restart-part2.mjs
RC=$?
halt
exit $RC
