'use client';

import React from 'react';

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="admin-tabs">
      <div className="admin-tabs-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.icon && <span className="admin-tab-icon">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="admin-tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps) {
  if (id !== activeTab) return null;
  return <div className="admin-tab-panel">{children}</div>;
}
