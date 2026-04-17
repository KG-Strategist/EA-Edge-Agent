

export const GLOBAL_STATUS_OPTIONS = ['Draft', 'Active', 'Needs Review', 'Deprecated'] as const;
export type GlobalStatus = typeof GLOBAL_STATUS_OPTIONS[number];

interface StatusSelectProps {
  value: string;
  onChange?: (val: string) => void;
  name?: string;
  className?: string;
}

export default function StatusSelect({ value, onChange, name = 'status', className = '' }: StatusSelectProps) {
  return (
    <select 
      name={name}
      defaultValue={onChange ? undefined : value}
      value={onChange ? value : undefined} 
      onChange={(e) => onChange && onChange(e.target.value)} 
      className={`w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors ${className}`}
    >
      {GLOBAL_STATUS_OPTIONS.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
