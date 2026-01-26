'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="admin-page-header">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2">
          <ol className="flex items-center gap-1 text-xs text-gray-500">
            {breadcrumbs.map((crumb, index) => (
              <li key={index} className="flex items-center gap-1">
                {index > 0 && <span>/</span>}
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-gray-900 hover:underline">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-gray-900">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="admin-page-title">{title}</h1>
          {subtitle && <p className="admin-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
