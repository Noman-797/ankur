"""Server-side TTS via Microsoft Edge neural voices (Bangla + English)."""

from __future__ import annotations

import io
import re
from typing import Literal

import edge_tts

SpeechLang = Literal["bangla", "english"]

VOICES: dict[SpeechLang, str] = {
    "bangla": "bn-BD-NabanitaNeural",
    "english": "en-US-JennyNeural",
}

MAX_CHARS = 2200  # per TTS chunk (Edge stays stable); full text is split across chunks
TTS_CHUNK_CHARS = 2000

# Spoken replacements for common LaTeX / math symbols.
_MATH_EN: list[tuple[str, str]] = [
    (r"\\leq", " less than or equal to "),
    (r"\\le", " less than or equal to "),
    (r"\\geq", " greater than or equal to "),
    (r"\\ge", " greater than or equal to "),
    (r"\\neq", " not equal to "),
    (r"\\ne", " not equal to "),
    (r"\\approx", " approximately equal to "),
    (r"\\equiv", " equivalent to "),
    (r"\\times", " times "),
    (r"\\cdot", " times "),
    (r"\\div", " divided by "),
    (r"\\pm", " plus or minus "),
    (r"\\mp", " minus or plus "),
    (r"\\infty", " infinity "),
    (r"\\rightarrow", " goes to "),
    (r"\\to", " goes to "),
    (r"\\Rightarrow", " implies "),
    (r"\\leftrightarrow", " if and only if "),
    (r"\\Leftrightarrow", " if and only if "),
    (r"\\in", " in "),
    (r"\\notin", " not in "),
    (r"\\subset", " subset of "),
    (r"\\subseteq", " subset or equal to "),
    (r"\\cup", " union "),
    (r"\\cap", " intersection "),
    (r"\\emptyset", " empty set "),
    (r"\\forall", " for all "),
    (r"\\exists", " there exists "),
    (r"\\sum", " sum of "),
    (r"\\prod", " product of "),
    (r"\\int", " integral of "),
    (r"\\partial", " partial "),
    (r"\\nabla", " nabla "),
    (r"\\alpha", " alpha "),
    (r"\\beta", " beta "),
    (r"\\gamma", " gamma "),
    (r"\\delta", " delta "),
    (r"\\theta", " theta "),
    (r"\\lambda", " lambda "),
    (r"\\mu", " mu "),
    (r"\\pi", " pi "),
    (r"\\sigma", " sigma "),
    (r"\\omega", " omega "),
    (r"\\Delta", " Delta "),
    (r"\\Sigma", " Sigma "),
    (r"\\Omega", " Omega "),
    (r"\\ldots", " dot dot dot "),
    (r"\\dots", " dot dot dot "),
    (r"\\%", " percent "),
    (r"\\degree", " degrees "),
    (r"\\circ", " degrees "),
]

_MATH_BN: list[tuple[str, str]] = [
    (r"\\leq", " ছোটো বা সমান "),
    (r"\\le", " ছোটো বা সমান "),
    (r"\\geq", " বড়ো বা সমান "),
    (r"\\ge", " বড়ো বা সমান "),
    (r"\\neq", " সমান নয় "),
    (r"\\ne", " সমান নয় "),
    (r"\\approx", " প্রায় সমান "),
    (r"\\equiv", " সমতুল্য "),
    (r"\\times", " গুণ "),
    (r"\\cdot", " গুণ "),
    (r"\\div", " ভাগ "),
    (r"\\pm", " যোগ বা বিয়োগ "),
    (r"\\mp", " বিয়োগ বা যোগ "),
    (r"\\infty", " অসীম "),
    (r"\\rightarrow", " যায় "),
    (r"\\to", " যায় "),
    (r"\\Rightarrow", " থেকে বোঝায় "),
    (r"\\leftrightarrow", " যদি এবং কেবল যদি "),
    (r"\\Leftrightarrow", " যদি এবং কেবল যদি "),
    (r"\\in", " এর অন্তর্গত "),
    (r"\\notin", " এর অন্তর্গত নয় "),
    (r"\\subset", " উপসেট "),
    (r"\\subseteq", " উপসেট বা সমান "),
    (r"\\cup", " ইউনিয়ন "),
    (r"\\cap", " ইন্টারসেকশন "),
    (r"\\emptyset", " শূন্য সেট "),
    (r"\\forall", " সকলের জন্য "),
    (r"\\exists", " অস্তিত্ব আছে "),
    (r"\\sum", " যোগফল "),
    (r"\\prod", " গুণফল "),
    (r"\\int", " ইন্টিগ্রাল "),
    (r"\\partial", " পার্শিয়াল "),
    (r"\\nabla", " ন্যাবলা "),
    (r"\\alpha", " অ্যালফা "),
    (r"\\beta", " বিটা "),
    (r"\\gamma", " গামা "),
    (r"\\delta", " ডেল্টা "),
    (r"\\theta", " থিটা "),
    (r"\\lambda", " ল্যাম্বডা "),
    (r"\\mu", " মিউ "),
    (r"\\pi", " পাই "),
    (r"\\sigma", " সিগমা "),
    (r"\\omega", " ওমেগা "),
    (r"\\Delta", " ডেল্টা "),
    (r"\\Sigma", " সিগমা "),
    (r"\\Omega", " ওমেগা "),
    (r"\\ldots", " ডট ডট ডট "),
    (r"\\dots", " ডট ডট ডট "),
    (r"\\%", " পার্সেন্ট "),
    (r"\\degree", " ডিগ্রি "),
    (r"\\circ", " ডিগ্রি "),
]

_PLAIN_OPS_EN = [
    (r"≤", " less than or equal to "),
    (r"≥", " greater than or equal to "),
    (r"≠", " not equal to "),
    (r"≈", " approximately equal to "),
    (r"×", " times "),
    (r"÷", " divided by "),
    (r"±", " plus or minus "),
    (r"∞", " infinity "),
    (r"→", " goes to "),
    (r"⇒", " implies "),
    (r"∈", " in "),
]

_PLAIN_OPS_BN = [
    (r"≤", " ছোটো বা সমান "),
    (r"≥", " বড়ো বা সমান "),
    (r"≠", " সমান নয় "),
    (r"≈", " প্রায় সমান "),
    (r"×", " গুণ "),
    (r"÷", " ভাগ "),
    (r"±", " যোগ বা বিয়োগ "),
    (r"∞", " অসীম "),
    (r"→", " যায় "),
    (r"⇒", " থেকে বোঝায় "),
    (r"∈", " এর অন্তর্গত "),
]


def _brace_arg(expr: str, start: int) -> tuple[str, int] | None:
    """Parse `{...}` starting at `start` (must be '{'). Returns (inner, end_index)."""
    if start >= len(expr) or expr[start] != "{":
        return None
    depth = 0
    for i in range(start, len(expr)):
        if expr[i] == "{":
            depth += 1
        elif expr[i] == "}":
            depth -= 1
            if depth == 0:
                return expr[start + 1 : i], i + 1
    return None


def _rewrite_frac_sqrt(expr: str, lang: SpeechLang) -> str:
    """Expand \\frac{a}{b} and \\sqrt[n]{x} / \\sqrt{x} into spoken phrases."""
    out: list[str] = []
    i = 0
    while i < len(expr):
        if expr.startswith(r"\frac", i):
            j = i + 5
            while j < len(expr) and expr[j].isspace():
                j += 1
            num = _brace_arg(expr, j)
            if num:
                den = _brace_arg(expr, num[1])
                if den:
                    a = _rewrite_frac_sqrt(num[0], lang)
                    b = _rewrite_frac_sqrt(den[0], lang)
                    if lang == "bangla":
                        out.append(f" {a} ভাগ {b} ")
                    else:
                        out.append(f" {a} over {b} ")
                    i = den[1]
                    continue
        if expr.startswith(r"\sqrt", i):
            j = i + 5
            while j < len(expr) and expr[j].isspace():
                j += 1
            root_n = None
            if j < len(expr) and expr[j] == "[":
                end = expr.find("]", j)
                if end != -1:
                    root_n = expr[j + 1 : end].strip()
                    j = end + 1
                    while j < len(expr) and expr[j].isspace():
                        j += 1
            body = _brace_arg(expr, j)
            if body:
                inner = _rewrite_frac_sqrt(body[0], lang)
                if lang == "bangla":
                    if root_n:
                        out.append(f" {root_n} তম মূল {inner} ")
                    else:
                        out.append(f" বর্গমূল {inner} ")
                else:
                    if root_n:
                        out.append(f" the {root_n} root of {inner} ")
                    else:
                        out.append(f" square root of {inner} ")
                i = body[1]
                continue
        out.append(expr[i])
        i += 1
    return "".join(out)


def _rewrite_scripts(expr: str, lang: SpeechLang) -> str:
    """Turn a^b / a_b / a^{b} / a_{b} into spoken form."""

    def speak_sup(base: str, power: str) -> str:
        power = power.strip()
        if lang == "bangla":
            special = {"2": " স্কোয়ার ", "3": " কিউব "}
            if power in special:
                return f"{base}{special[power]}"
            return f"{base} এর ঘাত {power} "

        special = {"2": " squared ", "3": " cubed "}
        if power in special:
            return f"{base}{special[power]}"
        return f"{base} to the power of {power} "

    def speak_sub(base: str, sub: str) -> str:
        sub = sub.strip()
        if lang == "bangla":
            return f"{base} সাবস্ক্রিপ্ট {sub} "
        return f"{base} sub {sub} "

    # Superscripts / subscripts with braces
    expr = re.sub(
        r"([A-Za-z0-9πθαλμσωΔΣΩ\)\]])\^\{([^{}]+)\}",
        lambda m: speak_sup(m.group(1), m.group(2)),
        expr,
    )
    expr = re.sub(
        r"([A-Za-z0-9πθαλμσωΔΣΩ\)\]])_\{([^{}]+)\}",
        lambda m: speak_sub(m.group(1), m.group(2)),
        expr,
    )
    expr = re.sub(
        r"([A-Za-z0-9πθαλμσωΔΣΩ\)\]])\^([A-Za-z0-9])",
        lambda m: speak_sup(m.group(1), m.group(2)),
        expr,
    )
    expr = re.sub(
        r"([A-Za-z0-9πθαλμσωΔΣΩ\)\]])_([A-Za-z0-9])",
        lambda m: speak_sub(m.group(1), m.group(2)),
        expr,
    )
    return expr


def latex_to_speech(expr: str, lang: SpeechLang) -> str:
    """Convert a LaTeX math expression into speakable plain language."""
    text = expr.strip()
    if not text:
        return ""

    # Drop math-mode wrappers / sizing commands that shouldn't be spoken.
    text = re.sub(r"\\left|\\right|\\big|\\Big|\\bigg|\\Bigg", "", text)
    text = re.sub(r"\\,|\\;|\\!|\\quad|\\qquad|~", " ", text)
    text = text.replace(r"\{", " ").replace(r"\}", " ")

    text = _rewrite_frac_sqrt(text, lang)
    text = _rewrite_scripts(text, lang)

    table = _MATH_BN if lang == "bangla" else _MATH_EN
    for pat, repl in table:
        text = re.sub(pat, repl, text)

    plain = _PLAIN_OPS_BN if lang == "bangla" else _PLAIN_OPS_EN
    for pat, repl in plain:
        text = re.sub(pat, repl, text)

    # Remaining unknown \commands → speak the name
    text = re.sub(r"\\([A-Za-z]+)", r" \1 ", text)

    # ASCII operators
    if lang == "bangla":
        text = text.replace("<=", " ছোটো বা সমান ")
        text = text.replace(">=", " বড়ো বা সমান ")
        text = text.replace("!=", " সমান নয় ")
        text = text.replace("==", " সমান ")
        text = text.replace("=", " সমান ")
        text = text.replace("<", " ছোটো ")
        text = text.replace(">", " বড়ো ")
        text = text.replace("+", " যোগ ")
        text = text.replace("-", " বিয়োগ ")
        text = text.replace("*", " গুণ ")
        text = text.replace("/", " ভাগ ")
    else:
        text = text.replace("<=", " less than or equal to ")
        text = text.replace(">=", " greater than or equal to ")
        text = text.replace("!=", " not equal to ")
        text = text.replace("==", " equals ")
        text = text.replace("=", " equals ")
        text = text.replace("<", " less than ")
        text = text.replace(">", " greater than ")
        text = text.replace("+", " plus ")
        text = text.replace("-", " minus ")
        text = text.replace("*", " times ")
        text = text.replace("/", " divided by ")

    text = text.replace("{", " ").replace("}", " ")
    text = text.replace("\\", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_table_row(line: str) -> list[str]:
    line = line.strip().strip("|")
    return [c.strip() for c in line.split("|")]


def tables_to_speech(text: str, lang: SpeechLang = "bangla") -> str:
    """Turn Markdown tables into short spoken sentences (avoids TTS stalling on | grids)."""
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Start of a markdown table: a pipe row followed by a separator or another pipe row
        if line.count("|") >= 2:
            block = [line]
            j = i + 1
            while j < len(lines) and lines[j].count("|") >= 2:
                block.append(lines[j])
                j += 1
            # Need header + at least one data row (skip --- separators)
            rows: list[list[str]] = []
            for raw in block:
                if re.match(r"^\s*\|?\s*:?-{3,}", raw.strip()):
                    continue
                cells = [c for c in _split_table_row(raw) if c != ""]
                if cells:
                    rows.append(cells)
            if len(rows) >= 2:
                headers = rows[0]
                spoken_rows: list[str] = []
                for row in rows[1:]:
                    bits: list[str] = []
                    for idx, cell in enumerate(row):
                        header = headers[idx] if idx < len(headers) else f"col {idx + 1}"
                        # Speak "Profit/Weight" as "profit weight" not "divided by"
                        header_s = header.replace("/", " ").replace("%", " percent")
                        cell_s = cell.replace("/", " ")
                        if lang == "bangla":
                            bits.append(f"{header_s} {cell_s}")
                        else:
                            bits.append(f"{header_s} is {cell_s}")
                    if lang == "bangla":
                        spoken_rows.append(", ".join(bits) + "।")
                    else:
                        spoken_rows.append(", ".join(bits) + ".")
                intro = "টেবিল। " if lang == "bangla" else "Table. "
                out.append(intro + " ".join(spoken_rows))
                i = j
                continue
        out.append(line)
        i += 1
    return "\n".join(out)


def looks_like_heavy_table(text: str) -> bool:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False
    pipe_rows = sum(1 for ln in lines if ln.count("|") >= 2)
    return pipe_rows >= 3 and pipe_rows / max(len(lines), 1) >= 0.35


def prepare_for_speech(text: str, lang: SpeechLang = "bangla", *, limit: int | None = None) -> str:
    """Markdown → speakable text, with tables + math read aloud clearly."""
    plain = tables_to_speech(text, lang)

    def math_repl(match: re.Match[str]) -> str:
        spoken = latex_to_speech(match.group(1), lang)
        return f" {spoken} " if spoken else " "

    # Display then inline math
    plain = re.sub(r"\$\$([\s\S]*?)\$\$", math_repl, plain)
    plain = re.sub(r"(?<!\$)\$([^$\n]+)\$(?!\$)", math_repl, plain)
    # \( ... \) / \[ ... \]
    plain = re.sub(r"\\\(([\s\S]*?)\\\)", math_repl, plain)
    plain = re.sub(r"\\\[([\s\S]*?)\\\]", math_repl, plain)

    plain = re.sub(r"```[\s\S]*?```", " ", plain)
    plain = re.sub(r"!\[[^\]]*]\([^)]*\)", " ", plain)
    plain = re.sub(r"\[([^\]]*)]\([^)]*\)", r"\1", plain)
    # Do NOT strip '|' here — tables already converted; leftover pipes → space
    plain = re.sub(r"[#>*_`~|]", " ", plain)
    plain = re.sub(r"\s+", " ", plain).strip()
    if limit is not None and limit > 0:
        return plain[:limit]
    return plain


def _split_speech_chunks(text: str, max_len: int = TTS_CHUNK_CHARS) -> list[str]:
    """Split long speech into Edge-TTS-safe chunks at sentence boundaries."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= max_len:
        return [text]

    chunks: list[str] = []
    remaining = text
    while remaining:
        if len(remaining) <= max_len:
            chunks.append(remaining)
            break
        window = remaining[:max_len]
        cut = max(
            window.rfind("।"),
            window.rfind(". "),
            window.rfind("? "),
            window.rfind("! "),
            window.rfind("\n"),
            window.rfind("；"),
        )
        if cut < max_len // 3:
            cut = window.rfind(" ")
        if cut < max_len // 4:
            cut = max_len
        piece = remaining[:cut].strip()
        if piece:
            chunks.append(piece)
        remaining = remaining[cut:].strip()
    return chunks


async def _edge_mp3_chunk(text: str, voice: str) -> bytes:
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    data = buf.getvalue()
    if not data:
        raise RuntimeError("TTS returned empty audio for a chunk")
    return data


async def synthesize_mp3(text: str, lang: SpeechLang = "bangla") -> bytes:
    """Synthesize the FULL script as MP3.

    Long text is split into chunks; chunks are generated in parallel, then
    concatenated in order into one continuous MP3.
    """
    import asyncio

    plain = prepare_for_speech(text, lang)
    if not plain:
        raise ValueError("Nothing to speak")

    voice = VOICES[lang]
    parts = _split_speech_chunks(plain, TTS_CHUNK_CHARS)
    if len(parts) == 1:
        return await _edge_mp3_chunk(parts[0], voice)

    # Generate multiple chunks together (bounded concurrency for Edge stability).
    sem = asyncio.Semaphore(4)

    async def gen(part: str) -> bytes:
        async with sem:
            return await _edge_mp3_chunk(part, voice)

    audios = await asyncio.gather(*[gen(p) for p in parts])
    audio = b"".join(audios)
    if not audio:
        raise RuntimeError("TTS returned empty audio")
    return audio
