<script setup lang="ts">
import type { Run } from '@mugloar/core';
import Tag from 'primevue/tag';
import { storeToRefs } from 'pinia';
import { RUN_STATUS_SEVERITY, describeEndReason, shortRunId } from '@/runDisplay';
import { useRunsStore } from '@/stores/runs';

const runs = useRunsStore();
const { sortedRuns, activeRunId } = storeToRefs(runs);

function outcome(run: Run): string {
  if (run.status === 'failed') {
    return run.summary ? describeEndReason(run.summary.reason) : 'failed';
  }

  const stats = run.summary ? { score: run.summary.score, turn: run.summary.turns } : run.stats;

  return stats ? `${stats.score} / T${stats.turn}` : 'starting…';
}
</script>

<template>
  <section aria-labelledby="runs-title">
    <h2 id="runs-title" class="panel-title">Runs ({{ sortedRuns.length }})</h2>
    <p v-if="sortedRuns.length === 0" class="empty">No runs yet. Start a run to watch the bot play.</p>
    <ul v-else class="runs">
      <li v-for="run in sortedRuns" :key="run.runId">
        <button
          type="button"
          class="run"
          :class="{ active: run.runId === activeRunId }"
          :aria-current="run.runId === activeRunId ? 'true' : undefined"
          @click="runs.select(run.runId)">
          <span class="id">{{ shortRunId(run.runId) }}</span>
          <Tag :value="run.status" :severity="RUN_STATUS_SEVERITY[run.status]" />
          <span class="outcome">{{ outcome(run) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 340px;
  overflow-y: auto;
}

.run {
  width: 100%;
  display: grid;
  grid-template-columns: 4em auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--app-surface);
  color: var(--app-text);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.run:hover {
  background: var(--app-subtle);
}

.run.active {
  border: 2px solid var(--tone-info);
  padding: 7px 9px;
}

.id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}

.outcome {
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.empty {
  margin: 0;
  color: var(--app-muted);
}
</style>
