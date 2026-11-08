<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import { onErrorCaptured, ref } from 'vue';

const failed = ref(false);

onErrorCaptured((error) => {
  console.error(error);
  failed.value = true;

  return false;
});

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <div v-if="failed" class="panel boundary" role="alert">
    <Message severity="error">Something went wrong while showing this page.</Message>
    <Button label="Reload the page" icon="pi pi-refresh" @click="reload" />
  </div>
  <slot v-else />
</template>

<style scoped>
.boundary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
</style>
