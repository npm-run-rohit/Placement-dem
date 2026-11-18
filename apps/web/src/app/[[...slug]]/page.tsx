import { ClientApp } from './client';

/**
 * Single-page app: every path renders the react-router app client-side (Next's documented Vite migration path).
 * Only `/` is pre-rendered for the static export; the host serves index.html for deep links, as with the Vite build.
 */
export function generateStaticParams() {
  return [{ slug: [''] }];
}

export default function Page() {
  return <ClientApp />;
}
