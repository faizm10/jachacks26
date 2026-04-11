from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load ../.env so GEMINI_API_KEY is available
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

import time

from app.analyze import AnalyzeRequest, FrameAnalysis, analyze_frame

app = FastAPI(title="Room Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-memory cache: { url: (result, timestamp) }
_analysis_cache: dict[str, tuple[FrameAnalysis, float]] = {}
CACHE_TTL_SECONDS = 20  # serve cached result for 20s before re-analyzing


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=FrameAnalysis)
async def analyze(req: AnalyzeRequest):
    now = time.time()

    # Return cached result if fresh enough
    cached = _analysis_cache.get(req.frame_url)
    if cached:
        result, ts = cached
        if now - ts < CACHE_TTL_SECONDS:
            return result

    try:
        result = await analyze_frame(req)
        _analysis_cache[req.frame_url] = (result, now)

        # Evict old entries to prevent memory leak
        stale = [k for k, (_, ts) in _analysis_cache.items() if now - ts > 300]
        for k in stale:
            del _analysis_cache[k]

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
