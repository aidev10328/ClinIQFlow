'use client';

import React from 'react';

interface PageSpinnerProps {
  /** Label shown below the spinner, e.g. "Loading dashboard..." */
  label?: string;
}

export function PageSkeleton({ label = 'Loading...' }: PageSpinnerProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export function ContentSpinner({ label = 'Loading...' }: PageSpinnerProps) {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}
