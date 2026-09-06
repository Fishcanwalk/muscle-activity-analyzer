<script>
  import { onMount } from "svelte";
  import {
    patients,
    patientsLoading,
    patientsError,
    selectedPatientId,
    refreshPatients,
    addPatient,
  } from "../lib/stores/patientStore.js";

  let showForm = false;
  let formError = null;
  let submitting = false;
  let form = { patient_id: "", name: "", age: "", target_muscle: "", note: "" };

  onMount(refreshPatients);

  function selectPatient(patientId) {
    selectedPatientId.set(patientId);
  }

  async function submit() {
    formError = null;
    submitting = true;
    try {
      await addPatient({
        patient_id: form.patient_id.trim(),
        name: form.name.trim(),
        age: form.age ? Number(form.age) : null,
        target_muscle: form.target_muscle.trim() || null,
        note: form.note.trim() || null,
      });
      form = { patient_id: "", name: "", age: "", target_muscle: "", note: "" };
      showForm = false;
    } catch (e) {
      formError = e.message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>รายชื่อผู้ป่วย</h1>
    <button class="primary" on:click={() => (showForm = !showForm)}>
      {showForm ? "ยกเลิก" : "+ เพิ่มผู้ป่วยใหม่"}
    </button>
  </div>

  {#if showForm}
    <form class="card form" on:submit|preventDefault={submit}>
      <div class="form-row">
        <label>
          รหัสผู้ป่วย *
          <input required bind:value={form.patient_id} placeholder="เช่น USER_003" />
        </label>
        <label>
          ชื่อ *
          <input required bind:value={form.name} placeholder="ชื่อ-สกุล" />
        </label>
      </div>
      <div class="form-row">
        <label>
          อายุ
          <input type="number" min="0" bind:value={form.age} />
        </label>
        <label>
          กล้ามเนื้อเป้าหมาย
          <input bind:value={form.target_muscle} placeholder="เช่น Biceps Brachii" />
        </label>
      </div>
      <label>
        หมายเหตุ
        <textarea bind:value={form.note} rows="2"></textarea>
      </label>
      {#if formError}<p class="error">{formError}</p>{/if}
      <button class="primary" type="submit" disabled={submitting}>
        {submitting ? "กำลังบันทึก..." : "บันทึกผู้ป่วย"}
      </button>
    </form>
  {/if}

  {#if $patientsLoading}
    <p>กำลังโหลด...</p>
  {:else if $patientsError}
    <p class="error">โหลดรายชื่อผู้ป่วยไม่สำเร็จ: {$patientsError}</p>
  {:else if $patients.length === 0}
    <p class="empty">ยังไม่มีผู้ป่วยในระบบ ลองกด "+ เพิ่มผู้ป่วยใหม่"</p>
  {:else}
    <div class="patient-grid">
      {#each $patients as p (p.patient_id)}
        <button class="card patient-card" on:click={() => selectPatient(p.patient_id)}>
          <div class="patient-id">{p.patient_id}</div>
          <div class="patient-name">{p.name}</div>
          {#if p.target_muscle}<div class="patient-muscle">🎯 {p.target_muscle}</div>{/if}
          {#if p.age}<div class="patient-age">อายุ {p.age} ปี</div>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.4rem;
    margin: 0;
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 1rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
  }

  .form-row label {
    flex: 1;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  input, textarea {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.95rem;
  }

  .primary {
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    align-self: flex-start;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: var(--color-declined);
    font-size: 0.85rem;
  }

  .empty {
    color: var(--color-text-muted);
  }

  .patient-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  .patient-card {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .patient-id {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .patient-name {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .patient-muscle, .patient-age {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
</style>
