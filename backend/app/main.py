import os

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import calibrations as cal_store
from app.calibrations import CorridorCalibration
from app.floorplan import AnalyzeRequest, FloorPlanAnalyzeResponse, analyze_from_url

app = FastAPI(title="Room Intelligence API")

_origins = os.environ.get("CORS_ALLOW_ORIGINS", "http://localhost:3000")
_allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Floor plan analysis
# ---------------------------------------------------------------------------

@app.post("/floorplan/analyze", response_model=FloorPlanAnalyzeResponse)
def floorplan_analyze(body: AnalyzeRequest):
    # Resolve calibration: inline body takes precedence, then look up by camera_id
    calibration = body.calibration
    if calibration is None and body.camera_id:
        calibration = cal_store.get(body.camera_id)

    try:
        return analyze_from_url(
            str(body.video_url),
            corridor_map=body.corridor_map,
            calibration=calibration,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {e!s}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ---------------------------------------------------------------------------
# Corridor calibration CRUD
# ---------------------------------------------------------------------------

@app.get("/calibrations")
def list_calibrations() -> dict:
    all_cals = cal_store.load_all()
    return {"calibrations": [v.model_dump() for v in all_cals.values()]}


@app.get("/calibrations/{camera_id}")
def get_calibration(camera_id: str) -> dict:
    cal = cal_store.get(camera_id)
    if cal is None:
        raise HTTPException(status_code=404, detail=f"No calibration for camera_id={camera_id!r}")
    return cal.model_dump()


@app.post("/calibrations/{camera_id}", status_code=201)
def save_calibration(camera_id: str, body: CorridorCalibration) -> dict:
    if len(body.camera_pts) < 4 or len(body.floor_pts) < 4:
        raise HTTPException(status_code=400, detail="Need at least 4 point pairs for homography")
    if len(body.camera_pts) != len(body.floor_pts):
        raise HTTPException(status_code=400, detail="camera_pts and floor_pts must have the same length")
    body = body.model_copy(update={"camera_id": camera_id})
    cal_store.upsert(body)
    return {"saved": True, "camera_id": camera_id}


@app.delete("/calibrations/{camera_id}")
def delete_calibration(camera_id: str) -> dict:
    deleted = cal_store.delete(camera_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No calibration for camera_id={camera_id!r}")
    return {"deleted": True, "camera_id": camera_id}
