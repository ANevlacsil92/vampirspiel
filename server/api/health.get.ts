import { getState } from '../utils/game'

export default defineEventHandler(() => {
  const s = getState()
  return {
    ok: true,
    phase: s.phase,
    groups: s.groups.length,
    vampires: s.vampires.length,
    seq: s.seq,
    uptime: Math.round(process.uptime()),
  }
})
