import { useEffect, useRef, useState } from 'react'
import MathMarkdown from './MathMarkdown'
import GenerateLoader from './GenerateLoader'
import type { AskMessage, HistoryPackSummary } from '../types'

interface Props {
  contextTitle: string
  contextMarkdown: string
  historySummaries: HistoryPackSummary[]
  onClose: () => void
}

const SUGGESTIONS = [
  'এই lecture এর main points সহজ করে বলো',
  'একটা ছোট উদাহরণ দিয়ে বুঝিয়ে দাও',
  'Common mistakes গুলো কী কী?',
  'Exam এ কীভাবে লিখব এই টপিক?',
]

export default function AskPanel({
  contextTitle,
  contextMarkdown,
  historySummaries,
  onClose,
}: Props) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const send = async (preset?: string) => {
    const q = (preset ?? input).trim()
    if (!q || loading) return
    const nextHistory = [...messages, { role: 'user' as const, content: q }]
    setMessages(nextHistory)
    setInput('')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context_title: contextTitle,
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
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: data.answer_markdown || 'No answer returned.' },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ask failed')
    } finally {
      setLoading(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const hasContext = Boolean(contextMarkdown?.trim())
  const packCount = historySummaries.length

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col animate-fade-up sm:min-h-[75vh]">
      <div className="relative overflow-hidden rounded-xl border border-board/10 bg-board px-4 py-5 text-chalk shadow-[0_24px_60px_-36px_rgba(12,41,32,0.55)] sm:px-8 sm:py-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 12% 20%, rgba(61,214,140,0.35), transparent 45%), radial-gradient(ellipse at 90% 80%, rgba(244,241,232,0.08), transparent 40%)',
          }}
        />
        <div className="relative flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] text-accent uppercase">
              Ankur tutor
            </p>
            <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-3xl">
              Ask anything
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-emerald-100/85">
              Answers stay grounded in your active notes
              {packCount ? ` and ${packCount} saved pack${packCount === 1 ? '' : 's'}` : ''}.
            </p>
            <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-accent" />
              <span className="truncate text-xs font-semibold text-emerald-50/95">
                {hasContext ? contextTitle || 'Current notes' : 'Semester history only'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 shrink-0 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-chalk hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 flex max-h-[calc(100dvh-11rem)] min-h-[20rem] flex-1 flex-col overflow-hidden rounded-xl border border-board/10 bg-white shadow-sm sm:max-h-none sm:min-h-[32rem]">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          {messages.length === 0 && (
            <div className="space-y-4 py-2">
              <div>
                <p className="font-display text-lg font-bold text-board">Start with a prompt</p>
                <p className="mt-1 text-sm text-muted">
                  Pick a suggestion or type your own question in Bangla or English.
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => void send(s)}
                    className="rounded-lg border border-board/10 bg-mist/50 px-4 py-3.5 text-left text-sm font-medium text-board transition-colors hover:border-accent-dark/30 hover:bg-mist disabled:opacity-60"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!hasContext && (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                  No active notes yet — open a saved pack or generate notes first for sharper answers.
                </p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[95%] rounded-lg px-4 py-3 text-sm sm:max-w-[80%] ${
                  m.role === 'user'
                    ? 'bg-board text-chalk'
                    : 'border border-board/10 bg-mist/40 text-board'
                }`}
              >
                <p
                  className={`mb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase ${
                    m.role === 'user' ? 'text-accent' : 'text-accent-dark'
                  }`}
                >
                  {m.role === 'user' ? 'You' : 'Tutor'}
                </p>
                {m.role === 'assistant' ? (
                  <MathMarkdown>{m.content}</MathMarkdown>
                ) : (
                  <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <GenerateLoader variant="compact" title="Tutor is thinking" className="px-1 py-2" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          className="sticky bottom-0 border-t border-board/10 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:px-6 sm:py-4 sm:pb-4"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <div className="flex items-end gap-2 rounded-lg border border-board/15 bg-mist/30 p-2 focus-within:border-accent-dark sm:p-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              placeholder="Ask about this lecture…"
              className="min-h-[48px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-board outline-none placeholder:text-muted sm:min-h-[52px]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="min-h-10 shrink-0 rounded-md bg-accent-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 sm:px-5"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
