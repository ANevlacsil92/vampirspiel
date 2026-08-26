#!/bin/sh
# Startet den gebauten Server, testet den Upgrade, beendet ihn wieder.
cd /home/claude/vampirspiel || exit 1
pkill -f "index.mjs" 2>/dev/null
sleep 1
rm -rf /tmp/vsdata
mkdir -p /tmp/vsdata

DATA_DIR=/tmp/vsdata DRACULA_PIN=1897 ADMIN_PIN=0666 \
  node .output/server/index.mjs > /tmp/srv.log 2>&1 &
SRV=$!

# Warten bis der Port antwortet
i=0
while [ $i -lt 40 ]; do
  if curl -s -o /dev/null http://127.0.0.1:3000/api/health; then break; fi
  i=$((i+1)); sleep 0.25
done

echo "=== health ==="
curl -s http://127.0.0.1:3000/api/health; echo

echo "=== ws probe ==="
node "$1" 2>&1 | tail -40
RC=$?

echo "=== server log ==="
cat /tmp/srv.log

kill $SRV 2>/dev/null
wait $SRV 2>/dev/null
exit $RC
