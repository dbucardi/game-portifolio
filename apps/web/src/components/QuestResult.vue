<script setup lang="ts">
import Message from 'primevue/message';
import { computed } from 'vue';
import { formatSigned } from '@/gameFeel';
import type { QuestReveal } from '@/stores/game';

const props = defineProps<{ reveal: QuestReveal }>();
const title = computed(() => (props.reveal.success ? 'Quest complete!' : 'Quest failed'));
const deltas = computed(() => {
  const { previous, next } = props.reveal;
  const list: { key: string; text: string; tone: 'good' | 'bad' }[] = [];
  const gold = next.gold - previous.gold;
  const score = next.score - previous.score;
  const lives = next.lives - previous.lives;

  if (gold !== 0) {
    list.push({ key: 'gold', text: `${formatSigned(gold)} gold`, tone: gold > 0 ? 'good' : 'bad' });
  }

  if (score !== 0) {
    list.push({ key: 'score', text: `${formatSigned(score)} score`, tone: 'good' });
  }

  if (lives !== 0) {
    list.push({
      key: 'lives',
      text: `${formatSigned(lives)} ${Math.abs(lives) === 1 ? 'life' : 'lives'}`,
      tone: lives > 0 ? 'good' : 'bad',
    });
    list.push({ key: 'lives-total', text: `Lives ${previous.lives} → ${next.lives}`, tone: 'bad' });
  }

  return list;
});
</script>

<template>
  <div class="quest-result" data-testid="quest-result-card">
    <div class="result" :class="reveal.success ? 'result-success' : 'result-failure'" aria-live="assertive" data-testid="quest-result">
      <span class="result-icon" aria-hidden="true">{{ reveal.success ? '🏆' : '💔' }}</span>
      <h3 class="result-title">{{ title }}</h3>
      <p class="result-message">"{{ reveal.message }}"</p>
      <ul class="deltas">
        <li v-for="delta in deltas" :key="delta.key" :class="`delta-${delta.tone}`">
          {{ delta.text }}
        </li>
      </ul>
    </div>
    <Message v-for="milestone in reveal.milestones" :key="milestone.key" :severity="milestone.key === 'last-life' ? 'warn' : 'success'" data-testid="milestone">
      {{ milestone.text }}
    </Message>
    <Message v-if="reveal.potionHint" severity="warn">{{ reveal.potionHint }}</Message>
  </div>
</template>

<style scoped>
.quest-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 12px;
  border-radius: var(--radius);
  border: 2px solid;
  animation: pop 0.35s ease-out;
}

.result-success {
  background: var(--tone-success-bg);
  border-color: var(--tone-success);
  color: var(--tone-success);
}

.result-failure {
  background: var(--tone-danger-bg);
  border-color: var(--tone-danger);
  color: var(--tone-danger);
}

.result-icon {
  font-size: 2.2rem;
}

.result-title {
  margin: 0;
  font-size: 1.15rem;
}

.result-message {
  margin: 0;
  font-style: italic;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.deltas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.delta-good {
  color: var(--tone-success);
}

.delta-bad {
  color: var(--tone-danger);
}

@keyframes pop {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
}

/* FUN-06: no movement, only fades. */
@media (prefers-reduced-motion: reduce) {
  .result {
    animation: fade 0.3s ease-out;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}
</style>
