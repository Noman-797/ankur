import type { SavedRadarRun, TopicRadarResult } from '../types'

const DB_NAME = 'ankur-radar'
const DB_VERSION = 1
const STORE = 'runs'

let cache: SavedRadarRun[] | null = null
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
    req.onerror = () => reject(req.error ?? new Error('Radar IndexedDB open failed'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Radar IndexedDB request failed'))
  })
}

async function readAllFromDb(): Promise<SavedRadarRun[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const rows = await idbReq(store.getAll() as IDBRequest<SavedRadarRun[]>)
    return (rows ?? []).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
  } finally {
    db.close()
  }
}

async function writeAllToDb(items: SavedRadarRun[]): Promise<void> {
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
      tx.onerror = () => reject(tx.error ?? new Error('Radar IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Radar IndexedDB write aborted'))
    })
  } finally {
    db.close()
  }
}

function persistCache(next: SavedRadarRun[]): SavedRadarRun[] {
  cache = next
  void writeAllToDb(next).catch((err) => {
    console.warn('Ankur radar history save failed:', err)
  })
  return next
}

export function newRadarId(): string {
  return `radar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function initRadarHistory(): Promise<SavedRadarRun[]> {
  if (!ready) {
    ready = (async () => {
      try {
        cache = await readAllFromDb()
      } catch (err) {
        console.warn('Ankur radar history read failed:', err)
        cache = []
      }
    })()
  }
  return ready.then(() => cache ?? [])
}

export function loadRadarHistory(): SavedRadarRun[] {
  return cache ?? []
}

export function getRadarRun(id: string): SavedRadarRun | undefined {
  return loadRadarHistory().find((r) => r.id === id)
}

export function saveRadarRun(
  result: TopicRadarResult,
  id?: string,
): { runs: SavedRadarRun[]; run: SavedRadarRun } {
  const normalized: TopicRadarResult = {
    ...result,
    previous_questions: result.previous_questions ?? [],
    practice_quiz: result.practice_quiz ?? [],
    practice_written: result.practice_written ?? [],
  }
  const existingId = id || ''
  const prev = loadRadarHistory()
  const found = existingId ? prev.find((r) => r.id === existingId) : undefined
  const run: SavedRadarRun = {
    id: found?.id || newRadarId(),
    savedAt: new Date().toISOString(),
    title: normalized.exam_title || found?.title || 'Radar map',
    result: normalized,
  }
  const runs = persistCache([run, ...prev.filter((r) => r.id !== run.id)])
  return { runs, run }
}

export function deleteRadarRun(id: string): SavedRadarRun[] {
  return persistCache(loadRadarHistory().filter((r) => r.id !== id))
}
