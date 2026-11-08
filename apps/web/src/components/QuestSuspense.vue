<script setup lang="ts">
import { riskTier } from '@mugloar/core';
import { computed } from 'vue';
import { oddsText } from '@/gameFeel';
import type { Suspense } from '@/stores/game';

const props = defineProps<{ suspense: Suspense }>();
const quest = computed(() => props.suspense.ad);
const tier = computed(() => riskTier(quest.value.probability));
</script>

<template>
  <div class="quest" :class="[`tier-${tier}`, { 'is-climax': suspense.phase === 'climax' }]" data-testid="quest-suspense">
    <h3 class="quest-title">Quest in progress</h3>
    <div class="stage" data-testid="suspense-stage" aria-hidden="true">
      <span class="hero">🛡️</span>
      <span class="clash">⚔️</span>
      <span class="foe">🐉</span>
    </div>
    <p class="flavour" data-testid="flavour" aria-live="polite">{{ suspense.flavour }}</p>
    <div class="progress" role="progressbar" aria-label="Quest progress" :style="{ '--suspense-ms': `${suspense.durationMs}ms` }">
      <span class="progress-fill" />
    </div>
    <dl class="stakes">
      <div class="win">
        <dt>Win</dt>
        <dd>+{{ quest.reward }} gold</dd>
      </div>
      <div class="lose">
        <dt>Lose</dt>
        <dd>-1 life</dd>
      </div>
    </dl>
    <p class="odds">{{ oddsText(quest.probability) }}</p>
  </div>
</template>

<style scoped>
.quest {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quest-title {
  margin: 0;
  font-size: 1.05rem;
}

.stage {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-radius: var(--radius);
  background: var(--app-subtle);
  font-size: 2.4rem;
  user-select: none;
}

.hero,
.foe {
  animation: bob 0.8s steps(2) infinite;
}

.foe {
  animation-delay: 0.4s;
}

.clash {
  opacity: 0.25;
  transition: opacity 0.3s;
}

.is-climax .clash {
  opacity: 1;
  animation: clash 0.5s ease-in-out infinite;
}

.is-climax.tier-risky .stage,
.is-climax.tier-dangerous .stage {
  animation: shake 0.35s ease-in-out infinite;
}

.flavour {
  margin: 0;
  font-style: italic;
  min-height: 1.5em;
}

.progress {
  height: 8px;
  border-radius: 4px;
  background: var(--app-subtle);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  width: 0;
  background: var(--p-primary-color);
  animation: fill var(--suspense-ms) linear forwards;
}

.stakes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0;
}

.stakes div {
  border-radius: 8px;
  padding: 6px 10px;
}

.stakes dt {
  font-size: 0.75rem;
}

.stakes dd {
  margin: 0;
  font-weight: 700;
}

.win {
  background: var(--tone-success-bg);
  color: var(--tone-success);
}

.lose {
  background: var(--tone-danger-bg);
  color: var(--tone-danger);
}

.odds {
  margin: 0;
  color: var(--app-muted);
}

@keyframes bob {
  50% {
    transform: translateY(-6px);
  }
}

@keyframes clash {
  50% {
    transform: scale(1.3) rotate(10deg);
  }
}

@keyframes shake {
  25% {
    transform: translateX(-3px);
  }
  75% {
    transform: translateX(3px);
  }
}

@keyframes fill {
  to {
    width: 100%;
  }
}

/* FUN-06: no movement, only fades. */
@media (prefers-reduced-motion: reduce) {
  .hero,
  .foe,
  .is-climax .clash,
  .is-climax .stage {
    animation: none !important;
  }
}
</style>
