import type { ReactNode } from 'react'

interface Props {
  onClose: () => void
  onStartBoard: () => void
  onStartLecture: () => void
  onStartRadar: () => void
  onStartAsk: () => void
}

const FLOW = [
  {
    n: '1',
    title: 'Capture your class',
    body: 'Take a photo of the board or notebook. Or add a YouTube class, PDF, Word file, or typed notes.',
  },
  {
    n: '2',
    title: 'Study the pack',
    body: 'Ankur makes full Notes for you. Then use Explanation, Quiz, Flashcards, Written, Flow, and Listen.',
  },
  {
    n: '3',
    title: 'Prepare for exam',
    body: 'Before the exam, open Topic Radar with past papers. See which topics come often and what you still need to cover.',
  },
]

const MODES = [
  {
    title: 'Board',
    when: 'When you have a whiteboard, blackboard, or notebook photo',
    steps: [
      'Choose Bangla or English output',
      'Upload up to 5 photos from the same class',
      'Tap generate and wait for your study pack',
    ],
    action: 'board' as const,
    cta: 'Open Board',
  },
  {
    title: 'Lecture',
    when: 'When you have a YouTube link, PDF, Docs, slides, or pasted text',
    steps: [
      'Paste the YouTube link, or upload PDF / DOCX / PPTX / TXT',
      'You can also paste notes or transcript',
      'Tap Create notes for the same study pack',
    ],
    action: 'lecture' as const,
    cta: 'Open Lecture',
  },
  {
    title: 'Topic Radar',
    when: 'When exam is near and you have previous questions',
    steps: [
      'Upload past paper photos or PDF, or paste the questions',
      'Radar checks them against your saved packs',
      'See important topics, weak areas, and practice ideas',
    ],
    action: 'radar' as const,
    cta: 'Open Radar',
  },
  {
    title: 'Ask',
    when: 'When any line in the notes feels confusing',
    steps: [
      'Open Ask from the top menu',
      'Ask in Bangla or English, as you like',
      'It uses your open notes and saved semester history',
    ],
    action: 'ask' as const,
    cta: 'Open Ask',
  },
]

const PACK = [
  {
    title: 'Notes',
    body: 'Clean class notes you can read, edit, print, or save as PDF.',
  },
  {
    title: 'Explanation',
    body: 'Step by step teaching from your Notes, in the same language you chose.',
  },
  {
    title: 'Code',
    body: 'If the lecture had code, you get short snippets with easy explanations.',
  },
  {
    title: 'Flow',
    body: 'A simple flowchart of the topic. You can edit it on the canvas.',
  },
  {
    title: 'Flashcards',
    body: 'Quick revision cards. Choose Easy, Medium, or Hard.',
  },
  {
    title: 'Quiz',
    body: 'MCQ practice with answers and short reasons. Make more anytime.',
  },
  {
    title: 'Written',
    body: 'Long questions like exam style, with model answers and keywords.',
  },
  {
    title: 'Listen',
    body: 'Hear Notes or Explanation in Bangla or English while you revise.',
  },
]

const TIPS = [
  {
    title: 'Better board photos',
    body: 'Use clear light. If there are many boards, upload left to right, or first board to last board.',
  },
  {
    title: 'PDF tip',
    body: 'Text PDFs work well. Pure scan or photo PDFs may have no text. Then use Board photos or paste the notes.',
  },
  {
    title: 'YouTube tip',
    body: 'The video needs captions, or paste the transcript yourself. Very long videos are taken from a practical part of the lecture.',
  },
  {
    title: 'Your data stays here',
    body: 'Saved packs stay on this phone or computer only. We do not keep your study packs on our server.',
  },
  {
    title: 'Saved and backup',
    body: 'Open Saved anytime to reopen a pack. Before changing phones, download the .boardsnap.json file if you want a backup.',
  },
]

function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-board/10 bg-white p-4 shadow-[0_12px_40px_-28px_rgba(12,41,32,0.45)] sm:p-5 ${className}`}
    >
      {children}
    </div>
  )
}

export default function HowToUsePanel({
  onClose,
  onStartBoard,
  onStartLecture,
  onStartRadar,
  onStartAsk,
}: Props) {
  const run = (action: 'board' | 'lecture' | 'radar' | 'ask') => {
    if (action === 'board') onStartBoard()
    else if (action === 'lecture') onStartLecture()
    else if (action === 'radar') onStartRadar()
    else onStartAsk()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-fade-up sm:space-y-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-accent-dark uppercase">
            Student guide
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-board sm:text-4xl">How to use</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Ankur helps students turn class work into exam ready notes. No login
            needed. Everything stays on your device.
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

      <Card className="bg-mist/60">
        <p className="font-display text-lg font-bold text-board">In one line</p>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
          Capture your class, study the pack, ask when you are stuck, then use Topic Radar before
          the exam. That is the full semester loop.
        </p>
      </Card>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-bold text-board">Simple flow</h3>
          <p className="mt-1 text-sm text-muted">Follow these three steps every week.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {FLOW.map((step) => (
            <Card key={step.n}>
              <p className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-board font-display text-sm font-bold text-accent">
                {step.n}
              </p>
              <p className="mt-3 font-display text-lg font-bold text-board">{step.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-bold text-board">Four ways to start</h3>
          <p className="mt-1 text-sm text-muted">Pick the option that matches what you have today.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <Card key={m.title} className="flex flex-col">
              <p className="font-display text-xl font-bold text-board">{m.title}</p>
              <p className="mt-2 text-sm font-medium text-accent-dark">{m.when}</p>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                {m.steps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="font-semibold text-board">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => run(m.action)}
                className="mt-4 self-start rounded-full bg-accent-dark px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                {m.cta}
              </button>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-bold text-board">Inside your study pack</h3>
          <p className="mt-1 text-sm text-muted">
            After generation, use these tabs. Bangla or English stays the same across Notes,
            Explanation, and Listen.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACK.map((item) => (
            <Card key={item.title}>
              <p className="font-display text-base font-bold text-board">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-xl font-bold text-board">Useful tips</h3>
          <p className="mt-1 text-sm text-muted">Small things that make results much better.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TIPS.map((tip) => (
            <Card key={tip.title}>
              <p className="font-display text-base font-bold text-board">{tip.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{tip.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={onStartBoard}
          className="rounded-full bg-board px-5 py-2.5 text-sm font-semibold text-chalk hover:bg-board-light"
        >
          Start with Board
        </button>
        <button
          type="button"
          onClick={onStartLecture}
          className="rounded-full border border-board/15 bg-white px-5 py-2.5 text-sm font-semibold text-board hover:bg-mist"
        >
          Start with Lecture
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-board/15 bg-white px-5 py-2.5 text-sm font-semibold text-board hover:bg-mist"
        >
          Back home
        </button>
      </div>
    </div>
  )
}
