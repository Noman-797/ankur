"""YouTube / raw-text intake for the Nexus lecture layer."""

from __future__ import annotations

import logging
import os
import re
from urllib.parse import parse_qs, urlparse

import httpx

logger = logging.getLogger(__name__)

# Prefer South-Asian classroom languages, then English, then common fallbacks.
PREFERRED_TRANSCRIPT_LANGS = (
    "bn",  # Bangla
    "bn-BD",
    "hi",  # Hindi
    "hi-IN",
    "en",
    "en-US",
    "en-GB",
    "en-IN",
)

# Android Innertube client often still works when the web timedtext path is IP-blocked.
_INNERTUBE_PLAYER_URL = (
    "https://www.youtube.com/youtubei/v1/player"
    "?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"
)
_INNERTUBE_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    "X-Youtube-Client-Name": "3",
    "X-Youtube-Client-Version": "20.10.38",
}
_INNERTUBE_CONTEXT = {
    "client": {
        "clientName": "ANDROID",
        "clientVersion": "20.10.38",
        "androidSdkVersion": 30,
        "hl": "en",
        "gl": "US",
    }
}


def extract_youtube_id(url: str) -> str | None:
    text = (url or "").strip()
    if not text:
        return None
    if re.fullmatch(r"[\w-]{11}", text):
        return text
    try:
        parsed = urlparse(text)
    except Exception:
        return None
    host = (parsed.hostname or "").lower()
    if host in {"youtu.be"}:
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid if re.fullmatch(r"[\w-]{11}", vid) else None
    if "youtube" in host:
        qs = parse_qs(parsed.query)
        if "v" in qs and re.fullmatch(r"[\w-]{11}", qs["v"][0]):
            return qs["v"][0]
        parts = [p for p in parsed.path.split("/") if p]
        if parts and parts[0] in {"embed", "shorts", "live", "v"} and len(parts) > 1:
            vid = parts[1]
            return vid if re.fullmatch(r"[\w-]{11}", vid) else None
    return None


def _fetch_via_supadata(video_id: str) -> str:
    key = os.environ.get("SUPADATA_API_KEY", "").strip()
    if not key:
        raise RuntimeError("SUPADATA_API_KEY not set")
    url = f"https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v={video_id}"
    # Ask for preferred languages when the API supports lang query params.
    headers = {"x-api-key": key}
    with httpx.Client(timeout=60.0) as client:
        res = client.get(
            url,
            headers=headers,
            params={"lang": "bn,hi,en"},
        )
        res.raise_for_status()
        data = res.json()
    if isinstance(data, dict):
        if isinstance(data.get("content"), str):
            return data["content"]
        chunks = data.get("transcript") or data.get("content") or data.get("segments")
        if isinstance(chunks, list):
            parts: list[str] = []
            for c in chunks:
                if isinstance(c, str):
                    parts.append(c)
                elif isinstance(c, dict):
                    parts.append(str(c.get("text") or c.get("content") or ""))
            return " ".join(p for p in parts if p)
    raise RuntimeError("Unexpected Supadata transcript response")


def _transcript_to_text(fetched) -> str:
    if fetched is None:
        return ""
    # FetchedTranscript is iterable of snippets with .text
    try:
        lines = [snip.text for snip in fetched]
        return " ".join(lines)
    except TypeError:
        pass
    if isinstance(fetched, list):
        return " ".join(str(item.get("text", "")) for item in fetched if isinstance(item, dict))
    return str(fetched)


def _lang_rank(code: str) -> int:
    code = (code or "").lower()
    for i, pref in enumerate(PREFERRED_TRANSCRIPT_LANGS):
        if code == pref.lower() or code.startswith(pref.lower().split("-")[0]):
            return i
    return 10_000


def _pick_caption_track(tracks: list[dict]) -> dict | None:
    if not tracks:
        return None
    scored: list[tuple[int, int, int, dict]] = []
    for idx, track in enumerate(tracks):
        code = str(track.get("languageCode") or "")
        # Prefer manual tracks (no kind=asr) over auto-generated when rank ties.
        asr_penalty = 1 if (track.get("kind") or "") == "asr" else 0
        scored.append((_lang_rank(code), asr_penalty, idx, track))
    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    return scored[0][3]


def _json3_to_text(payload: dict) -> str:
    parts: list[str] = []
    for event in payload.get("events") or []:
        for seg in event.get("segs") or []:
            raw = seg.get("utf8")
            if not isinstance(raw, str):
                continue
            text = raw.replace("\n", " ").strip()
            if text:
                parts.append(text)
    return " ".join(parts)


def _fetch_via_innertube(video_id: str) -> str:
    """Fetch captions via YouTube Innertube ANDROID player (bypasses many web IP blocks)."""
    with httpx.Client(timeout=45.0, headers=_INNERTUBE_HEADERS) as client:
        res = client.post(
            _INNERTUBE_PLAYER_URL,
            json={"context": _INNERTUBE_CONTEXT, "videoId": video_id},
        )
        res.raise_for_status()
        data = res.json()

        playability = (data.get("playabilityStatus") or {}).get("status")
        if playability and playability != "OK":
            reason = (data.get("playabilityStatus") or {}).get("reason") or playability
            raise RuntimeError(f"YouTube player unavailable: {reason}")

        caps = (data.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}
        tracks = caps.get("captionTracks") or []
        track = _pick_caption_track(tracks)
        if not track or not track.get("baseUrl"):
            raise RuntimeError("No caption tracks available for this video")

        base_url = str(track["baseUrl"])
        if "fmt=" in base_url:
            caption_url = re.sub(r"fmt=[^&]+", "fmt=json3", base_url)
        else:
            sep = "&" if "?" in base_url else "?"
            caption_url = f"{base_url}{sep}fmt=json3"

        cap_res = client.get(caption_url)
        cap_res.raise_for_status()
        payload = cap_res.json()
        text = _json3_to_text(payload).strip()
        if not text:
            raise RuntimeError("Empty caption track from Innertube")
        logger.info(
            "Innertube transcript lang=%s kind=%s chars=%d",
            track.get("languageCode"),
            track.get("kind") or "manual",
            len(text),
        )
        return text


def _proxy_config_from_env():
    """Optional rotating proxy for youtube-transcript-api (Webshare or generic HTTP)."""
    user = os.environ.get("WEBSHARE_PROXY_USERNAME", "").strip()
    password = os.environ.get("WEBSHARE_PROXY_PASSWORD", "").strip()
    if user and password:
        from youtube_transcript_api.proxies import WebshareProxyConfig

        return WebshareProxyConfig(
            proxy_username=user,
            proxy_password=password,
            retries_when_blocked=5,
        )

    http_proxy = os.environ.get("YOUTUBE_HTTP_PROXY", "").strip()
    https_proxy = os.environ.get("YOUTUBE_HTTPS_PROXY", "").strip() or http_proxy
    if http_proxy or https_proxy:
        from youtube_transcript_api.proxies import GenericProxyConfig

        return GenericProxyConfig(http_url=http_proxy or None, https_url=https_proxy or None)
    return None


def _fetch_via_youtube_transcript_api(video_id: str) -> str:
    """Fetch transcript preferring Bangla / Hindi / English (manual or auto).

    Uses youtube-transcript-api v1+ instance methods (get_transcript was removed in 1.2).
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise RuntimeError("youtube-transcript-api is not installed") from exc

    proxy_config = _proxy_config_from_env()
    api = YouTubeTranscriptApi(proxy_config=proxy_config) if proxy_config else YouTubeTranscriptApi()
    last_err: Exception | None = None

    # 1) List available tracks and pick BN → HI → EN (manual first, then generated).
    try:
        listing = api.list(video_id)
        try:
            transcript = listing.find_transcript(list(PREFERRED_TRANSCRIPT_LANGS))
            fetched = transcript.fetch()
            text = _transcript_to_text(fetched).strip()
            if text:
                logger.info(
                    "YouTube transcript lang=%s generated=%s chars=%d",
                    getattr(transcript, "language_code", "?"),
                    getattr(transcript, "is_generated", "?"),
                    len(text),
                )
                return text
        except Exception as exc:
            last_err = exc
            logger.warning("Preferred transcript pick failed: %s", exc)

        # 2) Any manually created track, then any generated track.
        for finder_name in ("find_manually_created_transcript", "find_generated_transcript"):
            finder = getattr(listing, finder_name, None)
            if not finder:
                continue
            for langs in (
                list(PREFERRED_TRANSCRIPT_LANGS),
                ["bn", "hi", "en"],
            ):
                try:
                    transcript = finder(langs)
                    text = _transcript_to_text(transcript.fetch()).strip()
                    if text:
                        logger.info(
                            "YouTube transcript via %s lang=%s",
                            finder_name,
                            getattr(transcript, "language_code", "?"),
                        )
                        return text
                except Exception as exc:
                    last_err = exc

        # 3) Absolute fallback: first available transcript of any language.
        try:
            for transcript in listing:
                text = _transcript_to_text(transcript.fetch()).strip()
                if text:
                    logger.info(
                        "YouTube transcript fallback lang=%s",
                        getattr(transcript, "language_code", "?"),
                    )
                    return text
        except Exception as exc:
            last_err = exc
    except Exception as exc:
        last_err = exc
        logger.warning("YouTube list() failed: %s", exc)

    # 4) Direct fetch API (v1+)
    try:
        fetched = api.fetch(video_id, languages=list(PREFERRED_TRANSCRIPT_LANGS))
        text = _transcript_to_text(fetched).strip()
        if text:
            return text
    except Exception as exc:
        last_err = exc

    raise RuntimeError(f"Could not fetch YouTube transcript: {last_err}")


def fetch_youtube_transcript(url_or_id: str) -> tuple[str, str]:
    """Return (transcript_text, video_id). Supports BN / HI / EN (and other) captions."""
    video_id = extract_youtube_id(url_or_id)
    if not video_id:
        raise ValueError("Invalid YouTube URL or video id")

    errors: list[str] = []
    if os.environ.get("SUPADATA_API_KEY", "").strip():
        try:
            text = _fetch_via_supadata(video_id).strip()
            if text:
                return text, video_id
        except Exception as exc:
            logger.warning("Supadata transcript failed: %s", exc)
            errors.append(str(exc))

    try:
        text = _fetch_via_youtube_transcript_api(video_id).strip()
        if text:
            return text, video_id
    except Exception as exc:
        logger.warning("youtube-transcript-api failed: %s", exc)
        errors.append(str(exc))

    # Innertube ANDROID client — works when the web timedtext path is IP-blocked.
    try:
        text = _fetch_via_innertube(video_id).strip()
        if text:
            return text, video_id
    except Exception as exc:
        logger.warning("Innertube transcript failed: %s", exc)
        errors.append(str(exc))

    detail = "; ".join(errors) if errors else "no transcript"
    raise RuntimeError(
        f"Could not load transcript for {video_id} ({detail}). "
        "Paste the transcript or notes as text instead "
        "(Bangla, Hindi, or English all work)."
    )
