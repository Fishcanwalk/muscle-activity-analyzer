<script>
  import { onDestroy } from "svelte";
  import Chart from "chart.js/auto";
  import { api } from "../lib/api.js";
  import { refreshPatientData } from "../lib/stores/sessionStore.js";

  export let patientId;
  export let defaultTargetMuscle = "";

  const POLL_MS = 300;
  const EMG_BUFFER_MAX = 200;

  let phase = "idle"; // idle | running
  let deviceIdEdited = false;
  let form = { session_name: "", target_muscle: defaultTargetMuscle, device_id: "" };

  let sessionId = null;
  let pollHandle = null;
  let liveMetrics = null;
  let isOnline = false;
  let emgBuffer = [];
  let error = null;
  let starting = false;
  let stopping = false;

  let canvasEl;
  let chartInstance;

  $: if (!deviceIdEdited && phase === "idle") form.device_id = `SIM_${patientId}`;

  // canvasEl ยังไม่ถูก bind จนกว่า Svelte จะ re-render DOM หลัง phase เปลี่ยนเป็น "running"
  // (setPhase แล้วเรียก buildChart() ทันทีจะเจอ canvasEl เป็น undefined) จึงต้องรอผ่าน reactive block นี้แทน
  $: if (phase === "running" && canvasEl && !chartInstance) buildChart();

  function buildChart() {
    if (!canvasEl) return;
    chartInstance = new Chart(canvasEl, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "EMG (raw)",
            data: [],
            borderColor: "#2563eb",
            backgroundColor: "#2563eb22",
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.2,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        scales: { x: { display: false }, y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    });
  }

  function updateChart() {
    if (!chartInstance) return;
    chartInstance.data.labels = emgBuffer.map((_, i) => i);
    chartInstance.data.datasets[0].data = emgBuffer;
    chartInstance.update("none");
  }

  async function poll() {
    try {
      const live = await api.getLiveTelemetry(form.device_id);
      isOnline = !!live.is_online;
      liveMetrics = live.metrics ?? null;

      const samples = liveMetrics?.emg_samples;
      if (Array.isArray(samples) && samples.length > 0) {
        emgBuffer = [...emgBuffer, ...samples].slice(-EMG_BUFFER_MAX);
        updateChart();
      }
    } catch (e) {
      // เก็บ error ไว้เฉยๆ ไม่ตัดการ polling เพราะอาจเป็นแค่ network hiccup ชั่วคราว
      error = e.message;
    }
  }

  async function startSession() {
    error = null;
    starting = true;
    try {
      const resp = await api.startSession({
        session_name: form.session_name.trim() || `Live Session ${new Date().toLocaleString("th-TH")}`,
        subject_id: patientId,
        target_muscle: form.target_muscle.trim() || null,
        device_id: form.device_id.trim(),
      });
      sessionId = resp.session_id;
      emgBuffer = [];
      isOnline = false;
      liveMetrics = null;
      phase = "running";
      pollHandle = setInterval(poll, POLL_MS);
    } catch (e) {
      error = e.message;
    } finally {
      starting = false;
    }
  }

  async function stopSession() {
    stopping = true;
    error = null;
    clearInterval(pollHandle);
    pollHandle = null;
    try {
      await api.stopSession(sessionId);
      await refreshPatientData(patientId);
    } catch (e) {
      error = e.message;
    } finally {
      chartInstance?.destroy();
      chartInstance = null;
      sessionId = null;
      phase = "idle";
      stopping = false;
    }
  }

  onDestroy(() => {
    if (pollHandle) clearInterval(pollHandle);
    chartInstance?.destroy();
  });

  function fmt(v, digits = 1) {
    return v === null || v === undefined ? "-" : Number(v).toFixed(digits);
  }
</script>

<div class="card">
  <div class="header">
    <h2>Live Session (รับข้อมูล Real-time)</h2>
    {#if phase === "idle"}
      <span class="badge idle">⚪ ยังไม่เริ่ม</span>
    {:else}
      <span class="badge {isOnline ? 'online' : 'waiting'}">
        {isOnline ? "🟢 กำลังรับข้อมูล" : "⚪ รอข้อมูลจากอุปกรณ์..."}
      </span>
    {/if}
  </div>

  {#if phase === "idle"}
    <form class="form" on:submit|preventDefault={startSession}>
      <div class="form-row">
        <label>
          ชื่อการฝึก/ตรวจ
          <input bind:value={form.session_name} placeholder="เช่น Live Biceps Session" />
        </label>
        <label>
          กล้ามเนื้อเป้าหมาย
          <input bind:value={form.target_muscle} />
        </label>
        <label>
          Device ID
          <input bind:value={form.device_id} on:input={() => (deviceIdEdited = true)} required />
        </label>
      </div>
      <p class="hint">
        ต้องใช้ Device ID เดียวกันกับที่ ESP32 (หรือสคริปต์จำลอง <code>backend/scripts/simulate_esp32.py --device-id ...</code>) ส่งข้อมูลเข้ามา
      </p>
      {#if error}<p class="error">{error}</p>{/if}
      <button class="primary" type="submit" disabled={starting}>
        {starting ? "กำลังเริ่ม..." : "▶ เริ่ม Live Session"}
      </button>
    </form>
  {:else}
    <div class="live-grid">
      <div class="metric"><span class="label">EMG RMS</span><span class="value">{fmt(liveMetrics?.emg_rms)}</span></div>
      <div class="metric"><span class="label">แรงกด (N)</span><span class="value">{fmt(liveMetrics?.fsr_force)}</span></div>
      <div class="metric"><span class="label">HR (bpm)</span><span class="value">{fmt(liveMetrics?.heart_rate, 0)}</span></div>
      <div class="metric"><span class="label">SpO2 (%)</span><span class="value">{fmt(liveMetrics?.spo2)}</span></div>
      <div class="metric"><span class="label">ผิวหนัง (°C)</span><span class="value">{fmt(liveMetrics?.skin_temp)}</span></div>
    </div>

    <div class="chart-wrap">
      <canvas bind:this={canvasEl}></canvas>
    </div>

    {#if error}<p class="error">{error}</p>{/if}
    <button class="danger" on:click={stopSession} disabled={stopping}>
      {stopping ? "กำลังบันทึก..." : "⏹ หยุด & บันทึกเป็น Log"}
    </button>
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
    margin-bottom: 0.75rem;
  }

  h2 {
    font-size: 1.05rem;
    margin: 0;
  }

  .badge {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: var(--color-info-bg);
    color: var(--color-info);
  }

  .badge.online {
    background: var(--color-improved-bg);
    color: var(--color-improved);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .hint {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    margin: 0;
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

  .danger {
    background: var(--color-declined);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .primary:disabled, .danger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: var(--color-declined);
    font-size: 0.85rem;
  }

  .live-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem;
    background: var(--color-info-bg);
    border-radius: 8px;
  }

  .metric .label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .metric .value {
    font-size: 1.2rem;
    font-weight: 700;
  }

  .chart-wrap {
    position: relative;
    height: 200px;
    margin-bottom: 1rem;
  }
</style>
