"""
POST /analyze — Detect people and infer activities from a camera frame.

Uses Google Gemini vision to analyze the image and return structured
person detections + scene description.
"""

import json
import os
import uuid
from datetime import datetime, timezone

import httpx
from google import genai
from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    frame_url: str


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


async def analyze_frame(req: AnalyzeRequest) -> FrameAnalysis:
    """Download the media, send to Gemini, return structured analysis."""

    # 1. Download the media
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
        media_resp = await http.get(req.frame_url)
        media_resp.raise_for_status()
        media_bytes = media_resp.content

    content_type = _guess_mime(
        req.frame_url,
        media_resp.headers.get("content-type", "image/jpeg"),
    )

    # 2. Call Gemini with image or video
    client = _get_gemini_client()

    if _is_video(content_type):
        # For videos, upload via the File API first (inline bytes not supported for video)
        import tempfile

        ext = "." + content_type.split("/")[1]  # e.g. ".mp4"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(media_bytes)
            tmp_path = tmp.name

        uploaded = client.files.upload(file=tmp_path)

        # Wait for processing
        import time

        while uploaded.state.name == "PROCESSING":
            time.sleep(1)
            uploaded = client.files.get(name=uploaded.name)

        parts = [
            genai.types.Part.from_uri(file_uri=uploaded.uri, mime_type=content_type),
            genai.types.Part.from_text(text=ANALYSIS_PROMPT),
        ]

        # Clean up temp file
        import os as _os
        _os.unlink(tmp_path)
    else:
        parts = [
            genai.types.Part.from_bytes(data=media_bytes, mime_type=content_type),
            genai.types.Part.from_text(text=ANALYSIS_PROMPT),
        ]

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[genai.types.Content(parts=parts)],
    )

    # 3. Parse the JSON response
    raw_text = response.text.strip()
    # Strip markdown fences if Gemini adds them anyway
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3].strip()
    if raw_text.startswith("json"):
        raw_text = raw_text[4:].strip()

    data = json.loads(raw_text)

    # 4. Map into our schema
    persons: list[DetectedPerson] = []
    for p in data.get("persons", []):
        bbox_raw = p.get("bbox", {})
        persons.append(
            DetectedPerson(
                id=str(uuid.uuid4())[:8],
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
