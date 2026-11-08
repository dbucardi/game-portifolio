<script setup lang="ts">
import type { GameStats } from '@mugloar/core';
import { computed, reactive, watch } from 'vue';
import { formatSigned } from '@/gameFeel';

/** WEB-03, WEB-18: `highScore` is the player's own stored best, not the API's field. Without it the tile is left out. */
const props = defineProps<{ stats: GameStats | null; highScore?: number; label?: string; animated?: boolean }>();

type StatKey = keyof GameStats;

const TILES: readonly { key: StatKey; label: string }[] = [
  { key: 'lives', label: 'Lives' },
  { key: 'gold', label: 'Gold' },
  { key: 'level', label: 'Level' },
  { key: 'score', label: 'Score' },
  { key: 'turn', label: 'Turn' },
  { key: 'highScore', label: 'High score' },
];
const tiles = computed(() => {
  const s = props.stats;

  return TILES.filter(({ key }) => key !== 'highScore' || props.highScore !== undefined).map(({ key, label }) => ({
    key,
    label,
    value: key === 'highScore' ? String(props.highScore) : s ? String(s[key]) : '–',
    danger: key === 'lives' && s !== null && s.lives <= 1,
  }));
});
/** FUN-04, FUN-07: a short float-up of what changed, for example "+1 ♥". */
const changes = reactive<Partial<Record<StatKey, { id: number; text: string; up: boolean }>>>({});
let nextChangeId = 0;
const FLOATING: readonly StatKey[] = ['lives', 'gold', 'level', 'score'];

watch(
  () => props.stats,
  (next, previous) => {
    if (!props.animated || !next || !previous) {
      return;
    }

    for (const key of FLOATING) {
      const diff = next[key] - previous[key];

      if (diff === 0) {
        continue;
      }

      const amount = formatSigned(diff);

      changes[key] = {
        id: nextChangeId++,
        text: key === 'lives' ? `${amount} ♥` : amount,
        up: diff > 0,
      };
    }
  },
);
</script>

<template>
  <section class="stats" :aria-label="label ?? 'Game stats'">
    <dl class="stats-grid" :style="{ '--columns': tiles.length }">
      <div v-for="tile in tiles" :key="tile.key" class="stat" :class="{ 'stat-danger': tile.danger }" :data-testid="`stat-${tile.key}`">
        <dt>{{ tile.label }}</dt>
        <dd>
          <span :key="tile.value" :class="{ bump: animated }">{{ tile.value }}</span>
        </dd>
        <span
          v-if="changes[tile.key]"
          :key="changes[tile.key]?.id"
          class="float"
          :class="changes[tile.key]?.up ? 'float-up' : 'float-down'"
          aria-hidden="true"
          data-testid="stat-change"
          >{{ changes[tile.key]?.text }}</span
        >
      </div>
    </dl>
  </section>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

@media (min-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(var(--columns, 6), minmax(0, 1fr));
  }
}

.stat {
  position: relative;
  background: var(--app-subtle);
  border: 1px solid var(--app-border);
  border-radius: var(--radius);
  padding: 8px 12px;
  min-width: 0;
}

.stat dt {
  font-size: 0.8rem;
  color: var(--app-muted);
}

.stat dd {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bump {
  display: inline-block;
  animation: bump 0.4s ease-out;
}

.stat-danger {
  background: var(--tone-danger-bg);
  border-color: var(--tone-danger);
}

.stat-danger dd,
.stat-danger dt {
  color: var(--tone-danger);
}

.float {
  position: absolute;
  right: 10px;
  top: 6px;
  font-weight: 700;
  pointer-events: none;
  opacity: 0;
  animation: float-up 0.9s ease-out;
}

.float-up {
  color: var(--tone-success);
}

.float-down {
  color: var(--tone-danger);
}

@keyframes bump {
  40% {
    transform: scale(1.25);
  }
}

@keyframes float-up {
  0% {
    opacity: 1;
    transform: translateY(8px);
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-14px);
  }
}

@keyframes fade-out {
  0%,
  60% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bump {
    animation: none;
  }

  .float {
    animation: fade-out 0.9s ease-out;
  }
}
</style>
