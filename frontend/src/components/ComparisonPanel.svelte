<script>
  import { onMount, afterUpdate } from "svelte";
  import Chart from "chart.js/auto";

  export let comparison = null;
  export let sessions = [];

  let canvasEl;
  let chartInstance;

  const VERDICT_META = {
    improved: { label: "ดีขึ้น", className: "verdict-improved" },
    declined: { label: "แย่ลง", className: "verdict-declined" },
    no_change: { label: "คงที่", className: "verdict-flat" },
    info_only: { label: "ข้อมูลอ้างอิง", className: "verdict-info" },
  };

  const ARROW = { up: "▲", down: "▼", flat: "▬" };

  function metaFor(row) {
    return VERDICT_META[row.verdict] ?? VERDICT_META.info_only;
  }

  function buildChart() {
    if (!canvasEl || sessions.length < 2) return;

    const ordered = [...sessions].reverse(); // oldest -> newest
    const labels = ordered.map((s) => new Date(s.started_at).toLocaleDateString("th-TH"));
    const forceData = ordered.map((s) => s.summary_metrics?.max_force_newton ?? null);
    const emgData = ordered.map((s) => s.summary_metrics?.avg_emg_rms ?? null);

    chartInstance?.destroy();
    chartInstance = new Chart(canvasEl, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "แรงกดสูงสุด (N)",
            data: forceData,
            borderColor: "#2563eb",
            backgroundColor: "#2563eb33",
            tension: 0.3,
          },
          {
            label: "EMG RMS เฉลี่ย",
            data: emgData,
            borderColor: "#7c3aed",
            backgroundColor: "#7c3aed33",
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: false } },
      },
    });
  }

  onMount(buildChart);
  afterUpdate(buildChart);
</script>

<div class="card">
  <h2>เปรียบเทียบครั้งล่าสุด vs ก่อนหน้า</h2>

  {#if !comparison || !comparison.has_enough_data}
    <p class="empty">{comparison?.message ?? "ยังไม่มีข้อมูลเพียงพอเปรียบเทียบ"}</p>
  {:else}
    <p class="summary-text">📊 {comparison.overall.summary_text}</p>

    <div class="rows">
      {#each comparison.comparison as row (row.metric)}
        <div class="row {metaFor(row).className}">
          <div class="row-label">{row.label}</div>
          <div class="row-values">
            <span class="prev">{row.previous}</span>
            <span class="arrow">{ARROW[row.direction]}</span>
            <span class="cur">{row.current}</span>
          </div>
          <div class="row-delta">
            {row.delta > 0 ? "+" : ""}{row.delta}
            {#if row.pct_change !== null}({row.pct_change > 0 ? "+" : ""}{row.pct_change}%){/if}
          </div>
          <div class="row-verdict">{metaFor(row).label}</div>
        </div>
      {/each}
    </div>

    <p class="disclaimer">
      * ตัวชี้วัดด้านสัญญาณชีพ (HR, SpO2, อุณหภูมิ) แสดงไว้เป็นข้อมูลอ้างอิงเท่านั้น
      ทิศทางที่ "ดี" ขึ้นอยู่กับดุลยพินิจของผู้เชี่ยวชาญ ระบบไม่ตัดสินแทน
    </p>
  {/if}

  {#if sessions.length >= 2}
    <div class="chart-wrap">
      <canvas bind:this={canvasEl}></canvas>
    </div>
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

  h2 {
    font-size: 1.05rem;
    margin: 0 0 0.75rem 0;
  }

  .empty {
    color: var(--color-text-muted);
  }

  .summary-text {
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: 1.4fr 1fr 0.9fr auto;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    font-size: 0.88rem;
    background: var(--color-info-bg);
  }

  .row-label {
    font-weight: 500;
  }

  .row-values {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--color-text-muted);
  }

  .arrow {
    font-size: 0.75rem;
  }

  .cur {
    font-weight: 700;
    color: var(--color-text);
  }

  .row-verdict {
    justify-self: end;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .verdict-improved {
    background: var(--color-improved-bg);
  }
  .verdict-improved .row-verdict {
    color: var(--color-improved);
    background: var(--color-improved-bg);
  }

  .verdict-declined {
    background: var(--color-declined-bg);
  }
  .verdict-declined .row-verdict {
    color: var(--color-declined);
    background: var(--color-declined-bg);
  }

  .verdict-flat .row-verdict,
  .verdict-info .row-verdict {
    color: var(--color-info);
    background: var(--color-info-bg);
  }

  .disclaimer {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .chart-wrap {
    max-height: 320px;
  }
</style>
