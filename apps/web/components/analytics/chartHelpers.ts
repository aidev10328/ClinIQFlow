'use client';

import React, { useState, useRef, useEffect } from 'react';

// Chart colors - navy blue palette only
export const chartColors = {
  primary: '#1e3a5f',   // navy-600
  secondary: '#2b5a8a', // navy-500
  tertiary: '#3d7ab8',  // navy-400
  accent: '#5a9ad4',    // navy-300
  light: '#a3cbef',     // navy-200
  muted: '#d1e5f7',     // navy-100
};

export const DONUT_COLORS = [
  chartColors.primary,
  chartColors.secondary,
  chartColors.light,
  chartColors.tertiary,
  chartColors.muted,
];

export type TimeFilter = 'week' | 'month' | 'year';

// Date helpers
export function bKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekRange(baseDate: Date, weekOffset: number): { start: Date; end: Date } {
  const s = new Date(baseDate);
  s.setDate(s.getDate() - s.getDay() + weekOffset * 7);
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

export function getDateRange(filter: TimeFilter, now: Date) {
  switch (filter) {
    case 'week': { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { start: s, count: 7, type: 'days' as const }; }
    case 'month': { const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0); return { start: s, count: 30, type: 'days' as const }; }
    case 'year': { const s = new Date(now); s.setMonth(s.getMonth() - 11); s.setDate(1); s.setHours(0, 0, 0, 0); return { start: s, count: 12, type: 'months' as const }; }
  }
}

export function buildBuckets(filter: TimeFilter, now: Date) {
  const { start, count, type } = getDateRange(filter, now);
  const out: { key: string; label: string }[] = [];

  if (type === 'months') {
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
      out.push({ key: bKey(d), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
  }
  return out;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
