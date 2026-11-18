import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { App } from './App';
import { DevToolsProvider } from './dev/DevTools';
import { initSahayakBridge } from './lib/auth';

const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';
initSahayakBridge();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
// static preview: hash routing (no server)
const Router = DEMO ? HashRouter : BrowserRouter;

/** Client-only app root (loaded with ssr: false from app/[[...slug]]/client.tsx). */
export default function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router
        basename={DEMO ? undefined : process.env.NEXT_PUBLIC_BASE_PATH || '/'}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DevToolsProvider>
          <App />
        </DevToolsProvider>
        {DEMO && (
          <div className="fixed bottom-3 right-3 z-50 rounded-full border border-t-amber-line bg-t-amber-soft px-3 py-1 text-meta font-medium text-t-amber">
            Preview with sample data · changes reset on reload
          </div>
        )}
      </Router>
    </QueryClientProvider>
  );
}
