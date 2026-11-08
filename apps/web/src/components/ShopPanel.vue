<script setup lang="ts">
import Button from 'primevue/button';
import { storeToRefs } from 'pinia';
import { useGameStore } from '@/stores/game';

const game = useGameStore();
const { shop, stats, canQueue, canAfford, pending } = storeToRefs(game);

function missingGoldTooltip(cost: number): string | undefined {
  const missing = cost - (stats.value?.gold ?? 0);

  return missing > 0 ? `Not enough gold: you need ${missing} more.` : undefined;
}
</script>

<template>
  <section class="shop" aria-labelledby="shop-title">
    <h2 id="shop-title" class="panel-title">Shop</h2>
    <p v-if="shop.length === 0" class="empty">Start a game to see the shop.</p>
    <ul v-else class="items">
      <li v-for="item in shop" :key="item.id" class="item" data-testid="shop-item">
        <span class="name">{{ item.name }}</span>
        <span class="cost">{{ item.cost }}g</span>
        <!-- A disabled button gets no pointer events, so the tooltip sits on the wrapper. -->
        <span v-tooltip.top="missingGoldTooltip(item.cost)" class="buy">
          <Button
            label="Buy"
            size="small"
            :aria-label="`Buy ${item.name} for ${item.cost} gold`"
            :disabled="!canQueue || !canAfford(item)"
            :loading="pending?.kind === 'buy' && pending.itemId === item.id"
            @click="game.buy(item.id)" />
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--app-subtle);
}

.buy {
  display: inline-flex;
}

.name {
  overflow-wrap: anywhere;
}

.cost {
  font-variant-numeric: tabular-nums;
  color: var(--app-muted);
  font-weight: 600;
}

.empty {
  margin: 0;
  color: var(--app-muted);
}
</style>
