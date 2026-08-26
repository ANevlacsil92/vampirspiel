// Schneller End-to-End-Test gegen einen laufenden Server.
// Aufruf: node test-e2e.mjs
const URL = 'ws://127.0.0.1:3000/_ws'
let failures = 0

function check(name, cond) {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

function client(name) {
  const ws = new WebSocket(URL)
  const inbox = []
  let state = null
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    inbox.push(m)
    if (m.type === 'state') state = m.state
  })
  return {
    name,
    ws,
    inbox,
    get state() {
      return state
    },
    ready: new Promise(res => ws.addEventListener('open', res)),
    send: obj => ws.send(JSON.stringify(obj)),
    act(kind, payload = {}) {
      const id = crypto.randomUUID()
      ws.send(JSON.stringify({ type: 'action', action: { id, kind, payload } }))
      return id
    },
    last(type) {
      return [...inbox].reverse().find(m => m.type === type)
    },
    close: () => ws.close(),
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms))

const admin = client('admin')
const vamp = client('vampir')
const drac = client('dracula')
await Promise.all([admin.ready, vamp.ready, drac.ready])

// --- Anmeldung -------------------------------------------------------------
admin.send({ type: 'hello', token: 't-admin', role: 'admin', pin: '0666' })
await wait(120)
check('Admin mit richtiger PIN angenommen', !!admin.last('welcome'))

drac.send({ type: 'hello', token: 't-drac', role: 'dracula', pin: 'falsch' })
await wait(120)
check('Dracula mit falscher PIN abgelehnt', !!drac.last('denied'))

drac.send({ type: 'hello', token: 't-drac', role: 'dracula', pin: '1897' })
await wait(120)
check('Dracula mit richtiger PIN angenommen', !!drac.last('welcome'))

// --- Aufbau ----------------------------------------------------------------
admin.act('setup', {
  groups: ['Gruppe 1', 'Gruppe 2', 'Gruppe 3'],
  vampires: [
    { label: 'Rot', color: '#e0332f' },
    { label: 'Blau', color: '#2f6fe0' },
  ],
})
await wait(150)
check('3 Gruppen angelegt', admin.state?.groups.length === 3)
check('2 Vampire angelegt', admin.state?.vampires.length === 2)

vamp.send({ type: 'hello', token: 't-v1', role: 'vampir', vampireId: 'v1' })
await wait(120)
check('Vampir hat Farbe v1 belegt', !!vamp.last('welcome'))

// Zweiter Vampir will dieselbe Farbe
const vamp2 = client('vampir2')
await vamp2.ready
vamp2.send({ type: 'hello', token: 't-v2', role: 'vampir', vampireId: 'v1' })
await wait(120)
check('Belegte Farbe wird abgelehnt', !!vamp2.last('denied'))

// --- Zähne geben -----------------------------------------------------------
vamp.act('give', { groupId: 'g1', vampireId: 'v1' })
await wait(120)
check('Zahn bei Gruppe 1 angekommen', admin.state?.teeth['g1|v1'] === 1)

// Fremde Farbe darf der Vampir nicht vergeben
vamp.act('give', { groupId: 'g1', vampireId: 'v2' })
await wait(120)
check('Fremde Farbe abgelehnt', !!vamp.last('rejected'))
check('Fremder Zahn nicht gesetzt', !admin.state?.teeth['g1|v2'])

// Idempotenz: dieselbe Action-ID zweimal
const dupId = crypto.randomUUID()
vamp.send({ type: 'action', action: { id: dupId, kind: 'give', payload: { groupId: 'g2', vampireId: 'v1' } } })
await wait(100)
vamp.send({ type: 'action', action: { id: dupId, kind: 'give', payload: { groupId: 'g2', vampireId: 'v1' } } })
await wait(150)
check('Doppelte Action-ID zählt nur einmal', admin.state?.teeth['g2|v1'] === 1)

// Zurücknehmen
vamp.act('take', { groupId: 'g2', vampireId: 'v1' })
await wait(120)
check('Zahn zurückgenommen', !admin.state?.teeth['g2|v1'])

// --- Siegbedingung ---------------------------------------------------------
// Vampir 2 anmelden und Gruppe 1 vervollständigen
const vampB = client('vampirB')
await vampB.ready
vampB.send({ type: 'hello', token: 't-vb', role: 'vampir', vampireId: 'v2' })
await wait(120)
vampB.act('give', { groupId: 'g1', vampireId: 'v2' })
await wait(150)
check('Gruppe 1 als komplett erkannt', admin.state?.finished.some(f => f.groupId === 'g1'))

// --- Dracula nimmt ab ------------------------------------------------------
vamp.act('give', { groupId: 'g1', vampireId: 'v1' }) // jetzt 2 rote bei g1
await wait(120)
check('Gruppe 1 hat 2 rote Zähne', admin.state?.teeth['g1|v1'] === 2)

drac.act('drain', { groupId: 'g1', vampireIds: ['v1', 'v2'] })
await wait(150)
check('Dracula hat je einen abgezogen', admin.state?.teeth['g1|v1'] === 1 && !admin.state?.teeth['g1|v2'])
check('Gruppe 1 nicht mehr komplett', !admin.state?.finished.some(f => f.groupId === 'g1'))

// Vampir darf nicht drainen
vamp.act('drain', { groupId: 'g1', vampireIds: ['v1'] })
await wait(120)
check('Vampir darf nicht drainen', vamp.last('rejected')?.reason?.includes('Dracula'))

// Dracula darf nicht aufbauen
drac.act('reset')
await wait(120)
check('Dracula darf nicht zurücksetzen', drac.last('rejected')?.reason?.includes('Spielleitung'))

// --- Broadcast -------------------------------------------------------------
const seqBefore = vampB.state.seq
vamp.act('give', { groupId: 'g3', vampireId: 'v1' })
await wait(150)
check('Andere Clients bekommen das Update', vampB.state.seq > seqBefore)
check('Update enthält den neuen Zahn', vampB.state.teeth['g3|v1'] === 1)

for (const c of [admin, vamp, vamp2, vampB, drac]) c.close()
await wait(100)

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests grün')
process.exit(failures ? 1 : 0)
