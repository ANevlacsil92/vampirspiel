import { restore } from '../utils/game'

/**
 * Stellt den Spielstand beim Serverstart her, nicht erst wenn sich der erste
 * Client verbindet. Sonst meldet /api/health nach einem Neustart ein leeres
 * Spiel, obwohl das Event-Log voll ist.
 */
export default defineNitroPlugin(() => {
  restore()
})
