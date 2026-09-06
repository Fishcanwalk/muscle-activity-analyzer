import { writable } from "svelte/store";
import { api } from "../api.js";

export const sessions = writable([]);
export const comparison = writable(null);
export const sessionsLoading = writable(false);
export const sessionsError = writable(null);

export async function refreshPatientData(patientId) {
  if (!patientId) {
    sessions.set([]);
    comparison.set(null);
    return;
  }

  sessionsLoading.set(true);
  sessionsError.set(null);
  try {
    const [sessionList, compareResult] = await Promise.all([
      api.getPatientSessions(patientId),
      api.comparePatientSessions(patientId),
    ]);
    sessions.set(sessionList);
    comparison.set(compareResult);
  } catch (e) {
    sessionsError.set(e.message);
  } finally {
    sessionsLoading.set(false);
  }
}

export async function logSession(patientId, data) {
  await api.createManualSession({ ...data, subject_id: patientId });
  await refreshPatientData(patientId);
}
