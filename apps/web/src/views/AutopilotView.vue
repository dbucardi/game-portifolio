<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted } from 'vue';
import EventLog from '@/components/EventLog.vue';
import RunControls from '@/components/RunControls.vue';
import RunList from '@/components/RunList.vue';
import ScoreChart from '@/components/ScoreChart.vue';
import StatsBar from '@/components/StatsBar.vue';
import { RUN_STATUS_SEVERITY, describeEndReason, shortRunId } from '@/runDisplay';
import { useHighScoreStore } from '@/stores/highScore';
import { useRunsStore } from '@/stores/runs';
import { STRATEGY_LABELS } from '@mugloar/core';

const runs = useRunsStore();
const highScores = useHighScoreStore();
const { status, error, activeRun, activeStats, activeLog, scoreHistory, live } = storeToRefs(runs);
const unavailable = computed(() => status.value === 'unavailable');
const runTitle = computed(() =>
  activeRun.value ? `Run ${shortRunId(activeRun.value.runId)} - game ${activeRun.value.gameId} - ${STRATEGY_LABELS[activeRun.value.strategy]}` : '',
);

onMounted(() => {
  void runs.fetchRuns();
});
// Close the EventSource when the user leaves the page.
onBeforeUnmount(() => {
  runs.unsubscribe();
});
</script>

<template>
  <div class="autopilot">
    <h1 class="title">Autopilot</h1>

    <Message v-if="unavailable" severity="warn" class="banner">
      <div class="banner-body">
        <span>The bot service isn't available. Manual play still works.</span>
        <div class="banner-actions">
          <Button label="Retry" size="small" :loading="status === 'loading'" @click="runs.fetchRuns()" />
          <RouterLink to="/play" class="link">Go to manual play</RouterLink>
        </div>
      </div>
    </Message>

    <Message v-if="error" severity="error" closable @close="runs.dismissError()">{{ error }}</Message>

    <div class="layout">
      <div class="side">
        <div class="panel"><RunControls :disabled="unavailable" /></div>
        <div class="panel"><RunList /></div>
      </div>

      <section class="panel detail" aria-labelledby="run-detail-title">
        <template v-if="activeRun">
          <div class="section-header">
            <h2 id="run-detail-title" class="panel-title detail-title">{{ runTitle }}</h2>
            <Tag :value="activeRun.status" :severity="RUN_STATUS_SEVERITY[activeRun.status]" />
          </div>
          <StatsBar :stats="activeStats" :high-score="highScores.best" label="Run stats" />
          <ScoreChart :points="scoreHistory" />
          <p v-if="activeRun.summary" class="summary" data-testid="run-summary">
            {{ describeEndReason(activeRun.summary.reason) }}. Score {{ activeRun.summary.score }} in {{ activeRun.summary.turns }}
            turns.
          </p>
          <EventLog :entries="activeLog" title="Live events" :live="live" empty-text="Waiting for the first move…" />
        </template>
        <template v-else>
          <h2 id="run-detail-title" class="panel-title">No run selected</h2>
          <p class="empty">Start a run, or pick one from the list, to watch the bot play.</p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.autopilot {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title {
  font-size: 1.4rem;
}

.banner-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  width: 100%;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.link {
  color: inherit;
  font-weight: 600;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 1024px) {
  .layout {
    grid-template-columns: 340px minmax(0, 1fr);
    align-items: start;
  }
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-title {
  margin-bottom: 0;
  overflow-wrap: anywhere;
}

.summary,
.empty {
  margin: 0;
  color: var(--app-muted);
}
</style>
