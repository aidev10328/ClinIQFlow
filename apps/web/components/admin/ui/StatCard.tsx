'use client';

import React from 'react';
import Link from 'next/link';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  href?: string;
  subtitle?: string;
}

export function StatCard({ label, value, trend, icon, href, subtitle }: StatCardProps) {
  const content = (
    <div className="admin-stat-card group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="admin-stat-label">{label}</p>
          <p className="admin-stat-value">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`admin-stat-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={trend.isPositive ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
                />
              </svg>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="admin-stat-icon">
            {icon}
          </div>
        )}
      </div>
      {href && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-[var(--color-primary)] font-medium group-hover:underline">
            View details →
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
