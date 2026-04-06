import React from 'react';
import { LucideIcon } from 'lucide-react';

// Stat Card Widget
export function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  colorClass = 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30'
}: {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: string; isPositive: boolean };
  colorClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between h-full hover:border-blue-200 dark:hover:border-blue-800/50 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
        {Icon && (
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      <div>
        <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
        {trend && (
          <div className="mt-2 text-xs flex items-center gap-1">
            <span className={trend.isPositive ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 font-medium'}>
              {trend.value}
            </span>
            <span className="text-gray-400">vs last period</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple Native SVG Bar Chart Widget
export function NativeBarChart({
  title,
  data,
  colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
}: {
  title: string;
  data: { label: string; value: number }[];
  colors?: string[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm h-full min-h-[250px] flex items-center justify-center text-sm text-gray-400">
        No Data for {title}
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm h-full min-h-[250px] flex flex-col">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-6">{title}</h3>
      <div className="flex-1 flex items-end gap-2 md:gap-4 h-full pt-4">
        {data.map((item, idx) => {
          const heightPct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
              <div className="relative w-full flex justify-center h-full items-end pb-1">
                <div 
                   className="w-full max-w-[40px] rounded-t-md transition-all duration-500 ease-out relative group-hover:opacity-80"
                   style={{ 
                     height: `${heightPct}%`, 
                     backgroundColor: colors[idx % colors.length],
                     minHeight: item.value > 0 ? '4px' : '0' 
                   }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-[10px] py-1 px-2 rounded font-medium shadow-xl pointer-events-none transition-opacity whitespace-nowrap z-10">
                    {item.value}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mt-2 truncate w-full text-center px-1 font-medium select-none" title={item.label}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Simple Native SVG Target Progress ring (Donut logic)
export function NativeProgressRing({
  title,
  value,
  max,
  label,
  colorClass = "text-emerald-500"
}: {
  title: string;
  value: number;
  max: number;
  label: string;
  colorClass?: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const safeMax = max > 0 ? max : 1;
  const percentage = (value / safeMax) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm h-full flex flex-col justify-between items-center min-h-[250px]">
      <div className="w-full text-left">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      </div>
      <div className="relative flex items-center justify-center flex-1 w-full">
        <svg className="w-32 h-32 -rotate-90 transform">
          <circle 
            className="text-gray-100 dark:text-gray-700" 
            strokeWidth="8" 
            stroke="currentColor" 
            fill="transparent" 
            r={radius} 
            cx="64" 
            cy="64" 
          />
          <circle 
            className={`${colorClass} transition-all duration-1000 ease-out`} 
            strokeWidth="8" 
            strokeDasharray={circumference} 
            strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round" 
            stroke="currentColor" 
            fill="transparent" 
            r={radius} 
            cx="64" 
            cy="64" 
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{label}</span>
        </div>
      </div>
    </div>
  );
}
