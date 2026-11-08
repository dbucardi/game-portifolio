<script setup lang="ts">
import type { LogEntry } from '@/session';

defineProps<{ entries: LogEntry[]; title?: string; live?: boolean; emptyText?: string }>();
</script>

<template>
  <section class="log" :aria-label="title ?? 'Event log'">
    <div class="section-header">
      <h2 class="panel-title log-title">{{ title ?? 'Event log' }}</h2>
      <span v-if="live" class="live" data-testid="live-indicator"><span class="dot" aria-hidden="true" />live</span>
    </div>
    <p v-if="entries.length === 0" class="empty">{{ emptyText ?? 'Nothing has happened yet.' }}</p>
    <ol v-else class="entries" aria-live="polite" aria-relevant="additions">
      <li v-for="entry in entries" :key="entry.key" class="entry" :class="`tone-${entry.tone}`">
        <span class="turn">T{{ entry.turn }}</span>
        <span class="text">{{ entry.text }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log-title {
  margin-bottom: 0;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entry {
  display: grid;
  grid-template-columns: 3.2em 1fr;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.turn {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.tone-success {
  color: var(--tone-success);
  background: var(--tone-success-bg);
}

.tone-danger {
  color: var(--tone-danger);
  background: var(--tone-danger-bg);
}

.tone-info {
  color: var(--tone-info);
  background: var(--tone-info-bg);
}

.tone-warn {
  color: var(--tone-warn);
  background: var(--tone-warn-bg);
}

.empty {
  margin: 0;
  color: var(--app-muted);
}

.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--tone-success);
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}
</style>
