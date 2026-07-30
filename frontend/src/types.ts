export interface CodeSnippet {
  language: string
  title: string
  code: string
  explanation: string
}

export interface Flashcard {
  question: string
  answer: string
}

export interface QuizQuestion {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export interface WrittenQuestion {
  question: string
  marks: number
  model_answer: string
  keywords: string[]
}

export interface StudyPack {
  title: string
  detected_languages: string[]
  subject: string
  notes_markdown: string
  code_snippets: CodeSnippet[]
  flashcards: Flashcard[]
  quiz: QuizQuestion[]
  written_questions: WrittenQuestion[]
  mermaid_diagram: string
  /** Excalidraw elements JSON for editable Flow canvas */
  excalidraw_json?: string
  related_topics: string[]
  warnings: string[]
}

export interface GenerateResponse {
  study_pack: StudyPack
  model: string
  output_language: string
  image_count?: number
}

export type OutputLanguage = 'bangla' | 'english'
export type QuizDifficulty = 'easy' | 'mixed' | 'hard'

export interface SavedPack {
  id: string
  savedAt: string
  title: string
  subject: string
  output_language: string
  study_pack: StudyPack
  thumbnails?: string[]
  source?: 'board' | 'youtube' | 'text' | 'document' | 'import'
}

export interface SpacedCard {
  question: string
  intervalDays: number
  ease: number
  dueAt: string
  reps: number
}

export interface HistoryPackSummary {
  title: string
  subject: string
  related_topics: string[]
  notes_excerpt: string
}

export interface TopicCoverage {
  topic: string
  question_count: number
  weight_percent: number
  importance: 'high' | 'medium' | 'low' | string
  coverage: 'covered' | 'weak' | 'missing' | string
  sample_questions: string[]
  study_actions: string[]
}

export interface PreviousPaperQuestion {
  question: string
  marks: number
  topic: string
  solution_markdown: string
}

export interface TopicRadarResult {
  exam_title: string
  summary_markdown: string
  topics: TopicCoverage[]
  must_study: string[]
  checklist: string[]
  practice_quiz: QuizQuestion[]
  practice_written: WrittenQuestion[]
  previous_questions: PreviousPaperQuestion[]
  model: string
}

/** Radar maps saved separately from study packs (never used for coverage). */
export interface SavedRadarRun {
  id: string
  savedAt: string
  title: string
  result: TopicRadarResult
}

export interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}
