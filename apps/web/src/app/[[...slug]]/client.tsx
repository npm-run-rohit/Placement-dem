'use client';

import dynamic from 'next/dynamic';

const ClientRoot = dynamic(
  async () => {
    if (process.env.NEXT_PUBLIC_DEMO === 'true') {
      // static preview build: fixtures instead of the API, installed before the first query runs
      const { installMockApi } = await import('@/demo/mock-api');
      installMockApi(process.env.NEXT_PUBLIC_API_BASE ?? '/api/v1');
    }
    return import('@/Root');
  },
  { ssr: false },
);

export function ClientApp() {
  return <ClientRoot />;
}
