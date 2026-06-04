"""observer.py — Encore V2G mock vision service (schema-aligned).

This FastAPI app exposes a single POST /vision-detect endpoint that accepts
frames (base64 JPEG) and returns a V2GResponse object matching
`prototype/v2g/schema.md`. It also serves GET /health for quick checks.

The implementation is deliberately deterministic for demo purposes: it
rotates through the FPS / MOBA / BR templates based on the provided
`frame_index` or request order, so the frontend team can demonstrate the
highlight flow without relying on an actual model.
"""
from __future__ import annotations

import itertools
import os
import random
import time
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "3000"))
DEFAULT_CONFIDENCE = float(os.getenv("MOCK_CONFIDENCE", "0.92"))
CONFIDENCE_THRESHOLD = float(os.getenv("MOCK_CONFIDENCE_THRESHOLD", "0.6"))

# ---------------------------------------------------------------------------
# Mock template catalogue
# ---------------------------------------------------------------------------
TEMPLATE_CATALOGUE = [
    {
        "template": "fps",
        "theme": "cyber",
        "scenario": {
            "enemy_count": 3,
            "hp_start": 90,
            "description": "Encore auto highlight · 1v3 RETAKE",
        },
    },
    {
        "template": "moba",
        "theme": "grass",
        "scenario": {
            "enemy_count": 4,
            "hp_start": 100,
            "description": "Encore auto highlight · Dragon Pit Steal",
        },
    },
    {
        "template": "br",
        "theme": "forest",
        "scenario": {
            "enemy_count": 2,
            "hp_start": 75,
            "weapon": "rifle",
            "description": "Encore auto highlight · Final Circle clutch",
        },
    },
]

TEMPLATE_CYCLE = itertools.cycle(TEMPLATE_CATALOGUE)

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class VisionDetectPayload(BaseModel):
    image_base64: Optional[str] = Field(
        default=None,
        description="Base64 encoded JPEG data URL or raw base64 string",
    )
    frame_index: Optional[int] = Field(default=None, ge=0)
    timestamp: Optional[float] = Field(default=None, ge=0.0)
    video_path: Optional[str] = None


class V2GResponse(BaseModel):
    highlight: bool
    confidence: float
    template: str
    theme: str
    scenario: Dict[str, Any]
    _meta: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# FastAPI app setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Encore Vision Mock",
    version="1.1",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_request_counter = 0


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "version": app.version, "confidence_threshold": CONFIDENCE_THRESHOLD}


@app.post("/vision-detect")
def vision_detect(payload: VisionDetectPayload) -> JSONResponse:
    global _request_counter
    _request_counter += 1

    if not payload.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    if payload.image_base64.startswith("data:"):
        try:
            _, data = payload.image_base64.split(",", 1)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid data URL in image_base64")
        base64_payload = data
    else:
        base64_payload = payload.image_base64

    # The payload is not decoded in this mock, but we keep the length in _meta.
    encoded_size = len(base64_payload)

    template_entry = _pick_template(payload.frame_index)
    response = _build_response(template_entry, payload, encoded_size)
    return JSONResponse(status_code=200, content=response)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _pick_template(frame_index: Optional[int]) -> Dict[str, Any]:
    if frame_index is not None:
        idx = frame_index % len(TEMPLATE_CATALOGUE)
        return TEMPLATE_CATALOGUE[idx]
    return next(TEMPLATE_CYCLE)


def _build_response(template_entry: Dict[str, Any], payload: VisionDetectPayload, encoded_size: int) -> Dict[str, Any]:
    confidence = DEFAULT_CONFIDENCE
    highlight = confidence >= CONFIDENCE_THRESHOLD

    scenario = dict(template_entry["scenario"])
    if payload.timestamp is not None:
        scenario["description"] = _append_timestamp_hint(
            scenario.get("description", "Encore highlight"), payload.timestamp
        )

    response: Dict[str, Any] = {
        "highlight": highlight,
        "confidence": confidence,
        "template": template_entry["template"],
        "theme": template_entry["theme"],
        "scenario": scenario,
        "_meta": {
            "model": "mock-static",
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "encoded_size": encoded_size,
            "video_path": payload.video_path,
            "frame_index": payload.frame_index,
            "timestamp": payload.timestamp,
        },
    }
    return response


def _append_timestamp_hint(description: str, timestamp: float) -> str:
    hint = f" · t={timestamp:.1f}s"
    if description.endswith(hint):
        return description
    return f"{description}{hint}"


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
