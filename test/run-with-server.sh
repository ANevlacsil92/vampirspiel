#!/bin/sh
# Startet den gebauten Server, führt das übergebene Testskript aus, räumt auf.
# Aufruf: sh test/run-with-server.sh ./test/test-e2e.mjs

# Wurzel relativ zum Skript bestimmen, nicht zum Arbeitsverzeichnis.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
cd "$ROOT" || exit 1

if [ ! -f .output/server/index.mjs ]; then
  echo "Kein Build gefunden. Vorher 'npm run build' ausführen." >&2
  exit 1
fi

PORT=${TEST_PORT:-3000}
DATA=$(mktemp -d)
LOG=$(mktemp)
SRV=""

cleanup() {
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  [ -n "$SRV" ] && wait "$SRV" 2>/dev/null
  rm -rf "$DATA" "$LOG"
}
trap cleanup EXIT INT TERM

DATA_DIR="$DATA" DRACULA_PIN=1897 ADMIN_PIN=0666 NITRO_PORT="$PORT" \
  node .output/server/index.mjs > "$LOG" 2>&1 &
SRV=$!

i=0
while [ $i -lt 60 ]; do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health" && break
  # Ist der Server schon gestorben, hat weiteres Warten keinen Sinn
  kill -0 "$SRV" 2>/dev/null || { echo "Server beendet sich sofort:" >&2; cat "$LOG" >&2; exit 1; }
  i=$((i+1)); sleep 0.25
done

if [ $i -ge 60 ]; then
  echo "Server antwortet nicht auf Port $PORT:" >&2
  cat "$LOG" >&2
  exit 1
fi

echo "=== health ==="
curl -s "http://127.0.0.1:$PORT/api/health"; echo

echo "=== test ==="
# Kein Pipe: sonst steht in $? der Exit-Code von tail statt dem von node,
# und ein fehlgeschlagener Test meldet in der CI faelschlich Erfolg.
TEST_PORT="$PORT" node "$1"
RC=$?

echo "=== server log ==="
cat "$LOG"

exit $RC
