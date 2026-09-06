from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.models.session_model import SessionManualCreate, SessionStart
from app.services import session_service

bp = Blueprint("sessions", __name__)


@bp.post("/api/sessions/start")
def start_session():
    try:
        data = SessionStart.model_validate(request.get_json(force=True))
    except ValidationError as e:
        return jsonify({"status": "error", "errors": e.errors()}), 400

    session = session_service.start_session(data)
    return jsonify({"status": "success", "session_id": session["session_id"], "message": "Session started"}), 201


@bp.post("/api/sessions/stop")
def stop_session():
    body = request.get_json(force=True) or {}
    session_id = body.get("session_id")
    if not session_id:
        return jsonify({"status": "error", "message": "session_id is required"}), 400

    session = session_service.stop_session(session_id)
    if not session:
        return jsonify({"status": "error", "message": "session not found"}), 404

    return jsonify({"status": "success", "session": session})


@bp.post("/api/sessions/manual")
def create_manual_session():
    try:
        data = SessionManualCreate.model_validate(request.get_json(force=True))
    except ValidationError as e:
        return jsonify({"status": "error", "errors": e.errors()}), 400

    session = session_service.create_manual_session(data)
    return jsonify({"status": "success", "session": session}), 201


@bp.get("/api/sessions/<session_id>/history")
def session_history(session_id: str):
    return jsonify(session_service.get_session_history(session_id))
