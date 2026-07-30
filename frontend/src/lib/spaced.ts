import type { SpacedCard } from '../types'

const KEY = 'boardsnap.spaced.v1'

function loadAll(): Record<string, SpacedCard> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, SpacedCard>
  } catch {
    return {}
  }
}

function saveAll(map: Record<string, SpacedCard>) {
  localStorage.setItem(KEY, JSON.stringify(map))
}

function cardKey(packId: string, question: string) {
  return `${packId}::${question.slice(0, 120)}`
}

/** SM-2 lite: quality 0=again, 3=hard, 4=good, 5=easy */
export function reviewCard(packId: string, question: string, quality: 0 | 3 | 4 | 5): SpacedCard {
  const map = loadAll()
  const k = cardKey(packId, question)
  const now = Date.now()
  const prev = map[k] ?? {
    question,
    intervalDays: 0,
    ease: 2.5,
    dueAt: new Date(now).toISOString(),
    reps: 0,
  }

  let { intervalDays, ease, reps } = prev
  if (quality < 3) {
    reps = 0
    intervalDays = 0
  } else {
    if (reps === 0) intervalDays = 1
    else if (reps === 1) intervalDays = 3
    else intervalDays = Math.round(intervalDays * ease)
    reps += 1
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  }

  const dueAt = new Date(now + Math.max(intervalDays, 0) * 86400000).toISOString()
  const next: SpacedCard = { question, intervalDays, ease, dueAt, reps }
  map[k] = next
  saveAll(map)
  return next
}

export function dueQuestions(packId: string, questions: string[]): string[] {
  const map = loadAll()
  const now = Date.now()
  return questions.filter((q) => {
    const card = map[cardKey(packId, q)]
    if (!card) return true
    return new Date(card.dueAt).getTime() <= now
  })
}

let narrateAbort: AbortController | null = null

export type SpeakLang = 'bangla' | 'english'
export type SpeakPhase = 'preparing' | 'speaking'
export type SpeakResult =
  | { ok: true; url: string }
  | { ok: false; reason: string }

/**
 * AI reads the full selected text → builds full MP3 → returns an object URL for the player.
 * Caller must revoke the URL via revokeAudioUrl when done.
 */
export async function narrateAudio(
  text: string,
  lang: SpeakLang = 'bangla',
  onPhase?: (phase: SpeakPhase) => void,
): Promise<SpeakResult> {
  const plain = text.trim().slice(0, 60000)
  if (!plain) {
    return { ok: false, reason: 'Nothing to read yet. Generate notes or Step-by-step first.' }
  }

  abortNarration()
  onPhase?.('preparing')

  narrateAbort = new AbortController()
  try {
    const res = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plain, lang }),
      signal: narrateAbort.signal,
    })
    if (!res.ok) {
      let detail = ''
      try {
        const data = (await res.json()) as { detail?: string }
        detail = data.detail || ''
      } catch {
        detail = await res.text().catch(() => '')
      }
      return {
        ok: false,
        reason: detail || `Narrate failed (${res.status}). Try again in a moment.`,
      }
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    onPhase?.('speaking')
    return { ok: true, url }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, reason: 'Cancelled' }
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Speech request failed',
    }
  } finally {
    narrateAbort = null
  }
}

/** @deprecated use narrateAudio + AudioPlayer */
export async function speakText(
  text: string,
  lang: SpeakLang = 'bangla',
  onPhase?: (phase: SpeakPhase) => void,
): Promise<SpeakResult> {
  return narrateAudio(text, lang, onPhase)
}

export function abortNarration(): void {
  if (narrateAbort) {
    narrateAbort.abort()
    narrateAbort = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export function stopSpeaking(): void {
  abortNarration()
}

export function revokeAudioUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url)
}

export function isSpeaking(): boolean {
  return false
}
