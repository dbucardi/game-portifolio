import { createRouter, createWebHistory } from 'vue-router';
import PlayView from '@/views/PlayView.vue';

export const routes = [
  { path: '/', redirect: '/play' },
  { path: '/play', name: 'play', component: PlayView, meta: { title: 'Play' } },
  {
    path: '/autopilot',
    name: 'autopilot',
    component: () => import('@/views/AutopilotView.vue'),
    meta: { title: 'Autopilot' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/play' },
];

export function createAppRouter() {
  const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

  router.afterEach((to) => {
    const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;

    document.title = title ? `${title} · Dragons of Mugloar` : 'Dragons of Mugloar';
  });

  return router;
}
