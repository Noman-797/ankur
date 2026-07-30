import { useEffect, useRef, useState } from 'react'
import MathMarkdown from './MathMarkdown'
import GenerateLoader from './GenerateLoader'
import type { HistoryPackSummary, SavedRadarRun, TopicRadarResult } from '../types'

interface Props {
  historySummaries: HistoryPackSummary[]
  savedRuns: SavedRadarRun[]
  activeRunId?: string
  initialResult?: TopicRadarResult | null
  onClose: () => void
  onResult: (result: TopicRadarResult | null) => void
  onOpenDesk: (result: TopicRadarResult) => void
  onOpenRun: (run: SavedRadarRun) => void
  onDeleteRun: (id: string) => void
}

const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const importanceRank = (v: string) => (v === 'high' ? 0 : v === 'medium' ? 1 : 2)

function isPaperFile(f: File): boolean {
  const name = f.name.toLowerCase()
  if (f.type === 'application/pdf' || name.endsWith('.pdf')) return true
  if (['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(f.type)) return true
  return (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  )
}

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

export default function TopicRadarPanel({
  historySummaries,
  savedRuns,
  activeRunId = '',
  initialResult = null,
  onClose,
  onResult,
  onOpenDesk,
  onOpenRun,
  onDeleteRun,
}: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [paperText, setPaperText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TopicRadarResult | null>(initialResult)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setResult(initialResult)
  }, [initialResult])

  const publish = (next: TopicRadarResult | null) => {
    setResult(next)
    onResult(next)
  }

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(isPaperFile)
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES)
    if (tooBig) {
      setError(`File too large (max 10 MB): ${tooBig.name}`)
      return
    }
    setError('')
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES))
  }

  const removeAt = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  const run = async () => {
    if (!files.length && !paperText.trim()) {
      setError('Upload past-paper photos/PDF and/or paste questions')
      return
    }
    setLoading(true)
    setError('')
    publish(null)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('images', f))
      form.append('paper_text', paperText)
      form.append('history_json', JSON.stringify(historySummaries))
      form.append('generate_practice', 'true')
      form.append('practice_count', '5')
      const res = await fetch('/api/topic-radar', { method: 'POST', body: form })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = (await res.json()) as TopicRadarResult
      if (!data.previous_questions) data.previous_questions = []
      publish(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Topic Radar failed')
    } finally {
      setLoading(false)
    }
  }

  const coverageStyle = (c: string) => {
    if (c === 'covered') return 'bg-emerald-100 text-emerald-900'
    if (c === 'weak') return 'bg-amber-100 text-amber-900'
    return 'bg-rose-100 text-rose-900'
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-board">Topic Radar</h2>
          <p className="mt-1 text-sm text-muted">
            Upload past paper questions. Topic Radar checks them against your saved boards and
            lectures, shows important topics, gaps in your study, and makes targeted practice for
            you.
          </p>
          <p className="mt-2 text-xs text-muted">
            Using {historySummaries.length} saved pack
            {historySummaries.length === 1 ? '' : 's'} as your class syllabus. Radar maps are saved
            separately and never count as studied.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 shrink-0 rounded-full border border-board/15 px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
        >
          Close
        </button>
      </div>

      {savedRuns.length > 0 && (
        <div className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-board">Saved Radar maps</p>
              <p className="mt-0.5 text-xs text-muted">
                Open an old map anytime. New runs do not use these for coverage.
              </p>
            </div>
            <span className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-bold text-board">
              {savedRuns.length}
            </span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {savedRuns.map((run) => {
              const active = run.id === activeRunId
              const mcq = run.result.practice_quiz?.length ?? 0
              const wr = run.result.practice_written?.length ?? 0
              const sol = run.result.previous_questions?.length ?? 0
              return (
                <article
                  key={run.id}
                  className={`w-[min(100%,220px)] shrink-0 rounded-2xl border p-3 ${
                    active ? 'border-accent-dark/40 bg-accent-dark/5' : 'border-board/10 bg-mist/30'
                  }`}
                >
                  <p className="truncate font-display text-sm font-bold text-board">{run.title}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(run.savedAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {mcq} MCQ · {wr} written · {sol} solved
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRun(run)}
                      className="flex-1 rounded-full bg-accent-dark px-3 py-2 text-xs font-semibold text-white"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRun(run.id)}
                      className="rounded-full border border-board/15 px-3 py-2 text-xs font-semibold text-red-600/90 hover:bg-white"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 sm:items-stretch">
        <div className="flex flex-col rounded-2xl border border-board/10 bg-white p-4">
          <p className="text-sm font-bold text-board">Paper photos or PDF</p>
          <p className="mt-1 text-xs text-muted">
            JPG, PNG, WebP, or PDF. Up to {MAX_FILES} files · max 10 MB each.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {/* Fixed height — selected files replace empty state, no page jump */}
          <div
            className={`mt-3 flex h-[200px] flex-col overflow-hidden rounded-2xl border transition-colors sm:h-[220px] ${
              dragging
                ? 'border-accent-dark bg-accent-dark/5'
                : 'border-board/15 bg-mist/40 hover:border-accent-dark/40'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 py-4 text-center"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-board font-display text-xl font-bold text-accent">
                  +
                </span>
                <span className="font-display text-base font-bold text-board">Drop photos or PDF</span>
                <span className="text-xs text-muted">or tap to choose from device</span>
                <span className="mt-0.5 rounded-full bg-accent-dark px-4 py-2 text-xs font-semibold text-white">
                  Choose files
                </span>
              </button>
            ) : (
              <div className="flex h-full flex-col px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                    Selected ({files.length}/{MAX_FILES})
                  </p>
                  {files.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-board/15 bg-white px-3 py-1 text-[11px] font-semibold text-board hover:bg-mist"
                    >
                      Add more
                    </button>
                  )}
                </div>
                <div className="mt-2 flex min-h-0 flex-1 items-center gap-2 overflow-x-auto">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}-${f.size}`}
                      className="relative h-[7.25rem] w-[7.25rem] shrink-0"
                    >
                      {isPdfFile(f) ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-board/10 bg-board px-2 text-center">
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-board">
                            PDF
                          </span>
                          <span className="line-clamp-3 w-full text-[9px] font-medium leading-tight text-chalk/90">
                            {f.name}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={URL.createObjectURL(f)}
                          alt={`Paper ${i + 1}`}
                          className="h-full w-full rounded-xl border border-board/10 object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-board text-sm font-bold text-chalk"
                      >
                        ×
                      </button>
                      <span className="absolute bottom-1 left-1 rounded bg-board/80 px-1.5 text-[10px] font-bold text-chalk">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-board/10 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-board">Paste questions</p>
              <p className="mt-1 text-xs text-muted">
                Type or paste from your past paper. Photos/PDF optional if you paste here.
              </p>
            </div>
            {paperText.trim() && (
              <button
                type="button"
                onClick={() => setPaperText('')}
                className="shrink-0 rounded-full border border-board/10 px-3 py-1.5 text-xs font-semibold text-muted hover:bg-mist hover:text-board"
              >
                Clear
              </button>
            )}
          </div>

          <div
            className={`mt-3 flex h-[200px] flex-col overflow-hidden rounded-2xl border bg-mist/40 transition-colors sm:h-[220px] ${
              paperText.trim()
                ? 'border-accent-dark/30'
                : 'border-board/10 focus-within:border-accent-dark/40'
            }`}
          >
            <textarea
              value={paperText}
              onChange={(e) => setPaperText(e.target.value)}
              className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-board outline-none placeholder:text-muted/80"
              placeholder={
                'Q1. Define stack with an example.\nQ2. Write differences between array and linked list.\nQ3. …'
              }
            />
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-board/10 px-3 py-2">
              <p className="text-[11px] text-muted">
                {paperText.trim()
                  ? `${paperText.trim().split(/\n+/).filter(Boolean).length} line${
                      paperText.trim().split(/\n+/).filter(Boolean).length === 1 ? '' : 's'
                    }`
                  : 'One question per line works best'}
              </p>
              <p className="text-[11px] tabular-nums text-muted">
                {paperText.length.toLocaleString()} chars
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className="rounded-full bg-accent-dark px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {loading ? 'Working…' : 'Run Topic Radar'}
      </button>

      {loading && (
        <GenerateLoader
          variant="banner"
          title="Running Topic Radar"
          hint="Matching past papers with your semester history…"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-board/10 bg-white px-4 py-5 sm:px-7">
            <p className="text-xs font-bold tracking-wide text-accent-dark uppercase">Exam map</p>
            <h3 className="mt-1 font-display text-xl font-bold text-board">{result.exam_title}</h3>
            {result.summary_markdown && (
              <MathMarkdown className="prose-notes mt-3">{result.summary_markdown}</MathMarkdown>
            )}
          </div>

          {result.must_study.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-4 sm:px-6">
              <p className="text-sm font-bold text-rose-900">Must study</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-950">
                {result.must_study.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-3">
            {[...result.topics]
              .sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance))
              .map((t) => (
                <div key={t.topic} className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold text-board">{t.topic}</p>
                      <p className="mt-1 text-xs text-muted">
                        {t.question_count} Q · {t.weight_percent}% weight · {t.importance} importance
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${coverageStyle(t.coverage)}`}>
                      {t.coverage}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-accent-dark"
                      style={{ width: `${Math.min(100, Math.max(4, t.weight_percent))}%` }}
                    />
                  </div>
                  {t.study_actions?.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-board">
                      {t.study_actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  )}
                  {t.sample_questions?.length > 0 && (
                    <div className="mt-3 space-y-1 text-sm text-muted">
                      {t.sample_questions.map((q) => (
                        <p key={q}>• {q}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {result.checklist.length > 0 && (
            <div className="rounded-2xl border border-board/10 bg-mist/50 px-4 py-4 sm:px-6">
              <p className="text-sm font-bold text-board">Study checklist</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-board">
                {result.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {(result.practice_quiz.length > 0 ||
            result.practice_written.length > 0 ||
            (result.previous_questions?.length ?? 0) > 0) && (
            <button
              type="button"
              onClick={() => onOpenDesk(result)}
              className="w-full rounded-full bg-board px-4 py-3 text-center text-sm font-semibold leading-snug text-chalk hover:bg-board-light"
            >
              Open practice & answers
              <span className="mt-0.5 block text-xs font-medium text-chalk/80">
                {result.practice_quiz.length} MCQ
                {result.practice_written.length
                  ? ` · ${result.practice_written.length} written`
                  : ''}
                {result.previous_questions?.length
                  ? ` · ${result.previous_questions.length} solved`
                  : ''}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
