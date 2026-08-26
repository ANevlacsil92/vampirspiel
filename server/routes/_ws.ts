import type { Peer } from 'crossws'
import { applyAction, getState, restore, type Action } from '../utils/game'
import { authenticate, findSession, onlineVampires, touch, type Role } from '../utils/session'

let restored = false
const peers = new Map<Peer, { token?: string; role?: Role }>()

function ensureRestored() {
  if (restored) return
  restore()
  restored = true
}

function snapshot() {
  return JSON.stringify({
    type: 'state',
    state: getState(),
    online: onlineVampires(),
  })
}

function broadcast() {
  const msg = snapshot()
  for (const peer of peers.keys()) {
    try {
      peer.send(msg)
    } catch {
      peers.delete(peer)
    }
  }
}

/** Darf diese Rolle diese Aktion? */
function permitted(role: Role | undefined, action: Action, vampireId?: string): string | null {
  if (!role) return 'Nicht angemeldet.'

  switch (action.kind) {
    case 'give':
    case 'take':
      if (role === 'vampir') {
        // Ein Vampir vergibt nur seine eigene Farbe
        if (action.payload?.vampireId !== vampireId) return 'Das ist nicht deine Farbe.'
        return null
      }
      return role === 'dracula' || role === 'admin' ? null : 'Nicht erlaubt.'

    case 'drain':
      return role === 'dracula' || role === 'admin' ? null : 'Nur Dracula darf Zähne abnehmen.'

    case 'setup':
    case 'reset':
    case 'toggleVampire':
    case 'toggleGroup':
    case 'start':
    case 'end':
      return role === 'admin' ? null : 'Nur die Spielleitung darf das.'

    default:
      return 'Unbekannte Aktion.'
  }
}

export default defineWebSocketHandler({
  open(peer) {
    ensureRestored()
    peers.set(peer, {})
    peer.send(snapshot())
  },

  message(peer, message) {
    ensureRestored()
    let data: any
    try {
      data = JSON.parse(message.text())
    } catch {
      return
    }

    const meta = peers.get(peer) || {}

    if (data.type === 'hello') {
      const res = authenticate({
        token: data.token,
        role: data.role,
        pin: data.pin,
        vampireId: data.vampireId,
        force: data.force,
      })
      if (!res.ok) {
        peer.send(JSON.stringify({ type: 'denied', reason: res.reason }))
        return
      }
      meta.token = data.token
      meta.role = data.role
      peers.set(peer, meta)
      peer.send(JSON.stringify({ type: 'welcome', role: data.role, vampireId: data.vampireId }))
      peer.send(snapshot())
      broadcast() // damit Dracula die neue Online-Liste sieht
      return
    }

    if (data.type === 'ping') {
      if (meta.token) touch(meta.token)
      peer.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (data.type === 'action') {
      const session = meta.token ? findSession(meta.token) : undefined
      const action = data.action as Action
      if (!action?.id || !action?.kind) return

      const problem = permitted(meta.role, action, session?.vampireId)
      if (problem) {
        peer.send(JSON.stringify({ type: 'rejected', id: action.id, reason: problem }))
        return
      }

      if (meta.token) touch(meta.token)
      const changed = applyAction({ ...action, actor: meta.token || 'unbekannt' })

      // Immer bestätigen – auch bei Duplikaten, sonst schickt der Client ewig nach
      peer.send(JSON.stringify({ type: 'ack', id: action.id }))
      if (changed) broadcast()
      else peer.send(snapshot())
    }
  },

  close(peer) {
    peers.delete(peer)
    broadcast()
  },

  error(peer) {
    peers.delete(peer)
  },
})
