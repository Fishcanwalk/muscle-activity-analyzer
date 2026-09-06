<script>
  import { selectedPatientId } from "../lib/stores/patientStore.js";

  function goHome() {
    selectedPatientId.set(null);
  }
</script>

<header class="navbar">
  <button class="brand" on:click={goHome}>💪 Muscle Activity Analyzer</button>
  <span class="subtitle">บันทึกผลตรวจ & ติดตามความก้าวหน้าผู้ป่วย</span>
</header>

<style>
  .navbar {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }

  .brand {
    background: none;
    border: none;
    padding: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
</style>
