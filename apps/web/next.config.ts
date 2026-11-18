import path from 'node:path';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Served under /placement inside the BimaSahayak shell in prod (NEXT_PUBLIC_BASE_PATH=/placement, no trailing slash).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;
const DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';

export default function config(phase: string): NextConfig {
  const shared: NextConfig = {
    basePath,
    reactStrictMode: true,
    agentRules: false, // don't let `next dev` write AGENTS.md / CLAUDE.md into apps/web
    devIndicators: false, // the dev badge sits on the sidebar; the engine-time chip is our dev affordance
    // monorepo root, so Turbopack resolves the shared contracts source (tsconfig path -> packages/contracts/src)
    turbopack: {
      root: path.resolve(process.cwd(), '../..'), // npm -w runs scripts from apps/web
      // the static preview's fixtures (~440 KB) only exist in the demo build; everywhere else the import is a stub
      resolveAlias: DEMO ? {} : { '@/demo/mock-api': './src/demo/mock-api.noop.ts' },
    },
  };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    // dev only: forward /api to the Nest API (static exports cannot rewrite)
    return {
      ...shared,
      // extra hosts allowed to load the dev server, e.g. a demo tunnel: NEXT_DEV_ALLOWED_ORIGINS=*.ngrok-free.app
      allowedDevOrigins: process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(',').filter(Boolean),
      rewrites: async () => [{ source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' }],
    };
  }
  // production: plain static files the shell can host (demo preview goes to its own folder)
  return { ...shared, output: 'export', distDir: DEMO ? 'dist-demo' : 'dist' };
}
