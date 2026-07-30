"""Lightweight whiteboard photo cleanup before Gemma vision."""

from __future__ import annotations

import io
import logging

from PIL import Image, ImageEnhance, ImageOps

logger = logging.getLogger(__name__)

MAX_EDGE = 1600


def preprocess_whiteboard(image_bytes: bytes, mime_type: str = "image/jpeg") -> tuple[bytes, str]:
    """Auto-orient, contrast boost, mild sharpen, downscale — return JPEG bytes."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")

        # Mild contrast + brightness help low-light classroom photos.
        img = ImageEnhance.Contrast(img).enhance(1.25)
        img = ImageEnhance.Brightness(img).enhance(1.05)
        img = ImageEnhance.Sharpness(img).enhance(1.15)

        w, h = img.size
        longest = max(w, h)
        if longest > MAX_EDGE:
            scale = MAX_EDGE / longest
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=88, optimize=True)
        return out.getvalue(), "image/jpeg"
    except Exception:
        logger.exception("Image preprocess failed; using original bytes")
        return image_bytes, mime_type
