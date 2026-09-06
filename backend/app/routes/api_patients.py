from flask import Blueprint, jsonify, request
from pydantic import ValidationError

from app.models.patient_model import PatientCreate
from app.services import patient_service, session_service
from app.services.comparison_service import compare_latest_sessions

bp = Blueprint("patients", __name__)


@bp.get("/api/patients")
def list_patients():
    return jsonify(patient_service.list_patients())


@bp.post("/api/patients")
def create_patient():
    try:
        data = PatientCreate.model_validate(request.get_json(force=True))
        patient = patient_service.create_patient(data)
    except ValidationError as e:
        return jsonify({"status": "error", "errors": e.errors()}), 400
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 409

    return jsonify({"status": "success", "patient": patient}), 201


@bp.get("/api/patients/<patient_id>")
def get_patient(patient_id: str):
    patient = patient_service.get_patient(patient_id)
    if not patient:
        return jsonify({"status": "error", "message": "patient not found"}), 404
    return jsonify(patient)


@bp.get("/api/patients/<patient_id>/sessions")
def get_patient_sessions(patient_id: str):
    return jsonify(session_service.list_sessions_for_patient(patient_id))


@bp.get("/api/patients/<patient_id>/compare")
def compare_patient_sessions(patient_id: str):
    return jsonify(compare_latest_sessions(patient_id))
