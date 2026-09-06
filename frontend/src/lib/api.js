const BASE_URL = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message || body?.errors?.[0]?.msg || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  listPatients: () => request("/patients"),
  createPatient: (data) => request("/patients", { method: "POST", body: JSON.stringify(data) }),
  getPatient: (patientId) => request(`/patients/${patientId}`),
  getPatientSessions: (patientId) => request(`/patients/${patientId}/sessions`),
  comparePatientSessions: (patientId) => request(`/patients/${patientId}/compare`),
  createManualSession: (data) => request("/sessions/manual", { method: "POST", body: JSON.stringify(data) }),
  startSession: (data) => request("/sessions/start", { method: "POST", body: JSON.stringify(data) }),
  stopSession: (sessionId) => request("/sessions/stop", { method: "POST", body: JSON.stringify({ session_id: sessionId }) }),
  getLiveTelemetry: (deviceId) => request(`/telemetry/live?device_id=${encodeURIComponent(deviceId)}`),
};
