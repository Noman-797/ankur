import { useEffect, useEffectEvent, useRef, useState } from 'react'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Props = {
  src: string
  title: string
  subtitle?: string
  onClose: () => void
}

export default function AudioPlayer({ src, title, subtitle, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const onTime = useEffectEvent(() => {
    const a = audioRef.current
    if (!a) return
    setCurrent(a.currentTime)
    if (Number.isFinite(a.duration)) setDuration(a.duration)
  })

  useEffect(() => {
    const audio = new Audio(src)
    audioRef.current = audio
    audio.playbackRate = rate
    audio.preload = 'auto'

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onMeta)

    void audio.play().catch(() => setPlaying(false))

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rate applied separately
  }, [src])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  const seek = (value: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = value
    setCurrent(value)
  }

  const skip = (delta: number) => {
    const a = audioRef.current
    if (!a) return
    const next = Math.max(0, Math.min((a.duration || 0), a.currentTime + delta))
    a.currentTime = next
    setCurrent(next)
  }

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl animate-fade-up sm:sticky sm:bottom-4 sm:inset-x-auto">
      <div className="rounded-none border border-board/15 border-x-0 border-b-0 bg-white/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-20px_rgba(12,41,32,0.45)] backdrop-blur-xl sm:rounded-3xl sm:border-x sm:border-b sm:pb-4 sm:shadow-[0_20px_50px_-28px_rgba(12,41,32,0.55)] sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] text-accent-dark uppercase">
              Audio player
            </p>
            <p className="mt-0.5 truncate font-display text-base font-bold text-board">{title}</p>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-board/10 text-xs font-semibold text-muted hover:bg-mist hover:text-board"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted">
            {formatTime(current)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer accent-accent-dark"
            aria-label="Seek"
          />
          <span className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-muted">
            {formatTime(duration)}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => skip(-10)}
              className="min-h-10 rounded-full border border-board/10 px-3 py-2 text-xs font-semibold text-board hover:bg-mist"
              title="Back 10s"
            >
              −10s
            </button>
            <button
              type="button"
              onClick={toggle}
              className="min-h-10 rounded-full bg-accent-dark px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => skip(10)}
              className="min-h-10 rounded-full border border-board/10 px-3 py-2 text-xs font-semibold text-board hover:bg-mist"
              title="Forward 10s"
            >
              +10s
            </button>
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <label className="text-[10px] font-bold tracking-wide text-muted uppercase" htmlFor="audio-rate">
              Speed
            </label>
            <select
              id="audio-rate"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="min-h-10 flex-1 rounded-full border border-board/10 bg-white px-3 text-sm font-semibold text-board"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 1 ? '1x' : `${r}x`}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden flex-wrap items-center gap-1 sm:flex">
            <span className="mr-1 text-[10px] font-bold tracking-wide text-muted uppercase">
              Speed
            </span>
            {RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  rate === r
                    ? 'bg-board text-chalk'
                    : 'border border-board/10 text-board hover:bg-mist'
                }`}
              >
                {r === 1 ? '1x' : `${r}x`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
