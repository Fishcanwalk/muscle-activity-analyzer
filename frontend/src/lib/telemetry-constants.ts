// Shared across telemetryStore.ts (server), telemetry.svelte.ts (client store) and
// EmgGraphMonitor.svelte (chart) so the raw EMG rolling buffer is the same length
// everywhere in the pipeline.
export const EMG_BUFFER_SIZE = 150;
