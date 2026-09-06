import { writable } from "svelte/store";
import { api } from "../api.js";

export const patients = writable([]);
export const selectedPatientId = writable(null);
export const patientsLoading = writable(false);
export const patientsError = writable(null);

export async function refreshPatients() {
  patientsLoading.set(true);
  patientsError.set(null);
  try {
    const data = await api.listPatients();
    patients.set(data);
  } catch (e) {
    patientsError.set(e.message);
  } finally {
    patientsLoading.set(false);
  }
}

export async function addPatient(data) {
  const result = await api.createPatient(data);
  await refreshPatients();
  return result;
}
