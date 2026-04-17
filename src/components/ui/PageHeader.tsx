import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function PageHeader({ icon, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="shrink-0">{icon}</span>
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          {description}
        </p>
      </div>
      {action && (
        <div className="flex items-center gap-3 shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
