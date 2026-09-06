<script>
  import Navbar from "./components/Navbar.svelte";
  import PatientList from "./components/PatientList.svelte";
  import LiveSessionPanel from "./components/LiveSessionPanel.svelte";
  import SessionLogForm from "./components/SessionLogForm.svelte";
  import SessionHistoryTable from "./components/SessionHistoryTable.svelte";
  import ComparisonPanel from "./components/ComparisonPanel.svelte";

  import { patients, selectedPatientId } from "./lib/stores/patientStore.js";
  import { sessions, comparison, sessionsLoading, sessionsError, refreshPatientData } from "./lib/stores/sessionStore.js";

  $: currentPatient = $patients.find((p) => p.patient_id === $selectedPatientId) ?? null;
  $: if ($selectedPatientId) refreshPatientData($selectedPatientId);
</script>

<Navbar />

<main>
  {#if !$selectedPatientId}
    <PatientList />
  {:else}
    <div class="page">
      <button class="back-link" on:click={() => selectedPatientId.set(null)}>← กลับไปรายชื่อผู้ป่วย</button>

      <div class="patient-header">
        <h1>{currentPatient?.name ?? $selectedPatientId}</h1>
        <span class="patient-id">{$selectedPatientId}</span>
        {#if currentPatient?.target_muscle}<span class="target">🎯 {currentPatient.target_muscle}</span>{/if}
      </div>

      {#if $sessionsLoading}
        <p>กำลังโหลดข้อมูล...</p>
      {:else if $sessionsError}
        <p class="error">โหลดข้อมูลไม่สำเร็จ: {$sessionsError}</p>
      {/if}

      <LiveSessionPanel patientId={$selectedPatientId} defaultTargetMuscle={currentPatient?.target_muscle ?? ""} />
      <SessionLogForm patientId={$selectedPatientId} defaultTargetMuscle={currentPatient?.target_muscle ?? ""} />
      <ComparisonPanel comparison={$comparison} sessions={$sessions} />
      <SessionHistoryTable sessions={$sessions} />
    </div>
  {/if}
</main>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .back-link {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: 0.85rem;
    padding: 0;
    margin-bottom: 1rem;
  }

  .patient-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .patient-header h1 {
    font-size: 1.4rem;
    margin: 0;
  }

  .patient-id, .target {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  .error {
    color: var(--color-declined);
  }
</style>
