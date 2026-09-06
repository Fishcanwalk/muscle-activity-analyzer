<script>
  import { logSession } from "../lib/stores/sessionStore.js";

  export let patientId;
  export let defaultTargetMuscle = "";

  let showForm = false;
  let submitting = false;
  let error = null;

  let form = {
    session_name: "",
    target_muscle: defaultTargetMuscle,
    duration_seconds: "",
    max_emg_rms: "",
    avg_emg_rms: "",
    max_force_newton: "",
    avg_heart_rate: "",
    avg_spo2: "",
    max_skin_temp_c: "",
  };

  function toNumberOrNull(v) {
    return v === "" || v === null || v === undefined ? null : Number(v);
  }

  async function submit() {
    error = null;
    submitting = true;
    try {
      await logSession(patientId, {
        session_name: form.session_name.trim(),
        target_muscle: form.target_muscle.trim() || null,
        summary_metrics: {
          duration_seconds: toNumberOrNull(form.duration_seconds),
          max_emg_rms: toNumberOrNull(form.max_emg_rms),
          avg_emg_rms: toNumberOrNull(form.avg_emg_rms),
          max_force_newton: toNumberOrNull(form.max_force_newton),
          avg_heart_rate: toNumberOrNull(form.avg_heart_rate),
          avg_spo2: toNumberOrNull(form.avg_spo2),
          max_skin_temp_c: toNumberOrNull(form.max_skin_temp_c),
        },
      });
      form = { ...form, session_name: "" };
      showForm = false;
    } catch (e) {
      error = e.message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="card">
  <div class="header">
    <h2>บันทึกผลตรวจครั้งใหม่</h2>
    <button class="primary" on:click={() => (showForm = !showForm)}>
      {showForm ? "ยกเลิก" : "+ เพิ่ม Log"}
    </button>
  </div>

  {#if showForm}
    <form class="form" on:submit|preventDefault={submit}>
      <div class="form-row">
        <label>
          ชื่อการฝึก/ตรวจ *
          <input required bind:value={form.session_name} placeholder="เช่น Biceps Curl Test #6" />
        </label>
        <label>
          กล้ามเนื้อเป้าหมาย
          <input bind:value={form.target_muscle} />
        </label>
      </div>

      <div class="form-row">
        <label>
          ระยะเวลา (วินาที)
          <input type="number" step="0.1" bind:value={form.duration_seconds} />
        </label>
        <label>
          แรงกดสูงสุด (N)
          <input type="number" step="0.1" bind:value={form.max_force_newton} />
        </label>
      </div>

      <div class="form-row">
        <label>
          EMG RMS สูงสุด
          <input type="number" step="0.1" bind:value={form.max_emg_rms} />
        </label>
        <label>
          EMG RMS เฉลี่ย
          <input type="number" step="0.1" bind:value={form.avg_emg_rms} />
        </label>
      </div>

      <div class="form-row">
        <label>
          HR เฉลี่ย (bpm)
          <input type="number" step="1" bind:value={form.avg_heart_rate} />
        </label>
        <label>
          SpO2 เฉลี่ย (%)
          <input type="number" step="0.1" bind:value={form.avg_spo2} />
        </label>
        <label>
          อุณหภูมิผิวหนังสูงสุด (°C)
          <input type="number" step="0.1" bind:value={form.max_skin_temp_c} />
        </label>
      </div>

      {#if error}<p class="error">{error}</p>{/if}
      <button class="primary" type="submit" disabled={submitting}>
        {submitting ? "กำลังบันทึก..." : "บันทึกผลตรวจ"}
      </button>
    </form>
  {/if}
</div>

<style>
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    font-size: 1.05rem;
    margin: 0;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .form-row label {
    flex: 1;
    min-width: 160px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  input {
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
</style>
