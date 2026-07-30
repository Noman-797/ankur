import { useEffect, useMemo, useState } from 'react'
import Modal from './components/Modal'
import MathMarkdown from './components/MathMarkdown'
import UploadZone from './components/UploadZone'
import ProcessingOverlay from './components/ProcessingOverlay'
import FlashcardsTab from './components/FlashcardsTab'
import QuizTab from './components/QuizTab'
import CodeTab from './components/CodeTab'
import FlowTab from './components/FlowTab'
import WrittenTab from './components/WrittenTab'
import HistoryPanel from './components/HistoryPanel'
import LecturePanel, { type LectureSubmitPayload } from './components/LecturePanel'
import TopicRadarPanel from './components/TopicRadarPanel'
import RadarPracticePanel from './components/RadarPracticePanel'
import AskPanel from './components/AskPanel'
import HowToUsePanel from './components/HowToUsePanel'
import JourneySteps from './components/JourneySteps'
import type { LectureSourceKind, ProcessingMode } from './components/ProcessingOverlay'
import type {
  GenerateResponse,
  OutputLanguage,
  SavedPack,
  SavedRadarRun,
  StudyPack,
  TopicRadarResult,
} from './types'
import {
  deleteFromHistory,
  fileToThumb,
  historySummaries,
  initHistory,
  newPackId,
  parseImportFile,
  saveToHistory,
  shareWhatsAppText,
} from './lib/history'
import {
  deleteRadarRun,
  getRadarRun,
  initRadarHistory,
  saveRadarRun,
} from './lib/radarHistory'
import { enhanceBoardImage } from './lib/enhance'
import { abortNarration, narrateAudio, revokeAudioUrl, type SpeakLang, type SpeakPhase } from './lib/spaced'
import {
  clearActiveSession,
  clearRadarResult,
  loadActiveSession,
  loadRadarResult,
  saveActiveSession,
  saveRadarResult,
} from './lib/session'
import AudioPlayer from './components/AudioPlayer'
import GenerateLoader from './components/GenerateLoader'

type Phase =
  | 'idle'
  | 'loading'
  | 'done'
  | 'error'
  | 'lecture'
  | 'radar'
  | 'radarPractice'
  | 'ask'
  | 'guide'
type Tab = 'notes' | 'code' | 'cards' | 'quiz' | 'written' | 'flow'

const LANGS: { id: OutputLanguage; label: string }[] = [
  { id: 'bangla', label: 'Bangla' },
  { id: 'english', label: 'English' },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'code', label: 'Code' },
  { id: 'flow', label: 'Flow' },
  { id: 'cards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'written', label: 'Written' },
]

function emptyPackDefaults(pack: StudyPack): StudyPack {
  return {
    ...pack,
    written_questions: pack.written_questions ?? [],
    mermaid_diagram: pack.mermaid_diagram ?? '',
    excalidraw_json: pack.excalidraw_json ?? '',
    related_topics: pack.related_topics ?? [],
    warnings: pack.warnings ?? [],
    code_snippets: pack.code_snippets ?? [],
    flashcards: pack.flashcards ?? [],
    quiz: pack.quiz ?? [],
  }
}


export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [loadingMode, setLoadingMode] = useState<ProcessingMode>('board')
  const [lectureLabel, setLectureLabel] = useState('')
  const [lectureSources, setLectureSources] = useState<LectureSourceKind[]>([])
  const [lectureRetry, setLectureRetry] = useState<LectureSubmitPayload | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [language, setLanguage] = useState<OutputLanguage>('bangla')
  const [enhance, setEnhance] = useState(true)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [packId, setPackId] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('notes')
  const [boardModal, setBoardModal] = useState(false)
  const [warningsModal, setWarningsModal] = useState(false)
  const [stepLogic, setStepLogic] = useState('')
  const [stepLoading, setStepLoading] = useState(false)
  const [stepError, setStepError] = useState('')
  const [showStep, setShowStep] = useState(false)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [history, setHistory] = useState<SavedPack[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [listenPhase, setListenPhase] = useState<SpeakPhase | null>(null)
  const [listenError, setListenError] = useState('')
  const [listenLang, setListenLang] = useState<SpeakLang>('bangla')
  const [listenSource, setListenSource] = useState<'notes' | 'step'>('notes')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [radarResult, setRadarResult] = useState<TopicRadarResult | null>(null)
  const [radarRunId, setRadarRunId] = useState('')
  const [radarRuns, setRadarRuns] = useState<SavedRadarRun[]>([])

  const previewUrls = useMemo(
    () => files.map((f) => URL.createObjectURL(f)),
    [files],
  )

  useEffect(() => {
    return () => previewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [previewUrls])

  useEffect(() => {
    void Promise.all([initHistory(), initRadarHistory()]).then(([items, runs]) => {
      setHistory(items)
      setRadarRuns(runs)
      const session = loadActiveSession()
      if (!session) {
        setSessionReady(true)
        return
      }

      if (session.language === 'english' || session.language === 'bangla') {
        setLanguage(session.language)
      }

      const restorePack = (packId: string) => {
        const item = items.find((p) => p.id === packId)
        if (!item) return false
        const lang = (item.output_language === 'english' ? 'english' : 'bangla') as OutputLanguage
        setLanguage(lang)
        setResult({
          study_pack: emptyPackDefaults(item.study_pack),
          model: 'saved',
          output_language: lang,
        })
        setPackId(item.id)
        setNotesDraft(item.study_pack.notes_markdown)
        setFiles([])
        const tabs: Tab[] = ['notes', 'code', 'cards', 'quiz', 'written', 'flow']
        if (session.tab && tabs.includes(session.tab as Tab)) {
          setTab(session.tab as Tab)
        } else {
          setTab('notes')
        }
        return true
      }

      const restoreRadar = (runId?: string) => {
        if (runId) {
          const run = getRadarRun(runId) || runs.find((r) => r.id === runId)
          if (run) {
            const data = run.result
            if (!data.previous_questions) data.previous_questions = []
            setRadarResult(data)
            setRadarRunId(run.id)
            return true
          }
        }
        const saved = loadRadarResult<TopicRadarResult>()
        if (saved) {
          if (!saved.previous_questions) saved.previous_questions = []
          setRadarResult(saved)
          return true
        }
        return false
      }

      if (session.phase === 'lecture' || session.phase === 'guide') {
        setPhase(session.phase)
        setSessionReady(true)
        return
      }

      if (session.phase === 'radar' || session.phase === 'radarPractice') {
        const ok = restoreRadar(session.radarRunId)
        if (session.phase === 'radarPractice' && !ok) {
          setPhase('radar')
        } else {
          setPhase(session.phase)
        }
        setSessionReady(true)
        return
      }

      if (session.phase === 'ask') {
        if (session.packId && !restorePack(session.packId)) {
          clearActiveSession()
          setSessionReady(true)
          return
        }
        setPhase('ask')
        setSessionReady(true)
        return
      }

      // done
      if (!session.packId || !restorePack(session.packId)) {
        clearActiveSession()
        setSessionReady(true)
        return
      }
      setPhase('done')
      setSessionReady(true)
    })
  }, [])

  useEffect(() => {
    if (!sessionReady) return
    if (phase === 'idle') {
      clearActiveSession()
      return
    }
    // Mid-request: keep user on lecture (or home for board) after refresh
    if (phase === 'loading' || phase === 'error') {
      if (loadingMode === 'lecture') {
        saveActiveSession({ phase: 'lecture', language })
      }
      return
    }
    if (phase === 'lecture' || phase === 'radar' || phase === 'guide') {
      saveActiveSession({
        phase,
        language,
        radarRunId: phase === 'radar' ? radarRunId || undefined : undefined,
      })
      if (phase === 'radar' && radarResult) saveRadarResult(radarResult)
      return
    }
    if (phase === 'radarPractice') {
      saveActiveSession({
        phase: 'radarPractice',
        language,
        radarRunId: radarRunId || undefined,
      })
      if (radarResult) saveRadarResult(radarResult)
      return
    }
    if (phase === 'ask') {
      saveActiveSession({
        phase: 'ask',
        packId: packId || undefined,
        tab,
        language,
      })
      return
    }
    if (phase === 'done' && packId) {
      saveActiveSession({ phase: 'done', packId, tab, language })
    }
  }, [sessionReady, phase, packId, tab, language, loadingMode, radarResult, radarRunId])

  const persistPack = async (
    study_pack: StudyPack,
    output_language: string,
    sourceFiles: File[],
    id?: string,
    source: SavedPack['source'] = 'board',
  ) => {
    const pid = id || newPackId()
    const thumbs: string[] = []
    for (const f of sourceFiles.slice(0, 2)) {
      const t = await fileToThumb(f)
      if (t) thumbs.push(t)
    }
    const entry: SavedPack = {
      id: pid,
      savedAt: new Date().toISOString(),
      title: study_pack.title,
      subject: study_pack.subject,
      output_language,
      study_pack,
      thumbnails: thumbs,
      source,
    }
    setHistory(saveToHistory(entry))
    setPackId(pid)
    return pid
  }

  const acceptStudyPack = async (
    pack: StudyPack,
    output_language: OutputLanguage,
    source: SavedPack['source'] = 'board',
    sourceFiles: File[] = [],
  ) => {
    const normalized = emptyPackDefaults(pack)
    setResult({
      study_pack: normalized,
      model: 'gemma',
      output_language,
    })
    setNotesDraft(normalized.notes_markdown)
    setTab('notes')
    setStepLogic('')
    setStepError('')
    setShowStep(false)
    setEditingNotes(false)
    setListenError('')
    setListenSource('notes')
    setPhase('done')
    await persistPack(normalized, output_language, sourceFiles, undefined, source)
  }

  const generate = async (sourceFiles: File[], lang: OutputLanguage) => {
    if (!sourceFiles.length) return
    setLoadingMode('board')
    setLectureRetry(null)
    setPhase('loading')
    setError('')
    try {
      let uploadFiles = sourceFiles
      if (enhance) {
        uploadFiles = await Promise.all(sourceFiles.map((f) => enhanceBoardImage(f)))
      }
      const form = new FormData()
      uploadFiles.forEach((f) => form.append('images', f))
      form.append('output_language', lang)
      const res = await fetch('/api/generate', { method: 'POST', body: form })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = (await res.json()) as GenerateResponse
      data.study_pack = emptyPackDefaults(data.study_pack)
      setResult(data)
      setNotesDraft(data.study_pack.notes_markdown)
      setTab('notes')
            setStepLogic('')
      setStepError('')
      setShowStep(false)
      setEditingNotes(false)
      await persistPack(data.study_pack, lang, sourceFiles, undefined, 'board')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('error')
    }
  }

  const trySampleBoard = async () => {
    setSampleLoading(true)
    try {
      const res = await fetch('/sample-board.png')
      if (!res.ok) throw new Error('Sample board not found')
      const blob = await res.blob()
      const sample = new File([blob], 'sample-board.png', { type: blob.type || 'image/png' })
      setFiles([sample])
      await generate([sample], language)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sample board')
      setPhase('error')
    } finally {
      setSampleLoading(false)
    }
  }

  const reset = () => {
    abortNarration()
    revokeAudioUrl(audioUrl)
    setAudioUrl(null)
    clearActiveSession()
    setRadarResult(null)
    setRadarRunId('')
    setPhase('idle')
    setFiles([])
    setResult(null)
    setPackId('')
    setError('')
    setLoadingMode('board')
    setLectureLabel('')
    setLectureRetry(null)
    setStepLogic('')
    setStepError('')
    setShowStep(false)
    setBoardModal(false)
    setWarningsModal(false)
    setEditingNotes(false)
    setShareOpen(false)
    setListenPhase(null)
    setListenError('')
    setListenSource('notes')
  }

  const ingestLecture = async (payload: LectureSubmitPayload) => {
    const sources: LectureSourceKind[] = []
    if (payload.youtube_url.trim()) sources.push('youtube')
    if (payload.document) sources.push('document')
    if (payload.raw_text.trim()) sources.push('text')
    const label =
      payload.title_hint ||
      payload.document?.name ||
      payload.youtube_url ||
      (payload.raw_text ? payload.raw_text.slice(0, 80) : 'Lecture')
    setLectureLabel(label)
    setLectureSources(sources.length ? sources : ['text'])
    setLectureRetry(payload)
    setLoadingMode('lecture')
    setLanguage(payload.output_language)
    setPhase('loading')
    setError('')
    try {
      const form = new FormData()
      form.append('youtube_url', payload.youtube_url)
      form.append('raw_text', payload.raw_text)
      form.append('output_language', payload.output_language)
      form.append('title_hint', payload.title_hint)
      if (payload.document) {
        form.append('document', payload.document)
      }
      const res = await fetch('/api/lecture', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      const source: SavedPack['source'] =
        data.source === 'youtube'
          ? 'youtube'
          : data.source === 'document'
            ? 'document'
            : 'text'
      await acceptStudyPack(
        data.study_pack as StudyPack,
        (data.output_language as OutputLanguage) || payload.output_language,
        source,
      )
      setLectureRetry(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture ingest failed')
      setPhase('error')
    }
  }

  const openSaved = (item: SavedPack) => {
    const lang = (item.output_language === 'english' ? 'english' : 'bangla') as OutputLanguage
    setLanguage(lang)
    setResult({
      study_pack: emptyPackDefaults(item.study_pack),
      model: 'saved',
      output_language: lang,
    })
    setPackId(item.id)
    setNotesDraft(item.study_pack.notes_markdown)
    setFiles([])
    setTab('notes')
    setHistoryOpen(false)
    setPhase('done')
  }

  const importPack = async (file: File) => {
    try {
      const pack = emptyPackDefaults(await parseImportFile(file))
      const id = await persistPack(pack, language, [], undefined, 'import')
      setResult({ study_pack: pack, model: 'import', output_language: language })
      setPackId(id)
      setNotesDraft(pack.notes_markdown)
      setHistoryOpen(false)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setPhase('error')
    }
  }

  const applyNotesEdit = () => {
    if (!result) return
    const next = {
      ...result,
      study_pack: { ...result.study_pack, notes_markdown: notesDraft },
    }
    setResult(next)
    setEditingNotes(false)
    void persistPack(next.study_pack, next.output_language, files, packId || undefined)
  }

  const updatePack = (mutator: (pack: StudyPack) => StudyPack) => {
    setResult((prev) => {
      if (!prev) return prev
      const study_pack = mutator(prev.study_pack)
      void persistPack(study_pack, prev.output_language, files, packId || undefined)
      return { ...prev, study_pack }
    })
  }


  const requestStepLogic = async (force = false) => {
    if (!result) return
    setShowStep(true)
    setListenSource('step')
    const trimmed = stepLogic.trimStart()
    const cachedLooksBroken =
      !!stepLogic &&
      (trimmed.startsWith('{') ||
        stepLogic.includes('"logic_markdown"') ||
        /^(cpp|c\+\+|c|python|java|javascript|js|ts|pseudocode)\b/i.test(trimmed) ||
        /^for\s*\(/i.test(trimmed))
    if (stepLogic && !cachedLooksBroken && !force) return
    setStepLoading(true)
    setStepError('')
    try {
      const res = await fetch('/api/step-logic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Lecture/board → complete Notes first; this explains those Notes.
          notes_markdown: result.study_pack.notes_markdown,
          title: result.study_pack.title,
          code_snippets: [],
          output_language: result.output_language || language,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `Server error (${res.status})`)
      }
      const data = await res.json()
      let md = (data.logic_markdown ?? '').trim()
      if (md.startsWith('{') && md.includes('logic_markdown')) {
        try {
          const inner = JSON.parse(md)
          if (typeof inner.logic_markdown === 'string') md = inner.logic_markdown
        } catch {
          /* keep raw */
        }
      }
      setStepLogic(md)
      setListenSource('step')
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'Failed to generate step-by-step explanation')
    } finally {
      setStepLoading(false)
    }
  }

  const printNotes = () => {
    if (!result) return
    setTab('notes')
    requestAnimationFrame(() => {
      const prev = document.title
      document.title = result.study_pack.title
      window.print()
      document.title = prev
    })
  }

  const listenTextForSource = (source: 'notes' | 'step') => {
    if (source === 'step') return stepLogic.trim()
    return (result?.study_pack.notes_markdown || '').trim()
  }

  const closeAudioPlayer = () => {
    abortNarration()
    revokeAudioUrl(audioUrl)
    setAudioUrl(null)
    setListenPhase(null)
  }

  const startListening = (source?: 'notes' | 'step') => {
    if (listenPhase === 'preparing') {
      closeAudioPlayer()
      return
    }
    const src = source ?? listenSource
    // Toggle off if the same source's player is already open.
    if (audioUrl && src === listenSource) {
      closeAudioPlayer()
      return
    }
    if (source) setListenSource(source)
    const text = listenTextForSource(src)
    if (!text) {
      const need =
        src === 'step'
          ? 'Generate Step-by-step first, or pick Notes.'
          : 'No notes to read yet.'
      setListenError(need)
      return
    }
    setListenError('')
    setListenSource(src)
    revokeAudioUrl(audioUrl)
    setAudioUrl(null)
    setListenPhase('preparing')
    void narrateAudio(text, listenLang, (phase) => setListenPhase(phase)).then((res) => {
      if (!res.ok) {
        setListenPhase(null)
        if (res.reason !== 'Cancelled') setListenError(res.reason)
        return
      }
      setAudioUrl(res.url)
      setListenPhase('speaking')
    })
  }

  const openAsk = () => setPhase('ask')

  const persistRadarResult = (data: TopicRadarResult, asNew: boolean) => {
    const { runs, run } = saveRadarRun(data, asNew ? undefined : radarRunId || undefined)
    setRadarRuns(runs)
    setRadarRunId(run.id)
    setRadarResult(data)
    saveRadarResult(data)
  }

  const openRadarRun = (run: SavedRadarRun) => {
    const data = {
      ...run.result,
      previous_questions: run.result.previous_questions ?? [],
    }
    setRadarRunId(run.id)
    setRadarResult(data)
    saveRadarResult(data)
    setHistoryOpen(false)
    setPhase('radar')
  }

  const removeRadarRun = (id: string) => {
    const next = deleteRadarRun(id)
    setRadarRuns(next)
    if (id === radarRunId) {
      setRadarRunId('')
      setRadarResult(null)
      clearRadarResult()
      if (phase === 'radarPractice') setPhase('radar')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/70 backdrop-blur-xl no-print">
        <div className="shell flex h-14 items-center justify-between gap-2 sm:h-[4.75rem] sm:gap-3 sm:py-0">
          <button onClick={reset} className="group min-w-0 text-left">
            <p className="font-display text-xl font-bold tracking-tight text-board sm:text-2xl">
              An<span className="text-accent-dark">kur</span>
            </p>
            <p className="hidden truncate text-[10px] font-medium tracking-[0.14em] text-muted uppercase sm:block sm:text-[11px]">
              From class notes to exam ready
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="min-h-10 rounded-full border border-board/15 bg-white px-3 py-2 text-xs font-semibold text-board hover:bg-mist sm:min-h-0 sm:py-1.5"
            >
              Saved
              {history.length > 0 && (
                <span className="ml-1.5 rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-bold text-accent-dark">
                  {history.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPhase('lecture')}
              className="hidden rounded-full border border-board/15 bg-white px-3 py-1.5 text-xs font-semibold text-board hover:bg-mist md:inline"
            >
              Lecture
            </button>
            <button
              type="button"
              onClick={() => setPhase('radar')}
              className="hidden rounded-full border border-board/15 bg-white px-3 py-1.5 text-xs font-semibold text-board hover:bg-mist md:inline"
            >
              Radar
            </button>
            <button
              type="button"
              onClick={openAsk}
              className="hidden rounded-full border border-board/15 bg-white px-3 py-1.5 text-xs font-semibold text-board hover:bg-mist sm:inline"
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setPhase('guide')}
              className={`min-h-10 shrink-0 rounded-full px-3.5 py-2 text-xs font-bold tracking-wide transition-colors sm:min-h-0 sm:px-4 sm:py-1.5 sm:text-sm ${
                phase === 'guide'
                  ? 'bg-accent text-board shadow-sm'
                  : 'bg-accent-dark text-white shadow-[0_8px_20px_-10px_rgba(15,143,90,0.8)] hover:bg-emerald-800'
              }`}
            >
              How to use
            </button>
          </div>
        </div>
      </header>

      <main className={`shell flex-1 ${audioUrl && phase === 'done' ? 'pb-44 sm:pb-16' : 'pb-16'}`}>
        {phase === 'idle' && (
          <div className="animate-fade-up">
            <section className="grid items-center gap-5 py-5 sm:gap-10 sm:py-16 lg:min-h-[calc(100vh-9rem)] lg:grid-cols-2 lg:gap-12 lg:py-20">
              <div className="w-full pr-0 text-center lg:pr-6 lg:text-left">
                <p className="hidden text-xs font-bold tracking-[0.2em] text-accent-dark uppercase sm:block">
                  Ankur · For every student
                </p>
                <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-board sm:mt-4 sm:text-5xl sm:leading-[1.05] xl:text-[3.5rem]">
                  <span className="sm:hidden">
                    Class to notes.
                    <br />
                    <span className="text-accent-dark">Exam ready.</span>
                  </span>
                  <span className="hidden sm:inline">
                    Your class. Your lectures.
                    <br />
                    <span className="text-accent-dark">Your exam map.</span>
                  </span>
                </h1>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted sm:mt-5 sm:text-lg lg:mx-0">
                  <span className="sm:hidden">Snap your board, add YouTube or PDF, get clear notes.</span>
                  <span className="hidden sm:inline">
                    Turn messy class boards, YouTube lectures, and PDFs into clear notes and
                    practice. When exams come, Topic Radar shows what past papers actually ask, so
                    you know what to revise first.
                  </span>
                </p>

                <div className="mx-auto mt-4 hidden max-w-lg grid-cols-4 gap-2 sm:mt-8 sm:grid sm:max-w-none lg:mx-0">
                  {[
                    { label: 'Board', phase: 'idle' as const, blurb: 'Board or notebook' },
                    { label: 'Lecture', phase: 'lecture' as const, blurb: 'YouTube / PDF / Docs' },
                    { label: 'Radar', phase: 'radar' as const, blurb: 'Past papers' },
                    { label: 'Ask', phase: 'ask' as const, blurb: 'Tutor chat' },
                  ].map((m) => (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => {
                        if (m.phase === 'idle') {
                          document
                            .getElementById('board-upload')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          return
                        }
                        setPhase(m.phase)
                      }}
                      className="rounded-2xl border border-board/10 bg-white/80 px-3 py-3 text-left transition-colors hover:border-accent-dark/40 hover:bg-white"
                    >
                      <p className="font-display text-sm font-bold text-board">{m.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{m.blurb}</p>
                    </button>
                  ))}
                </div>

                <JourneySteps />
              </div>

              <div className="w-full pl-0 lg:pl-6">
                <div
                  id="board-upload"
                  className="w-full rounded-[1.5rem] border border-board/10 bg-white/80 p-4 shadow-[0_28px_70px_-40px_rgba(12,41,32,0.45)] backdrop-blur sm:rounded-[1.75rem] sm:p-7 lg:p-8"
                >
                  <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold text-board sm:text-base">Output language</span>
                    <div className="flex w-full rounded-full border border-board/10 bg-mist/70 p-1 sm:w-auto">
                      {LANGS.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setLanguage(l.id)}
                          className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-all sm:flex-none sm:px-5 ${
                            language === l.id
                              ? 'bg-board text-chalk shadow-sm'
                              : 'text-muted hover:text-board'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <UploadZone
                    files={files}
                    onFilesChange={setFiles}
                    onSubmit={() => void generate(files, language)}
                    onSample={() => void trySampleBoard()}
                    sampleLoading={sampleLoading}
                    enhance={enhance}
                    onEnhanceChange={setEnhance}
                  />
                  <div className="mt-4 space-y-2 sm:hidden">
                    <p className="text-center text-xs font-semibold text-muted">Other options</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPhase('lecture')}
                        className="rounded-2xl border border-board/15 bg-white px-2 py-3 text-center"
                      >
                        <p className="font-display text-sm font-bold text-board">Lecture</p>
                        <p className="mt-0.5 text-[10px] text-muted">YouTube / PDF</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhase('radar')}
                        className="rounded-2xl border border-board/15 bg-white px-2 py-3 text-center"
                      >
                        <p className="font-display text-sm font-bold text-board">Radar</p>
                        <p className="mt-0.5 text-[10px] text-muted">Past papers</p>
                      </button>
                      <button
                        type="button"
                        onClick={openAsk}
                        className="rounded-2xl border border-board/15 bg-white px-2 py-3 text-center"
                      >
                        <p className="font-display text-sm font-bold text-board">Ask</p>
                        <p className="mt-0.5 text-[10px] text-muted">Tutor chat</p>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {phase === 'guide' && (
          <div className="py-10">
            <HowToUsePanel
              onClose={reset}
              onStartBoard={() => {
                clearActiveSession()
                setPhase('idle')
                window.setTimeout(() => {
                  document.getElementById('board-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 50)
              }}
              onStartLecture={() => setPhase('lecture')}
              onStartRadar={() => setPhase('radar')}
              onStartAsk={openAsk}
            />
          </div>
        )}

        {phase === 'lecture' && (
          <div className="py-10">
            <LecturePanel
              language={language}
              onLanguageChange={setLanguage}
              onClose={reset}
              onSubmit={(payload) => void ingestLecture(payload)}
            />
          </div>
        )}

        {phase === 'radar' && (
          <div className="py-10">
            <TopicRadarPanel
              historySummaries={historySummaries(history)}
              savedRuns={radarRuns}
              activeRunId={radarRunId}
              initialResult={radarResult}
              onResult={(r) => {
                if (!r) {
                  setRadarResult(null)
                  setRadarRunId('')
                  clearRadarResult()
                  return
                }
                persistRadarResult(r, true)
              }}
              onOpenDesk={(r) => {
                persistRadarResult(r, false)
                setPhase('radarPractice')
              }}
              onOpenRun={openRadarRun}
              onDeleteRun={removeRadarRun}
              onClose={() => {
                setRadarResult(null)
                setRadarRunId('')
                clearRadarResult()
                reset()
              }}
            />
          </div>
        )}

        {phase === 'radarPractice' && radarResult && (
          <div className="py-10">
            <RadarPracticePanel
              result={radarResult}
              historySummaries={historySummaries(history)}
              onUpdateResult={(next) => persistRadarResult(next, false)}
              onBack={() => setPhase('radar')}
              onClose={() => {
                setRadarResult(null)
                setRadarRunId('')
                clearRadarResult()
                reset()
              }}
            />
          </div>
        )}

        {phase === 'ask' && (
          <div className="py-6 sm:py-8">
            <AskPanel
              contextTitle={result?.study_pack.title || 'Semester history'}
              contextMarkdown={result?.study_pack.notes_markdown || ''}
              historySummaries={historySummaries(history)}
              onClose={() => {
                if (result) {
                  setPhase('done')
                } else {
                  clearActiveSession()
                  setPhase('idle')
                }
              }}
            />
          </div>
        )}


        {phase === 'loading' && (
          <div className="pt-14">
            <ProcessingOverlay
              mode={loadingMode}
              imageUrls={loadingMode === 'board' ? previewUrls : []}
              lectureLabel={lectureLabel}
              lectureSources={loadingMode === 'lecture' ? lectureSources : []}
            />
          </div>
        )}

        {phase === 'error' && (
          <div className="mx-auto max-w-xl pt-16 text-center animate-fade-up sm:pt-24">
            <div className="rounded-3xl border border-red-200/80 bg-white p-6 shadow-sm sm:p-10">
              <p className="font-display text-2xl font-bold text-red-700">
                {loadingMode === 'lecture' ? 'Lecture failed' : 'Generation failed'}
              </p>
              <p className="mt-2 text-sm text-red-500/90">{error}</p>
              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center sm:gap-3">
                {loadingMode === 'lecture' && lectureRetry && (
                  <button
                    onClick={() => void ingestLecture(lectureRetry)}
                    className="min-h-11 w-full rounded-full bg-board px-6 py-2.5 text-sm font-semibold text-chalk transition-colors hover:bg-board-light sm:w-auto"
                  >
                    Retry
                  </button>
                )}
                {loadingMode === 'board' && files.length > 0 && (
                  <button
                    onClick={() => void generate(files, language)}
                    className="min-h-11 w-full rounded-full bg-board px-6 py-2.5 text-sm font-semibold text-chalk transition-colors hover:bg-board-light sm:w-auto"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => {
                    if (loadingMode === 'lecture') {
                      setError('')
                      setPhase('lecture')
                    } else {
                      reset()
                    }
                  }}
                  className="min-h-11 w-full rounded-full border border-board/15 bg-white px-6 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-mist sm:w-auto"
                >
                  {loadingMode === 'lecture' ? 'Back to lecture' : 'Start over'}
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="py-6 animate-fade-up sm:py-10">
            <div className="flex flex-col gap-4 no-print sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-8 sm:gap-y-5">
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-tight font-bold text-board sm:text-4xl">
                  {result.study_pack.title}
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted sm:mt-2.5">
                  {result.study_pack.subject && <span>{result.study_pack.subject}</span>}
                  {result.study_pack.subject && <span className="text-board/20">·</span>}
                  <span>{result.study_pack.detected_languages.join(', ')}</span>
                  {result.image_count && result.image_count > 1 && (
                    <>
                      <span className="text-board/20">·</span>
                      <span>{result.image_count} photos merged</span>
                    </>
                  )}
                </p>
              </div>
              <div className="action-strip -mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                <div className="flex shrink-0 overflow-hidden rounded-full border border-board/15 bg-white text-sm font-semibold">
                  {(
                    [
                      { id: 'notes' as const, label: 'Notes', ready: true },
                      { id: 'step' as const, label: 'Steps', ready: !!stepLogic },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={
                        s.ready
                          ? `Listen to ${s.label}`
                          : s.id === 'step'
                            ? 'Generate Step-by-step first'
                            : ''
                      }
                      onClick={() => setListenSource(s.id)}
                      className={`min-h-10 px-3 py-2 transition-colors sm:min-h-0 sm:px-3 ${
                        listenSource === s.id
                          ? 'bg-board text-chalk'
                          : s.ready
                            ? 'text-board hover:bg-mist'
                            : 'text-muted/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 overflow-hidden rounded-full border border-board/15 bg-white text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setListenLang('bangla')}
                    className={`min-h-10 px-3 py-2 transition-colors sm:min-h-0 ${
                      listenLang === 'bangla'
                        ? 'bg-accent-dark text-white'
                        : 'text-board hover:bg-mist'
                    }`}
                  >
                    BN
                  </button>
                  <button
                    type="button"
                    onClick={() => setListenLang('english')}
                    className={`min-h-10 px-3 py-2 transition-colors sm:min-h-0 ${
                      listenLang === 'english'
                        ? 'bg-accent-dark text-white'
                        : 'text-board hover:bg-mist'
                    }`}
                  >
                    EN
                  </button>
                </div>
                <button
                  onClick={() => startListening()}
                  className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board transition-colors hover:bg-mist sm:min-h-0"
                >
                  {listenPhase === 'preparing'
                    ? 'Preparing…'
                    : audioUrl
                      ? 'Close audio'
                      : 'Listen'}
                </button>
                <button
                  onClick={openAsk}
                  className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board transition-colors hover:bg-mist sm:min-h-0"
                >
                  Ask
                </button>
                <button
                  onClick={() => void requestStepLogic(showStep && !!stepLogic)}
                  className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board transition-colors hover:bg-mist sm:min-h-0"
                  title="Creates a teaching explanation from your Notes"
                >
                  <span className="sm:hidden">Steps</span>
                  <span className="hidden sm:inline">Step-by-step</span>
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board transition-colors hover:bg-mist sm:min-h-0"
                >
                  <span className="sm:hidden">Share</span>
                  <span className="hidden sm:inline">Share</span>
                </button>
                <button
                  onClick={printNotes}
                  className="min-h-10 shrink-0 rounded-full bg-accent-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 sm:min-h-0"
                >
                  <span className="sm:hidden">PDF</span>
                  <span className="hidden sm:inline">Print / PDF</span>
                </button>
                <button
                  onClick={reset}
                  className="min-h-10 shrink-0 rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board transition-colors hover:bg-mist sm:min-h-0"
                >
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New board</span>
                </button>
              </div>
            </div>

            {listenError && (
              <p className="mt-3 text-sm text-red-600 no-print">{listenError}</p>
            )}
            {!listenError && listenPhase === 'preparing' && (
              <div className="mt-4 no-print">
                <GenerateLoader
                  variant="banner"
                  title={`Preparing ${
                    listenSource === 'step' ? 'Step-by-step' : 'Notes'
                  } audio`}
                  hint="AI is reading the full text and building multi-chunk audio…"
                />
              </div>
            )}
            {audioUrl && (
              <div className="mt-4 no-print">
                <AudioPlayer
                  src={audioUrl}
                  title={
                    listenSource === 'step' ? 'Step-by-step Explanation' : 'Notes'
                  }
                  subtitle={`${listenLang === 'bangla' ? 'BN voice' : 'EN voice'} · use speed controls`}
                  onClose={closeAudioPlayer}
                />
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 no-print">
              <button
                onClick={() => previewUrls[0] && setBoardModal(true)}
                disabled={!previewUrls[0]}
                className="flex items-center justify-between gap-3 rounded-2xl border border-board/10 bg-white/70 p-3 text-left transition-colors enabled:hover:border-accent-dark/40 enabled:hover:bg-white disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  {previewUrls[0] ? (
                    <img
                      src={previewUrls[0]}
                      alt="Whiteboard thumbnail"
                      className="h-11 w-14 shrink-0 rounded-lg border border-board/10 object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-mist text-xs font-bold text-muted">
                      Saved
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-board">Source photo</span>
                    <span className="block truncate text-xs text-muted">
                      {previewUrls.length > 1
                        ? `${previewUrls.length} photos · board or notebook`
                        : previewUrls[0]
                          ? 'Board or notebook'
                          : 'Opened from history'}
                    </span>
                  </span>
                </span>
                {previewUrls[0] && (
                  <span className="shrink-0 text-xs font-semibold text-accent-dark">Open</span>
                )}
              </button>

              <button
                onClick={() => result.study_pack.warnings.length > 0 && setWarningsModal(true)}
                disabled={result.study_pack.warnings.length === 0}
                className="flex items-center justify-between gap-3 rounded-2xl border border-board/10 bg-white/70 p-3 text-left transition-colors enabled:hover:border-accent-dark/40 enabled:hover:bg-white disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-mist font-display text-lg font-bold text-board">
                    {result.study_pack.warnings.length}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-board">Unclear parts</span>
                    <span className="block truncate text-xs text-muted">
                      {result.study_pack.warnings.length === 0
                        ? 'Everything was legible'
                        : 'Flagged, never guessed'}
                    </span>
                  </span>
                </span>
                {result.study_pack.warnings.length > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-accent-dark">Open</span>
                )}
              </button>
            </div>

            <div className="mt-6">
              <section className="w-full">
                <div className="tab-strip sticky top-14 z-10 flex items-center gap-1 overflow-x-auto rounded-2xl border border-board/10 bg-white/95 p-1.5 shadow-sm backdrop-blur sm:top-[4.75rem] no-print">
                  {TABS.map(({ id, label }) => {
                    const count =
                      id === 'code'
                        ? result.study_pack.code_snippets.length
                        : id === 'cards'
                          ? result.study_pack.flashcards.length
                          : id === 'quiz'
                            ? result.study_pack.quiz.length
                            : id === 'written'
                              ? result.study_pack.written_questions.length
                              : id === 'flow'
                                ? result.study_pack.excalidraw_json?.trim()
                                  ? 1
                                  : 0
                                : null
                    return (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all sm:flex-1 sm:px-3 ${
                          tab === id
                            ? 'bg-board text-chalk shadow'
                            : 'text-muted hover:bg-mist hover:text-board'
                        }`}
                      >
                        {label}
                        {count !== null && count > 0 && (
                          <span
                            className={`rounded-full px-1.5 text-[11px] ${
                              tab === id ? 'bg-accent text-board' : 'bg-mist text-accent-dark'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-5 print-notes">
                  {tab === 'notes' && (
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2 no-print">
                        <button
                          type="button"
                          onClick={() => {
                            setNotesDraft(result.study_pack.notes_markdown)
                            setEditingNotes((v) => !v)
                          }}
                          className="rounded-full border border-board/15 bg-white px-4 py-2 text-sm font-semibold text-board hover:bg-mist"
                        >
                          {editingNotes ? 'Cancel edit' : 'Edit notes'}
                        </button>
                        {editingNotes && (
                          <button
                            type="button"
                            onClick={applyNotesEdit}
                            className="rounded-full bg-board px-4 py-2 text-sm font-semibold text-chalk"
                          >
                            Save notes
                          </button>
                        )}
                      </div>

                      {editingNotes && (
                        <textarea
                          value={notesDraft}
                          onChange={(e) => setNotesDraft(e.target.value)}
                          rows={18}
                          className="w-full rounded-2xl border border-board/15 bg-white p-4 font-mono text-sm text-board no-print"
                        />
                      )}


                      {showStep && (
                        <div className="rounded-2xl border border-board/15 bg-white px-4 py-5 shadow-sm sm:px-9 sm:py-6 no-print">
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-bold tracking-wide text-board uppercase">
                              Step-by-step Explanation
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startListening('step')}
                                className="min-h-10 rounded-full border border-board/10 px-3 py-2 text-xs font-semibold text-accent-dark hover:bg-mist"
                              >
                                {listenPhase === 'preparing' && listenSource === 'step'
                                  ? 'Preparing…'
                                  : audioUrl && listenSource === 'step'
                                    ? 'Close audio'
                                    : 'Listen this'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void requestStepLogic(true)}
                                disabled={stepLoading}
                                className="min-h-10 rounded-full border border-board/10 px-3 py-2 text-xs font-semibold text-accent-dark hover:bg-mist disabled:opacity-50"
                              >
                                Regenerate
                              </button>
                              <button
                                onClick={() => setShowStep(false)}
                                className="min-h-10 rounded-full border border-board/10 px-3 py-2 text-xs font-semibold text-muted hover:bg-mist hover:text-board"
                              >
                                Hide
                              </button>
                            </div>
                          </div>
                          {stepLoading && (
                            <GenerateLoader
                              variant="banner"
                              className="mb-4"
                              title={
                                (result.output_language || language) === 'english'
                                  ? 'Writing Step-by-step Explanation'
                                  : 'Step-by-step ব্যাখ্যা লেখা হচ্ছে'
                              }
                              hint={
                                (result.output_language || language) === 'english'
                                  ? 'Elaborate teaching with examples from your Notes…'
                                  : 'Notes থেকে উদাহরণসহ বিস্তারিত ব্যাখ্যা…'
                              }
                            />
                          )}
                          {stepError && <p className="text-sm text-red-600">{stepError}</p>}
                          {stepLogic && <MathMarkdown>{stepLogic}</MathMarkdown>}
                        </div>
                      )}

                      {!editingNotes && (
                        <div id="print-sheet">
                          <MathMarkdown className="prose-notes rounded-2xl border border-board/10 bg-white px-4 py-5 shadow-sm sm:px-9 sm:py-8">
                            {result.study_pack.notes_markdown}
                          </MathMarkdown>

                          {(result.study_pack.related_topics?.length ?? 0) > 0 && (
                            <div className="print-related">
                              <h2>Related topics</h2>
                              <ul>
                                {result.study_pack.related_topics.map((topic) => (
                                  <li key={topic}>{topic}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {(result.study_pack.related_topics?.length ?? 0) > 0 && (
                        <div className="mt-5 rounded-2xl border border-board/10 bg-white px-4 py-5 sm:px-6 no-print">
                          <p className="text-sm font-bold tracking-wide text-board uppercase">
                            Related topics to study next
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.study_pack.related_topics.map((topic) => (
                              <span
                                key={topic}
                                className="rounded-full bg-mist px-3.5 py-1.5 text-sm font-medium text-board"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === 'code' && (
                    <div className="no-print">
                      <CodeTab snippets={result.study_pack.code_snippets} />
                    </div>
                  )}
                  {tab === 'flow' && (
                    <div className="no-print">
                      <FlowTab
                        sceneJson={result.study_pack.excalidraw_json || ''}
                        notesMarkdown={result.study_pack.notes_markdown}
                        title={result.study_pack.title}
                        onUpdate={(excalidraw_json) =>
                          updatePack((p) => ({ ...p, excalidraw_json }))
                        }
                      />
                    </div>
                  )}
                  {tab === 'cards' && (
                    <div className="no-print">
                      <FlashcardsTab
                        cards={result.study_pack.flashcards}
                        notesMarkdown={result.study_pack.notes_markdown}
                        packId={packId || 'anon'}
                        onAppendCards={(cards) =>
                          updatePack((p) => ({
                            ...p,
                            flashcards: [...p.flashcards, ...cards],
                          }))
                        }
                      />
                    </div>
                  )}
                  {tab === 'quiz' && (
                    <div className="no-print">
                      <QuizTab
                        quiz={result.study_pack.quiz}
                        notesMarkdown={result.study_pack.notes_markdown}
                        title={result.study_pack.title}
                        relatedTopics={result.study_pack.related_topics}
                        onAppendQuiz={(questions) =>
                          updatePack((p) => ({
                            ...p,
                            quiz: [...p.quiz, ...questions],
                          }))
                        }
                      />
                    </div>
                  )}
                  {tab === 'written' && (
                    <div className="no-print">
                      <WrittenTab
                        questions={result.study_pack.written_questions}
                        notesMarkdown={result.study_pack.notes_markdown}
                        onAppend={(qs) =>
                          updatePack((p) => ({
                            ...p,
                            written_questions: [...p.written_questions, ...qs],
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {boardModal && previewUrls[0] && (
        <Modal title="Source photos" onClose={() => setBoardModal(false)}>
          <div className="space-y-3">
            {previewUrls.map((url, i) => (
              <img
                key={url}
                src={url}
                alt={`Source ${i + 1}`}
                className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl border border-board/10 object-contain"
              />
            ))}
          </div>
        </Modal>
      )}

      {warningsModal && result && (
        <Modal title="Unclear parts" onClose={() => setWarningsModal(false)}>
          <p className="mb-4 text-sm text-muted">
            Gemma flagged these instead of guessing what the handwriting said.
          </p>
          <ul className="space-y-2.5">
            {result.study_pack.warnings.map((w, i) => (
              <li
                key={i}
                className="rounded-xl border border-board/10 bg-mist/50 px-4 py-3 text-sm leading-relaxed text-board/85"
              >
                {w}
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {historyOpen && (
        <Modal title="Saved on this device" onClose={() => setHistoryOpen(false)}>
          <HistoryPanel
            items={history}
            radarRuns={radarRuns}
            onOpen={openSaved}
            onDelete={(id) => {
              setHistory(deleteFromHistory(id))
              if (id === packId) {
                clearActiveSession()
                setResult(null)
                setPackId('')
                setPhase('idle')
              }
            }}
            onImport={(f) => void importPack(f)}
            onOpenRadar={openRadarRun}
            onDeleteRadar={removeRadarRun}
          />
        </Modal>
      )}

      {shareOpen && result && (
        <Modal title="Share on WhatsApp" onClose={() => setShareOpen(false)}>
          <p className="mb-4 text-sm text-muted">
            Send as plain text. Pick Notes or Step-by-step.
          </p>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => {
                void shareWhatsAppText({
                  title: result.study_pack.title,
                  subject: result.study_pack.subject,
                  label: 'Notes',
                  body: notesDraft || result.study_pack.notes_markdown,
                })
                  .then(() => setShareOpen(false))
                  .catch((e) => {
                    setListenError(e instanceof Error ? e.message : 'Share failed')
                    setShareOpen(false)
                  })
              }}
              className="rounded-2xl bg-[#25D366] px-4 py-3.5 text-left text-sm font-semibold text-white"
            >
              <span className="block">Share Notes</span>
              <span className="mt-0.5 block text-xs font-medium text-white/85">
                Full study notes as text
              </span>
            </button>
            <button
              type="button"
              disabled={!stepLogic.trim()}
              onClick={() => {
                void shareWhatsAppText({
                  title: result.study_pack.title,
                  subject: result.study_pack.subject,
                  label: 'Step-by-step',
                  body: stepLogic,
                })
                  .then(() => setShareOpen(false))
                  .catch((e) => {
                    setListenError(e instanceof Error ? e.message : 'Share failed')
                    setShareOpen(false)
                  })
              }}
              className="rounded-2xl bg-[#25D366] px-4 py-3.5 text-left text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block">Share Step-by-step</span>
              <span className="mt-0.5 block text-xs font-medium text-white/85">
                {stepLogic.trim()
                  ? 'Explanation as text'
                  : 'Generate Step-by-step first'}
              </span>
            </button>
          </div>
        </Modal>
      )}

      <footer className="mt-auto border-t border-board/10 bg-board text-chalk no-print">
        <div className="shell space-y-1.5 py-8 text-center">
          <p className="text-sm font-medium text-emerald-100/90">
            A concern of <span className="font-semibold text-white">Semicolons</span>
            <span className="mx-2 text-emerald-200/40">·</span>
            Powered by Gemma 4
          </p>
          <p className="text-xs text-emerald-200/75">
            Developed by{' '}
            <a
              href="https://abdnoman.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-100 underline-offset-2 hover:underline"
            >
              Abdullah Al Noman
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
