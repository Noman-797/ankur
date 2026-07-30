"""Pydantic schemas for the BoardSnap study pack pipeline."""

from typing import Literal

from pydantic import BaseModel, Field

OutputLanguage = Literal["bangla", "english"]


class CodeSnippet(BaseModel):
    language: str = Field(description="Programming language, e.g. python, c, pseudocode")
    title: str = Field(description="Short title for the snippet")
    code: str = Field(description="The runnable / cleaned-up code")
    explanation: str = Field(default="", description="One-line explanation of what the code does")


class Flashcard(BaseModel):
    question: str
    answer: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=2, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str = ""


class WrittenQuestion(BaseModel):
    question: str
    marks: int = Field(default=5, ge=1, le=20)
    model_answer: str = Field(description="Ideal short/long answer for self-check")
    keywords: list[str] = Field(
        default_factory=list,
        description="Key points a good answer should cover",
    )


class StudyPack(BaseModel):
    title: str = Field(description="Short descriptive title of the board content")
    detected_languages: list[str] = Field(description="Human languages detected, e.g. ['Bangla', 'English']")
    subject: str = Field(default="", description="Detected subject, e.g. 'Computer Science - Control Flow'")
    notes_markdown: str = Field(description="Clean structured Markdown reconstruction of the board")
    code_snippets: list[CodeSnippet] = Field(default_factory=list)
    flashcards: list[Flashcard] = Field(default_factory=list)
    quiz: list[QuizQuestion] = Field(default_factory=list)
    written_questions: list[WrittenQuestion] = Field(
        default_factory=list,
        description="Exam-style short/long answer questions with model answers",
    )
    mermaid_diagram: str = Field(
        default="",
        description="Legacy Mermaid flowchart (optional). Prefer excalidraw_json for Flow.",
    )
    excalidraw_json: str = Field(
        default="",
        description="Excalidraw scene JSON (elements) for the editable Flow canvas",
    )
    related_topics: list[str] = Field(
        default_factory=list,
        description="3-5 related topics the student should study next",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Illegible or uncertain parts of the board; never silently invent content",
    )


class GenerateResponse(BaseModel):
    study_pack: StudyPack
    model: str
    output_language: str
    image_count: int = 1


class MoreQuizRequest(BaseModel):
    notes_markdown: str
    existing_questions: list[str] = Field(default_factory=list)
    count: int = Field(default=5, ge=1, le=8)
    difficulty: str = Field(default="mixed")  # easy | mixed | hard


class MoreQuizResponse(BaseModel):
    quiz: list[QuizQuestion]
    model: str


class ExplainRequest(BaseModel):
    notes_markdown: str
    title: str = ""


class ExplainResponse(BaseModel):
    explanation_markdown: str
    model: str


class StepLogicRequest(BaseModel):
    notes_markdown: str
    title: str = ""
    code_snippets: list[str] = Field(default_factory=list)
    output_language: OutputLanguage = "bangla"


class StepLogicResponse(BaseModel):
    logic_markdown: str
    model: str


class MoreFlashcardsRequest(BaseModel):
    notes_markdown: str
    existing_questions: list[str] = Field(default_factory=list)
    count: int = Field(default=5, ge=1, le=8)
    difficulty: str = Field(default="medium")  # easy | medium | hard


class MoreFlashcardsResponse(BaseModel):
    flashcards: list[Flashcard]
    model: str


class WrittenRequest(BaseModel):
    notes_markdown: str
    existing_questions: list[str] = Field(default_factory=list)
    count: int = Field(default=3, ge=1, le=6)


class WrittenResponse(BaseModel):
    written_questions: list[WrittenQuestion]
    model: str


class MermaidRequest(BaseModel):
    notes_markdown: str
    title: str = ""


class MermaidResponse(BaseModel):
    mermaid_diagram: str
    model: str


class FlowRequest(BaseModel):
    notes_markdown: str
    title: str = ""


class FlowResponse(BaseModel):
    elements: list[dict] = Field(default_factory=list)
    excalidraw_json: str = ""
    model: str




class WeakCoachRequest(BaseModel):
    notes_markdown: str
    title: str = ""
    missed_questions: list[str] = Field(default_factory=list)
    related_topics: list[str] = Field(default_factory=list)


class WeakCoachResponse(BaseModel):
    coach_markdown: str
    focus_topics: list[str] = Field(default_factory=list)
    model: str


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=60000)
    lang: str = Field(
        default="bangla",
        description="Speech language: bangla | english",
    )


# --- Nexus lecture + Topic Radar + Ask ---


class HistoryPackSummary(BaseModel):
    title: str = ""
    subject: str = ""
    related_topics: list[str] = Field(default_factory=list)
    notes_excerpt: str = ""


class TopicCoverage(BaseModel):
    topic: str
    question_count: int = 0
    weight_percent: float = 0.0
    importance: str = Field(description="high | medium | low")
    coverage: str = Field(description="covered | weak | missing")
    sample_questions: list[str] = Field(default_factory=list)
    study_actions: list[str] = Field(default_factory=list)


class PreviousPaperQuestion(BaseModel):
    """A question extracted from the past paper, with a full model solution."""

    question: str
    marks: int = Field(default=5, ge=1, le=20)
    topic: str = ""
    solution_markdown: str = Field(
        default="",
        description="Full step-by-step solution for the previous question",
    )


class TopicRadarRequest(BaseModel):
    history_packs: list[HistoryPackSummary] = Field(default_factory=list)
    paper_text: str = Field(default="", description="Optional pasted past-paper text")
    generate_practice: bool = True
    practice_count: int = Field(default=5, ge=1, le=8)


class TopicRadarResponse(BaseModel):
    exam_title: str
    summary_markdown: str
    topics: list[TopicCoverage]
    must_study: list[str] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    practice_quiz: list[QuizQuestion] = Field(default_factory=list)
    practice_written: list[WrittenQuestion] = Field(default_factory=list)
    previous_questions: list[PreviousPaperQuestion] = Field(default_factory=list)
    model: str


class LectureIngestRequest(BaseModel):
    youtube_url: str = ""
    raw_text: str = ""
    output_language: str = "bangla"
    title_hint: str = ""


class LectureIngestResponse(BaseModel):
    study_pack: StudyPack
    source: str = Field(description="youtube | text | document")
    source_label: str = ""
    transcript_preview: str = ""
    model: str
    output_language: str


class AskMessage(BaseModel):
    role: str = Field(description="user | assistant")
    content: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    context_title: str = ""
    context_markdown: str = Field(default="", max_length=50000)
    history_packs: list[HistoryPackSummary] = Field(default_factory=list)
    chat_history: list[AskMessage] = Field(default_factory=list)


class AskResponse(BaseModel):
    answer_markdown: str
    model: str


class VerbalizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=60000)
    lang: str = Field(default="bangla", description="bangla | english")


class VerbalizeResponse(BaseModel):
    spoken_text: str
    model: str
