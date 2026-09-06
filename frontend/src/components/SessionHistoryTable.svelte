<script>
  export let sessions = [];

  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  }

  function fmt(v, digits = 1) {
    return v === null || v === undefined ? "-" : Number(v).toFixed(digits);
  }
</script>

<div class="card">
  <h2>ประวัติการตรวจ/ฝึก ({sessions.length} ครั้ง)</h2>

  {#if sessions.length === 0}
    <p class="empty">ยังไม่มีประวัติ ลองเพิ่ม Log ครั้งแรก</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ชื่อการฝึก</th>
            <th>แรงกดสูงสุด (N)</th>
            <th>EMG RMS เฉลี่ย</th>
            <th>ระยะเวลา (s)</th>
            <th>HR เฉลี่ย</th>
            <th>SpO2</th>
          </tr>
        </thead>
        <tbody>
          {#each sessions as s (s.session_id)}
            <tr>
              <td>{formatDate(s.started_at)}</td>
              <td>{s.session_name}</td>
              <td>{fmt(s.summary_metrics?.max_force_newton)}</td>
              <td>{fmt(s.summary_metrics?.avg_emg_rms)}</td>
              <td>{fmt(s.summary_metrics?.duration_seconds, 0)}</td>
              <td>{fmt(s.summary_metrics?.avg_heart_rate, 0)}</td>
              <td>{fmt(s.summary_metrics?.avg_spo2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
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

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th, td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  th {
    color: var(--color-text-muted);
    font-weight: 600;
  }
</style>
