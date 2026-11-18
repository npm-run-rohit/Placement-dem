import { lazy, type ComponentType } from 'react';

type Preloadable<P> = ComponentType<P> & { preload: () => Promise<unknown> };
const preloaders: Array<() => Promise<unknown>> = [];

/**
 * React.lazy for a named export, with `preload()` so a chunk can be fetched before it is needed.
 * Each call becomes its own Turbopack chunk; `preloadAll` warms them once the first screen has painted.
 */
export function lazyNamed<M, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): Preloadable<M[K] extends ComponentType<infer P> ? P : never> {
  let promise: Promise<M> | undefined;
  const once = () => (promise ??= load());
  const C = lazy(async () => ({
    default: (await once())[name] as unknown as ComponentType<object>,
  })) as unknown as Preloadable<never>;
  C.preload = once;
  preloaders.push(once);
  return C as never;
}

/** Fetch every lazy chunk while the browser is idle, so later navigation never waits on the network. */
export function preloadAll() {
  const run = () => preloaders.forEach((p) => void p().catch(() => undefined));
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
