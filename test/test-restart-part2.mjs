const ws = new WebSocket('ws://127.0.0.1:3000/_ws')
const wait = ms => new Promise(r => setTimeout(r, ms))
let state = null
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.type === 'state') state = m.state
})
await new Promise(r => ws.addEventListener('open', r))
await wait(300)

let bad = 0
const check = (n, c) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${n}`); if (!c) bad++ }

check('Gruppen wiederhergestellt', state?.groups.length === 2)
check('Gruppenname erhalten', state?.groups[0]?.name === 'Rote Gruppe')
check('Vampire wiederhergestellt', state?.vampires.length === 2)
check('Phase running erhalten', state?.phase === 'running')
check('Startzeit erhalten', typeof state?.startedAt === 'number')
check('Zahn g1|v1 da', state?.teeth['g1|v1'] === 1)
check('Zahn g1|v2 da', state?.teeth['g1|v2'] === 1)
check('Zahn g2|v1 da', state?.teeth['g2|v1'] === 1)
check('Gruppe 1 gilt als komplett', state?.finished.some(f => f.groupId === 'g1'))
check('Gruppe 2 noch nicht komplett', !state?.finished.some(f => f.groupId === 'g2'))

ws.close()
await wait(100)
console.log(bad ? `\n${bad} Test(s) fehlgeschlagen` : '\nNeustart-Test grün')
process.exit(bad ? 1 : 0)
