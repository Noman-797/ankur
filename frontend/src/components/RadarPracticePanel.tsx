import { useEffect, useRef, useState } from 'react'
import MathMarkdown from './MathMarkdown'
import MathText from './MathText'
import GenerateLoader from './GenerateLoader'
import type {
  AskMessage,
  HistoryPackSummary,
  QuizQuestion,
  TopicRadarResult,
  WrittenQuestion,
} from '../types'

type DeskTab = 'mcq' | 'written' | 'answers' | 'ask'

interface Props {
  result: TopicRadarResult
  historySummaries: HistoryPackSummary[]
  onUpdateResult: (next: TopicRadarResult) => void
  onBack: () => void
  onClose: () => void
}

const ASK_SUGGESTIONS = [
  'কোন টপিকগুলো must study?',
  'Previous Q এর একটা answer সহজ করে বলো',
  'Exam এ কোন টপিক থেকে বেশি আসতে পারে?',
  'Missing topics কীভাবে পড়ব?',
]

/** Build Ask context from everything Radar produced. */
export function radarContextMarkdown(result: TopicRadarResult): string {
  const parts: string[] = [
    `# ${result.exam_title || 'Topic Radar'}`,
    result.summary_markdown || '',
  ]

  if (result.must_study?.length) {
    parts.push('## Must study\n' + result.must_study.map((t) => `- ${t}`).join('\n'))
  }
  if (result.checklist?.length) {
    parts.push('## Checklist\n' + result.checklist.map((c) => `- ${c}`).join('\n'))
  }
  if (result.topics?.length) {
    parts.push(
      '## Topic map\n' +
        result.topics
          .map(
            (t) =>
              `- **${t.topic}** — ${t.importance} · ${t.weight_percent}% · ${t.coverage}` +
              (t.sample_questions?.length
                ? `\n  Samples: ${t.sample_questions.join(' | ')}`
                : ''),
          )
          .join('\n'),
    )
  }
  if (result.previous_questions?.length) {
    parts.push(
      '## Previous questions & solutions\n' +
        result.previous_questions
          .map(
            (q, i) =>
              `### Q${i + 1} (${q.marks} marks${q.topic ? ` · ${q.topic}` : ''})\n` +
              `${q.question}\n\n**Solution:**\n${q.solution_markdown || '_n/a_'}`,
          )
          .join('\n\n'),
    )
  }
  if (result.practice_written?.length) {
    parts.push(
      '## Practice written\n' +
        result.practice_written
          .map(
            (w, i) =>
              `### W${i + 1} (${w.marks} marks)\n${w.question}\n\nModel: ${w.model_answer}`,
          )
          .join('\n\n'),
    )
  }
  if (result.practice_quiz?.length) {
    parts.push(
      '## Practice MCQ\n' +
        result.practice_quiz
          .map(
            (q, i) =>
              `${i + 1}. ${q.question}\n` +
              q.options.map((o, oi) => `   ${String.fromCharCode(65 + oi)}. ${o}`).join('\n') +
              `\n   Correct: ${String.fromCharCode(65 + q.correct_index)}. ${q.explanation || ''}`,
          )
          .join('\n\n'),
    )
  }
  return parts.filter(Boolean).join('\n\n').slice(0, 28000)
}

export default function RadarPracticePanel({
  result,
  historySummaries,
  onUpdateResult,
  onBack,
  onClose,
}: Props) {
  const quiz = result.practice_quiz ?? []
  const written = result.practice_written ?? []
  const previous = result.previous_questions ?? []
  const contextMarkdown = radarContextMarkdown(result)

  const [tab, setTab] = useState<DeskTab>(() => {
    if (quiz.length) return 'mcq'
    if (written.length) return 'written'
    if (previous.length) return 'answers'
    return 'ask'
  })
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [showWritten, setShowWritten] = useState<Record<number, boolean>>({})
  const [openSolve, setOpenSolve] = useState<Record<number, boolean>>({})
  const [writtenLoading, setWrittenLoading] = useState(false)
  const [writtenError, setWrittenError] = useState('')
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState('')

  const [askInput, setAskInput] = useState('')
  const [askMessages, setAskMessages] = useState<AskMessage[]>([])
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState('')
  const askBottomRef = useRef<HTMLDivElement>(null)
  const askInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setAnswers({})
    setShowWritten({})
    setOpenSolve({})
  }, [result.exam_title])

  useEffect(() => {
    askBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [askMessages, askLoading])

  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(
    ([q, a]) => quiz[Number(q)]?.correct_index === a,
  ).length
  const finished = answered === quiz.length && quiz.length > 0

  const tabs: { id: DeskTab; label: string; count?: number }[] = [
    { id: 'mcq', label: 'MCQ', count: quiz.length },
    { id: 'written', label: 'Written', count: written.length },
    { id: 'answers', label: 'Previous answers', count: previous.length },
    { id: 'ask', label: 'Ask' },
  ]

  const generateMoreQuiz = async () => {
    setQuizLoading(true)
    setQuizError('')
    try {
      const res = await fetch('/api/more-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_markdown: contextMarkdown,
          existing_questions: quiz.map((q) => q.question),
          count: 5,
          difficulty: 'mixed',
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      const extra = (data.quiz ?? []) as QuizQuestion[]
      if (!extra.length) throw new Error('No new MCQs returned')
      onUpdateResult({
        ...result,
        practice_quiz: [...quiz, ...extra],
      })
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : 'Failed to generate MCQs')
    } finally {
      setQuizLoading(false)
    }
  }

  const generateMoreWritten = async () => {
    setWrittenLoading(true)
    setWrittenError('')
    try {
      const res = await fetch('/api/written-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_markdown: contextMarkdown,
          existing_questions: written.map((q) => q.question),
          count: 3,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      const extra = (data.written_questions ?? []) as WrittenQuestion[]
      if (!extra.length) throw new Error('No new questions returned')
      onUpdateResult({
        ...result,
        practice_written: [...written, ...extra],
      })
    } catch (e) {
      setWrittenError(e instanceof Error ? e.message : 'Failed to generate written questions')
    } finally {
      setWrittenLoading(false)
    }
  }

  const sendAsk = async (preset?: string) => {
    const q = (preset ?? askInput).trim()
    if (!q || askLoading) return
    const nextHistory = [...askMessages, { role: 'user' as const, content: q }]
    setAskMessages(nextHistory)
    setAskInput('')
    setAskLoading(true)
    setAskError('')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context_title: `Radar · ${result.exam_title || 'Previous questions'}`,
          context_markdown: contextMarkdown,
          history_packs: historySummaries,
          chat_history: nextHistory.slice(0, -1),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      setAskMessages((m) => [
        ...m,
        { role: 'assistant', content: data.answer_markdown || 'No answer returned.' },
      ])
    } catch (e) {
      setAskError(e instanceof Error ? e.message : 'Ask failed')
    } finally {
      setAskLoading(false)
      requestAnimationFrame(() => askInputRef.current?.focus())
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 animate-fade-up sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-accent-dark uppercase">
            Radar desk
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-board sm:text-3xl">
            {result.exam_title || 'Practice & answers'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            MCQ, written practice, previous solutions, and Ask on this Radar pack.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-10 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
          >
            Back to map
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-10 shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'bg-board text-chalk'
                : 'border border-board/10 bg-white text-muted hover:text-board'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'mcq' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-board/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Extra MCQ practice — generate more anytime from this Radar pack.
            </p>
            <button
              type="button"
              onClick={() => void generateMoreQuiz()}
              disabled={quizLoading || !contextMarkdown.trim()}
              className="min-h-10 shrink-0 rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {quizLoading ? 'Working…' : quiz.length ? 'Generate 5 more' : 'Generate MCQ'}
            </button>
          </div>

          {quizLoading && (
            <GenerateLoader
              variant="banner"
              title="Generating MCQs"
              hint="New practice questions in the style of your past paper…"
            />
          )}
          {quizError && <p className="text-sm text-red-600">{quizError}</p>}

          {!quiz.length && !quizLoading ? (
            <p className="rounded-2xl border border-board/10 bg-white px-4 py-8 text-center text-sm text-muted">
              No sample MCQs yet. Tap Generate MCQ, or check Written / Answers.
            </p>
          ) : (
            <>
              {quiz.map((q, i) => {
                const picked = answers[i]
                const revealed = picked !== undefined
                return (
                  <div
                    key={`${i}-${q.question.slice(0, 40)}`}
                    className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5"
                  >
                    <p className="text-xs font-bold tracking-wide text-muted uppercase">
                      Question {i + 1}
                    </p>
                    <div className="mt-2 text-sm font-medium text-board">
                      <MathText>{q.question}</MathText>
                    </div>
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.correct_index
                        const isPick = picked === oi
                        let style =
                          'border-board/10 bg-mist/40 text-board hover:border-accent-dark/40'
                        if (revealed && isCorrect) {
                          style = 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        } else if (revealed && isPick && !isCorrect) {
                          style = 'border-rose-300 bg-rose-50 text-rose-950'
                        }
                        return (
                          <button
                            key={oi}
                            type="button"
                            disabled={revealed}
                            onClick={() => setAnswers((prev) => ({ ...prev, [i]: oi }))}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${style}`}
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-board/90 text-[11px] font-bold text-chalk">
                              {String.fromCharCode(65 + oi)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <MathText>{opt}</MathText>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {revealed && q.explanation && (
                      <div className="mt-3 rounded-xl border border-board/10 bg-mist/50 px-3 py-2.5 text-sm text-board">
                        <p className="text-xs font-bold text-muted uppercase">Why</p>
                        <div className="mt-1">
                          <MathText>{q.explanation}</MathText>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {finished && (
                <p className="rounded-2xl border border-accent-dark/20 bg-accent-dark/5 px-4 py-3 text-sm font-semibold text-board">
                  Score: {correct} / {quiz.length}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'written' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-board/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Extra written practice — generate more anytime from this Radar pack.
            </p>
            <button
              type="button"
              onClick={() => void generateMoreWritten()}
              disabled={writtenLoading || !contextMarkdown.trim()}
              className="min-h-10 shrink-0 rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {writtenLoading ? 'Working…' : written.length ? 'Generate 3 more' : 'Generate written'}
            </button>
          </div>

          {writtenLoading && (
            <GenerateLoader
              variant="banner"
              title="Generating written questions"
              hint="Exam-style short and long answers from your Radar pack…"
            />
          )}
          {writtenError && <p className="text-sm text-red-600">{writtenError}</p>}

          {!written.length && !writtenLoading ? (
            <p className="rounded-2xl border border-board/10 bg-white px-4 py-8 text-center text-sm text-muted">
              No written samples yet. Tap Generate written, or check Previous answers.
            </p>
          ) : (
            written.map((w, i) => (
              <div
                key={`${i}-${w.question.slice(0, 40)}`}
                className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold tracking-wide text-muted uppercase">
                    Written {i + 1}
                  </p>
                  <span className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-bold text-board">
                    {w.marks} marks
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium text-board">
                  <MathText>{w.question}</MathText>
                </div>
                {w.keywords?.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Cover: {w.keywords.join(' · ')}</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowWritten((prev) => ({ ...prev, [i]: !prev[i] }))}
                  className="mt-3 min-h-10 rounded-full border border-board/15 px-4 py-2 text-xs font-semibold text-board hover:bg-mist"
                >
                  {showWritten[i] ? 'Hide model answer' : 'Show model answer'}
                </button>
                {showWritten[i] && (
                  <div className="mt-3 rounded-xl border border-board/10 bg-mist/50 px-3 py-3">
                    <MathMarkdown className="prose-notes">{w.model_answer}</MathMarkdown>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'answers' && (
        <div className="space-y-4">
          {!previous.length ? (
            <p className="rounded-2xl border border-board/10 bg-white px-4 py-8 text-center text-sm text-muted">
              No previous-question solutions extracted. Re-run Radar with clearer photos or pasted
              text.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Questions from your paper with full step-by-step solutions.
              </p>
              {previous.map((pq, i) => (
                <div
                  key={`${i}-${pq.question.slice(0, 40)}`}
                  className="rounded-2xl border border-board/10 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold tracking-wide text-muted uppercase">
                      Previous Q{i + 1}
                      {pq.topic ? ` · ${pq.topic}` : ''}
                    </p>
                    <span className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-bold text-board">
                      {pq.marks} marks
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-board">
                    <MathText>{pq.question}</MathText>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenSolve((prev) => ({ ...prev, [i]: !prev[i] }))}
                    className="mt-3 min-h-10 rounded-full bg-accent-dark px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    {openSolve[i] ? 'Hide full solve' : 'Show full solve'}
                  </button>
                  {openSolve[i] && (
                    <div className="mt-3 rounded-xl border border-accent-dark/20 bg-accent-dark/5 px-3 py-3 sm:px-4">
                      <p className="text-xs font-bold tracking-wide text-accent-dark uppercase">
                        Solution
                      </p>
                      <MathMarkdown className="prose-notes mt-2">
                        {pq.solution_markdown || '_No solution generated._'}
                      </MathMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'ask' && (
        <div className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-board/10 bg-white sm:min-h-[32rem]">
          <div className="border-b border-board/10 px-4 py-3 sm:px-5">
            <p className="text-sm font-bold text-board">Ask about this Radar pack</p>
            <p className="mt-0.5 text-xs text-muted">
              Answers use the topic map, must-study list, previous solutions, and practice from this
              run — plus your saved packs.
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5">
            {!askMessages.length && !askLoading && (
              <div className="flex flex-wrap gap-2">
                {ASK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendAsk(s)}
                    className="rounded-full border border-board/10 bg-mist/50 px-3 py-2 text-left text-xs font-medium text-board hover:bg-mist"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {askMessages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[85%] ${
                  m.role === 'user'
                    ? 'ml-auto bg-board text-chalk'
                    : 'mr-auto border border-board/10 bg-mist/40 text-board'
                }`}
              >
                {m.role === 'assistant' ? (
                  <MathMarkdown className="prose-notes">{m.content}</MathMarkdown>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {askLoading && (
              <GenerateLoader
                variant="banner"
                title="Thinking"
                hint="Using your Radar map and packs…"
              />
            )}
            {askError && <p className="text-sm text-red-600">{askError}</p>}
            <div ref={askBottomRef} />
          </div>

          <div className="border-t border-board/10 p-3 sm:p-4">
            <div className="flex gap-2">
              <textarea
                ref={askInputRef}
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendAsk()
                  }
                }}
                rows={2}
                placeholder="Ask about topics, solutions, or exam prep…"
                className="min-h-11 flex-1 resize-none rounded-2xl border border-board/10 bg-mist/40 px-3 py-2.5 text-sm text-board outline-none focus:border-accent-dark"
              />
              <button
                type="button"
                onClick={() => void sendAsk()}
                disabled={askLoading || !askInput.trim()}
                className="min-h-11 shrink-0 self-end rounded-full bg-accent-dark px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
