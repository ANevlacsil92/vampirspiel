#!/bin/sh
# Prüft, ob ein Serverneustart den Spielstand aus dem Event-Log wiederherstellt.
cd /home/claude/vampirspiel || exit 1
pkill -f "index.mjs" 2>/dev/null
sleep 1
rm -rf /tmp/vsrestart
mkdir -p /tmp/vsrestart

boot() {
  DATA_DIR=/tmp/vsrestart DRACULA_PIN=1897 ADMIN_PIN=0666 \
    node .output/server/index.mjs > "$1" 2>&1 &
  SRV=$!
  i=0
  while [ $i -lt 40 ]; do
    curl -s -o /dev/null http://127.0.0.1:3000/api/health && return 0
    i=$((i+1)); sleep 0.25
  done
  return 1
}

echo "=== Durchgang 1: Spielstand aufbauen ==="
boot /tmp/r1.log || { echo "Server startet nicht"; exit 1; }
node ./test/test-restart-part1.mjs
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "--- Log-Datei ---"
wc -l /tmp/vsrestart/events.jsonl

echo ""
echo "=== Durchgang 2: nach Neustart ==="
boot /tmp/r2.log || { echo "Server startet nicht"; exit 1; }
grep "\[game\]" /tmp/r2.log
node ./test/test-restart-part2.mjs
RC=$?
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
exit $RC
