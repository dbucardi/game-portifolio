<script setup lang="ts">
import type { Ad, RankedAd } from '@mugloar/core';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import { formatSigned } from '@/gameFeel';
import RiskTag from './RiskTag.vue';

const props = defineProps<{
  ad: Ad;
  /** WEB-07: only set while advisor hints are on. */
  hint: RankedAd | null;
  disabled: boolean;
  /** FUN-02, FUN-04: this quest is being solved or showing its result in the dialog. */
  active: boolean;
}>();
const emit = defineEmits<{ solve: [adId: string] }>();
const ev = computed(() => (props.hint ? formatSigned(Math.round(props.hint.expectedValue)) : ''));
const expiry = computed(() => (props.ad.expiresIn === 1 ? 'Expires in 1 turn' : `Expires in ${props.ad.expiresIn} turns`));
</script>

<template>
  <article class="ad" :class="{ 'is-active': active }" :aria-label="ad.message" data-testid="ad-card">
    <div class="ad-tags">
      <RiskTag :probability="ad.probability" />
      <Tag v-if="ad.encryption !== 'none'" value="decoded" severity="secondary" />
      <Tag v-if="hint?.trap" value="trap" severity="warn" icon="pi pi-exclamation-triangle" />
    </div>
    <p class="ad-message">{{ ad.message }}</p>
    <dl class="ad-facts">
      <div>
        <dt>Reward</dt>
        <dd>{{ ad.reward }} gold</dd>
      </div>
      <div>
        <dt>At stake</dt>
        <dd>1 life</dd>
      </div>
      <div v-if="hint" data-testid="advisor-ev">
        <dt>Advisor EV</dt>
        <dd :class="{ negative: hint.expectedValue < 0 }">{{ ev }}</dd>
      </div>
    </dl>
    <div class="ad-footer">
      <span class="expiry">{{ expiry }}</span>
      <Button label="Solve" :aria-label="`Solve: ${ad.message}`" :disabled="disabled" @click="emit('solve', ad.adId)" />
    </div>
  </article>
</template>

<style scoped>
.ad {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--radius);
  padding: 14px;
  min-width: 0;
}

.ad.is-active {
  border-color: var(--p-primary-color);
}

.ad-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ad-message {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
  flex: 1;
}

.ad-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  font-size: 0.9rem;
}

.ad-facts dt {
  color: var(--app-muted);
  font-size: 0.75rem;
}

.ad-facts dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.negative {
  color: var(--tone-danger);
}

.ad-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.expiry {
  color: var(--app-muted);
  font-size: 0.85rem;
}
</style>
