const ws = new WebSocket(`ws://127.0.0.1:${process.env.TEST_PORT || 3000}/_ws`)
const wait = ms => new Promise(r => setTimeout(r, ms))
const send = o => ws.send(JSON.stringify(o))
const act = (kind, payload = {}) =>
  send({ type: 'action', action: { id: crypto.randomUUID(), kind, payload } })

await new Promise(r => ws.addEventListener('open', r))
send({ type: 'hello', token: 't-a', role: 'admin', pin: '0666' })
await wait(150)
act('setup', {
  groups: ['Rote Gruppe', 'Blaue Gruppe'],
  vampires: [{ label: 'Rot', color: '#e0332f' }, { label: 'Grün', color: '#33b35a' }],
})
await wait(150)
act('start')
await wait(100)
act('give', { groupId: 'g1', vampireId: 'v1' })
act('give', { groupId: 'g1', vampireId: 'v2' })
act('give', { groupId: 'g2', vampireId: 'v1' })
await wait(250)
console.log('Vor dem Neustart geschrieben: 3 Zähne, Phase running')
ws.close()
await wait(100)
process.exit(0)
