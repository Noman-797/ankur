/** Keep the current page across refresh (same browser tab). Home only after Close / logo. */
const KEY = 'ankur.activeSession.v1'
const RADAR_KEY = 'ankur.radarResult.v1'

export type SessionPhase = 'done' | 'ask' | 'lecture' | 'radar' | 'radarPractice' | 'guide'

export type ActiveSession = {
  phase: SessionPhase
  /** Present when restoring a study pack (done / ask-from-pack) */
  packId?: string
  /** Present when restoring a Radar map / desk */
  radarRunId?: string
  tab?: string
  language?: 'bangla' | 'english'
}

const SESSION_PHASES: SessionPhase[] = [
  'done',
  'ask',
  'lecture',
  'radar',
  'radarPractice',
  'guide',
]

export function saveActiveSession(session: ActiveSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as ActiveSession
    if (!data?.phase || !SESSION_PHASES.includes(data.phase)) return null
    if (data.phase === 'done' && !data.packId) return null
    return data
  } catch {
    return null
  }
}

export function clearActiveSession(): void {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(RADAR_KEY)
  } catch {
    /* ignore */
  }
}

export function saveRadarResult(result: unknown): void {
  try {
    sessionStorage.setItem(RADAR_KEY, JSON.stringify(result))
  } catch {
    /* ignore */
  }
}

export function loadRadarResult<T = unknown>(): T | null {
  try {
    const raw = sessionStorage.getItem(RADAR_KEY)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearRadarResult(): void {
  try {
    sessionStorage.removeItem(RADAR_KEY)
  } catch {
    /* ignore */
  }
}
