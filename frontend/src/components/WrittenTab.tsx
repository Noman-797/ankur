import { useState } from 'react'
import type { WrittenQuestion } from '../types'
import MathMarkdown from './MathMarkdown'
import MathText from './MathText'
import GenerateLoader from './GenerateLoader'

interface Props {
  questions: WrittenQuestion[]
  notesMarkdown: string
  onAppend: (qs: WrittenQuestion[]) => void
}

export default function WrittenTab({ questions, notesMarkdown, onAppend }: Props) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateMore = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/written-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_markdown: notesMarkdown,
          existing_questions: questions.map((q) => q.question),
          count: 3,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      onAppend(data.written_questions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate written questions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-board/10 bg-white px-3 py-3 sm:px-4">
        <p className="text-sm font-semibold text-board">Exam-style written answers</p>
        <button
          onClick={() => void generateMore()}
          disabled={loading || !notesMarkdown}
          className="rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? 'Working…' : 'Generate 3 more'}
        </button>
      </div>

      {loading && (
        <GenerateLoader
          variant="banner"
          title="Generating written questions"
          hint="Exam-style short and long answers from your notes…"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {questions.length === 0 ? (
        <p className="py-10 text-center text-muted">
          No written questions yet. Generate short/long answers from your notes.
        </p>
      ) : (
        questions.map((q, i) => (
          <div key={`${i}-${q.question.slice(0, 24)}`} className="rounded-3xl border border-board/10 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 gap-2 text-[15px] font-semibold text-board">
                <span>{i + 1}.</span>
                <MathText className="min-w-0 flex-1">{q.question}</MathText>
              </div>
              <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-accent-dark">
                {q.marks} marks
              </span>
            </div>
            {(q.keywords?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {q.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-medium text-muted">
                    {k}
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
              className="mt-4 text-sm font-semibold text-accent-dark"
            >
              {revealed[i] ? 'Hide model answer' : 'Show model answer'}
            </button>
            {revealed[i] && (
              <div className="mt-3 rounded-xl bg-mist/70 px-4 py-3">
                <MathMarkdown>{q.model_answer}</MathMarkdown>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
