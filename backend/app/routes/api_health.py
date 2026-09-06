from datetime import datetime, timezone

from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)


@bp.get("/api/health")
def health():
    return jsonify({"status": "ok", "server_time": datetime.now(timezone.utc).isoformat()})
