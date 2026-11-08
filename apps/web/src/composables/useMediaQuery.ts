import { onBeforeUnmount, ref, type Ref } from 'vue';

export function useMediaQuery(query: string): Ref<boolean> {
  const list = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(query) : null;
  const matches = ref(list?.matches ?? false);
  const update = (event: MediaQueryListEvent) => {
    matches.value = event.matches;
  };

  list?.addEventListener('change', update);
  onBeforeUnmount(() => list?.removeEventListener('change', update));

  return matches;
}
