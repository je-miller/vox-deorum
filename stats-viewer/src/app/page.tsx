// Dashboard page: fetches runs server-side and delegates to the Dashboard client component.

import Dashboard from '@/components/Dashboard';

async function getRuns() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/runs`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const runs = await getRuns();

  return <Dashboard runs={runs} />;
}
