from flask import Flask, jsonify
from flask_cors import CORS

from app.config import Config


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app, origins=Config.CORS_ORIGINS)

    from app.routes import api_health, api_patients, api_sessions, api_telemetry

    app.register_blueprint(api_health.bp)
    app.register_blueprint(api_patients.bp)
    app.register_blueprint(api_sessions.bp)
    app.register_blueprint(api_telemetry.bp)

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"status": "error", "message": "not found"}), 404

    return app
