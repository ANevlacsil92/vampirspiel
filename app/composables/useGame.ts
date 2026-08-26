import { computed, ref, shallowRef } from 'vue'

export type Role = 'vampir' | 'dracula' | 'admin'
export type Status = 'connecting' | 'online' | 'offline' | 'denied'

export interface Vampire {
  id: string
  name: string
  color: string
  /** Zweite Farbe bei gestreiften Halmen. Fehlt bei einfarbigen. */
  color2?: string
  label: string
  active: boolean
}
export interface Group {
  id: string
  name: string
  active: boolean
}
export interface GameState {
  seq: number
  phase: 'setup' | 'running' | 'ended'
  groups: Group[]
  vampires: Vampire[]
  teeth: Record<string, number>
  startedAt: number | null
  endedAt: number | null
  finished: { groupId: string; at: number }[]
}

interface QueuedAction {
  id: string
  kind: string
  payload: any
}

const LS = {
  token: 'vs.token',
  role: 'vs.role',
  vampireId: 'vs.vampireId',
  pin: 'vs.pin',
  queue: 'vs.queue',
}

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function read(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* Privatmodus – dann halt ohne */
  }
}

// --- Singleton-Zustand (SPA, also modulweit) -------------------------------

const serverState = shallowRef<GameState | null>(null)
const online = ref<string[]>([])
const status = ref<Status>('connecting')
const deniedReason = ref<string | null>(null)
const lastError = ref<string | null>(null)
const queue = ref<QueuedAction[]>([])

let socket: WebSocket | null = null
let pingTimer: any = null
let retryTimer: any = null
let attempt = 0
let started = false

const identity = {
  token: '',
  role: null as Role | null,
  vampireId: null as string | null,
  pin: null as string | null,
}

function loadIdentity() {
  identity.token = read(LS.token) || ''
  if (!identity.token) {
    identity.token = uuid()
    write(LS.token, identity.token)
  }
  identity.role = (read(LS.role) as Role) || null
  identity.vampireId = read(LS.vampireId)
  identity.pin = read(LS.pin)
  try {
    queue.value = JSON.parse(read(LS.queue) || '[]')
  } catch {
    queue.value = []
  }
}

function persistQueue() {
  write(LS.queue, JSON.stringify(queue.value))
}

export const teethKey = (groupId: string, vampireId: string) => `${groupId}|${vampireId}`

/** Wendet eine noch nicht bestätigte Aktion auf eine Kopie des States an. */
function applyOptimistic(teeth: Record<string, number>, a: QueuedAction) {
  const bump = (k: string, d: number) => {
    const next = (teeth[k] || 0) + d
    if (next <= 0) delete teeth[k]
    else teeth[k] = next
  }
  if (a.kind === 'give') bump(teethKey(a.payload.groupId, a.payload.vampireId), 1)
  else if (a.kind === 'take') bump(teethKey(a.payload.groupId, a.payload.vampireId), -1)
  else if (a.kind === 'drain') {
    for (const vid of a.payload.vampireIds || []) bump(teethKey(a.payload.groupId, vid), -1)
  }
}

/** Der State, den die UI sieht: Server + noch offene eigene Aktionen. */
const view = computed<GameState | null>(() => {
  const s = serverState.value
  if (!s) return null
  if (!queue.value.length) return s
  const teeth = { ...s.teeth }
  for (const a of queue.value) applyOptimistic(teeth, a)
  return { ...s, teeth }
})

// --- Verbindung ------------------------------------------------------------

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/_ws`
}

function sendRaw(obj: any): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false
  try {
    socket.send(JSON.stringify(obj))
    return true
  } catch {
    return false
  }
}

function flushQueue() {
  for (const a of queue.value) {
    sendRaw({ type: 'action', action: { ...a, actor: identity.token } })
  }
}

function sayHello() {
  if (!identity.role) return
  sendRaw({
    type: 'hello',
    token: identity.token,
    role: identity.role,
    pin: identity.pin || undefined,
    vampireId: identity.vampireId || undefined,
  })
}

function connect() {
  clearTimeout(retryTimer)
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  status.value = status.value === 'denied' ? 'denied' : 'connecting'

  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleRetry()
    return
  }

  socket.onopen = () => {
    attempt = 0
    status.value = 'online'
    deniedReason.value = null
    sayHello()
    flushQueue()
    clearInterval(pingTimer)
    pingTimer = setInterval(() => sendRaw({ type: 'ping' }), 20_000)
  }

  socket.onmessage = (ev) => {
    let msg: any
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }

    if (msg.type === 'state') {
      serverState.value = msg.state
      online.value = msg.online || []
    } else if (msg.type === 'ack') {
      queue.value = queue.value.filter(a => a.id !== msg.id)
      persistQueue()
    } else if (msg.type === 'rejected') {
      queue.value = queue.value.filter(a => a.id !== msg.id)
      persistQueue()
      lastError.value = msg.reason
    } else if (msg.type === 'denied') {
      status.value = 'denied'
      deniedReason.value = msg.reason
    } else if (msg.type === 'welcome') {
      deniedReason.value = null
    }
  }

  socket.onclose = () => {
    clearInterval(pingTimer)
    if (status.value !== 'denied') status.value = 'offline'
    scheduleRetry()
  }

  socket.onerror = () => {
    try {
      socket?.close()
    } catch {
      /* egal */
    }
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  const delay = Math.min(1000 * 2 ** attempt, 10_000)
  attempt++
  retryTimer = setTimeout(connect, delay)
}

// --- Öffentliche API -------------------------------------------------------

export function useGame() {
  if (!started && import.meta.client) {
    started = true
    loadIdentity()
    connect()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') connect()
    })
    window.addEventListener('online', connect)
  }

  function dispatch(kind: string, payload: any = {}): string {
    const action: QueuedAction = { id: uuid(), kind, payload }
    queue.value = [...queue.value, action]
    persistQueue()
    const sent = sendRaw({ type: 'action', action: { ...action, actor: identity.token } })
    if (!sent) connect()
    return action.id
  }

  function login(role: Role, opts: { pin?: string; vampireId?: string; force?: boolean } = {}) {
    identity.role = role
    identity.pin = opts.pin ?? null
    identity.vampireId = opts.vampireId ?? null
    write(LS.role, role)
    write(LS.pin, identity.pin)
    write(LS.vampireId, identity.vampireId)
    status.value = 'connecting'
    deniedReason.value = null
    if (socket?.readyState === WebSocket.OPEN) {
      sendRaw({
        type: 'hello',
        token: identity.token,
        role,
        pin: opts.pin,
        vampireId: opts.vampireId,
        force: opts.force,
      })
    } else {
      connect()
    }
  }

  function logout() {
    write(LS.role, null)
    write(LS.pin, null)
    write(LS.vampireId, null)
    identity.role = null
    identity.pin = null
    identity.vampireId = null
    deniedReason.value = null
    status.value = 'connecting'
    try {
      socket?.close()
    } catch {
      /* egal */
    }
    connect()
  }

  function buzz(pattern: number | number[] = 12) {
    try {
      navigator.vibrate?.(pattern)
    } catch {
      /* nicht überall vorhanden */
    }
  }

  return {
    state: view,
    serverState,
    online,
    status,
    deniedReason,
    lastError,
    pending: computed(() => queue.value.length),
    role: computed(() => identity.role),
    myVampireId: computed(() => identity.vampireId),
    dispatch,
    login,
    logout,
    buzz,
  }
}

/** Zähne einer Gruppe zählen (nur aktive Vampire). */
export function tally(state: GameState, groupId: string) {
  const need = state.vampires.filter(v => v.active)
  const have = need.filter(v => (state.teeth[teethKey(groupId, v.id)] || 0) > 0).length
  return { have, need: need.length }
}