import { useRef, useState } from 'react'
import type { OutputLanguage } from '../types'

export type LectureSubmitPayload = {
  youtube_url: string
  raw_text: string
  output_language: OutputLanguage
  title_hint: string
  document: File | null
}

interface Props {
  language: OutputLanguage
  onLanguageChange: (l: OutputLanguage) => void
  onSubmit: (payload: LectureSubmitPayload) => void
  onClose: () => void
}

const ACCEPT =
  '.pdf,.docx,.pptx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown'

function fileKind(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'PDF'
  if (n.endsWith('.docx')) return 'DOCX'
  if (n.endsWith('.pptx')) return 'PPTX'
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown')) return 'Text'
  return 'File'
}

export default function LecturePanel({ language, onLanguageChange, onSubmit, onClose }: Props) {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [titleHint, setTitleHint] = useState('')
  const [document, setDocument] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = (file: File | null | undefined) => {
    if (!file) return
    const name = file.name.toLowerCase()
    const ok =
      name.endsWith('.pdf') ||
      name.endsWith('.docx') ||
      name.endsWith('.pptx') ||
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.markdown')
    if (!ok) {
      setError('Use PDF, DOCX, PPTX, TXT, or Markdown')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large (max 20 MB)')
      return
    }
    setError('')
    setDocument(file)
  }

  const hasSource = Boolean(youtubeUrl.trim() || rawText.trim() || document)

  const run = () => {
    if (!hasSource) {
      setError('Add a YouTube link, upload a file, or paste lecture text')
      return
    }
    setError('')
    onSubmit({
      youtube_url: youtubeUrl.trim(),
      raw_text: rawText.trim(),
      output_language: language,
      title_hint: titleHint.trim(),
      document,
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 animate-fade-up sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-accent-dark uppercase">Lecture</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-board sm:text-3xl">
            Turn class content into notes
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Add YouTube, PDF, Docs, slides, or pasted notes. Ankur builds complete Notes in Bangla or
            English. Explanation, Quiz, Flow, and Ask use the same pack.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
        >
          Close
        </button>
      </div>

      <div className="sticky top-14 z-10 -mx-1 rounded-2xl border border-board/10 bg-white/95 p-3 shadow-sm backdrop-blur-md sm:top-[4.75rem] sm:mx-0 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex w-full rounded-full border border-board/10 bg-mist/70 p-1 sm:w-auto">
              {(['bangla', 'english'] as OutputLanguage[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLanguageChange(l)}
                  className={`min-h-10 flex-1 rounded-full px-4 py-2 text-sm font-semibold capitalize transition-all sm:flex-none sm:px-5 ${
                    language === l ? 'bg-board text-chalk shadow-sm' : 'text-muted hover:text-board'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="px-1 text-xs text-muted sm:text-sm">
              {hasSource
                ? 'Ready — create notes anytime.'
                : 'Add a source below, then create notes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!hasSource}
            className="min-h-11 w-full shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Create notes
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
          <p className="text-sm font-bold text-board">YouTube</p>
          <p className="mt-1 text-xs text-muted">Paste a class video link with captions.</p>
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="mt-3 w-full rounded-2xl border border-board/10 bg-mist/40 px-4 py-3 text-sm text-board outline-none focus:border-accent-dark"
          />
        </div>

        <div className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
          <p className="text-sm font-bold text-board">PDF, Docs or slides</p>
          <p className="mt-1 text-xs text-muted">PDF, DOCX, PPTX, TXT or Markdown. Max 20 MB.</p>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          {document ? (
            <div className="mt-3 rounded-2xl border border-board/10 bg-mist/40 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-board px-3 py-1 text-[11px] font-bold tracking-wide text-accent uppercase">
                  {fileKind(document.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-board">{document.name}</p>
                  <p className="text-xs text-muted">{(document.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="min-h-10 rounded-full bg-accent-dark px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Change file
                </button>
                <button
                  type="button"
                  onClick={() => setDocument(null)}
                  className="min-h-10 rounded-full border border-board/15 bg-white px-4 py-2 text-xs font-semibold text-board hover:bg-mist"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pickFile(e.dataTransfer.files?.[0])
              }}
              className={`mt-3 flex w-full flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-center transition-colors ${
                dragging
                  ? 'border-accent-dark bg-accent-dark/5'
                  : 'border-board/15 bg-mist/40 hover:border-accent-dark/40 hover:bg-mist'
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-board font-display text-xl font-bold text-accent">
                +
              </span>
              <span className="font-display text-base font-bold text-board">Drop your file here</span>
              <span className="text-xs text-muted">or tap to choose from device</span>
              <span className="mt-1 rounded-full bg-accent-dark px-4 py-2 text-xs font-semibold text-white">
                Choose file
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-board">Paste notes or transcript</p>
            <p className="mt-1 text-xs text-muted">
              Optional if you already added YouTube or a file. You can also combine sources.
            </p>
          </div>
          {rawText.trim() && (
            <button
              type="button"
              onClick={() => setRawText('')}
              className="shrink-0 rounded-full border border-board/10 px-3 py-1.5 text-xs font-semibold text-muted hover:bg-mist hover:text-board"
            >
              Clear
            </button>
          )}
        </div>
        <div
          className={`mt-3 rounded-2xl border bg-mist/40 transition-colors ${
            rawText.trim()
              ? 'border-accent-dark/30'
              : 'border-board/10 focus-within:border-accent-dark/40'
          }`}
        >
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={7}
            placeholder="Paste lecture notes or a transcript here…"
            className="min-h-[10rem] w-full resize-y rounded-2xl bg-transparent px-4 py-3 text-sm leading-relaxed text-board outline-none placeholder:text-muted/80"
          />
          <div className="flex items-center justify-between gap-2 border-t border-board/10 px-3 py-2">
            <p className="text-[11px] text-muted">
              {rawText.trim()
                ? `${rawText.trim().split(/\n+/).filter(Boolean).length} line${
                    rawText.trim().split(/\n+/).filter(Boolean).length === 1 ? '' : 's'
                  }`
                : 'Bangla, Hindi, or English all work'}
            </p>
            <p className="text-[11px] tabular-nums text-muted">
              {rawText.length.toLocaleString()} chars
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5">
        <p className="text-sm font-bold text-board">Title hint</p>
        <p className="mt-1 text-xs text-muted">Optional. Helps Ankur name your study pack.</p>
        <input
          value={titleHint}
          onChange={(e) => setTitleHint(e.target.value)}
          placeholder="e.g. Stack vs Queue, Week 5"
          className="mt-3 w-full rounded-2xl border border-board/10 bg-mist/40 px-4 py-3 text-sm text-board outline-none focus:border-accent-dark"
        />
      </div>
    </div>
  )
}
