'use client';

import React from 'react';

type StatusType =
  | 'active'
  | 'trial'
  | 'past_due'
  | 'cancelled'
  | 'pending'
  | 'expired'
  | 'inactive'
  | 'complete'
  | 'success'
  | 'warning'
  | 'error';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  trial: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  past_due: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  expired: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  complete: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  success: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  warning: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  error: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/ /g, '_');
  const config = statusConfig[normalizedStatus] || statusConfig.inactive;
  const displayLabel = label || status.replace(/_/g, ' ');

  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1';
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-1.5 h-1.5';

  return (
    <span className={`inline-flex items-center gap-1 rounded font-medium capitalize ${config.bg} ${config.text} ${sizeClasses}`}>
      <span className={`${dotSize} rounded-full ${config.dot}`} />
      {displayLabel}
    </span>
  );
}
