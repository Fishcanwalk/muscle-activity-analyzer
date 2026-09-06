"""ตาม SYSTEM_SPEC.md 6.1/6.2 -- เตรียมไว้สำหรับ ESP32 ในอนาคต ยังไม่มี UI ใช้งานในรอบนี้"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.models.telemetry_model import TelemetryBatch
from app.services import telemetry_service

bp = Blueprint("telemetry", __name__)


@bp.post("/api/telemetry")
def ingest_telemetry():
    try:
        data = TelemetryBatch.model_validate(request.get_json(force=True))
    except ValidationError as e:
        return jsonify({"status": "error", "errors": e.errors()}), 400

    telemetry_service.ingest_batch(data.model_dump())
    return jsonify({"status": "success", "recorded": True, "server_time": datetime.now(timezone.utc).isoformat()})


@bp.get("/api/telemetry/live")
def get_live_telemetry():
    device_id = request.args.get("device_id", "ESP32_MUSCLE_01")
    live = telemetry_service.get_live(device_id)
    if not live:
        return jsonify({"device_id": device_id, "is_online": False, "metrics": None})
    return jsonify(live)
