<script setup lang="ts">
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { BOARD_SORT_LABELS, BOARD_SORTS, LAST_LIFE_TEXT } from '@/gameFeel';
import { useGameStore } from '@/stores/game';
import { usePreferencesStore } from '@/stores/preferences';
import AdCard from './AdCard.vue';
import QuestResult from './QuestResult.vue';
import QuestSuspense from './QuestSuspense.vue';

const game = useGameStore();
const { boardAds, hints, canAct, canQueue, pending, isLastLife, suspense, reveal } = storeToRefs(game);
const { advisor, boardSort } = storeToRefs(usePreferencesStore());
const solvingAd = computed(() => suspense.value?.ad ?? reveal.value?.ad ?? null);
// FUN-04: the result stays until the player closes it, so only the suspense phase blocks closing.
const dialogOpen = computed({
  get: () => solvingAd.value !== null,
  set: (open) => {
    if (!open && reveal.value) {
      void game.closeReveal();
    }
  },
});
const sortOptions = BOARD_SORTS.map((value) => ({ value, label: BOARD_SORT_LABELS[value] }));
</script>

<template>
  <section class="board" aria-labelledby="ads-title">
    <div class="section-header">
      <h2 id="ads-title" class="panel-title board-title">Quest board</h2>
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        size="small"
        :disabled="!canQueue"
        :loading="pending?.kind === 'refresh'"
        @click="game.refreshAds()" />
    </div>

    <div class="controls">
      <div class="control">
        <label for="board-sort">Sort</label>
        <Select v-model="boardSort" input-id="board-sort" :options="sortOptions" option-label="label" option-value="value" size="small" />
      </div>
      <div class="control">
        <label for="advisor-toggle">Advisor hints</label>
        <ToggleSwitch v-model="advisor" input-id="advisor-toggle" />
      </div>
    </div>

    <Message v-if="isLastLife" severity="warn" class="stakes" data-testid="last-life-warning">{{ LAST_LIFE_TEXT }}</Message>

    <Message v-if="boardAds.length === 0" severity="secondary">No quests right now. Try Refresh.</Message>
    <div v-else class="grid">
      <AdCard
        v-for="ad in boardAds"
        :key="ad.adId"
        :ad="ad"
        :hint="hints.get(ad.adId) ?? null"
        :disabled="!canAct"
        :active="solvingAd?.adId === ad.adId"
        @solve="game.solve" />
    </div>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      :closable="reveal !== null"
      :close-on-escape="reveal !== null"
      :draggable="false"
      :header="solvingAd?.message"
      class="quest-dialog"
      data-testid="quest-dialog">
      <QuestSuspense v-if="suspense" :suspense="suspense" />
      <div v-else-if="reveal" class="reveal">
        <QuestResult :reveal="reveal" />
        <Button label="Continue" autofocus data-testid="close-reveal" @click="game.closeReveal()" />
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.board-title {
  margin-bottom: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  margin-bottom: 12px;
}

.control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.stakes {
  margin-bottom: 12px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>

<style>
.p-dialog.quest-dialog {
  width: min(28rem, calc(100vw - 32px));
}

.quest-dialog .reveal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
