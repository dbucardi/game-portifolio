<script setup lang="ts">
import { TARGET_SCORE } from '@mugloar/core';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { storeToRefs } from 'pinia';
import { onMounted, ref, watch } from 'vue';
import AdBoard from '@/components/AdBoard.vue';
import EventLog from '@/components/EventLog.vue';
import GameOverPanel from '@/components/GameOverPanel.vue';
import ReputationPanel from '@/components/ReputationPanel.vue';
import ShopPanel from '@/components/ShopPanel.vue';
import StatsBar from '@/components/StatsBar.vue';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { useGameStore } from '@/stores/game';

const TOAST_GROUP = 'game-errors';
const game = useGameStore();
const { stats, highScore, status, error, log, hasGame, isGameOver } = storeToRefs(game);
const toast = useToast();
const isMobile = useMediaQuery('(max-width: 639px)');
const shopOpen = ref(false);
const reputationOpen = ref(false);
const logOpen = ref(false);
const isRestarting = ref(false);

onMounted(() => {
  void game.resumeGame();
});
// ERR-05: every failed request surfaces as a toast with a Retry action.
watch(error, (current) => {
  toast.removeGroup(TOAST_GROUP);

  if (current) {
    toast.add({ group: TOAST_GROUP, severity: 'error', summary: current.message, closable: true });
  }
});

async function startNewGame(): Promise<void> {
  isRestarting.value = true;

  try {
    await game.startGame();
  } finally {
    isRestarting.value = false;
  }
}

function retry(): void {
  toast.removeGroup(TOAST_GROUP);
  void game.retry();
}
</script>

<template>
  <div class="play">
    <Toast :group="TOAST_GROUP" position="top-center" @close="game.dismissError()">
      <template #message="{ message }">
        <div class="toast-body">
          <i class="pi pi-exclamation-circle" aria-hidden="true" />
          <span class="toast-text">{{ message.summary }}</span>
          <Button label="Retry" size="small" severity="danger" @click="retry" />
        </div>
      </template>
    </Toast>

    <div class="toolbar">
      <h1 class="title">Manual play</h1>
      <Button v-if="hasGame && !isGameOver" label="Abandon game" icon="pi pi-trash" severity="danger" outlined @click="game.abandonGame()" />
    </div>

    <StatsBar :stats="stats" :high-score="highScore" animated />

    <section v-if="!hasGame" class="panel intro">
      <h2>Ready to help the people of Mugloar?</h2>
      <p>
        Pick quests from the board, earn gold and score, and buy gear in the shop. Every choice is yours. Reach {{ TARGET_SCORE }} points before your lives run
        out.
      </p>
      <Button label="Start a new game" icon="pi pi-play" size="large" :loading="status === 'loading'" @click="game.startGame()" />
    </section>

    <template v-else>
      <!-- WEB-06: starting a game leaves 'gameOver', so keep the panel while its New game loads. -->
      <GameOverPanel v-if="(isGameOver || isRestarting) && stats" :stats="stats" :loading="isRestarting" @new-game="startNewGame" />

      <div class="layout">
        <div class="panel main">
          <div v-if="isMobile" class="sheet-buttons">
            <Button label="Shop" icon="pi pi-shopping-bag" severity="secondary" outlined @click="shopOpen = true" />
            <Button label="Reputation" icon="pi pi-users" severity="secondary" outlined @click="reputationOpen = true" />
            <Button label="Event log" icon="pi pi-list" severity="secondary" outlined @click="logOpen = true" />
          </div>
          <AdBoard />
        </div>
        <aside v-if="!isMobile" class="side">
          <div class="panel"><ShopPanel /></div>
          <div class="panel"><ReputationPanel /></div>
          <div id="play-log" class="panel"><EventLog :entries="log" /></div>
        </aside>
      </div>
    </template>

    <Drawer v-model:visible="shopOpen" position="bottom" header="Shop" class="sheet">
      <ShopPanel />
    </Drawer>
    <Drawer v-model:visible="reputationOpen" position="bottom" header="Reputation" class="sheet">
      <ReputationPanel />
    </Drawer>
    <Drawer v-model:visible="logOpen" position="bottom" header="Event log" class="sheet">
      <EventLog :entries="log" />
    </Drawer>
  </div>
</template>

<style scoped>
.play {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-size: 1.4rem;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.intro p {
  margin: 0;
  max-width: 60ch;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 1024px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 320px;
    align-items: start;
  }
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

@media (min-width: 640px) and (max-width: 1023px) {
  .side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

.sheet-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.sheet-buttons > * {
  flex: 1;
}

.toast-body {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.toast-text {
  flex: 1;
  font-weight: 600;
}
</style>

<style>
/* Extra specificity: PrimeVue's `.p-drawer-bottom .p-drawer` fixes the height at 10rem. */
.p-drawer-bottom .p-drawer.sheet {
  height: auto;
  min-height: 50vh;
  min-height: 50dvh;
  max-height: 90vh;
  max-height: 90dvh;
}

.p-drawer.sheet .p-drawer-content {
  overflow-y: auto;
}

/* The drawer header already names the panel. */
.p-drawer.sheet .panel-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
