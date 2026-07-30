import { useEffect, useState } from 'react'

const STEPS = [
  { n: '01', title: 'Capture', blurb: 'Content' },
  { n: '02', title: 'Study', blurb: 'Pack + Ask' },
  { n: '03', title: 'Exam', blurb: 'Topic Radar' },
] as const

/** Time to move from one step fully onto the next (no mid-hold). */
const STEP_MS = 1100
/** Brief beat on the last step before looping. */
const END_HOLD_MS = 700

export default function JourneySteps() {
  /** 0 → 1 → 2 … continuous; active step = floor(progress). */
  const [progress, setProgress] = useState(0)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setEntered(true)
      setProgress(STEPS.length - 1)
      return
    }

    const enter = window.setTimeout(() => setEntered(true), 80)
    let raf = 0
    let start = performance.now()
    const cycle = STEPS.length * STEP_MS + END_HOLD_MS

    const tick = (now: number) => {
      const t = (now - start) % cycle
      if (t < STEPS.length * STEP_MS) {
        // Glide 0 → 3 without pausing between integers
        setProgress(t / STEP_MS)
      } else {
        setProgress(STEPS.length - 1)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.clearTimeout(enter)
      cancelAnimationFrame(raf)
    }
  }, [])

  const active = Math.min(STEPS.length - 1, Math.floor(progress + 1e-6))

  return (
    <ol className="journey-steps mx-auto mt-4 grid max-w-md grid-cols-3 gap-2 sm:mt-10 sm:max-w-none sm:gap-3 lg:mx-0">
      {STEPS.map((step, i) => {
        const isActive = active === i
        const isDone = progress > i + 0.98
        const railFill = Math.max(0, Math.min(1, progress - i))

        return (
          <li
            key={step.n}
            className={`journey-step relative text-center lg:text-left ${entered ? 'is-in' : ''} ${
              isActive ? 'is-active' : ''
            } ${isDone ? 'is-done' : ''}`}
            style={{ ['--i' as string]: i }}
            aria-current={isActive ? 'step' : undefined}
          >
            {i < STEPS.length - 1 && (
              <span aria-hidden className="journey-rail">
                <span
                  className="journey-rail-fill"
                  style={{ transform: `scaleX(${railFill})` }}
                />
              </span>
            )}
            <div className="journey-badge relative mx-auto flex h-10 w-10 items-center justify-center rounded-2xl font-display text-sm font-bold shadow-sm lg:mx-0">
              <span className="journey-badge-ring" aria-hidden />
              <span className="relative z-[1]">{step.n}</span>
            </div>
            <p className="journey-title mt-2.5 font-display text-base font-bold sm:text-lg">
              {step.title}
            </p>
            <p className="journey-blurb mt-0.5 text-xs sm:text-sm">{step.blurb}</p>
          </li>
        )
      })}
    </ol>
  )
}
