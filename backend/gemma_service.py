"""Gemma 4 vision service: whiteboard photo -> structured study pack."""

import json
import logging
import os
import re
import time

from google import genai
from google.genai import types
from google.genai import errors as genai_errors

from schemas import Flashcard, QuizQuestion, StudyPack, WrittenQuestion

logger = logging.getLogger(__name__)

MODEL_ID = os.environ.get("GEMMA_MODEL", "gemma-4-26b-a4b-it")
# Optional second model when primary returns transient 500/503 (common on Gemma API).
FALLBACK_MODEL_ID = os.environ.get("GEMMA_FALLBACK_MODEL", "gemma-4-31b-it").strip()


def _model_chain() -> list[str]:
    models = [MODEL_ID]
    if FALLBACK_MODEL_ID and FALLBACK_MODEL_ID not in models:
        models.append(FALLBACK_MODEL_ID)
    return models


def _is_transient_genai_error(exc: BaseException) -> bool:
    if isinstance(exc, genai_errors.ServerError):
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        return code in {429, 500, 502, 503, 504}
    msg = str(exc).lower()
    return any(
        s in msg
        for s in (
            "500 internal",
            "503 unavailable",
            "high demand",
            "unavailable",
            "internal error",
            "429",
            "resource exhausted",
        )
    )


def _generate_content(
    contents: list,
    *,
    temperature: float = 0.3,
    response_mime_type: str | None = None,
    use_thinking: bool = True,
    max_attempts: int = 4,
):
    """Call Gemma with retries + optional fallback model (API often returns transient 500)."""
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    last_exc: BaseException | None = None

    for model in _model_chain():
        for attempt in range(max_attempts):
            thinking = use_thinking and attempt == 0
            config_kwargs: dict = {"temperature": temperature}
            if thinking:
                config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="MINIMAL")
            if response_mime_type:
                config_kwargs["response_mime_type"] = response_mime_type
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(**config_kwargs),
                )
                if model != MODEL_ID:
                    logger.info("Succeeded with fallback model %s", model)
                return response
            except Exception as exc:
                last_exc = exc
                if not _is_transient_genai_error(exc):
                    raise
                wait = min(8.0, 1.2 * (2**attempt))
                logger.warning(
                    "Gemma transient error model=%s attempt=%d/%d: %s — retry in %.1fs",
                    model,
                    attempt + 1,
                    max_attempts,
                    exc,
                    wait,
                )
                time.sleep(wait)
        logger.warning("Model %s exhausted retries; trying next fallback if any", model)

    assert last_exc is not None
    raise last_exc


LANGUAGE_INSTRUCTIONS = {
    "bangla": (
        "Write ALL notes, flashcards, quiz questions, explanations, and related text in clear, "
        "natural Bangla (বাংলা). Keep essential technical terms (e.g. loop, if-else, variable names) "
        "in English only when translating would confuse a student — still explain each term in Bangla. "
        "Do NOT mix long English paragraphs with Bangla; stay Bangla-first throughout."
    ),
    "english": (
        "Write ALL notes, flashcards, quiz questions, and explanations in clear English only. "
        "Do NOT add Bangla translations or bilingual dual-language sections."
    ),
}

SYSTEM_PROMPT = """You are Ankur, an expert study assistant for Bangladeshi students.
You receive a photo of classroom material: a whiteboard, blackboard, OR a notebook / copy page
where the student wrote notes from the board (or their own class notes).
The content may mix Bangla and English, and may include flowcharts, pseudocode, diagrams,
math, or messy handwriting.

Your job is to digitize the page into a structured study pack. Follow these rules strictly:

1. Transcribe faithfully. NEVER invent content that is not on the page.
2. If a part is illegible or you are unsure, add a note to "warnings" instead of guessing.
3. Reconstruct structure: turn arrows/flowcharts into ordered logic descriptions, fix obvious
   spelling slips, and organize content with Markdown headings.
4. Extract every code/pseudocode fragment into "code_snippets", cleaned up and runnable where
   possible (convert pseudocode to the closest real language only if the page implies one,
   otherwise keep language as "pseudocode").
5. Create 6-10 flashcards and 3-5 multiple-choice quiz questions that test the ACTUAL content
   of the page, including tracing outputs for specific inputs when code is present.
6. Create 2-4 exam-style "written_questions" (short/long answer) with model_answer and keywords.
7. If the page has a flowchart, diagram, or algorithm steps, fill "mermaid_diagram" with a
   valid Mermaid flowchart (flowchart TD ...). If none, use an empty string "".
8. Math: write every formula in LaTeX on ONE line. Use $...$ for inline and $$...$$
   (on their own lines) for display equations. Examples: $0 \\le A \\le 10$, $A > 10$,
   $\\text{{count}} = \\text{{count}} + 1$. NEVER spell operators as separate letters
   (wrong: 0 l e A). NEVER put each symbol on its own line.
9. Keep "warnings" short and concrete - only genuinely illegible or ambiguous handwriting,
   one short line each. Do not add interpretation, speculation or general commentary.
10. Add 3-5 "related_topics" — concrete next topics a Bangladeshi student should study after
   this page (short English topic names).
11. If multiple photos are provided, treat them as ONE lecture in left-to-right /
    chronological order and merge into a single coherent study pack.
12. {language_instruction}

Respond ONLY with a single JSON object matching this schema (no markdown fences, no prose).
JSON escaping rules (critical):
- Every backslash in code/notes MUST be written as \\\\ (e.g. \\n for newline in code, \\\\d for regex).
- Newlines inside string values must be \\n, not raw line breaks when avoidable.
- Never emit invalid escapes like \\a \\s \\c \\x — always double the backslash.

{schema}
"""

_JSON_SCHEMA_HINT = json.dumps(
    {
        "title": "string",
        "detected_languages": ["Bangla", "English"],
        "subject": "string",
        "notes_markdown": "string (full Markdown notes)",
        "code_snippets": [
            {"language": "string", "title": "string", "code": "string", "explanation": "string"}
        ],
        "flashcards": [{"question": "string", "answer": "string"}],
        "quiz": [
            {
                "question": "string",
                "options": ["a", "b", "c", "d"],
                "correct_index": 0,
                "explanation": "string",
            }
        ],
        "written_questions": [
            {
                "question": "string",
                "marks": 5,
                "model_answer": "string",
                "keywords": ["point1", "point2"],
            }
        ],
        "mermaid_diagram": "flowchart TD\\n  A[Start] --> B[End]",
        "related_topics": ["topic 1", "topic 2", "topic 3"],
        "warnings": ["string"],
    },
    indent=2,
)


_VALID_JSON_ESCAPES = set('"\\/bfnrt')


def _fix_invalid_escapes(blob: str) -> str:
    """Turn invalid JSON escapes (e.g. \\d, \\s) into escaped backslashes."""
    out: list[str] = []
    i = 0
    n = len(blob)
    while i < n:
        ch = blob[i]
        if ch == "\\" and i + 1 < n:
            nxt = blob[i + 1]
            if nxt in _VALID_JSON_ESCAPES:
                out.append(blob[i : i + 2])
                i += 2
                continue
            if nxt == "u" and i + 5 < n and all(
                c in "0123456789abcdefABCDEF" for c in blob[i + 2 : i + 6]
            ):
                out.append(blob[i : i + 6])
                i += 6
                continue
            # Invalid escape like \d or \s in code — escape the backslash.
            out.append("\\\\")
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


# LaTeX commands whose first letter is also a valid JSON escape, so json.loads()
# silently turns e.g. "\frac" into FORMFEED + "rac". Restore the backslash.
_LATEX_CONTROL_REPAIRS: list[tuple[str, str]] = [
    (f"\x0c{tail}", f"\\f{tail}") for tail in ("rac", "orall", "lat", "box")
] + [
    (f"\x08{tail}", f"\\b{tail}")
    for tail in ("egin", "eta", "ar", "inom", "ullet", "oldsymbol", "mod", "ig")
] + [
    (f"\t{tail}", f"\\t{tail}")
    for tail in ("ext", "imes", "heta", "au", "frac", "riangle", "ilde", "op")
] + [
    (f"\r{tail}", f"\\r{tail}")
    for tail in ("ightarrow", "ight", "angle", "ho", "brack")
] + [
    (f"\n{tail}", f"\\n{tail}") for tail in ("abla", "onumber", "eq ", "u_")
]


def _repair_latex_control_chars(value: str) -> str:
    """Undo JSON escapes that ate LaTeX backslashes (\\frac, \\theta, \\rho ...)."""
    if not value:
        return value
    for broken, fixed in _LATEX_CONTROL_REPAIRS:
        if broken in value:
            value = value.replace(broken, fixed)
    return value


def _repair_tree(node):
    """Recursively repair LaTeX escapes in every string of a parsed JSON tree."""
    if isinstance(node, str):
        return _repair_latex_control_chars(node)
    if isinstance(node, list):
        return [_repair_tree(item) for item in node]
    if isinstance(node, dict):
        return {key: _repair_tree(val) for key, val in node.items()}
    return node


def _loads_first_json(blob: str):
    """Parse the first JSON value; ignore trailing junk Gemma sometimes appends."""
    decoder = json.JSONDecoder()
    obj, _end = decoder.raw_decode(blob)
    return obj


def _strip_outer_fence(text: str) -> str:
    """Unwrap a leading/trailing ``` fence only when it wraps the whole payload.

    Must NOT match code fences embedded inside JSON string values (notes/code),
    which previously caused us to parse `{ for (int j ...` as the JSON root.
    """
    text = text.strip()
    if not text.startswith("```"):
        return text
    # Drop opening fence (optional language tag on same line).
    rest = re.sub(r"^```(?:json|JSON|javascript)?[ \t]*\r?\n?", "", text, count=1)
    # Drop a closing fence only at the very end.
    rest = re.sub(r"\r?\n?```[ \t]*$", "", rest)
    return rest.strip()


def _find_json_payload_start(text: str) -> int:
    """Index of the first JSON object/array that looks like structured output."""
    # Prefer {"key"... so we skip stray braces from code samples in prose.
    m = re.search(r'\{\s*"', text)
    if m:
        return m.start()
    m = re.search(r"\[\s*\{", text)
    if m:
        return m.start()
    start_obj, start_arr = text.find("{"), text.find("[")
    if start_obj == -1 and start_arr == -1:
        return -1
    if start_obj == -1:
        return start_arr
    if start_arr == -1:
        return start_obj
    return min(start_obj, start_arr)


def _escape_raw_controls_in_strings(blob: str) -> str:
    """Escape raw newlines/tabs inside JSON strings (common Gemma failure mode)."""
    out: list[str] = []
    in_string = False
    escape = False
    for ch in blob:
        if in_string:
            if escape:
                out.append(ch)
                escape = False
                continue
            if ch == "\\":
                out.append(ch)
                escape = True
                continue
            if ch == '"':
                out.append(ch)
                in_string = False
                continue
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                out.append("\\r")
                continue
            if ch == "\t":
                out.append("\\t")
                continue
            out.append(ch)
            continue
        out.append(ch)
        if ch == '"':
            in_string = True
    return "".join(out)


def _try_parse_json_blob(blob: str):
    """Try progressively more aggressive repairs until JSON parses."""
    attempts = (
        blob,
        _fix_invalid_escapes(blob),
        _escape_raw_controls_in_strings(blob),
        _fix_invalid_escapes(_escape_raw_controls_in_strings(blob)),
    )
    last_err: Exception | None = None
    seen: set[str] = set()
    for candidate in attempts:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            return _loads_first_json(candidate)
        except json.JSONDecodeError as exc:
            last_err = exc
    assert last_err is not None
    raise last_err


def _extract_json(text: str) -> dict:
    """Parse model output into a dict, tolerating fences, bad escapes, and trailing junk."""
    text = _strip_outer_fence(text or "")
    if not text:
        raise ValueError("Model response contained no JSON object")

    start = _find_json_payload_start(text)
    if start == -1:
        logger.warning("No JSON brace in model output preview: %s", text[:400].replace("\n", "\\n"))
        raise ValueError("Model response contained no JSON object")

    blob = text[start:]
    try:
        data = _try_parse_json_blob(blob)
    except json.JSONDecodeError as first_err:
        logger.warning(
            "JSON parse failed even after escape repair: %s | preview=%s",
            first_err,
            blob[:400].replace("\n", "\\n"),
        )
        raise ValueError(f"Invalid JSON from model: {first_err}") from first_err

    if isinstance(data, list):
        # Model sometimes returns a bare quiz/flashcard array.
        if data and isinstance(data[0], dict) and "question" in data[0] and "options" in data[0]:
            data = {"quiz": data}
        elif data and isinstance(data[0], dict) and "question" in data[0] and "answer" in data[0]:
            data = {"flashcards": data}
        else:
            raise ValueError("Model returned a JSON array, expected an object")

    if not isinstance(data, dict):
        raise ValueError(f"Model JSON must be an object, got {type(data).__name__}")

    return _repair_tree(data)


def generate_study_pack(
    images: list[tuple[bytes, str]],
    output_language: str,
) -> StudyPack:
    """images: list of (bytes, mime_type). One or more boards from the same lecture."""
    if not images:
        raise ValueError("At least one image is required")

    language_instruction = LANGUAGE_INSTRUCTIONS.get(
        output_language, LANGUAGE_INSTRUCTIONS["bangla"]
    )
    prompt = SYSTEM_PROMPT.format(
        language_instruction=language_instruction, schema=_JSON_SCHEMA_HINT
    )
    if len(images) > 1:
        prompt = (
            f"You are given {len(images)} whiteboard photos from the SAME lecture, "
            f"in order (photo 1 … photo {len(images)}). Merge them into ONE study pack.\n\n"
            + prompt
        )

    # Images must come before text for Gemma 4 multimodal requests.
    contents: list = [
        types.Part.from_bytes(data=data, mime_type=mime) for data, mime in images
    ]
    contents.append(prompt)

    response = _generate_content(
        contents,
        temperature=0.2,
        response_mime_type="application/json",
    )

    raw = response.text or ""
    logger.info("Gemma raw response length: %d chars (%d images)", len(raw), len(images))
    data = _extract_json(raw)
    return StudyPack.model_validate(data)


def _text_client_call(prompt: str, temperature: float = 0.3) -> dict:
    response = _generate_content(
        [prompt],
        temperature=temperature,
        response_mime_type="application/json",
    )
    raw = response.text or ""
    logger.info("Gemma text response length: %d chars", len(raw))
    try:
        return _extract_json(raw)
    except ValueError:
        logger.warning("JSON extract failed; raw preview: %s", raw[:400].replace("\n", "\\n"))
        raise


def _unwrap_markdown_payload(raw: str, json_key: str) -> str:
    """Return clean markdown from raw model output (plain MD or JSON wrapper)."""
    text = _strip_outer_fence(raw or "")
    if not text:
        return ""

    # Proper JSON object
    if text.startswith("{") and json_key in text:
        try:
            data = _extract_json(text)
            got = str(data.get(json_key, "")).strip()
            if got:
                return got
        except ValueError:
            pass

        # Salvage broken JSON where quotes inside the markdown broke parsing.
        m = re.search(
            rf'"{re.escape(json_key)}"\s*:\s*"(.*)"\s*\}}\s*$',
            text,
            re.DOTALL,
        )
        if m:
            salvaged = (
                m.group(1)
                .replace("\\n", "\n")
                .replace("\\t", "\t")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )
            return salvaged.strip()

        # Last resort: strip the JSON key wrapper if the model echoed it literally.
        m2 = re.search(
            rf'\{{\s*"{re.escape(json_key)}"\s*:\s*"(.*)"\s*\}}\s*$',
            text,
            re.DOTALL,
        )
        if m2:
            return (
                m2.group(1)
                .replace("\\n", "\n")
                .replace("\\t", "\t")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            ).strip()

    return text


def _markdown_from_model(prompt: str, json_key: str, temperature: float = 0.25) -> str:
    """Ask Gemma for markdown. Avoid JSON mime-type (quotes/LaTeX break it)."""
    response = _generate_content([prompt], temperature=temperature)
    raw = (response.text or "").strip()
    logger.info("Gemma markdown response length: %d chars", len(raw))
    if not raw:
        raise ValueError("Empty response from model")

    text = _unwrap_markdown_payload(raw, json_key)
    if not text:
        raise ValueError("Empty markdown from model")
    # If unwrap somehow still left a JSON envelope, strip a leading key line.
    if text.lstrip().startswith("{") and json_key in text[:80]:
        text = _unwrap_markdown_payload(text, json_key)
    return _repair_latex_control_chars(text)


def generate_more_quiz(
    notes_markdown: str,
    existing_questions: list[str],
    count: int = 5,
    difficulty: str = "mixed",
) -> list[QuizQuestion]:
    existing = "\n".join(f"- {q}" for q in existing_questions) or "- (none)"
    prompt = f"""You are Ankur. Based ONLY on the study notes below, create {count} NEW
multiple-choice quiz questions for a Bangladeshi student.

Difficulty: {difficulty}
- easy = basic recall / definitions
- mixed = mix of recall and application
- hard = tracing formulas, comparing ideas, applying concepts

Do NOT repeat any of these existing questions:
{existing}

Rules:
- Exactly 4 options per question
- correct_index is 0-based
- Include a short explanation for each answer
- Stay faithful to the notes — do not invent unrelated topics
- Use LaTeX ($...$) for any math

Notes:
\"\"\"
{notes_markdown[:12000]}
\"\"\"

Respond with EXACTLY one JSON object and nothing else (no markdown, no second object, no prose):
{{"quiz":[{{"question":"string","options":["a","b","c","d"],"correct_index":0,"explanation":"string"}}]}}
Inside strings, escape every double-quote as \\" and every backslash as \\\\.
"""
    data = _text_client_call(prompt, temperature=0.4)
    quiz = data.get("quiz") or data.get("questions") or []
    if not isinstance(quiz, list):
        raise ValueError("Model did not return a quiz array")
    return [QuizQuestion.model_validate(q) for q in quiz]


def _looks_like_code_dump(text: str) -> bool:
    """True when the model returned raw/minified code instead of an explanation."""
    t = (text or "").strip()
    if not t:
        return True
    if re.match(r"^```(?:\w+)?\s*\n", t) and t.count("```") <= 2:
        body = re.sub(r"^```(?:\w+)?\s*", "", t)
        body = re.sub(r"```\s*$", "", body).strip()
        t = body
    head = t[:220].lower().replace("\n", " ")
    if re.match(
        r"^(cpp|c\+\+|c|python|java|javascript|js|ts|typescript|pseudocode|code)\b",
        head,
    ):
        return True
    if re.match(r"^(for|while|if|int |void |public |def |#include)\b", head):
        return True
    lines = [ln for ln in t.splitlines() if ln.strip()]
    if len(lines) <= 2 and ("{" in t and "}" in t) and ("for (" in t or "for(" in t):
        return True
    letter_words = re.findall(r"[A-Za-z\u0980-\u09FF]{3,}", t)
    prose_ratio = len(letter_words) / max(len(t), 1)
    if ("{" in t and "}" in t) and prose_ratio < 0.08 and len(t) < 800:
        return True
    return False


def _format_step_explanation(data: dict, lang: str = "bangla") -> str:
    """Turn structured tutor JSON into readable Markdown."""
    bangla = lang != "english"
    labels = {
        "about": "এটা কী নিয়ে" if bangla else "What this is about",
        "step": "ধাপ" if bangla else "Step",
        "example": "উদাহরণ" if bangla else "Example",
        "mistakes": "সাধারণ ভুল" if bangla else "Common mistakes",
        "remember": "মনে রাখো" if bangla else "Remember",
    }

    summary = str(data.get("summary") or "").strip()
    steps = data.get("steps") or []
    mistakes = data.get("common_mistakes") or []
    remember = str(data.get("remember") or "").strip()

    parts: list[str] = []
    if summary:
        parts.append(f"**{labels['about']}:** {summary}")
        parts.append("")

    if isinstance(steps, list):
        for i, step in enumerate(steps, start=1):
            if not isinstance(step, dict):
                continue
            title = str(step.get("title") or f"{labels['step']} {i}").strip()
            explain = str(step.get("explain") or step.get("explanation") or "").strip()
            example = str(step.get("example") or "").strip()
            if not explain or _looks_like_code_dump(explain):
                continue
            parts.append(f"### {labels['step']} {i}: {title}")
            parts.append(explain)
            if example and not _looks_like_code_dump(example):
                parts.append("")
                parts.append(f"**{labels['example']}:** {example}")
            parts.append("")

    if isinstance(mistakes, list) and mistakes:
        parts.append(f"### {labels['mistakes']}")
        for m in mistakes[:5]:
            s = str(m).strip()
            if s and not _looks_like_code_dump(s):
                parts.append(f"- {s}")
        parts.append("")

    if remember and not _looks_like_code_dump(remember):
        parts.append(f"**{labels['remember']}:** {remember}")

    return _repair_latex_control_chars("\n".join(parts).strip())


def explain_step_by_step(
    notes_markdown: str,
    title: str = "",
    code_snippets: list[str] | None = None,
    output_language: str = "bangla",
) -> str:
    """Elaborate Step-by-step Explanation from Notes — teach with examples, strict language."""
    lang = output_language if output_language in {"bangla", "english"} else "bangla"
    language_instruction = LANGUAGE_INSTRUCTIONS.get(lang, LANGUAGE_INSTRUCTIONS["bangla"])

    if lang == "bangla":
        lang_lock = (
            "LANGUAGE LOCK (strict): Write EVERY string in clear natural Bangla (বাংলা). "
            "Technical terms (loop, swap, array) may stay in English but explain each in Bangla. "
            "Do NOT write English paragraphs. Do NOT mix long English + Bangla."
        )
        step_quality = (
            "Each step must TEACH: কী হচ্ছে, কেন হচ্ছে, কীভাবে কাজ করে — "
            "কমপক্ষে ৪–৭ বাক্য। প্রতিটি step-এ একটি সহজ উদাহরণ দাও "
            "(সংখ্যার অ্যারে, ছোট কেস, বা দৈনন্দিন তুলনা)."
        )
    else:
        lang_lock = (
            "LANGUAGE LOCK (strict): Write EVERY string in clear English only. "
            "Do NOT add Bangla. Do NOT make it bilingual."
        )
        step_quality = (
            "Each step must TEACH: what is happening, why, and how — "
            "at least 4–7 sentences. Every step needs a simple concrete example "
            "(tiny number array, mini case, or everyday analogy)."
        )

    prompt = f"""You are a patient Smart Tutor for Bangladeshi students.
The student ALREADY has complete Notes (from a lecture video or board photo).
Your job: write an ELABORATE Step-by-step Explanation that makes them truly understand.

Title: {title or "Lecture notes"}

{lang_lock}
Also: {language_instruction}

Teaching rules (strict):
1. Explain like a whiteboard teacher — clear, warm, structured.
2. {step_quality}
3. Give worked examples inside the "example" field (trace values, show before/after).
4. Do NOT paste source code / for-loops / "cpp" / full programs.
5. Do NOT invent topics missing from the notes — elaborate what IS there.
6. Need 5 to 8 steps covering the full idea from start to finish.
7. End with 3 common mistakes + one short "remember" tip.

Notes (source of truth — explain THESE):
\"\"\"
{notes_markdown[:10000]}
\"\"\"

Respond with EXACTLY one JSON object and nothing else:
{{
  "summary": "2-3 sentence overview in the locked language",
  "steps": [
    {{
      "title": "short step title",
      "explain": "elaborate teaching paragraph (4-7 sentences)",
      "example": "concrete worked example for this step"
    }}
  ],
  "common_mistakes": ["mistake 1", "mistake 2", "mistake 3"],
  "remember": "one memorable tip"
}}
Inside strings escape quotes as \\".
"""
    data = _text_client_call(prompt, temperature=0.4)
    text = _format_step_explanation(data, lang)

    weak = (
        not text
        or _looks_like_code_dump(text)
        or text.count("### ") < 3
        or len(text) < 400
    )
    if weak:
        rewrite = f"""Rewrite a RICHER Step-by-step Explanation. Previous output was too short or looked like code.

Title: {title or "Lecture notes"}
{lang_lock}

Must include:
- summary (2-3 sentences)
- 6 teaching steps; each explain 4–7 sentences + example with numbers/analogy
- 3 common_mistakes + remember tip
- ZERO source code dumps

Notes:
\"\"\"
{notes_markdown[:10000]}
\"\"\"

JSON only:
{{"summary":"...","steps":[{{"title":"...","explain":"...","example":"..."}}],"common_mistakes":["...","...","..."],"remember":"..."}}
"""
        data = _text_client_call(rewrite, temperature=0.45)
        text = _format_step_explanation(data, lang)

    if not text:
        raise ValueError("Empty step-by-step explanation from model")
    if _looks_like_code_dump(text):
        raise ValueError(
            "Model returned code instead of an explanation. Tap Regenerate."
        )
    return text



def generate_more_flashcards(
    notes_markdown: str,
    existing_questions: list[str],
    count: int = 5,
    difficulty: str = "medium",
) -> list[Flashcard]:
    existing = "\n".join(f"- {q}" for q in existing_questions) or "- (none)"
    level = (difficulty or "medium").lower().strip()
    if level not in {"easy", "medium", "hard"}:
        level = "medium"
    difficulty_guide = {
        "easy": "basic recall / definitions / one-line facts",
        "medium": "short applications, compare ideas, fill-in reasoning",
        "hard": "multi-step reasoning, formula tracing, why / what-if prompts",
    }[level]
    prompt = f"""You are Ankur. Based ONLY on the study notes below, create {count} NEW
flashcards for a Bangladeshi student.

Difficulty: {level} — {difficulty_guide}

Do NOT repeat any of these existing flashcard questions:
{existing}

Rules:
- question + answer pairs only
- Answers should be concise but complete (2-4 sentences max, or a short formula)
- Stay faithful to the notes — do not invent unrelated topics
- Use LaTeX ($...$) for any math

Notes:
\"\"\"
{notes_markdown[:12000]}
\"\"\"

Respond ONLY with JSON:
{{"flashcards":[{{"question":"string","answer":"string"}}]}}
"""
    data = _text_client_call(prompt, temperature=0.4)
    return [Flashcard.model_validate(c) for c in data.get("flashcards", [])]


def generate_written_questions(
    notes_markdown: str,
    existing_questions: list[str] | None = None,
    count: int = 3,
) -> list[WrittenQuestion]:
    existing = "\n".join(f"- {q}" for q in (existing_questions or [])) or "- (none)"
    prompt = f"""You are Ankur. Based ONLY on the study notes, create {count} exam-style
written (short/long answer) questions for Bangladeshi HSC / university students.

Do NOT repeat:
{existing}

Rules:
- Mix short (3-5 marks) and longer (8-10 marks) questions
- Provide a clear model_answer a student can self-check against
- keywords = 3-6 key points that must appear in a good answer
- Stay faithful to the notes

Notes:
\"\"\"
{notes_markdown[:12000]}
\"\"\"

Respond ONLY with JSON:
{{"written_questions":[{{"question":"string","marks":5,"model_answer":"string","keywords":["a","b"]}}]}}
"""
    data = _text_client_call(prompt, temperature=0.35)
    items = data.get("written_questions") or []
    return [WrittenQuestion.model_validate(q) for q in items]


def generate_mermaid_diagram(notes_markdown: str, title: str = "") -> str:
    prompt = f"""You are Ankur. From the lecture notes below, produce a Mermaid flowchart
that captures the main algorithm / process / decision flow.

Title: {title or "Lecture"}

Rules:
- Respond ONLY with JSON: {{"mermaid_diagram":"flowchart TD\\n  A-->B"}}
- Use flowchart TD syntax
- Keep node labels short (English or Bangla ok)
- If there is no clear process/flow, still make a simple concept map of 4-6 nodes
- No markdown fences inside the string

Notes:
\"\"\"
{notes_markdown[:10000]}
\"\"\"
"""
    data = _text_client_call(prompt, temperature=0.2)
    diagram = str(data.get("mermaid_diagram") or "").strip()
    # Strip accidental fences
    diagram = re.sub(r"^```(?:mermaid)?\s*", "", diagram)
    diagram = re.sub(r"\s*```$", "", diagram)
    return diagram.strip()


def generate_excalidraw_flow(notes_markdown: str, title: str = "") -> list[dict]:
    """AI builds an Excalidraw skeleton flowchart from notes (editable on canvas)."""
    prompt = f"""You are Ankur. From the lecture notes, build a clear FLOWCHART for Excalidraw.
Title: {title or "Lecture"}

Return ONLY JSON with an "elements" array using this Excalidraw skeleton format:
{{
  "elements": [
    {{"type":"rectangle","id":"n1","x":120,"y":40,"width":240,"height":72,"label":{{"text":"Start"}}}},
    {{"type":"diamond","id":"n2","x":120,"y":180,"width":240,"height":100,"label":{{"text":"Condition?"}}}},
    {{"type":"ellipse","id":"n3","x":120,"y":360,"width":240,"height":72,"label":{{"text":"End"}}}},
    {{"type":"arrow","id":"a1","start":{{"id":"n1"}},"end":{{"id":"n2"}}}},
    {{"type":"arrow","id":"a2","start":{{"id":"n2"}},"end":{{"id":"n3"}},"label":{{"text":"yes"}}}}
  ]
}}

Rules:
- 5 to 12 nodes covering the main process / algorithm / decision flow from the notes
- Use types: rectangle (process), diamond (decision), ellipse (start/end), arrow (links)
- Every node needs unique id, x, y, width, height, and label.text
- Arrows must use start.id / end.id pointing to node ids
- Layout top-to-bottom with ~120–140 px vertical gaps; keep x mostly aligned
- Labels short (Bangla OR English matching the notes — one language)
- No markdown fences, no Mermaid, no extra keys
- If notes have little flow, still make a useful concept map of key ideas

Notes:
\"\"\"
{notes_markdown[:10000]}
\"\"\"
"""
    data = _text_client_call(prompt, temperature=0.25)
    elements = data.get("elements") or []
    if not isinstance(elements, list) or not elements:
        raise ValueError("Model returned no flow elements")
    cleaned: list[dict] = []
    for el in elements:
        if isinstance(el, dict) and el.get("type"):
            cleaned.append(el)
    if len(cleaned) < 2:
        raise ValueError("Flow needs at least 2 elements")
    return cleaned


def coach_weak_topics(
    notes_markdown: str,
    title: str = "",
    missed_questions: list[str] | None = None,
    related_topics: list[str] | None = None,
) -> tuple[str, list[str]]:
    missed = "\n".join(f"- {q}" for q in (missed_questions or [])) or "- (none listed)"
    topics = ", ".join(related_topics or []) or "(none)"
    prompt = f"""You are a Smart Tutor for Bangladeshi students. The student missed some quiz
questions. Write a focused mini-lesson and a short revision plan.

Title: {title or "Lecture"}
Related topics on file: {topics}

Missed questions:
{missed}

Rules:
- Respond ONLY with JSON:
  {{"coach_markdown":"markdown lesson","focus_topics":["topic1","topic2","topic3"]}}
- coach_markdown: Markdown in ONE language matching the notes (Bangla OR English, not bilingual mix), 4-8 short sections
- Explain WHY the missed ideas matter and how to remember them
- focus_topics: 3-5 concrete things to revise next (short English names)
- Stay grounded in the notes — do not invent unrelated syllabus

Notes:
\"\"\"
{notes_markdown[:10000]}
\"\"\"
"""
    data = _text_client_call(prompt, temperature=0.3)
    md = str(data.get("coach_markdown") or "").strip()
    focus = data.get("focus_topics") or []
    if not isinstance(focus, list):
        focus = []
    focus = [str(t) for t in focus][:6]
    if not md:
        raise ValueError("Empty coach response")
    return md, focus


def generate_study_pack_from_text(
    source_text: str,
    output_language: str,
    title_hint: str = "",
    source_label: str = "lecture",
) -> StudyPack:
    """Build a StudyPack from YouTube transcript or pasted notes (Nexus layer)."""
    language_instruction = LANGUAGE_INSTRUCTIONS.get(
        output_language, LANGUAGE_INSTRUCTIONS["bangla"]
    )
    hint = f"Suggested title hint: {title_hint}\n" if title_hint else ""
    prompt = f"""You are Ankur, an expert study assistant for Bangladeshi students.
You receive a {source_label} transcript / notes (NOT a photo).
The SOURCE may be spoken/written in Bangla, Hindi, English, or a mix (code-switching is common).
You MUST understand the source clearly in any of those languages, then write the study pack
in the OUTPUT language below.

FIRST priority: produce COMPLETE, exam-ready study Notes from the lecture.
Then fill the rest of the study pack (cards, quiz, etc.).

{hint}
Rules:
1. Understand the source fully whether it is Bangla, Hindi, English, or mixed.
   Do not skip content just because the spoken language differs from the output language.
2. Be faithful to the source — do NOT invent major topics that are absent.
3. notes_markdown must be COMPLETE study notes (not a short summary):
   - Clear Markdown headings covering the FULL lecture flow
   - Definitions, key ideas, formulas, and important examples from the source
   - If algorithms appear: describe the idea in words + short structured bullets
     (students will get Step-by-step Explanation later — still make notes thorough)
   - Enough detail that a student who missed class can revise from Notes alone
4. Extract code/pseudocode into code_snippets when present (keep code identifiers as-is).
5. Create 6-10 flashcards and 3-5 MCQ quiz questions from the ACTUAL content.
6. Create 2-4 written_questions with model_answer and keywords.
7. If the lecture describes an algorithm/flow, fill mermaid_diagram; else "".
8. Math in $...$ / $$...$$ LaTeX on one line.
9. related_topics: 3-5 next topics to study.
10. warnings: only real gaps/ambiguities in the source (e.g. unclear audio / missing segment).
11. OUTPUT LANGUAGE (strict — this is what the student selected): {language_instruction}
    Write notes_markdown, flashcards, quiz, written answers ALL in this output language.
    If the source is Hindi/Bangla/English and output differs, TRANSLATE and teach clearly
    in the output language — still keep essential technical terms accurate.
    Do NOT mix Bangla and English paragraphs in the final notes.
12. detected_languages: list the human languages actually present in the SOURCE
    (e.g. ["Hindi"], ["Bangla","English"], ["English"]).

Source text:
\"\"\"
{source_text[:24000]}
\"\"\"

Respond ONLY with JSON matching this schema:
{_JSON_SCHEMA_HINT}
"""
    data = _text_client_call(prompt, temperature=0.25)
    return StudyPack.model_validate(data)


def analyze_topic_radar(
    *,
    paper_images: list[tuple[bytes, str]] | None,
    paper_text: str,
    history_packs: list[dict],
    generate_practice: bool = True,
    practice_count: int = 5,
) -> dict:
    """Past papers × student history → Topic Radar JSON."""
    hist_lines: list[str] = []
    for i, pack in enumerate(history_packs[:20], 1):
        topics = ", ".join((pack.get("related_topics") or [])[:8])
        excerpt = (pack.get("notes_excerpt") or "")[:700]
        hist_lines.append(
            f"{i}. Title: {pack.get('title') or 'Untitled'} | Subject: {pack.get('subject') or '—'}\n"
            f"   Topics: {topics or '—'}\n"
            f"   Notes excerpt: {excerpt or '—'}"
        )
    history_block = "\n".join(hist_lines) if hist_lines else "(No prior study packs — coverage will be 'missing' or unknown.)"

    practice_rule = (
        f"Also generate practice_quiz ({practice_count} NEW MCQs similar in style to the paper) "
        "and practice_written (3 NEW written questions) focused on MUST-STUDY / high-weight + "
        "missing/weak topics. These must be NEW practice samples, not copies of the paper."
        if generate_practice
        else "Set practice_quiz and practice_written to empty arrays."
    )

    prompt = f"""You are Topic Radar for Ankur (Bangladeshi students).
Analyze PREVIOUS QUESTION paper(s) and compare against the student's STUDY HISTORY
(from boards / lectures they already digitized).

Student study history:
{history_block}

Extra paper text (may be empty if only images were provided):
\"\"\"
{(paper_text or '')[:12000]}
\"\"\"

Tasks:
1. Identify exam topics from the paper questions.
2. Estimate weight_percent (sum ≈ 100) and importance: high | medium | low.
3. coverage vs history: covered | weak | missing.
4. must_study: high-importance topics that are missing or weak (ordered).
5. checklist: concrete study actions (8 bullets max).
6. summary_markdown: short overview for the student in ONE language (prefer Bangla if the paper mixes; else English). Do not write bilingual dual sections.
7. For each topic: sample_questions (1-3 short stems from the paper) and study_actions (2-4).
8. previous_questions: extract EVERY readable question from the paper (up to 12). For each give:
   - question text (as on the paper, cleaned)
   - marks (estimate if not printed)
   - topic
   - solution_markdown: FULL step-by-step exam-style answer (formulas, reasoning, final answer).
     Use Markdown + $...$ LaTeX for math. One language only (match the paper / Bangla prefer).
9. {practice_rule}

Respond ONLY with JSON:
{{
  "exam_title": "string",
  "summary_markdown": "string",
  "topics": [
    {{
      "topic": "string",
      "question_count": 0,
      "weight_percent": 0,
      "importance": "high",
      "coverage": "missing",
      "sample_questions": ["..."],
      "study_actions": ["..."]
    }}
  ],
  "must_study": ["topic"],
  "checklist": ["action"],
  "previous_questions": [
    {{
      "question": "string",
      "marks": 5,
      "topic": "string",
      "solution_markdown": "full solution markdown"
    }}
  ],
  "practice_quiz": [
    {{"question":"string","options":["a","b","c","d"],"correct_index":0,"explanation":"string"}}
  ],
  "practice_written": [
    {{"question":"string","marks":5,"model_answer":"string","keywords":["k"]}}
  ]
}}
"""

    contents: list = []
    for data, mime in paper_images or []:
        contents.append(types.Part.from_bytes(data=data, mime_type=mime))
    contents.append(prompt)

    response = _generate_content(
        contents,
        temperature=0.25,
        response_mime_type="application/json",
    )
    raw = response.text or ""
    logger.info("Topic Radar response length: %d chars", len(raw))
    return _extract_json(raw)


def ask_tutor(
    *,
    question: str,
    context_title: str,
    context_markdown: str,
    history_packs: list[dict],
    chat_history: list[dict],
) -> str:
    """Answer a student question using active pack + semester history."""
    hist = []
    for p in history_packs[:12]:
        hist.append(
            f"- {p.get('title')}: topics={', '.join((p.get('related_topics') or [])[:6])}; "
            f"excerpt={(p.get('notes_excerpt') or '')[:400]}"
        )
    prior = []
    for m in chat_history[-8:]:
        role = m.get("role", "user")
        prior.append(f"{role.upper()}: {m.get('content', '')[:1200]}")

    prompt = f"""You are the Ankur tutor for a Bangladeshi student.
Answer in ONE language only — match the student's question language (Bangla OR English).
Do not write bilingual dual paragraphs. Keep essential English technical terms if answering in Bangla.
Use ONLY the provided context and history — if unknown, say so and suggest what to study.
Use $...$ LaTeX for math. Markdown only (no JSON wrapper).

Active material: {context_title or 'Current study pack'}
\"\"\"
{(context_markdown or '')[:16000]}
\"\"\"

Semester history snippets:
{chr(10).join(hist) if hist else '(none)'}

Recent chat:
{chr(10).join(prior) if prior else '(none)'}

Student question:
{question}
"""
    return _markdown_from_model(prompt, "answer_markdown", temperature=0.35)


def verbalize_for_speech(text: str, lang: str = "bangla") -> str:
    """AI reads the FULL study text and writes a natural speech script for TTS."""
    from tts_service import tables_to_speech

    lang = lang if lang in {"bangla", "english"} else "bangla"
    # Convert tables to sentences first so the model narrates rows clearly.
    prepped = tables_to_speech(text, lang)  # type: ignore[arg-type]

    if lang == "bangla":
        lang_rule = (
            "Write the spoken script in clear Bangla (বাংলা). Keep essential English "
            "technical terms. Speak every formula in natural Bangla words "
            "(e.g. $0 \\le A \\le 10$ → 'A শূন্য থেকে দশ পর্যন্ত, সমানসহ')."
        )
    else:
        lang_rule = (
            "Write the spoken script in clear English. Speak every formula in natural "
            "words (e.g. $0 \\le A \\le 10$ → 'A is between zero and ten inclusive')."
        )

    # Chunk so the model can cover the ENTIRE notes / step-by-step explanation.
    chunks: list[str] = []
    remaining = prepped.strip()
    chunk_size = 3500
    max_chunks = 20  # enough for long notes + elaborate step explanations
    while remaining and len(chunks) < max_chunks:
        if len(remaining) <= chunk_size:
            chunks.append(remaining)
            break
        cut = remaining.rfind("\n\n", 0, chunk_size)
        if cut < chunk_size // 2:
            cut = remaining.rfind("\n", 0, chunk_size)
        if cut < chunk_size // 2:
            cut = remaining.rfind(" ", 0, chunk_size)
        if cut < 0:
            cut = chunk_size
        chunks.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()
    if remaining and len(chunks) >= max_chunks:
        # Append leftover into last chunk rather than dropping it.
        chunks[-1] = (chunks[-1] + "\n\n" + remaining).strip()

    total = len(chunks)

    def _narrate_chunk(idx: int, chunk: str) -> tuple[int, str]:
        part_note = (
            f"This is part {idx + 1} of {total}. "
            "Continue the narration in order. Cover EVERY sentence in THIS part — "
            "do not summarize, skip, or shorten. Full coverage of this part is required."
            if total > 1
            else (
                "Narrate the FULL study content in order. "
                "Do not summarize or skip — every section, step, and example must be spoken."
            )
        )
        prompt = f"""You are a study narrator. Read the notes and write a COMPLETE SPEECH SCRIPT.
{lang_rule}

{part_note}

Rules:
- Plain spoken sentences only. No Markdown, no LaTeX, no code fences, no pipe characters
- Cover ALL ideas in this part in order (steps, examples, common mistakes, tips)
- Tables: one short sentence per object/row
- Do NOT invent new academic content
- Do NOT write "and so on" / "etc" to skip material — speak it fully

Notes:
\"\"\"
{chunk}
\"\"\"
"""
        return idx, _markdown_from_model(prompt, "spoken_text", temperature=0.2)

    scripts: list[str] = [""] * total
    if total == 1:
        _, script = _narrate_chunk(0, chunks[0])
        scripts[0] = script
    else:
        # Multiple chunks narrated together, then merged in order for full audio.
        from concurrent.futures import ThreadPoolExecutor, as_completed

        workers = min(4, total)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_narrate_chunk, i, c) for i, c in enumerate(chunks)]
            for fut in as_completed(futures):
                idx, script = fut.result()
                scripts[idx] = script

    return " ".join(s.strip() for s in scripts if s.strip())
