import type { HistoryPackSummary, SavedPack, StudyPack } from '../types'

const LEGACY_KEY = 'boardsnap.history.v1'
const DB_NAME = 'boardsnap'
const DB_VERSION = 1
const STORE = 'packs'
const MAX_THUMB_BYTES = 80_000

/** How many packs to send into Topic Radar / Ask (storage itself is uncapped). */
const MAX_SUMMARY_PACKS = 80

let cache: SavedPack[] | null = null
let ready: Promise<void> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

async function readAllFromDb(): Promise<SavedPack[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const rows = await idbReq(store.getAll() as IDBRequest<SavedPack[]>)
    return (rows ?? []).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
  } finally {
    db.close()
  }
}

async function writeAllToDb(items: SavedPack[]): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.clear()
    for (const item of items) {
      store.put(item)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    })
  } finally {
    db.close()
  }
}

function readLegacyLocalStorage(): SavedPack[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedPack[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistCache(next: SavedPack[]): SavedPack[] {
  cache = next
  void writeAllToDb(next).catch((err) => {
    console.warn('Ankur history save failed:', err)
  })
  return next
}

/**
 * Load packs from IndexedDB (migrates old localStorage once).
 * Safe to call multiple times; App should await this on mount.
 */
export function initHistory(): Promise<SavedPack[]> {
  if (!ready) {
    ready = (async () => {
      let items: SavedPack[] = []
      try {
        items = await readAllFromDb()
      } catch (err) {
        console.warn('Ankur IndexedDB read failed, trying localStorage:', err)
      }

      if (items.length === 0) {
        const legacy = readLegacyLocalStorage()
        if (legacy.length > 0) {
          items = legacy
          try {
            await writeAllToDb(items)
            localStorage.removeItem(LEGACY_KEY)
          } catch (err) {
            console.warn('Ankur history migration failed:', err)
          }
        }
      }

      cache = items
    })()
  }
  return ready.then(() => cache ?? [])
}

/** Sync snapshot — prefer after initHistory(); falls back to legacy localStorage. */
export function loadHistory(): SavedPack[] {
  if (cache) return cache
  const legacy = readLegacyLocalStorage()
  cache = legacy
  return legacy
}

/** Uncapped device history — oldest packs are never auto-deleted. */
export function saveToHistory(entry: SavedPack): SavedPack[] {
  const prev = loadHistory().filter((p) => p.id !== entry.id)
  return persistCache([entry, ...prev])
}

export function deleteFromHistory(id: string): SavedPack[] {
  return persistCache(loadHistory().filter((p) => p.id !== id))
}

export function getHistoryItem(id: string): SavedPack | undefined {
  return loadHistory().find((p) => p.id === id)
}

/** Compact semester map for Topic Radar / Ask (not a storage cap). */
export function historySummaries(items: SavedPack[] = loadHistory()): HistoryPackSummary[] {
  return items.slice(0, MAX_SUMMARY_PACKS).map((p) => ({
    title: p.title || p.study_pack.title,
    subject: p.subject || p.study_pack.subject || '',
    related_topics: p.study_pack.related_topics ?? [],
    notes_excerpt: (p.study_pack.notes_markdown || '').slice(0, 800),
  }))
}

export async function fileToThumb(file: File, maxEdge = 160): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    let quality = 0.7
    let data = canvas.toDataURL('image/jpeg', quality)
    while (data.length > MAX_THUMB_BYTES && quality > 0.35) {
      quality -= 0.1
      data = canvas.toDataURL('image/jpeg', quality)
    }
    return data.length > MAX_THUMB_BYTES * 1.5 ? undefined : data
  } catch {
    return undefined
  }
}

export function newPackId(): string {
  return `pack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function exportPackJson(pack: StudyPack, title?: string): void {
  const blob = new Blob(
    [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), study_pack: pack }, null, 2)],
    { type: 'application/json' },
  )
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(title || pack.title || 'ankur').replace(/[^\w\-]+/g, '_').slice(0, 40)}.boardsnap.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function exportAnkiTsv(pack: StudyPack): void {
  const rows = pack.flashcards.map((c) => {
    const q = c.question.replace(/\t/g, ' ').replace(/\n/g, '<br>')
    const a = c.answer.replace(/\t/g, ' ').replace(/\n/g, '<br>')
    return `${q}\t${a}`
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' })
  const el = document.createElement('a')
  el.href = URL.createObjectURL(blob)
  el.download = `${(pack.title || 'ankur').replace(/[^\w\-]+/g, '_').slice(0, 40)}_anki.tsv`
  el.click()
  URL.revokeObjectURL(el.href)
}

/** Strip markdown to readable plain text for WhatsApp. */
export function markdownToPlainText(md: string): string {
  return (md || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Share Notes or Step-by-step as plain text on WhatsApp.
 * Uses native share sheet when available (better for long text on phones).
 */
export async function shareWhatsAppText(opts: {
  title: string
  subject?: string
  label: string
  body: string
}): Promise<void> {
  const plain = markdownToPlainText(opts.body)
  if (!plain) {
    throw new Error('Nothing to share yet. Generate Notes or Step-by-step first.')
  }

  const header = [
    `*Ankur — ${opts.title}*`,
    opts.subject ? `Subject: ${opts.subject}` : '',
    `_${opts.label}_`,
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const message = `${header}${plain}`

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `Ankur — ${opts.title}`,
        text: message,
      })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }

  const max = 1800
  const text =
    message.length > max
      ? `${message.slice(0, max).trim()}\n\n… (full text in Ankur)`
      : message
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function parseImportFile(file: File): Promise<StudyPack> {
  const text = await file.text()
  const data = JSON.parse(text)
  const pack = data.study_pack ?? data
  if (!pack?.notes_markdown || !pack?.title) {
    throw new Error('Not a valid Ankur export')
  }
  return {
    title: pack.title,
    detected_languages: pack.detected_languages ?? [],
    subject: pack.subject ?? '',
    notes_markdown: pack.notes_markdown,
    code_snippets: pack.code_snippets ?? [],
    flashcards: pack.flashcards ?? [],
    quiz: pack.quiz ?? [],
    written_questions: pack.written_questions ?? [],
    mermaid_diagram: pack.mermaid_diagram ?? '',
    excalidraw_json: pack.excalidraw_json ?? '',
    related_topics: pack.related_topics ?? [],
    warnings: pack.warnings ?? [],
  }
}
