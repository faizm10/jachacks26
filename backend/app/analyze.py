"""
POST /analyze — Detect people and infer activities from a camera frame.

Uses Google Gemini vision to analyze the image and return structured
person detections + scene description.
"""

import json
import os
from datetime import datetime, timezone

import httpx
from google import genai
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    frame_url: str


class AnalyzeFrameBase64Request(BaseModel):
    """For live tracking: client captures a video frame and sends it as base64 JPEG."""
    image_base64: str
    mime_type: str = "image/jpeg"


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class DetectedPerson(BaseModel):
    id: str
    bbox: BBox
    activity: str
    confidence: float


class FrameAnalysis(BaseModel):
    peopleCount: int
    persons: list[DetectedPerson]
    sceneDescription: str
    activities: list[str]
    analyzedAt: str
    frameUrl: str


ANALYSIS_PROMPT = """Analyze this camera frame. Return a JSON object with exactly this structure (no markdown, no extra text):

{
  "people_count": <integer>,
  "persons": [
    {
      "bbox": {"x": <0-1 fraction from left>, "y": <0-1 fraction from top>, "w": <0-1 width>, "h": <0-1 height>},
      "activity": "<what they are doing, e.g. sitting, standing, talking, typing, walking, reading>",
      "confidence": <0-1 float>
    }
  ],
  "scene_description": "<one sentence describing the overall scene>",
  "activities": ["<list of distinct activities happening in the room>"]
}

Rules:
- bbox values must be fractions between 0 and 1 relative to image dimensions
- Be specific about activities (not just "present" — say "typing on laptop", "standing near door", etc.)
- If no people are visible, return people_count: 0 and empty persons array
- Always return valid JSON only, no markdown fences"""


def _get_gemini_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return genai.Client(api_key=api_key)


VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _guess_mime(url: str, header_ct: str) -> str:
    """Determine MIME type from URL extension, falling back to response header."""
    from pathlib import PurePosixPath

    ext = PurePosixPath(url.split("?")[0]).suffix.lower()
    mime_map = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/mp4",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    return mime_map.get(ext, header_ct)


def _is_video(mime: str) -> bool:
    return mime.startswith("video/")


def _analyze_video_sync(media_bytes: bytes, content_type: str) -> dict:
    """Upload video to Gemini File API and analyze — blocking, run in thread pool."""
    import tempfile
    import time
    import os as _os

    client = _get_gemini_client()

    ext = "." + content_type.split("/")[1]
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(media_bytes)
        tmp_path = tmp.name

    try:
        uploaded = client.files.upload(file=tmp_path)
        for _ in range(60):  # max 60s wait
            if uploaded.state.name != "PROCESSING":
                break
            time.sleep(1)
            uploaded = client.files.get(name=uploaded.name)

        parts = [
            genai.types.Part.from_uri(file_uri=uploaded.uri, mime_type=content_type),
            genai.types.Part.from_text(text=ANALYSIS_PROMPT),
        ]
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[genai.types.Content(parts=parts)],
            config=genai.types.GenerateContentConfig(
                thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return _parse_gemini_response(response.text)
    finally:
        _os.unlink(tmp_path)


async def analyze_frame(req: AnalyzeRequest) -> FrameAnalysis:
    """Download the media, send to Gemini, return structured analysis."""
    import asyncio

    # 1. Download the media
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
        media_resp = await http.get(req.frame_url)
        media_resp.raise_for_status()
        media_bytes = media_resp.content

    content_type = _guess_mime(
        req.frame_url,
        media_resp.headers.get("content-type", "image/jpeg"),
    )

    # 2. Run Gemini in thread pool so it doesn't block the event loop
    loop = asyncio.get_event_loop()
    if _is_video(content_type):
        data = await asyncio.wait_for(
            loop.run_in_executor(None, _analyze_video_sync, media_bytes, content_type),
            timeout=90,
        )
    else:
        data = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini_sync, media_bytes, content_type),
            timeout=15,
        )

    # 3. Map into our schema
    persons: list[DetectedPerson] = []
    for i, p in enumerate(data.get("persons", [])):
        bbox_raw = p.get("bbox", {})
        persons.append(
            DetectedPerson(
                id=f"p{i}",
                bbox=BBox(
                    x=float(bbox_raw.get("x", 0)),
                    y=float(bbox_raw.get("y", 0)),
                    w=float(bbox_raw.get("w", 0)),
                    h=float(bbox_raw.get("h", 0)),
                ),
                activity=p.get("activity", "present"),
                confidence=float(p.get("confidence", 0.5)),
            )
        )

    return FrameAnalysis(
        peopleCount=data.get("people_count", len(persons)),
        persons=persons,
        sceneDescription=data.get("scene_description", ""),
        activities=data.get("activities", []),
        analyzedAt=datetime.now(timezone.utc).isoformat(),
        frameUrl=req.frame_url,
    )


def _parse_gemini_response(raw_text: str) -> dict:
    """Shared JSON parser for Gemini responses."""
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3].strip()
    if raw_text.startswith("json"):
        raw_text = raw_text[4:].strip()
    return json.loads(raw_text)


def _call_gemini_sync(image_bytes: bytes, mime_type: str) -> dict:
    """Run Gemini synchronously — meant to be called from a thread pool."""
    client = _get_gemini_client()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            genai.types.Content(
                parts=[
                    genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    genai.types.Part.from_text(text=ANALYSIS_PROMPT),
                ]
            )
        ],
        config=genai.types.GenerateContentConfig(
            thinking_config=genai.types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return _parse_gemini_response(response.text)


async def analyze_frame_base64(req: AnalyzeFrameBase64Request) -> FrameAnalysis:
    """Analyze a single base64-encoded frame — used for live tracking."""
    import asyncio
    import base64

    image_bytes = base64.b64decode(req.image_base64)

    # Run the blocking Gemini call in a thread pool with a timeout
    loop = asyncio.get_event_loop()
    try:
        data = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemini_sync, image_bytes, req.mime_type),
            timeout=30,
        )
    except asyncio.TimeoutError:
        raise RuntimeError("Gemini analysis timed out after 30s")

    persons: list[DetectedPerson] = []
    for i, p in enumerate(data.get("persons", [])):
        bbox_raw = p.get("bbox", {})
        persons.append(
            DetectedPerson(
                id=f"p{i}",
                bbox=BBox(
                    x=float(bbox_raw.get("x", 0)),
                    y=float(bbox_raw.get("y", 0)),
                    w=float(bbox_raw.get("w", 0)),
                    h=float(bbox_raw.get("h", 0)),
                ),
                activity=p.get("activity", "present"),
                confidence=float(p.get("confidence", 0.5)),
            )
        )

    return FrameAnalysis(
        peopleCount=data.get("people_count", len(persons)),
        persons=persons,
        sceneDescription=data.get("scene_description", ""),
        activities=data.get("activities", []),
        analyzedAt=datetime.now(timezone.utc).isoformat(),
        frameUrl="live-frame",
    )
