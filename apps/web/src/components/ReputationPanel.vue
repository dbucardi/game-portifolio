<script setup lang="ts">
import Button from 'primevue/button';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useGameStore } from '@/stores/game';

const game = useGameStore();
const { reputation, canQueue, pending } = storeToRefs(game);
const rows = computed(() => [
  { key: 'people', label: 'People', value: reputation.value?.people },
  { key: 'state', label: 'State', value: reputation.value?.state },
  { key: 'underworld', label: 'Underworld', value: reputation.value?.underworld },
]);

function format(value: number | undefined): string {
  if (value === undefined) {
    return '?';
  }

  const rounded = Math.round(value * 10) / 10 || 0;

  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function tone(value: number | undefined): string {
  return value === undefined || value === 0 ? 'neutral' : value > 0 ? 'good' : 'bad';
}
</script>

<template>
  <section class="reputation" aria-labelledby="reputation-title">
    <h2 id="reputation-title" class="panel-title">Reputation</h2>
    <dl class="rows">
      <div v-for="row in rows" :key="row.key" class="row" :data-testid="`reputation-${row.key}`">
        <dt>{{ row.label }}</dt>
        <dd :class="tone(row.value)">{{ format(row.value) }}</dd>
      </div>
    </dl>
    <p class="hint">{{ reputation ? 'As of your last investigation.' : 'Not investigated yet.' }} Investigating uses up one turn.</p>
    <Button
      label="Investigate"
      icon="pi pi-search"
      size="small"
      severity="secondary"
      outlined
      :disabled="!canQueue"
      :loading="pending?.kind === 'investigate'"
      @click="game.investigate()" />
  </section>
</template>

<style scoped>
.reputation {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.rows {
  align-self: stretch;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--app-subtle);
}

dt {
  overflow-wrap: anywhere;
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.good {
  color: var(--p-green-600, #15803d);
}

.bad {
  color: var(--p-red-600, #b91c1c);
}

.neutral {
  color: var(--app-muted);
}

.hint {
  margin: 0;
  color: var(--app-muted);
  font-size: 0.85rem;
}
</style>
