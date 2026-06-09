import React from 'react';
import { UploadCloud, HelpCircle } from 'lucide-react';

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  showHelp?: boolean;
}

export default function FileUploadButton({
  onFileSelect,
  isLoading = false,
  label = 'Sideload GGUF',
  id = 'file-upload-input',
  className = '',
  disabled = false,
  showHelp = true
}: FileUploadButtonProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.gguf')) {
        e.target.value = '';
        return;
      }
      onFileSelect(file);
      e.target.value = '';
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <input
        type="file"
        id={id}
        name={id}
        data-testid={id}
        onChange={handleChange}
        className="sr-only"
        accept=".gguf"
        disabled={disabled || isLoading}
        aria-label="Select a single GGUF file for OPFS sideloading"
      />
      <label
        htmlFor={id}
        data-testid={`${id}-label`}
        className={`flex items-center justify-center h-8 transition-all duration-200 ease-in-out gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer ${
          disabled || isLoading
            ? 'bg-blue-400 cursor-not-allowed opacity-70'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        title="Select a single GGUF model file (.gguf). The file will be stored locally in OPFS for offline inference."
      >
        <UploadCloud size={16} />
        {isLoading ? 'Sideloading...' : label}
      </label>
      {showHelp && !isLoading && (
        <span
          className="ml-1.5 text-gray-400 cursor-help"
          title="Select a single GGUF model file (.gguf). The file will be stored locally in OPFS for offline inference."
        >
          <HelpCircle size={14} />
        </span>
      )}
    </div>
  );
}
