<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import ErrorBoundary from '@/components/ErrorBoundary.vue';
import logoUrl from '@/assets/logo.png';

const links = [
  { to: '/play', label: 'Play', icon: 'pi pi-play' },
  { to: '/autopilot', label: 'Autopilot', icon: 'pi pi-android' },
];
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/play" class="brand">
        <img :src="logoUrl" alt="Dragons of Mugloar" class="logo" />
      </RouterLink>
      <nav class="top-nav" aria-label="Main">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="top-link">{{ link.label }}</RouterLink>
      </nav>
    </div>
  </header>

  <main id="main" class="app-main" tabindex="-1">
    <ErrorBoundary>
      <RouterView />
    </ErrorBoundary>
  </main>

  <nav class="tab-bar" aria-label="Main">
    <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="tab">
      <i :class="link.icon" aria-hidden="true" />
      <span>{{ link.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.skip-link {
  position: absolute;
  left: -9999px;
  top: 8px;
  z-index: 100;
  background: var(--app-surface);
  color: var(--app-text);
  padding: 8px 12px;
  border-radius: 6px;
}

.skip-link:focus {
  left: 8px;
}

.app-header {
  background:
    linear-gradient(rgb(1 23 23 / 0.7), rgb(1 23 23 / 0.7)),
    url('@/assets/background.jpg') center / cover no-repeat,
    var(--app-header-bg);
  color: var(--app-header-text);
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 10px var(--gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.logo {
  display: block;
  height: 40px;
  width: auto;
  max-width: 100%;
}

.top-nav {
  display: flex;
  gap: 4px;
}

.top-link {
  color: inherit;
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-weight: 600;
}

.top-link:hover {
  background: rgb(255 255 255 / 0.1);
}

.top-link.router-link-active {
  background: #fbf6ea;
  color: #2e2214;
}

.app-header :focus-visible {
  outline-color: #fbe38a;
}

.app-main {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--gutter);
  outline: none;
}

.tab-bar {
  display: none;
}

@media (max-width: 639px) {
  .logo {
    height: 30px;
  }

  .top-nav {
    display: none;
  }

  .app-main {
    padding-bottom: calc(var(--tabbar-height) + var(--gutter));
  }

  .tab-bar {
    position: fixed;
    inset: auto 0 0 0;
    height: var(--tabbar-height);
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--app-header-bg);
    border-top: 1px solid var(--app-border);
    z-index: 10;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--app-header-text);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .tab.router-link-active {
    background: rgb(255 255 255 / 0.12);
    color: #fbe38a;
  }

  .tab:focus-visible {
    outline-color: #fbe38a;
    outline-offset: -4px;
  }
}
</style>
