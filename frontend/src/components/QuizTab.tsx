import { useEffect, useState } from 'react'
import type { QuizDifficulty, QuizQuestion } from '../types'
import MathMarkdown from './MathMarkdown'
import MathText from './MathText'
import GenerateLoader from './GenerateLoader'

interface Props {
  quiz: QuizQuestion[]
  notesMarkdown: string
  title: string
  relatedTopics: string[]
  onAppendQuiz: (questions: QuizQuestion[]) => void
}

export default function QuizTab({
  quiz,
  notesMarkdown,
  title,
  relatedTopics,
  onAppendQuiz,
}: Props) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('mixed')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [coach, setCoach] = useState('')
  const [focus, setFocus] = useState<string[]>([])
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState('')

  useEffect(() => {
    setAnswers({})
    setCoach('')
    setFocus([])
    setCoachError('')
  }, [quiz.length])

  const answered = Object.keys(answers).length
  const correct = Object.entries(answers).filter(([q, a]) => quiz[Number(q)]?.correct_index === a).length
  const finished = answered === quiz.length && quiz.length > 0
  const missed = quiz
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => answers[i] !== undefined && answers[i] !== q.correct_index)
    .map(({ q }) => q.question)

  const generateMore = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/more-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_markdown: notesMarkdown,
          existing_questions: quiz.map((q) => q.question),
          count: 5,
          difficulty,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      onAppendQuiz(data.quiz ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate more quiz')
    } finally {
      setLoading(false)
    }
  }

  const requestCoach = async () => {
    setCoachLoading(true)
    setCoachError('')
    try {
      const res = await fetch('/api/weak-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_markdown: notesMarkdown,
          title,
          missed_questions: missed.length ? missed : quiz.map((q) => q.question).slice(0, 3),
          related_topics: relatedTopics,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      setCoach(data.coach_markdown ?? '')
      setFocus(data.focus_topics ?? [])
    } catch (e) {
      setCoachError(e instanceof Error ? e.message : 'Coach failed')
    } finally {
      setCoachLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-board/10 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-board">Difficulty</span>
          {(['easy', 'mixed', 'hard'] as QuizDifficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`min-h-10 rounded-full px-3 py-2 text-xs font-semibold capitalize transition-all ${
                difficulty === d ? 'bg-board text-chalk' : 'bg-mist text-muted hover:text-board'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => void generateMore()}
          disabled={loading || !notesMarkdown}
          className="min-h-10 w-full rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 sm:w-auto"
        >
          {loading ? 'Working…' : 'Generate 5 more'}
        </button>
      </div>

      {loading && (
        <GenerateLoader
          variant="banner"
          title="Generating quiz questions"
          hint="Building practice MCQs from your notes…"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {quiz.length === 0 ? (
        <p className="py-10 text-center text-muted">No quiz yet. Generate questions from your notes.</p>
      ) : (
        <>
          {finished && (
            <div className="space-y-3 rounded-3xl bg-board px-5 py-5 text-chalk shadow-lg animate-fade-up sm:px-7">
              <p className="font-display text-xl font-bold sm:text-2xl">
                Score: {correct} / {quiz.length}
              </p>
              <p className="text-sm text-emerald-200">
                {correct === quiz.length
                  ? 'Perfect. You nailed every question.'
                  : missed.length
                    ? `Missed ${missed.length}. Ask the weak-topic coach for a focused mini-lesson.`
                    : 'Review the notes and generate more practice questions.'}
              </p>
              <button
                type="button"
                onClick={() => void requestCoach()}
                disabled={coachLoading}
                className="rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {coachLoading ? 'Working…' : 'Weak-topic coach'}
              </button>
            </div>
          )}

          {coachLoading && (
            <GenerateLoader
              variant="banner"
              title="Weak-topic coach"
              hint="Building a focused mini-lesson from missed questions…"
            />
          )}

          {coachError && <p className="text-sm text-red-600">{coachError}</p>}
          {coach && (
            <div className="rounded-2xl border border-accent-dark/20 bg-mist/60 px-4 py-5 sm:px-6">
              <p className="mb-3 text-sm font-bold tracking-wide text-accent-dark uppercase">
                Focused revision
              </p>
              {focus.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {focus.map((t) => (
                    <span key={t} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-board">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <MathMarkdown>{coach}</MathMarkdown>
            </div>
          )}

          {quiz.map((q, qi) => {
            const picked = answers[qi]
            return (
              <div
                key={`${qi}-${q.question.slice(0, 24)}`}
                className="rounded-3xl border border-board/10 bg-white p-4 shadow-sm sm:p-6"
              >
                <div className="flex gap-2 text-[15px] font-semibold leading-relaxed text-board sm:text-base">
                  <span className="shrink-0">{qi + 1}.</span>
                  <MathText className="min-w-0 flex-1">{q.question}</MathText>
                </div>
                <div className="mt-4 grid gap-2">
                  {q.options.map((opt, oi) => {
                    const isPicked = picked === oi
                    const isCorrect = q.correct_index === oi
                    const revealed = picked !== undefined
                    let style = 'border-board/10 bg-white hover:border-accent-dark/40 hover:bg-mist'
                    if (revealed && isCorrect) style = 'border-emerald-500 bg-emerald-50'
                    else if (revealed && isPicked && !isCorrect) style = 'border-red-400 bg-red-50'
                    else if (revealed) style = 'border-board/10 bg-white opacity-55'

                    return (
                      <button
                        key={oi}
                        disabled={revealed}
                        onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                        className={`min-w-0 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition-all disabled:cursor-default sm:px-4 ${style}`}
                      >
                        <MathText>{opt}</MathText>
                      </button>
                    )
                  })}
                </div>
                {picked !== undefined && q.explanation && (
                  <div className="mt-3 rounded-xl bg-mist px-4 py-2.5 text-sm text-board/80 animate-fade-up">
                    <MathText>{q.explanation}</MathText>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
