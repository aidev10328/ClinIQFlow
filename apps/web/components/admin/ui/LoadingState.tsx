'use client';

import React from 'react';

interface LoadingStateProps {
  rows?: number;
  type?: 'table' | 'cards' | 'list';
}

export function LoadingState({ rows = 5, type = 'table' }: LoadingStateProps) {
  if (type === 'cards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-skeleton-card">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="admin-skeleton-row">
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="admin-skeleton-table">
      {/* Header */}
      <div className="admin-skeleton-header">
        <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="admin-skeleton-row">
          <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-1/6 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
