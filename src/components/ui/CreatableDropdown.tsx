
import CreatableSelect from 'react-select/creatable';
import { db } from '../../lib/db';

export interface CreatableDropdownProps {
  value: string | null;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  categoryType: string;
  placeholder?: string;
  isDisabled?: boolean;
}

export const reactSelectClassNames = {
  control: ({ isFocused }: any) => 
    `w-full bg-white dark:bg-gray-800 border ${isFocused ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300 dark:border-gray-700'} rounded-lg px-2 shadow-sm transition-colors min-h-[42px]`,
  menu: () => "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 overflow-hidden z-[9999]",
  menuList: () => "p-1",
  option: ({ isFocused, isSelected }: any) => 
    `px-3 py-2 rounded-md cursor-pointer ${isSelected ? 'bg-blue-600 text-white' : isFocused ? 'bg-blue-50 dark:bg-gray-700/80 text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}`,
  singleValue: () => "text-gray-900 dark:text-white",
  input: () => "text-gray-900 dark:text-white",
  placeholder: () => "text-gray-500 dark:text-gray-400 m-0",
  indicatorSeparator: () => "bg-gray-200 dark:bg-gray-700 mx-1",
  dropdownIndicator: () => "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
  clearIndicator: () => "text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400",
  noOptionsMessage: () => "text-gray-500 dark:text-gray-400 p-2"
};

export default function CreatableDropdown({
  value,
  onChange,
  options,
  categoryType,
  placeholder = "Select or type...",
  isDisabled = false
}: CreatableDropdownProps) {

  // Selected object formatted for React-Select
  const selectedOption = value ? { label: value, value: value } : null;

  const handleCreate = async (inputValue: string) => {
    try {
      const trimmed = inputValue.trim();
      if (!trimmed) return;

      // Verify if it exists already in db
      const exists = await db.master_categories
        .where({ type: categoryType, name: trimmed })
        .count();

      if (exists === 0) {
        await db.master_categories.add({
          name: trimmed,
          type: categoryType,
          status: 'Active'
        });
      }
      
      // Update selected value in the parent form immediately after saving
      onChange(trimmed);
    } catch (e) {
      console.error("Failed to create master category dynamically:", e);
    }
  };

  return (
    <CreatableSelect
      isDisabled={isDisabled}
      isClearable
      isSearchable
      formatCreateLabel={(inputValue) => `Create "${inputValue}"`}
      options={options}
      value={selectedOption}
      placeholder={placeholder}
      onChange={(newValue: any) => {
        onChange(newValue ? newValue.value : '');
      }}
      onCreateOption={handleCreate}
      unstyled
      classNames={reactSelectClassNames}
    />
  );
}
