"""BoardSnap - FastAPI backend.

Serves the API and, in production, the built React frontend.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from gemma_service import (  # noqa: E402
    MODEL_ID,
    analyze_topic_radar,
    ask_tutor,
    coach_weak_topics,
    explain_step_by_step,
    generate_excalidraw_flow,
    generate_mermaid_diagram,
    generate_more_flashcards,
    generate_more_quiz,
    generate_study_pack,
    generate_study_pack_from_text,
    generate_written_questions,
    verbalize_for_speech,
)
from image_preprocess import preprocess_whiteboard  # noqa: E402
from schemas import (  # noqa: E402
    AskRequest,
    AskResponse,
    FlowRequest,
    FlowResponse,
    GenerateResponse,
    LectureIngestResponse,
    MermaidRequest,
    MermaidResponse,
    MoreFlashcardsRequest,
    MoreFlashcardsResponse,
    MoreQuizRequest,
    MoreQuizResponse,
    QuizQuestion,
    SpeakRequest,
    StepLogicRequest,
    StepLogicResponse,
    TopicCoverage,
    TopicRadarResponse,
    PreviousPaperQuestion,
    VerbalizeRequest,
    VerbalizeResponse,
    WeakCoachRequest,
    WeakCoachResponse,
    WrittenQuestion,
    WrittenRequest,
    WrittenResponse,
)
from document_service import extract_document_text  # noqa: E402
from tts_service import synthesize_mp3  # noqa: E402
from youtube_service import fetch_youtube_transcript  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Ankur",
    description="AI study companion — boards, lectures, Topic Radar, and tutor. Powered by Gemma 4.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGES = 5


def _require_api_key() -> None:
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(500, "GEMINI_API_KEY is not configured on the server")


async def _read_images(files: list[UploadFile]) -> list[tuple[bytes, str]]:
    if not files:
        raise HTTPException(400, "At least one image is required")
    if len(files) > MAX_IMAGES:
        raise HTTPException(400, f"Too many images (max {MAX_IMAGES})")

    out: list[tuple[bytes, str]] = []
    for image in files:
        mime = image.content_type or ""
        if mime not in ALLOWED_MIME:
            raise HTTPException(400, f"Unsupported image type '{mime}'. Use JPEG, PNG or WebP.")
        data = await image.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(400, "Image too large (max 10 MB each)")
        data, mime = preprocess_whiteboard(data, mime)
        out.append((data, mime))
    return out


async def _read_radar_papers(
    files: list[UploadFile],
) -> tuple[list[tuple[bytes, str]], str]:
    """Accept past-paper photos (JPEG/PNG/WebP) and/or PDFs. Returns (images, pdf_text)."""
    if len(files) > MAX_IMAGES:
        raise HTTPException(400, f"Too many files (max {MAX_IMAGES})")

    images: list[tuple[bytes, str]] = []
    pdf_chunks: list[str] = []

    for upload in files:
        name = (upload.filename or "").strip()
        mime = (upload.content_type or "").lower()
        data = await upload.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(400, f"File too large (max 10 MB each): {name or 'upload'}")

        is_pdf = mime == "application/pdf" or name.lower().endswith(".pdf")
        if is_pdf:
            try:
                text, label = extract_document_text(data, name or "paper.pdf", "application/pdf")
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            if text.strip():
                pdf_chunks.append(f"--- PDF: {label} ---\n{text.strip()}")
            continue

        if mime not in ALLOWED_MIME and not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            raise HTTPException(
                400,
                f"Unsupported file '{name or mime}'. Use JPG, PNG, WebP, or PDF.",
            )
        if mime not in ALLOWED_MIME:
            # Fallback from extension when browser sends empty/octet-stream
            lower = name.lower()
            if lower.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif lower.endswith(".png"):
                mime = "image/png"
            elif lower.endswith(".webp"):
                mime = "image/webp"
            else:
                raise HTTPException(400, f"Unsupported image type '{mime}'.")
        data, mime = preprocess_whiteboard(data, mime)
        images.append((data, mime))

    return images, "\n\n".join(pdf_chunks)


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health() -> dict:
    """UptimeRobot / Render health probe — supports GET and HEAD."""
    return {"status": "ok", "model": MODEL_ID, "api_key_configured": bool(os.environ.get("GEMINI_API_KEY"))}


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(
    images: list[UploadFile] | None = File(None),
    image: UploadFile | None = File(None),
    output_language: str = Form("bangla"),
) -> GenerateResponse:
    """Accept either multiple `images` or a single legacy `image` field."""
    _require_api_key()
    files = list(images or [])
    if image is not None:
        files.append(image)
    prepared = await _read_images(files)

    try:
        pack = generate_study_pack(prepared, output_language)
    except Exception as exc:
        logger.exception("Study pack generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc

    return GenerateResponse(
        study_pack=pack,
        model=MODEL_ID,
        output_language=output_language,
        image_count=len(prepared),
    )


@app.post("/api/more-quiz", response_model=MoreQuizResponse)
def more_quiz(body: MoreQuizRequest) -> MoreQuizResponse:
    _require_api_key()
    try:
        quiz = generate_more_quiz(
            notes_markdown=body.notes_markdown,
            existing_questions=body.existing_questions,
            count=body.count,
            difficulty=body.difficulty,
        )
    except Exception as exc:
        logger.exception("More quiz generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return MoreQuizResponse(quiz=quiz, model=MODEL_ID)


def _friendly_gemma_error(exc: Exception) -> str:
    msg = str(exc)
    low = msg.lower()
    if "500" in low or "internal" in low or "503" in low or "unavailable" in low or "high demand" in low:
        return (
            "Gemma API is temporarily busy (Google 500/503). "
            "We retried automatically — please try again in a few seconds."
        )
    return f"Gemma generation failed: {exc}"


@app.post("/api/step-logic", response_model=StepLogicResponse)
def step_logic(body: StepLogicRequest) -> StepLogicResponse:
    _require_api_key()
    try:
        text = explain_step_by_step(
            body.notes_markdown,
            body.title,
            body.code_snippets,
            output_language=body.output_language,
        )
    except Exception as exc:
        logger.exception("Step-logic generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return StepLogicResponse(logic_markdown=text, model=MODEL_ID)


@app.post("/api/more-flashcards", response_model=MoreFlashcardsResponse)
def more_flashcards(body: MoreFlashcardsRequest) -> MoreFlashcardsResponse:
    _require_api_key()
    try:
        cards = generate_more_flashcards(
            notes_markdown=body.notes_markdown,
            existing_questions=body.existing_questions,
            count=body.count,
            difficulty=body.difficulty,
        )
    except Exception as exc:
        logger.exception("More flashcards generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return MoreFlashcardsResponse(flashcards=cards, model=MODEL_ID)


@app.post("/api/written-questions", response_model=WrittenResponse)
def written_questions(body: WrittenRequest) -> WrittenResponse:
    _require_api_key()
    try:
        qs = generate_written_questions(
            notes_markdown=body.notes_markdown,
            existing_questions=body.existing_questions,
            count=body.count,
        )
    except Exception as exc:
        logger.exception("Written questions failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return WrittenResponse(written_questions=qs, model=MODEL_ID)


@app.post("/api/mermaid", response_model=MermaidResponse)
def mermaid(body: MermaidRequest) -> MermaidResponse:
    _require_api_key()
    try:
        diagram = generate_mermaid_diagram(body.notes_markdown, body.title)
    except Exception as exc:
        logger.exception("Mermaid generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return MermaidResponse(mermaid_diagram=diagram, model=MODEL_ID)


@app.post("/api/flow", response_model=FlowResponse)
def flow_diagram(body: FlowRequest) -> FlowResponse:
    """Generate an editable Excalidraw flowchart from notes."""
    _require_api_key()
    try:
        elements = generate_excalidraw_flow(body.notes_markdown, body.title)
    except Exception as exc:
        logger.exception("Excalidraw flow generation failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    payload = json.dumps(elements, ensure_ascii=False)
    return FlowResponse(elements=elements, excalidraw_json=payload, model=MODEL_ID)




@app.post("/api/weak-coach", response_model=WeakCoachResponse)
def weak_coach(body: WeakCoachRequest) -> WeakCoachResponse:
    _require_api_key()
    try:
        md, focus = coach_weak_topics(
            notes_markdown=body.notes_markdown,
            title=body.title,
            missed_questions=body.missed_questions,
            related_topics=body.related_topics,
        )
    except Exception as exc:
        logger.exception("Weak coach failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return WeakCoachResponse(coach_markdown=md, focus_topics=focus, model=MODEL_ID)


@app.post("/api/speak")
async def speak(body: SpeakRequest) -> Response:
    """Synthesize Bangla or English speech as MP3 (math spoken clearly)."""
    lang = body.lang.strip().lower()
    if lang not in ("bangla", "english"):
        raise HTTPException(400, "lang must be 'bangla' or 'english'")
    try:
        audio = await synthesize_mp3(body.text, lang)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("TTS failed")
        raise HTTPException(502, f"Speech synthesis failed: {exc}") from exc
    return Response(content=audio, media_type="audio/mpeg")


@app.post("/api/verbalize", response_model=VerbalizeResponse)
def verbalize(body: VerbalizeRequest) -> VerbalizeResponse:
    """Gemma rewrite for natural spoken math (use before /api/speak for best Listen quality)."""
    _require_api_key()
    lang = body.lang.strip().lower()
    if lang not in ("bangla", "english"):
        raise HTTPException(400, "lang must be 'bangla' or 'english'")
    try:
        spoken = verbalize_for_speech(body.text, lang)
    except Exception as exc:
        logger.exception("Verbalize failed")
        raise HTTPException(502, f"Gemma verbalize failed: {exc}") from exc
    return VerbalizeResponse(spoken_text=spoken, model=MODEL_ID)


@app.post("/api/narrate")
async def narrate(body: SpeakRequest) -> Response:
    """Full pipeline: AI reads notes → speech script → MP3 audio."""
    _require_api_key()
    lang = body.lang.strip().lower()
    if lang not in ("bangla", "english"):
        raise HTTPException(400, "lang must be 'bangla' or 'english'")
    try:
        spoken = verbalize_for_speech(body.text, lang)
    except Exception as exc:
        logger.exception("Narrate verbalize failed; falling back to rule-based speech")
        spoken = body.text
    try:
        audio = await synthesize_mp3(spoken, lang)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Narrate TTS failed")
        raise HTTPException(502, f"Speech synthesis failed: {exc}") from exc
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"X-BoardSnap-Narrate": "1"},
    )


@app.post("/api/lecture", response_model=LectureIngestResponse)
async def ingest_lecture(
    youtube_url: str = Form(""),
    raw_text: str = Form(""),
    output_language: str = Form("bangla"),
    title_hint: str = Form(""),
    document: UploadFile | None = File(None),
) -> LectureIngestResponse:
    """Nexus layer: YouTube / PDF·Docs / pasted text → study pack."""
    _require_api_key()
    youtube_url = (youtube_url or "").strip()
    raw_text = (raw_text or "").strip()
    title_hint = (title_hint or "").strip()
    output_language = (output_language or "bangla").strip().lower() or "bangla"
    if output_language not in {"bangla", "english"}:
        raise HTTPException(400, "output_language must be bangla or english")

    transcript = ""
    doc_text = ""
    source = "text"
    source_label = title_hint or "Pasted notes"

    if document is not None and document.filename:
        data = await document.read()
        try:
            doc_text, doc_label = extract_document_text(
                data,
                document.filename,
                document.content_type,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        source = "document"
        source_label = title_hint or doc_label

    if youtube_url:
        try:
            transcript, video_id = fetch_youtube_transcript(youtube_url)
            source = "youtube"
            source_label = title_hint or f"YouTube {video_id}"
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            if not raw_text and not doc_text:
                raise HTTPException(502, str(exc)) from exc
            logger.warning("YouTube fetch failed, falling back to text/document: %s", exc)

    combined = "\n\n".join(p for p in [transcript, doc_text, raw_text] if p).strip()
    if not combined:
        raise HTTPException(
            400,
            "Provide a YouTube URL, PDF/DOCX/PPTX/TXT upload, and/or lecture text",
        )

    if source == "text" and doc_text and not transcript:
        source = "document"

    try:
        pack = generate_study_pack_from_text(
            combined,
            output_language,
            title_hint=title_hint or source_label,
            source_label=source_label,
        )
    except Exception as exc:
        logger.exception("Lecture ingest failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc

    preview = combined[:500]
    return LectureIngestResponse(
        study_pack=pack,
        source=source,
        source_label=source_label,
        transcript_preview=preview,
        model=MODEL_ID,
        output_language=output_language,
    )


@app.post("/api/topic-radar", response_model=TopicRadarResponse)
async def topic_radar(
    images: list[UploadFile] | None = File(None),
    paper_text: str = Form(""),
    history_json: str = Form("[]"),
    generate_practice: str = Form("true"),
    practice_count: int = Form(5),
) -> TopicRadarResponse:
    """Past question papers × study history → Topic Radar."""
    _require_api_key()
    files = list(images or [])
    prepared: list[tuple[bytes, str]] = []
    pdf_text = ""
    if files:
        prepared, pdf_text = await _read_radar_papers(files)
    text = (paper_text or "").strip()
    if pdf_text:
        text = f"{text}\n\n{pdf_text}".strip() if text else pdf_text
    if not prepared and not text:
        raise HTTPException(400, "Upload past-paper photos/PDF and/or paste paper text")

    try:
        history_packs = json.loads(history_json or "[]")
        if not isinstance(history_packs, list):
            history_packs = []
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid history_json") from exc

    do_practice = str(generate_practice).lower() not in {"0", "false", "no"}
    try:
        data = analyze_topic_radar(
            paper_images=prepared,
            paper_text=text,
            history_packs=history_packs,
            generate_practice=do_practice,
            practice_count=max(1, min(int(practice_count or 5), 8)),
        )
    except Exception as exc:
        logger.exception("Topic Radar failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc

    topics = [TopicCoverage.model_validate(t) for t in data.get("topics", [])]
    quiz = [QuizQuestion.model_validate(q) for q in data.get("practice_quiz", [])]
    written = [WrittenQuestion.model_validate(w) for w in data.get("practice_written", [])]
    previous = [
        PreviousPaperQuestion.model_validate(q) for q in data.get("previous_questions", [])
    ]
    return TopicRadarResponse(
        exam_title=str(data.get("exam_title") or "Previous questions"),
        summary_markdown=str(data.get("summary_markdown") or ""),
        topics=topics,
        must_study=[str(t) for t in data.get("must_study", [])],
        checklist=[str(t) for t in data.get("checklist", [])],
        practice_quiz=quiz,
        practice_written=written,
        previous_questions=previous,
        model=MODEL_ID,
    )


@app.post("/api/ask", response_model=AskResponse)
def ask(body: AskRequest) -> AskResponse:
    """Contextual tutor over active pack + semester history."""
    _require_api_key()
    try:
        answer = ask_tutor(
            question=body.question,
            context_title=body.context_title,
            context_markdown=body.context_markdown,
            history_packs=[p.model_dump() for p in body.history_packs],
            chat_history=[m.model_dump() for m in body.chat_history],
        )
    except Exception as exc:
        logger.exception("Ask tutor failed")
        raise HTTPException(502, f"Gemma generation failed: {exc}") from exc
    return AskResponse(answer_markdown=answer, model=MODEL_ID)


# Serve the built React SPA in production (Docker / Render).
STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
