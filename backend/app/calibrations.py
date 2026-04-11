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

STORE_PATH = Path(os.environ.get("CALIBRATIONS_PATH", "calibrations.json"))


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
        return {k: CorridorCalibration(**v) for k, v in raw.items()}
    except Exception:
        return {}


def save_all(cals: dict[str, CorridorCalibration]) -> None:
    STORE_PATH.write_text(
        json.dumps({k: v.model_dump() for k, v in cals.items()}, indent=2)
    )


def get(camera_id: str) -> CorridorCalibration | None:
    return load_all().get(camera_id)


def upsert(cal: CorridorCalibration) -> None:
    cals = load_all()
    cals[cal.camera_id] = cal
    save_all(cals)


def delete(camera_id: str) -> bool:
    cals = load_all()
    if camera_id not in cals:
        return False
    del cals[camera_id]
    save_all(cals)
    return True
