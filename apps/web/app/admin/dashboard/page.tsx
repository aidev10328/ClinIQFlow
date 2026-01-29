'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useApiQuery } from '../../../lib/hooks/useApiQuery';

// Lazy-load recharts
import { Cell } from 'recharts';
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────
type TimeFilter = 'day' | 'week' | 'month' | 'year';

// ─── Design Tokens (Navy Blue Only Palette) ──────────────────────────────────
const colors = {
  navy900: '#050d17',
  navy800: '#0a1a2e',
  navy700: '#0f2744',
  navy600: '#1e3a5f',
  navy500: '#2b5a8a',
  navy400: '#3d7ab8',
  navy300: '#5a9ad4',
  navy200: '#a3cbef',
  navy100: '#d1e5f7',
  navy50: '#e8f4fc',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
};

// Chart colors - navy blue palette only
const chartColors = {
  primary: '#1e3a5f',   // navy-600 - dark navy
  secondary: '#2b5a8a', // navy-500
  tertiary: '#3d7ab8',  // navy-400
  accent: '#5a9ad4',    // navy-300 - sky navy
  light: '#a3cbef',     // navy-200
  muted: '#d1e5f7',     // navy-100
};

// Donut colors - navy shades only
const DONUT_COLORS = [chartColors.primary, chartColors.secondary, chartColors.light, chartColors.tertiary, chartColors.muted];

// ─── Components ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-2 py-1.5 rounded-lg shadow-lg border border-slate-200 text-xs">
      <p className="text-slate-500 mb-0.5 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function FilterPills({ value, onChange }: { value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  return (
    <div className="flex gap-0.5 bg-slate-100 rounded p-0.5">
      {[
        { value: 'day' as TimeFilter, label: 'Day' },
        { value: 'week' as TimeFilter, label: 'Week' },
        { value: 'month' as TimeFilter, label: 'Month' },
        { value: 'year' as TimeFilter, label: 'Year' },
      ].map((f) => (
        <button key={f.value} onClick={() => onChange(f.value)}
          className={`px-2 py-0.5 text-[9px] rounded font-medium transition-all ${
            value === f.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function getDateRange(filter: TimeFilter) {
  const now = new Date();
  switch (filter) {
    case 'day': { const s = new Date(now); s.setHours(0, 0, 0, 0); return { start: s, count: 1, type: 'hours' as const }; }
    case 'week': { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { start: s, count: 7, type: 'days' as const }; }
    case 'month': { const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0); return { start: s, count: 30, type: 'days' as const }; }
    case 'year': { const s = new Date(now); s.setMonth(s.getMonth() - 11); s.setDate(1); s.setHours(0, 0, 0, 0); return { start: s, count: 12, type: 'months' as const }; }
  }
}

function buildBuckets(filter: TimeFilter) {
  const { start, count, type } = getDateRange(filter);
  const out: { key: string; label: string }[] = [];

  if (type === 'hours') {
    for (let i = 0; i < 24; i += 2) {
      const h = i.toString().padStart(2, '0');
      out.push({ key: `${start.toISOString().split('T')[0]}-${h}`, label: `${i % 12 || 12}${i < 12 ? 'a' : 'p'}` });
    }
  } else if (type === 'months') {
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short' }) });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.push({ key: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
  }
  return out;
}

function bKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AdminDashboardPage() {
  const [hospitalFilter, setHospitalFilter] = useState<TimeFilter>('month');
  const [revenueFilter, setRevenueFilter] = useState<TimeFilter>('month');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // ─── Data ────────────────────────────────────────────────────────────────
  const { data: hospitals = [], isLoading: hospitalsLoading } = useApiQuery<any[]>(
    ['admin', 'hospitals'],
    '/v1/hospitals'
  );

  const { data: subscriptions = [], isLoading: subsLoading } = useApiQuery<any[]>(
    ['admin', 'subscriptions'],
    '/v1/products/admin/subscriptions'
  );

  const loading = hospitalsLoading || subsLoading;

  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  // ─── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (loading) return null;

    // Hospitals by region
    const byRegion: Record<string, number> = {};
    hospitals.forEach((h: any) => {
      byRegion[h.region] = (byRegion[h.region] || 0) + 1;
    });

    // Subscription stats
    let totalMrr = 0;
    let activeCount = 0;
    let trialCount = 0;
    let pastDueCount = 0;
    const trialsExpiring: { hospitalName: string; expiresIn: number }[] = [];

    subscriptions.forEach((sub: any) => {
      if (sub.status === 'ACTIVE') {
        activeCount++;
        totalMrr += sub.totalMonthly || 0;
      } else if (sub.status === 'TRIAL') {
        trialCount++;
        if (sub.trialEndsAt) {
          const expiresAt = new Date(sub.trialEndsAt);
          const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntil > 0 && daysUntil <= 7) {
            trialsExpiring.push({ hospitalName: sub.hospitalName, expiresIn: daysUntil });
          }
        }
      } else if (sub.status === 'PAST_DUE') {
        pastDueCount++;
      }
    });

    // New hospitals this month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = hospitals.filter((h: any) => new Date(h.createdAt) >= thisMonthStart).length;

    // New hospitals today
    const todayHospitals = hospitals.filter((h: any) => new Date(h.createdAt).toISOString().split('T')[0] === todayStr).length;

    return {
      totalHospitals: hospitals.length,
      newThisMonth,
      todayHospitals,
      byRegion: Object.entries(byRegion).map(([region, count]) => ({ region, count })),
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: activeCount,
      trialSubscriptions: trialCount,
      pastDueSubscriptions: pastDueCount,
      mrr: totalMrr,
      trialsExpiring: trialsExpiring.sort((a, b) => a.expiresIn - b.expiresIn),
    };
  }, [hospitals, subscriptions, loading, now, todayStr]);

  // ─── Chart Data ──────────────────────────────────────────────────────────
  const hospitalChartData = useMemo(() => {
    const { start, type } = getDateRange(hospitalFilter);
    const buckets = buildBuckets(hospitalFilter);

    // Filter by region if selected
    let filteredHospitals = hospitals;
    if (selectedRegion) {
      filteredHospitals = hospitals.filter((h: any) => h.region === selectedRegion);
    }

    const newMap: Record<string, number> = {};
    const cumulativeMap: Record<string, number> = {};
    buckets.forEach((b) => { newMap[b.key] = 0; });

    // Sort hospitals by created date
    const sorted = [...filteredHospitals].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sorted.forEach((h: any) => {
      const d = new Date(h.createdAt);
      if (d < start) return;

      let k: string;
      if (type === 'hours') {
        const hr = Math.floor(d.getHours() / 2) * 2;
        k = `${d.toISOString().split('T')[0]}-${hr.toString().padStart(2, '0')}`;
      } else if (type === 'months') {
        k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        k = bKey(d);
      }

      if (newMap[k] !== undefined) newMap[k]++;
    });

    // Calculate cumulative
    let cumulative = filteredHospitals.filter((h: any) => new Date(h.createdAt) < start).length;
    buckets.forEach((b) => {
      cumulative += newMap[b.key];
      cumulativeMap[b.key] = cumulative;
    });

    return buckets.map((b) => ({
      label: b.label,
      'New Hospitals': newMap[b.key] || 0,
      'Total': cumulativeMap[b.key] || 0,
    }));
  }, [hospitals, hospitalFilter, selectedRegion]);

  const revenueChartData = useMemo(() => {
    const { start, type } = getDateRange(revenueFilter);
    const buckets = buildBuckets(revenueFilter);

    const revenueMap: Record<string, number> = {};
    buckets.forEach((b) => { revenueMap[b.key] = 0; });

    // Filter by region if selected
    let filteredSubs = subscriptions;
    if (selectedRegion) {
      const regionHospitalIds = new Set(hospitals.filter((h: any) => h.region === selectedRegion).map((h: any) => h.id));
      filteredSubs = subscriptions.filter((s: any) => regionHospitalIds.has(s.hospitalId));
    }

    // Calculate MRR for each period (simplified - assume monthly revenue)
    filteredSubs.forEach((sub: any) => {
      if (sub.status !== 'ACTIVE') return;
      const subStart = new Date(sub.createdAt || sub.startDate || start);

      buckets.forEach((b) => {
        // Parse bucket date
        let bucketDate: Date;
        if (type === 'months') {
          const [y, m] = b.key.split('-').map(Number);
          bucketDate = new Date(y, m - 1, 1);
        } else if (type === 'hours') {
          bucketDate = new Date(b.key.split('-').slice(0, 3).join('-'));
        } else {
          bucketDate = new Date(b.key);
        }

        // If subscription was active in this period
        if (subStart <= bucketDate) {
          revenueMap[b.key] += sub.totalMonthly || 0;
        }
      });
    });

    return buckets.map((b) => ({
      label: b.label,
      'MRR': Math.round(revenueMap[b.key]),
    }));
  }, [subscriptions, hospitals, revenueFilter, selectedRegion]);

  // Subscription Status donut
  const subscriptionDonutData = useMemo(() => [
    { name: 'Active', value: stats?.activeSubscriptions || 0 },
    { name: 'Trial', value: stats?.trialSubscriptions || 0 },
    { name: 'Past Due', value: stats?.pastDueSubscriptions || 0 },
  ].filter(d => d.value > 0), [stats]);

  // Region distribution donut
  const regionDonutData = useMemo(() => {
    return stats?.byRegion.map((r) => ({ name: r.region, value: r.count })) || [];
  }, [stats]);

  // Revenue breakdown (mock - would come from products in real implementation)
  const revenueDonutData = useMemo(() => {
    const activeRevenue = (stats?.mrr || 0);
    const trialRevenue = 0; // Trials don't generate revenue
    return [
      { name: 'Active MRR', value: activeRevenue },
      { name: 'Projected', value: Math.round(activeRevenue * 0.1) }, // 10% growth projection
    ].filter(d => d.value > 0);
  }, [stats]);

  const regionList = useMemo(() => stats?.byRegion.map((r) => r.region) || [], [stats]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="page-fullheight flex flex-col gap-2 p-2 overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-base font-semibold text-slate-900">Admin Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* KPI Cards - Compact Row */}
      <div className="grid grid-cols-6 gap-2 flex-shrink-0">
        {[
          { label: 'Hospitals', value: stats?.totalHospitals || 0, sub: stats?.todayHospitals ? `+${stats.todayHospitals} today` : 'total', href: '/admin/hospitals' },
          { label: 'Revenue', value: `$${((stats?.mrr || 0) / 1000).toFixed(1)}k`, sub: 'MRR', href: '/admin/revenue' },
          { label: 'Active', value: stats?.activeSubscriptions || 0, sub: 'subscriptions', href: '/admin/subscriptions' },
          { label: 'Trials', value: stats?.trialSubscriptions || 0, sub: 'active', href: '/admin/subscriptions' },
          { label: 'Past Due', value: stats?.pastDueSubscriptions || 0, sub: 'attention', href: '/admin/subscriptions' },
          { label: 'New', value: stats?.newThisMonth || 0, sub: 'this month', href: '/admin/hospitals' },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="bg-white rounded-lg border border-slate-200 p-2.5 hover:border-navy-300 transition-all">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{kpi.label}</p>
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-slate-900">{kpi.value}</span>
              <span className="text-[9px] text-navy-600 bg-navy-50 px-1.5 py-0.5 rounded font-medium">{kpi.sub}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* Left Column - Charts Stacked */}
        <div className="w-1/2 flex flex-col gap-2 min-h-0">
          {/* Donut Charts Row - 3 donuts side by side */}
          <div className="h-28 flex gap-2 flex-shrink-0">
            {/* Subscription Status Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={subscriptionDonutData.length > 0 ? subscriptionDonutData : [{ name: 'None', value: 1 }]} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {(subscriptionDonutData.length > 0 ? subscriptionDonutData : [{ name: 'None', value: 1 }]).map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-900">{stats?.totalSubscriptions || 0}</span>
                  <span className="text-[8px] text-slate-400">subs</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Subscriptions</p>
                <div className="space-y-0.5">
                  {subscriptionDonutData.slice(0, 3).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Region Distribution Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={regionDonutData.length > 0 ? regionDonutData : [{ name: 'None', value: 1 }]} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {(regionDonutData.length > 0 ? regionDonutData : [{ name: 'None', value: 1 }]).map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-900">{regionDonutData.length}</span>
                  <span className="text-[8px] text-slate-400">regions</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Regions</p>
                <div className="space-y-0.5">
                  {regionDonutData.slice(0, 3).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: {d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Revenue Breakdown Donut */}
            <div className="flex-1 bg-white rounded-lg border border-slate-200 p-2 flex items-center gap-2">
              <div className="relative w-16 h-16 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenueDonutData.length > 0 ? revenueDonutData : [{ name: 'None', value: 1 }]} cx="50%" cy="50%" innerRadius="55%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                      {(revenueDonutData.length > 0 ? revenueDonutData : [{ name: 'None', value: 1 }]).map((_, i: number) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-bold text-slate-900">${((stats?.mrr || 0) / 1000).toFixed(1)}k</span>
                  <span className="text-[8px] text-slate-400">MRR</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Revenue</p>
                <div className="space-y-0.5">
                  {revenueDonutData.slice(0, 2).map((d: any, i: number) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate">{d.name}: ${d.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Hospital Growth Chart */}
          <div className="flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-900">Hospital Growth</h3>
                <select
                  value={selectedRegion || ''}
                  onChange={(e) => setSelectedRegion(e.target.value || null)}
                  className="text-[9px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 cursor-pointer hover:border-navy-300 focus:outline-none focus:ring-1 focus:ring-navy-200 min-w-[90px] appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundPosition: 'right 4px center', backgroundSize: '12px', backgroundRepeat: 'no-repeat', paddingRight: '20px' }}
                >
                  <option value="">All Regions</option>
                  {regionList.map((r: string) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <FilterPills value={hospitalFilter} onChange={setHospitalFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hospitalChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="newHospitalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.accent} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={chartColors.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="New Hospitals" stroke={chartColors.primary} strokeWidth={2} fill="url(#newHospitalFill)" dot={false} />
                  <Area type="monotone" dataKey="Total" stroke={chartColors.accent} strokeWidth={2} fill="url(#totalFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: chartColors.primary }} />New Hospitals</span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: chartColors.accent }} />Cumulative</span>
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="flex-1 bg-white rounded-lg border border-slate-200 p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-900">Monthly Revenue</h3>
                <select
                  value={selectedRegion || ''}
                  onChange={(e) => setSelectedRegion(e.target.value || null)}
                  className="text-[9px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 cursor-pointer hover:border-navy-300 focus:outline-none focus:ring-1 focus:ring-navy-200 min-w-[90px] appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundPosition: 'right 4px center', backgroundSize: '12px', backgroundRepeat: 'no-repeat', paddingRight: '20px' }}
                >
                  <option value="">All Regions</option>
                  {regionList.map((r: string) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <FilterPills value={revenueFilter} onChange={setRevenueFilter} />
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="MRR" stroke={chartColors.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-full" style={{ background: chartColors.primary }} />Monthly Recurring Revenue</span>
            </div>
          </div>
        </div>

        {/* Right Column - Alerts & Quick Actions */}
        <div className="w-1/2 bg-white rounded-lg border border-slate-200 flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h3 className="text-xs font-semibold text-slate-900">Alerts & Activity</h3>
            <span className="text-[10px] text-slate-500">{(stats?.trialsExpiring.length || 0) + (stats?.pastDueSubscriptions || 0)} alerts</span>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
            {/* Trials Expiring Soon */}
            <div className="flex-shrink-0">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Trials Expiring Soon</p>
              {stats?.trialsExpiring && stats.trialsExpiring.length > 0 ? (
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {stats.trialsExpiring.map((trial, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg border-l-2 border-amber-400">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{trial.hospitalName}</p>
                        <p className="text-[10px] text-amber-700">Expires in {trial.expiresIn} day{trial.expiresIn !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 text-center py-2">No trials expiring soon</p>
              )}
            </div>

            {/* Past Due Subscriptions */}
            {(stats?.pastDueSubscriptions || 0) > 0 && (
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border-l-2 border-red-400">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-900">{stats.pastDueSubscriptions} Past Due</p>
                    <p className="text-[10px] text-red-700">Subscriptions need attention</p>
                  </div>
                </div>
              </div>
            )}

            {/* All Clear */}
            {(!stats?.trialsExpiring?.length && !stats?.pastDueSubscriptions) && (
              <div className="flex items-center gap-2 p-2 bg-lime-50 rounded-lg border-l-2 border-lime-400">
                <div className="w-8 h-8 rounded-full bg-lime-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-lime-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-900">All Clear</p>
                  <p className="text-[10px] text-lime-700">No pending alerts</p>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex-shrink-0 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/admin/hospitals" className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-navy-100 flex items-center justify-center text-navy-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-slate-700">Add Hospital</span>
                </Link>
                <Link href="/admin/subscriptions" className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-lime-100 flex items-center justify-center text-lime-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-slate-700">New Subscription</span>
                </Link>
                <Link href="/admin/discounts" className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-slate-700">Create Discount</span>
                </Link>
                <Link href="/admin/compliance" className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg hover:bg-navy-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-slate-700">Compliance</span>
                </Link>
              </div>
            </div>

            {/* Recent Hospitals */}
            <div className="flex-1 border-t border-slate-100 pt-3 min-h-0 overflow-hidden flex flex-col">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex-shrink-0">Recent Hospitals</p>
              <div className="flex-1 overflow-y-auto space-y-1.5">
                {hospitals.slice(0, 5).map((h: any) => (
                  <div key={h.id} className="flex items-center gap-2 p-2 bg-white border border-navy-200 rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center text-navy-600 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{h.name}</p>
                      <p className="text-[10px] text-slate-500">{h.city}, {h.region}</p>
                    </div>
                    <span className="text-[9px] text-navy-600 bg-navy-50 px-1.5 py-0.5 rounded font-medium flex-shrink-0">{h.region}</span>
                  </div>
                ))}
                {hospitals.length === 0 && (
                  <p className="text-[10px] text-slate-400 text-center py-2">No hospitals yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
