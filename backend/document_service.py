"""Extract plain text from lecture PDFs / Docs / slides for the Nexus lecture layer."""

from __future__ import annotations

import logging
import re
from io import BytesIO
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_EXTRACT_CHARS = 80_000

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md", ".markdown"}

ALLOWED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "application/octet-stream",  # browsers sometimes omit precise type
}


def _ext(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def _normalize(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _from_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is not installed") from exc

    reader = PdfReader(BytesIO(data))
    parts: list[str] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:
            logger.warning("PDF page %d extract failed: %s", i, exc)
            continue
        page_text = page_text.strip()
        if page_text:
            parts.append(f"--- Page {i} ---\n{page_text}")
    return "\n\n".join(parts)


def _from_docx(data: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("python-docx is not installed") from exc

    doc = Document(BytesIO(data))
    parts: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)
    for table in doc.tables:
        for row in table.rows:
            cells = [(c.text or "").strip() for c in row.cells]
            line = " | ".join(c for c in cells if c)
            if line:
                parts.append(line)
    return "\n\n".join(parts)


def _from_pptx(data: bytes) -> str:
    try:
        from pptx import Presentation
    except ImportError as exc:
        raise RuntimeError("python-pptx is not installed") from exc

    prs = Presentation(BytesIO(data))
    parts: list[str] = []
    for i, slide in enumerate(prs.slides, start=1):
        slide_bits: list[str] = []
        for shape in slide.shapes:
            if not getattr(shape, "has_text_frame", False):
                continue
            for para in shape.text_frame.paragraphs:
                t = "".join(run.text for run in para.runs).strip()
                if t:
                    slide_bits.append(t)
        if slide_bits:
            parts.append(f"--- Slide {i} ---\n" + "\n".join(slide_bits))
    return "\n\n".join(parts)


def _from_plain(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def extract_document_text(
    data: bytes,
    filename: str,
    content_type: str | None = None,
) -> tuple[str, str]:
    """Return (extracted_text, source_label). Raises ValueError on bad input."""
    if not data:
        raise ValueError("Empty document")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ValueError(f"Document too large (max {MAX_DOCUMENT_BYTES // (1024 * 1024)} MB)")

    name = (filename or "document").strip() or "document"
    ext = _ext(name)
    mime = (content_type or "").split(";")[0].strip().lower()

    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Use PDF, DOCX, PPTX, TXT, or Markdown."
        )
    if mime and mime not in ALLOWED_MIME and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{mime or ext}'. Use PDF, DOCX, PPTX, TXT, or Markdown."
        )

    if not ext:
        if mime == "application/pdf":
            ext = ".pdf"
        elif "wordprocessingml" in mime:
            ext = ".docx"
        elif "presentationml" in mime:
            ext = ".pptx"
        elif mime in {"text/plain", "text/markdown"}:
            ext = ".txt"
        else:
            raise ValueError("Could not detect file type. Use PDF, DOCX, PPTX, TXT, or Markdown.")

    try:
        if ext == ".pdf":
            text = _from_pdf(data)
        elif ext == ".docx":
            text = _from_docx(data)
        elif ext == ".pptx":
            text = _from_pptx(data)
        else:
            text = _from_plain(data)
    except ValueError:
        raise
    except Exception as exc:
        logger.exception("Document extract failed for %s", name)
        raise ValueError(f"Could not read document: {exc}") from exc

    text = _normalize(text)
    if not text:
        raise ValueError(
            "No extractable text found. Scanned/image-only PDFs need Board photos or pasted text."
        )

    if len(text) > MAX_EXTRACT_CHARS:
        text = text[:MAX_EXTRACT_CHARS] + "\n\n[… truncated for length …]"

    label = Path(name).name
    return text, label
