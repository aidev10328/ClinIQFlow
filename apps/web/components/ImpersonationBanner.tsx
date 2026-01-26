'use client';

import React from 'react';
import { useImpersonation } from '../lib/ImpersonationContext';

export default function ImpersonationBanner() {
  const { isImpersonating, impersonatedUser, stopImpersonation } = useImpersonation();

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-white px-4 py-2 sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <span className="font-medium">
            Viewing as:{' '}
            <span className="font-bold">
              {impersonatedUser.fullName || impersonatedUser.email}
            </span>
          </span>
          {impersonatedUser.role && (
            <span className="text-xs bg-amber-600 px-2 py-0.5 rounded">
              {impersonatedUser.role}
            </span>
          )}
          {impersonatedUser.hospitalName && (
            <span className="text-sm opacity-90">
              @ {impersonatedUser.hospitalName}
            </span>
          )}
        </div>
        <button
          onClick={stopImpersonation}
          className="flex items-center gap-2 bg-white text-amber-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Exit View
        </button>
      </div>
    </div>
  );
}
