export type Role = 'vampir' | 'dracula' | 'admin'

export interface Session {
  token: string
  role: Role
  vampireId?: string
  lastSeen: number
}

const sessions = new Map<string, Session>()

export const DRACULA_PIN = process.env.DRACULA_PIN || '1897'
export const ADMIN_PIN = process.env.ADMIN_PIN || '0666'

export function findSession(token: string): Session | undefined {
  return sessions.get(token)
}

/** Wer hält gerade diese Vampirfarbe? */
export function holderOf(vampireId: string): Session | undefined {
  for (const s of sessions.values()) {
    if (s.vampireId === vampireId) return s
  }
  return undefined
}

export interface AuthResult {
  ok: boolean
  reason?: string
  session?: Session
}

export function authenticate(opts: {
  token: string
  role: Role
  pin?: string
  vampireId?: string
  force?: boolean
}): AuthResult {
  const { token, role, pin, vampireId, force } = opts
  if (!token) return { ok: false, reason: 'Kein Token.' }

  if (role === 'dracula' && pin !== DRACULA_PIN) {
    return { ok: false, reason: 'PIN stimmt nicht.' }
  }
  if (role === 'admin' && pin !== ADMIN_PIN) {
    return { ok: false, reason: 'PIN stimmt nicht.' }
  }

  if (role === 'vampir') {
    if (!vampireId) return { ok: false, reason: 'Keine Farbe gewählt.' }
    const holder = holderOf(vampireId)
    if (holder && holder.token !== token && !force) {
      const idle = Date.now() - holder.lastSeen
      // Nach 2 Minuten ohne Lebenszeichen darf übernommen werden
      if (idle < 120_000) {
        return { ok: false, reason: 'Diese Farbe ist schon vergeben.' }
      }
    }
    if (holder && holder.token !== token) sessions.delete(holder.token)
  }

  const session: Session = { token, role, vampireId, lastSeen: Date.now() }
  sessions.set(token, session)
  return { ok: true, session }
}

export function touch(token: string) {
  const s = sessions.get(token)
  if (s) s.lastSeen = Date.now()
}

/** Für die Dracula-Ansicht: welche Vampire sind gerade online? */
export function onlineVampires(): string[] {
  const now = Date.now()
  const out: string[] = []
  for (const s of sessions.values()) {
    if (s.role === 'vampir' && s.vampireId && now - s.lastSeen < 90_000) {
      out.push(s.vampireId)
    }
  }
  return out
}
