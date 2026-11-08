<script setup lang="ts">
import { riskTier, type RiskTier } from '@mugloar/core';
import Tag from 'primevue/tag';
import { computed } from 'vue';

const props = defineProps<{ probability: string }>();
const SEVERITY: Record<RiskTier, 'success' | 'warn' | 'danger' | undefined> = {
  safe: 'success',
  likely: 'warn',
  risky: undefined,
  dangerous: 'danger',
};
const tier = computed(() => riskTier(props.probability));
</script>

<template>
  <Tag :value="probability" :severity="SEVERITY[tier]" :class="{ 'tag-risky': tier === 'risky' }" />
</template>
