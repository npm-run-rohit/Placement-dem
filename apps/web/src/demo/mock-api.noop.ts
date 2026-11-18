/** Stand-in for `mock-api` in real builds (next.config aliases it), so the demo fixtures never ship to production. */
export function installMockApi(_base: string) {
  throw new Error('Mock API is only available in the demo build (NEXT_PUBLIC_DEMO=true)');
}
