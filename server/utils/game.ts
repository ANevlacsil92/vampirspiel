import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Vampire {
  id: string
  name: string
  /** Hex-Farbe des Strohhalms, z.B. "#d92b2b" */
  color: string
  /** Zweite Farbe bei gestreiften Halmen. Fehlt bei einfarbigen. */
  color2?: string
  /** Farbname zum Vorlesen, z.B. "Rot" */
  label: string
  /** Inaktive Vampire zählen nicht für den Sieg */
  active: boolean
}

export interface Group {
  id: string
  name: string
  active: boolean
}

export interface GameState {
  /** Steigt bei jeder angewendeten Aktion. Client verwirft ältere Snapshots. */
  seq: number
  phase: 'setup' | 'running' | 'ended'
  groups: Group[]
  vampires: Vampire[]
  /** Schlüssel: `${groupId}|${vampireId}` -> Anzahl Zähne */
  teeth: Record<string, number>
  startedAt: number | null
  endedAt: number | null
  /** Gruppen, die alle Zähne beisammen hatten, in Reihenfolge des Erreichens */
  finished: { groupId: string; at: number }[]
}

export type ActionKind =
  | 'give'
  | 'take'
  | 'drain'
  | 'setup'
  | 'toggleVampire'
  | 'toggleGroup'
  | 'start'
  | 'end'
  | 'reset'

export interface Action {
  /** Vom Client erzeugte UUID – macht die Aktion idempotent */
  id: string
  kind: ActionKind
  actor: string
  payload: any
}

interface LoggedEvent extends Action {
  ts: number
}

// ---------------------------------------------------------------------------
// Persistenz
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR || '/data'
const LOG_PATH = join(DATA_DIR, 'events.jsonl')

function ensureDir() {
  const dir = dirname(LOG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function appendEvent(ev: LoggedEvent) {
  try {
    ensureDir()
    appendFileSync(LOG_PATH, JSON.stringify(ev) + '\n', 'utf8')
  } catch (err) {
    console.error('[game] Event konnte nicht geschrieben werden:', err)
  }
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

function emptyState(): GameState {
  return {
    seq: 0,
    phase: 'setup',
    groups: [],
    vampires: [],
    teeth: {},
    startedAt: null,
    endedAt: null,
    finished: [],
  }
}

let state: GameState = emptyState()
const seen = new Set<string>()

export const key = (groupId: string, vampireId: string) => `${groupId}|${vampireId}`

export function getState(): GameState {
  return state
}

function slug(prefix: string, n: number) {
  return `${prefix}${n}`
}

/** Prüft nach jeder Änderung, ob eine Gruppe gerade fertig geworden ist. */
function recomputeFinished(ts: number) {
  const needed = state.vampires.filter(v => v.active)
  if (!needed.length) return
  for (const g of state.groups) {
    if (!g.active) continue
    const complete = needed.every(v => (state.teeth[key(g.id, v.id)] || 0) > 0)
    const already = state.finished.find(f => f.groupId === g.id)
    if (complete && !already) {
      state.finished.push({ groupId: g.id, at: ts })
    } else if (!complete && already) {
      // Dracula hat einen Zahn abgenommen – Gruppe ist wieder im Rennen
      state.finished = state.finished.filter(f => f.groupId !== g.id)
    }
  }
}

/**
 * Wendet eine Aktion an. Gibt false zurück, wenn nichts passiert ist
 * (unbekannte Aktion, doppelte ID, ungültige Referenz).
 */
function reduce(a: Action, ts: number): boolean {
  switch (a.kind) {
    case 'setup': {
      const groupNames: string[] = a.payload.groups || []
      const vamps: {
        label: string
        color: string
        color2?: string
        name?: string
      }[] = a.payload.vampires || []

      state.groups = groupNames.map((name, i) => ({
        id: slug('g', i + 1),
        name: name.trim() || `Gruppe ${i + 1}`,
        active: true,
      }))
      state.vampires = vamps.map((v, i) => ({
        id: slug('v', i + 1),
        name: (v.name || v.label).trim(),
        label: v.label,
        color: v.color,
        // Nur setzen wenn vorhanden, sonst steht color2: undefined im Event-Log
        ...(v.color2 ? { color2: v.color2 } : {}),
        active: true,
      }))
      state.teeth = {}
      state.finished = []
      state.phase = 'setup'
      state.startedAt = null
      state.endedAt = null
      return true
    }

    case 'start': {
      if (!state.groups.length || !state.vampires.length) return false
      state.phase = 'running'
      state.startedAt = ts
      state.endedAt = null
      return true
    }

    case 'end': {
      state.phase = 'ended'
      state.endedAt = ts
      return true
    }

    case 'reset': {
      state.teeth = {}
      state.finished = []
      state.phase = 'setup'
      state.startedAt = null
      state.endedAt = null
      return true
    }

    case 'give': {
      const { groupId, vampireId } = a.payload
      if (!state.groups.some(g => g.id === groupId)) return false
      if (!state.vampires.some(v => v.id === vampireId)) return false
      const k = key(groupId, vampireId)
      state.teeth[k] = (state.teeth[k] || 0) + 1
      recomputeFinished(ts)
      return true
    }

    case 'take': {
      const { groupId, vampireId } = a.payload
      const k = key(groupId, vampireId)
      const cur = state.teeth[k] || 0
      if (cur <= 0) return false
      if (cur === 1) delete state.teeth[k]
      else state.teeth[k] = cur - 1
      recomputeFinished(ts)
      return true
    }

    case 'drain': {
      const { groupId, vampireIds } = a.payload as { groupId: string; vampireIds: string[] }
      if (!Array.isArray(vampireIds) || !vampireIds.length) return false
      let changed = false
      for (const vid of vampireIds) {
        const k = key(groupId, vid)
        const cur = state.teeth[k] || 0
        if (cur <= 0) continue
        if (cur === 1) delete state.teeth[k]
        else state.teeth[k] = cur - 1
        changed = true
      }
      if (changed) recomputeFinished(ts)
      return changed
    }

    case 'toggleVampire': {
      const v = state.vampires.find(x => x.id === a.payload.vampireId)
      if (!v) return false
      v.active = !!a.payload.active
      recomputeFinished(ts)
      return true
    }

    case 'toggleGroup': {
      const g = state.groups.find(x => x.id === a.payload.groupId)
      if (!g) return false
      g.active = !!a.payload.active
      recomputeFinished(ts)
      return true
    }

    default:
      return false
  }
}

/** Öffentlicher Einstieg: prüft Idempotenz, schreibt ins Log, erhöht seq. */
export function applyAction(a: Action): boolean {
  if (!a?.id || seen.has(a.id)) return false
  const ts = Date.now()
  const ok = reduce(a, ts)
  seen.add(a.id)
  if (!ok) return false
  state.seq++
  appendEvent({ ...a, ts })
  return true
}

/** Beim Start das Log abspielen, damit ein Neustart nichts kostet. */
let restored = false
export function restore() {
  if (restored) return
  restored = true
  ensureDir()
  if (!existsSync(LOG_PATH)) {
    console.log('[game] Kein Event-Log gefunden, starte leer.')
    return
  }
  let count = 0
  let broken = 0
  const lines = readFileSync(LOG_PATH, 'utf8').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const ev = JSON.parse(line) as LoggedEvent
      reduce(ev, ev.ts)
      seen.add(ev.id)
      count++
    } catch {
      broken++
    }
  }
  state.seq = count
  console.log(`[game] ${count} Events wiederhergestellt${broken ? `, ${broken} defekte Zeilen übersprungen` : ''}.`)
}

/** Archiviert das Log, z.B. vor einem neuen Spielabend. */
export function archiveLog() {
  if (!existsSync(LOG_PATH)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  renameSync(LOG_PATH, join(DATA_DIR, `events-${stamp}.jsonl`))
  state = emptyState()
  seen.clear()
}