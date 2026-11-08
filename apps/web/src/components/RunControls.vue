<script setup lang="ts">
import { DEFAULT_MAX_TURNS, MAX_TURNS_LIMIT, maxTurnsSchema, STRATEGY_LABELS, STRATEGY_NAMES, strategyNameSchema, type StrategyName } from '@mugloar/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { z } from 'zod';
import { useStoredRef } from '@/composables/useStoredRef';
import { useRunsStore } from '@/stores/runs';

const props = defineProps<{ disabled: boolean }>();
const runs = useRunsStore();
const { starting, stopping, canStop, activeRun } = storeToRefs(runs);
const strategy = useStoredRef<StrategyName>('mugloar.strategy', strategyNameSchema, 'expected-value');
const maxTurnsText = useStoredRef('mugloar.maxTurns', z.string(), String(DEFAULT_MAX_TURNS));
const touched = ref(false);
const strategyOptions = STRATEGY_NAMES.map((name) => ({
  value: name,
  label: STRATEGY_LABELS[name],
}));
// VAL-04/VAL-05: the same rule the bot service applies to the request body.
const maxTurns = computed(() => maxTurnsSchema.safeParse(maxTurnsText.value.trim() === '' ? undefined : maxTurnsText.value));
const maxTurnsError = computed(() => (touched.value && !maxTurns.value.success ? maxTurns.value.error.issues[0]?.message : undefined));

function submit(): void {
  touched.value = true;

  if (!maxTurns.value.success || props.disabled) {
    return;
  }

  void runs.startRun({ strategy: strategy.value, maxTurns: maxTurns.value.data });
}
</script>

<template>
  <form class="controls" novalidate aria-labelledby="run-form-title" @submit.prevent="submit">
    <h2 id="run-form-title" class="panel-title">Start a bot run</h2>
    <div class="field">
      <label for="run-strategy">Strategy</label>
      <Select v-model="strategy" input-id="run-strategy" :options="strategyOptions" option-label="label" option-value="value" class="full" />
    </div>
    <div class="field">
      <label for="run-max-turns">Max turns</label>
      <InputText
        id="run-max-turns"
        v-model="maxTurnsText"
        type="number"
        inputmode="numeric"
        min="1"
        :max="MAX_TURNS_LIMIT"
        step="1"
        class="full"
        :invalid="Boolean(maxTurnsError)"
        :aria-invalid="Boolean(maxTurnsError)"
        aria-describedby="run-max-turns-help"
        @blur="touched = true" />
      <Message v-if="maxTurnsError" id="run-max-turns-help" severity="error" variant="simple" size="small">
        {{ maxTurnsError }}
      </Message>
      <small v-else id="run-max-turns-help" class="help">A whole number from 1 to {{ MAX_TURNS_LIMIT }}</small>
    </div>
    <div class="actions">
      <Button type="submit" label="Start run" icon="pi pi-play" :loading="starting" :disabled="disabled" />
      <Button type="button" label="Stop run" icon="pi pi-stop" severity="secondary" outlined :disabled="!canStop" :loading="stopping" @click="runs.stopRun()" />
    </div>
    <Message v-if="activeRun?.status === 'stopping'" severity="info" size="small">
      Stopping… the bot finishes its current move, then the run ends as 'stopped'.
    </Message>
  </form>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.controls .panel-title {
  margin-bottom: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-weight: 600;
}

.full {
  width: 100%;
}

.help {
  color: var(--app-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
