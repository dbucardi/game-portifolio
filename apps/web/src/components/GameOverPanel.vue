<script setup lang="ts">
import { TARGET_SCORE, type GameStats } from '@mugloar/core';
import Button from 'primevue/button';
import { computed } from 'vue';

const props = defineProps<{ stats: GameStats; loading: boolean }>();
const emit = defineEmits<{ newGame: [] }>();
const reachedTarget = computed(() => props.stats.score >= TARGET_SCORE);
const title = computed(() => (reachedTarget.value ? 'Victory!' : 'Your journey ends'));
const flavour = computed(() => (reachedTarget.value ? 'The bards of Mugloar will sing of your deeds.' : 'The dragons of Mugloar claim another hero.'));
</script>

<template>
  <section class="panel over" :class="reachedTarget ? 'is-hit' : 'is-miss'" aria-labelledby="game-over-title">
    <div class="story">
      <h2 id="game-over-title" class="eyebrow">Game over</h2>
      <p class="over-title" data-testid="game-over-title">{{ title }}</p>
      <p class="flavour">{{ flavour }}</p>
      <Button class="new-game" label="New game" icon="pi pi-play" :loading="loading" @click="emit('newGame')" />
    </div>
    <span class="emblem" aria-hidden="true">{{ reachedTarget ? '🏆' : '🪦' }}</span>
  </section>
</template>

<style scoped>
.over {
  display: flex;
  align-items: center;
  gap: 16px;
  border-width: 2px;
}

.is-hit {
  border-color: var(--tone-success);
}

.is-miss {
  border-color: var(--tone-danger);
}

.story {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-muted);
}

.over-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.flavour {
  margin: 0 0 6px;
  font-style: italic;
}

.emblem {
  flex: none;
  font-size: 3.5rem;
  line-height: 1;
  user-select: none;
}

.is-hit .emblem {
  animation: bob 0.8s steps(2) infinite;
}

@keyframes bob {
  50% {
    transform: translateY(-6px);
  }
}

/* FUN-06: no movement. */
@media (prefers-reduced-motion: reduce) {
  .emblem {
    animation: none !important;
  }
}
</style>
