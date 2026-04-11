"""
Simple JSON file store for camera-to-corridor calibrations.

A calibration defines 4-point correspondences between camera view and floor plan,
which lets us compute a homography H: camera_px → floor_plan_px.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel

# Default next to backend/ so writes work even if uvicorn cwd is repo root.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_STORE = _BACKEND_DIR / "calibrations.json"
STORE_PATH = Path(os.environ.get("CALIBRATIONS_PATH", str(_DEFAULT_STORE)))


def _norm_camera_id(camera_id: str) -> str:
    return camera_id.strip().lower()


def normalize_camera_id(camera_id: str) -> str:
    """Stable key for storage and lookup (case-insensitive)."""
    return _norm_camera_id(camera_id)


class CorridorCalibration(BaseModel):
    """4-point correspondence: camera view → floor plan (all coords as % 0–100)."""

    camera_id: str
    # Four [x, y] points in the camera frame, as percentage of frame size
    camera_pts: list[list[float]]  # [[x,y], [x,y], [x,y], [x,y]]
    # Corresponding four [x, y] points on the floor plan, as percentage of floor plan size
    floor_pts: list[list[float]]
    # Floor plan pixel dimensions used when the calibration was created
    floor_w: int = 1536
    floor_h: int = 1024
    label: str = ""  # optional human-readable label, e.g. "North corridor"


def load_all() -> dict[str, CorridorCalibration]:
    if not STORE_PATH.exists():
        return {}
    try:
        raw = json.loads(STORE_PATH.read_text())
        out: dict[str, CorridorCalibration] = {}
        for k, v in raw.items():
            nid = _norm_camera_id(str(k))
            row = dict(v) if isinstance(v, dict) else v
            if isinstance(row, dict):
                row["camera_id"] = nid
            out[nid] = CorridorCalibration(**row)
        return out
    except Exception:
        return {}


def save_all(cals: dict[str, CorridorCalibration]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(
        json.dumps({k: v.model_dump() for k, v in cals.items()}, indent=2),
        encoding="utf-8",
    )


def get(camera_id: str) -> CorridorCalibration | None:
    return load_all().get(_norm_camera_id(camera_id))


def upsert(cal: CorridorCalibration) -> None:
    cals = load_all()
    nid = _norm_camera_id(cal.camera_id)
    cals[nid] = cal.model_copy(update={"camera_id": nid})
    save_all(cals)


def delete(camera_id: str) -> bool:
    cals = load_all()
    nid = _norm_camera_id(camera_id)
    if nid not in cals:
        return False
    del cals[nid]
    save_all(cals)
    return True
