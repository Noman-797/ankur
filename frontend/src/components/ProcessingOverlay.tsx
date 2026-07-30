import { useEffect, useState } from 'react'

type IconProps = { className?: string }

const CheckIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
    <path d="M4.5 12.5l5 5 10-11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ScanIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path
      d="M3 8V5a2 2 0 012-2h3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M21 16v3a2 2 0 01-2 2h-3"
      strokeLinecap="round"
    />
    <path d="M3 12h18" strokeLinecap="round" />
  </svg>
)

const NotesIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
  </svg>
)

const CodeIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CardsIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <rect x="3" y="7" width="13" height="14" rx="2.5" />
    <path d="M8 3h10a3 3 0 013 3v10" strokeLinecap="round" />
  </svg>
)

/** Official-style YouTube mark */
const YouTubeIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path
      fill="currentColor"
      d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.4 31.4 0 000 12a31.4 31.4 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.4 31.4 0 0024 12a31.4 31.4 0 00-.5-5.8z"
    />
    <path fill="#fff" d="M9.75 15.5v-7l6 3.5-6 3.5z" />
  </svg>
)

/** Document / file stack */
const DocumentsIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path
      d="M8 4h7l4 4v10a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
      strokeLinejoin="round"
    />
    <path d="M15 4v4h4M10 12h6M10 16h4" strokeLinecap="round" />
    <path d="M6 8H5a2 2 0 00-2 2v9a2 2 0 002 2h9" strokeLinecap="round" opacity="0.45" />
  </svg>
)

const BOARD_STAGES = [
  { title: 'Reading the board', hint: 'OCR + layout', Icon: ScanIcon },
  { title: 'Reconstructing notes', hint: 'Clean Markdown', Icon: NotesIcon },
  { title: 'Extracting code', hint: 'Snippets & logic', Icon: CodeIcon },
  { title: 'Building study pack', hint: 'Cards & quiz', Icon: CardsIcon },
]

export type ProcessingMode = 'board' | 'lecture'
export type LectureSourceKind = 'youtube' | 'document' | 'text'

type Props = {
  mode?: ProcessingMode
  /** @deprecated prefer imageUrls */
  imageUrl?: string
  /** All board photos — slides while analyzing */
  imageUrls?: string[]
  /** YouTube URL, title hint, or short label for lecture mode */
  lectureLabel?: string
  /** Which lecture inputs are being analyzed */
  lectureSources?: LectureSourceKind[]
}

function sourceMeta(kind: LectureSourceKind) {
  if (kind === 'youtube') {
    return { label: 'YouTube', Icon: YouTubeIcon, tone: 'text-[#FF0033]' }
  }
  if (kind === 'document') {
    return { label: 'Document', Icon: DocumentsIcon, tone: 'text-accent' }
  }
  return { label: 'Notes', Icon: NotesIcon, tone: 'text-accent' }
}

function lectureStages(sources: LectureSourceKind[]) {
  const primary = sources[0] ?? 'text'
  const FetchIcon =
    primary === 'youtube' ? YouTubeIcon : primary === 'document' ? DocumentsIcon : NotesIcon
  const fetchHint =
    primary === 'youtube'
      ? 'Captions & transcript'
      : primary === 'document'
        ? 'PDF / Docs / slides'
        : 'Pasted lecture text'
  const fetchTitle =
    primary === 'youtube'
      ? 'Fetching lecture'
      : primary === 'document'
        ? 'Reading document'
        : 'Reading your notes'

  return [
    { title: fetchTitle, hint: fetchHint, Icon: FetchIcon },
    { title: 'Understanding content', hint: 'Any spoken language', Icon: ScanIcon },
    { title: 'Writing notes', hint: 'Your output language', Icon: NotesIcon },
    { title: 'Building study pack', hint: 'Cards & quiz', Icon: CardsIcon },
  ]
}

export default function ProcessingOverlay({
  mode = 'board',
  imageUrl = '',
  imageUrls = [],
  lectureLabel = '',
  lectureSources = [],
}: Props) {
  const boardImages = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : []
  const sources: LectureSourceKind[] =
    lectureSources.length > 0
      ? lectureSources
      : mode === 'lecture'
        ? ['text']
        : []
  const stages = mode === 'lecture' ? lectureStages(sources) : BOARD_STAGES
  const [stage, setStage] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    setStage(0)
    setElapsed(0)
    setSlide(0)
    const stageTimer = setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1))
    }, 5500)
    const clock = setInterval(() => setElapsed((t) => t + 1), 1000)
    return () => {
      clearInterval(stageTimer)
      clearInterval(clock)
    }
  }, [mode, stages.length, sources.join('|')])

  useEffect(() => {
    if (mode !== 'board' || boardImages.length <= 1) return
    const t = setInterval(() => {
      setSlide((s) => (s + 1) % boardImages.length)
    }, 2800)
    return () => clearInterval(t)
  }, [mode, boardImages.length, boardImages.join('|')])

  const progress = ((stage + 1) / stages.length) * 100
  const ActiveIcon = stages[stage].Icon
  const eyebrow = mode === 'lecture' ? 'Lecture in progress' : 'Digitize in progress'
  const engine = mode === 'lecture' ? 'Gemma · lecture notes' : 'Gemma 4 vision'
  const label =
    lectureLabel.trim() ||
    (mode === 'lecture' ? 'YouTube / pasted lecture' : 'Whiteboard photo')
  const activeSlide = boardImages[Math.min(slide, Math.max(0, boardImages.length - 1))] || ''

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-8 pt-4 animate-fade-up sm:gap-10">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.18em] text-accent-dark uppercase">{eyebrow}</p>
        <div className="mt-3 flex items-center justify-center gap-2.5">
          <ActiveIcon className="h-6 w-6 text-accent-dark" />
          <h2 className="font-display text-2xl font-bold text-board sm:text-3xl">
            {stages[stage].title}
          </h2>
        </div>
        <p className="mt-1.5 text-sm text-muted">{stages[stage].hint}</p>
      </div>

      <div className="relative h-64 w-full overflow-hidden rounded-3xl border border-board/10 bg-board shadow-[0_24px_60px_-28px_rgba(12,41,32,0.5)] sm:h-72">
        {mode === 'board' && activeSlide ? (
          <>
            {boardImages.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`Board ${i + 1}`}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ${
                  i === slide ? 'opacity-90' : 'pointer-events-none opacity-0'
                }`}
              />
            ))}
            {boardImages.length > 1 && (
              <div className="absolute top-3 right-3 z-10 rounded-full bg-board/70 px-2.5 py-1 text-[11px] font-bold text-emerald-50 tabular-nums backdrop-blur-sm">
                {slide + 1} / {boardImages.length}
              </div>
            )}
            {boardImages.length > 1 && (
              <div className="absolute bottom-14 left-0 right-0 z-10 flex justify-center gap-1.5">
                {boardImages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Show photo ${i + 1}`}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide ? 'w-5 bg-accent' : 'w-1.5 bg-white/35 hover:bg-white/55'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-10">
            {mode === 'lecture' ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {sources.map((kind) => {
                  const { Icon, tone, label: kindLabel } = sourceMeta(kind)
                  return (
                    <span
                      key={kind}
                      className="flex flex-col items-center gap-2"
                      title={kindLabel}
                    >
                      <span
                        className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 sm:h-20 sm:w-20 ${tone}`}
                      >
                        <Icon className="h-9 w-9 sm:h-10 sm:w-10" />
                      </span>
                      <span className="text-[11px] font-semibold tracking-wide text-emerald-100/80 uppercase">
                        {kindLabel}
                      </span>
                    </span>
                  )
                })}
              </div>
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-accent">
                <ScanIcon className="h-8 w-8" />
              </span>
            )}
            <p className="max-w-2xl text-center text-sm font-medium text-emerald-50/95 break-all sm:text-base">
              {label}
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-board/55 via-transparent to-board/20" />
        <div className="scan-beam pointer-events-none absolute inset-x-0 h-16" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-4 pt-10 sm:px-6">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-emerald-100/90">
            <span>{engine}</span>
            <span>{elapsed}s</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <ol className="grid w-full grid-cols-1 gap-2.5 min-[400px]:grid-cols-2 sm:grid-cols-4 sm:gap-3">
        {stages.map((item, i) => {
          const done = i < stage
          const active = i === stage
          const StepIcon = item.Icon
          return (
            <li
              key={item.title}
              className={`rounded-2xl border px-3.5 py-3 transition-all duration-500 ${
                active
                  ? 'border-accent-dark/40 bg-white shadow-sm'
                  : done
                    ? 'border-board/10 bg-white/80'
                    : 'border-board/5 bg-white/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                    done
                      ? 'bg-accent-dark text-white'
                      : active
                        ? 'bg-board text-accent'
                        : 'bg-mist text-muted'
                  }`}
                >
                  {done ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </span>
                {active && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-dark" />
                )}
              </div>
              <p
                className={`mt-2 text-sm font-semibold leading-snug ${
                  active || done ? 'text-board' : 'text-muted'
                }`}
              >
                {item.title}
              </p>
            </li>
          )
        })}
      </ol>

      <p className="text-center text-sm text-muted">
        Usually finishes in about a minute. Keep this tab open.
      </p>
    </div>
  )
}
