import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import GenerateLoader from './GenerateLoader'

type Props = {
  sceneJson: string
  notesMarkdown: string
  title: string
  onUpdate: (excalidrawJson: string) => void
}

type ExcalidrawAPI = {
  updateScene: (scene: { elements: readonly unknown[] }) => void
  getSceneElements: () => readonly unknown[]
}

type ConvertFn = (skeleton: unknown[] | null, opts?: { regenerateIds: boolean }) => unknown[]

function parseScene(json: string): unknown[] {
  if (!json?.trim()) return []
  try {
    const data = JSON.parse(json) as unknown
    if (Array.isArray(data)) return data
    if (data && typeof data === 'object' && Array.isArray((data as { elements?: unknown }).elements)) {
      return (data as { elements: unknown[] }).elements
    }
  } catch {
    /* ignore */
  }
  return []
}

const ExcalidrawCanvas = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw')
  await import('@excalidraw/excalidraw/index.css')
  const { Excalidraw, convertToExcalidrawElements } = mod

  function Inner({
    sceneJson,
    onReady,
    onChangeElements,
  }: {
    sceneJson: string
    onReady: (api: ExcalidrawAPI, convert: ConvertFn) => void
    onChangeElements: (elements: unknown[]) => void
  }) {
    const initial = parseScene(sceneJson)
    return (
      <Excalidraw
        excalidrawAPI={(api) => {
          if (api) onReady(api as unknown as ExcalidrawAPI, convertToExcalidrawElements as ConvertFn)
        }}
        initialData={{
          elements: initial as never[],
          appState: {
            viewBackgroundColor: '#f7faf8',
            currentItemFontFamily: 1,
          },
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: { saveFileToDisk: true },
          },
        }}
        onChange={(elements) => onChangeElements([...(elements as unknown[])])}
      />
    )
  }

  return { default: Inner }
})

export default function FlowTab({ sceneJson, notesMarkdown, title, onUpdate }: Props) {
  const apiRef = useRef<ExcalidrawAPI | null>(null)
  const convertRef = useRef<ConvertFn | null>(null)
  const saveTimer = useRef<number | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [canvasKey, setCanvasKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  const onReady = useCallback((api: ExcalidrawAPI, convert: ConvertFn) => {
    apiRef.current = api
    convertRef.current = convert
  }, [])

  const onChangeElements = useCallback(
    (elements: unknown[]) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        onUpdate(JSON.stringify(elements))
      }, 400)
    },
    [onUpdate],
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    const onFs = () => {
      const el = canvasWrapRef.current
      const active =
        document.fullscreenElement === el ||
        // Safari
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ===
          el
      setFullscreen(Boolean(active))
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs as EventListener)
    }
  }, [])

  const toggleFullscreen = async () => {
    const el = canvasWrapRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        const req =
          el.requestFullscreen?.bind(el) ||
          (
            el as HTMLDivElement & {
              webkitRequestFullscreen?: () => Promise<void> | void
            }
          ).webkitRequestFullscreen?.bind(el)
        if (req) await Promise.resolve(req())
      } else {
        const exit =
          document.exitFullscreen?.bind(document) ||
          (document as Document & { webkitExitFullscreen?: () => Promise<void> | void })
            .webkitExitFullscreen?.bind(document)
        if (exit) await Promise.resolve(exit())
      }
    } catch {
      // Fallback: CSS-only fullscreen if browser blocks Fullscreen API
      setFullscreen((v) => !v)
    }
  }

  const generate = async () => {
    if (!notesMarkdown.trim()) {
      setError('Notes are empty — generate notes first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes_markdown: notesMarkdown, title }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = (await res.json()) as { elements?: unknown[]; excalidraw_json?: string }
      const skeleton = data.elements ?? []
      if (!Array.isArray(skeleton) || skeleton.length === 0) {
        throw new Error('No flow elements returned')
      }

      let elements: unknown[] = skeleton
      const convert = convertRef.current
      if (convert) {
        elements = convert(skeleton, { regenerateIds: false })
      } else {
        const mod = await import('@excalidraw/excalidraw')
        elements = mod.convertToExcalidrawElements(skeleton as never[], {
          regenerateIds: false,
        }) as unknown[]
      }

      const json = JSON.stringify(elements)
      onUpdate(json)
      if (apiRef.current) {
        apiRef.current.updateScene({ elements })
      } else {
        setCanvasKey((k) => k + 1)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Flow generation failed')
    } finally {
      setLoading(false)
    }
  }

  const hasScene = parseScene(sceneJson).length > 0
  const cssFullscreen = fullscreen && document.fullscreenElement !== canvasWrapRef.current

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-board">Flow</h3>
          <p className="mt-1 text-sm text-muted">
            Excalidraw canvas. Generate a flowchart from Notes, then edit freely.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="min-h-10 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
          >
            {fullscreen ? 'Exit full screen' : 'Flow · Full screen'}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading || !notesMarkdown}
            className="min-h-10 rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {loading ? 'Working…' : hasScene ? 'Regenerate flow' : 'Generate flow'}
          </button>
        </div>
      </div>

      {loading && (
        <GenerateLoader
          variant="banner"
          title="Generating Excalidraw flow"
          hint="Building an editable flowchart from your Notes…"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div
        ref={canvasWrapRef}
        className={`overflow-hidden border border-board/10 bg-white shadow-sm ${
          cssFullscreen
            ? 'fixed inset-0 z-[60] flex flex-col rounded-none border-0'
            : fullscreen
              ? 'flex h-full flex-col rounded-none'
              : 'rounded-2xl'
        }`}
      >
        {(cssFullscreen || fullscreen) && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-board/10 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-board">Flow · Full screen</p>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="min-h-10 rounded-full bg-board px-4 py-2 text-xs font-semibold text-chalk"
            >
              Exit full screen
            </button>
          </div>
        )}
        <div
          className={
            fullscreen || cssFullscreen
              ? 'min-h-0 w-full flex-1'
              : 'h-[min(55dvh,480px)] w-full min-h-[280px] sm:h-[min(70vh,640px)] sm:min-h-[420px]'
          }
          style={
            fullscreen && !cssFullscreen
              ? { height: '100%' }
              : cssFullscreen
                ? { height: 'calc(100dvh - 3rem)' }
                : undefined
          }
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <GenerateLoader variant="compact" title="Loading canvas" />
              </div>
            }
          >
            <ExcalidrawCanvas
              key={canvasKey}
              sceneJson={sceneJson}
              onReady={onReady}
              onChangeElements={onChangeElements}
            />
          </Suspense>
        </div>
      </div>

      {!hasScene && !loading && (
        <p className="text-center text-sm text-muted">
          No flow yet. Tap <span className="font-semibold text-board">Generate flow</span> to create
          one from your notes.
        </p>
      )}
    </div>
  )
}
