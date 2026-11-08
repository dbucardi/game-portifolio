<script setup lang="ts">
import { TARGET_SCORE } from '@mugloar/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ScorePoint } from '@/session';

const props = defineProps<{ points: ScorePoint[] }>();
const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };
// Drawn at the real pixel width so the line and labels don't stretch.
const container = ref<HTMLElement | null>(null);
const WIDTH_FALLBACK = 600;
const measuredWidth = ref(WIDTH_FALLBACK);
let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!container.value || typeof ResizeObserver === 'undefined') {
    return;
  }

  observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) {
      measuredWidth.value = entry.contentRect.width;
    }
  });
  observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());

const scale = computed(() => {
  const width = measuredWidth.value;
  // A loop, not Math.max(...spread): long runs would exceed the argument limit.
  let maxTurn = 10;
  let maxScore = TARGET_SCORE * 1.2;

  for (const point of props.points) {
    maxTurn = Math.max(maxTurn, point.turn);
    maxScore = Math.max(maxScore, point.score);
  }

  const x = (turn: number) => PAD.left + (turn / maxTurn) * (width - PAD.left - PAD.right);
  const y = (score: number) => HEIGHT - PAD.bottom - (score / maxScore) * (HEIGHT - PAD.top - PAD.bottom);

  return { x, y, maxTurn, maxScore, width };
});
const path = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.value.x(p.turn).toFixed(1)},${scale.value.y(p.score).toFixed(1)}`).join(' '),
);
const targetY = computed(() => scale.value.y(TARGET_SCORE));
const latest = computed(() => props.points.at(-1));
const summary = computed(() => (latest.value ? `Score ${latest.value.score} at turn ${latest.value.turn}. Target ${TARGET_SCORE}.` : 'No score yet.'));
</script>

<template>
  <figure ref="container" class="chart">
    <figcaption class="panel-title">Score over turns</figcaption>
    <svg :viewBox="`0 0 ${scale.width} ${HEIGHT}`" :height="HEIGHT" role="img" :aria-label="summary">
      <line :x1="PAD.left" :x2="PAD.left" :y1="PAD.top" :y2="HEIGHT - PAD.bottom" class="axis" />
      <line :x1="PAD.left" :x2="scale.width - PAD.right" :y1="HEIGHT - PAD.bottom" :y2="HEIGHT - PAD.bottom" class="axis" />
      <line :x1="PAD.left" :x2="scale.width - PAD.right" :y1="targetY" :y2="targetY" class="target" />
      <text :x="scale.width - PAD.right" :y="targetY - 6" text-anchor="end" class="label">{{ TARGET_SCORE }} target</text>
      <text :x="PAD.left - 6" :y="HEIGHT - PAD.bottom" text-anchor="end" class="label">0</text>
      <text :x="scale.width - PAD.right" :y="HEIGHT - 6" text-anchor="end" class="label">turn {{ scale.maxTurn }}</text>
      <path v-if="points.length > 1" :d="path" class="line" />
      <circle v-if="latest" :cx="scale.x(latest.turn)" :cy="scale.y(latest.score)" r="4" class="point" />
    </svg>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}

svg {
  width: 100%;
  display: block;
}

.axis {
  stroke: var(--app-border);
  stroke-width: 1;
}

.target {
  stroke: var(--app-accent);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.line {
  fill: none;
  stroke: var(--p-primary-color);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}

.point {
  fill: var(--p-primary-color);
}

.label {
  fill: var(--app-muted);
  font-size: 12px;
}
</style>
