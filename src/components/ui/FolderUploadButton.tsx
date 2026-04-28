import React from 'react';
import { UploadCloud } from 'lucide-react';

interface FolderUploadButtonProps {
  onFolderSelect: (files: FileList) => void;
  isLoading?: boolean;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export default function FolderUploadButton({
  onFolderSelect,
  isLoading = false,
  label = 'Select Folder & Sideload',
  id = 'folder-upload-input',
  className = '',
  disabled = false
}: FolderUploadButtonProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFolderSelect(files);
      // Reset the value so the same folder can be selected again if needed
      e.target.value = '';
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <input
        type="file"
        id={id}
        onChange={handleChange}
        className="sr-only"
        // @ts-expect-error - webkitdirectory is non-standard but supported in most modern browsers
        webkitdirectory=""
        directory=""
        multiple
        disabled={disabled || isLoading}
      />
      <label
        htmlFor={id}
        className={`flex items-center justify-center h-8 transition-all duration-200 ease-in-out gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer ${
          disabled || isLoading
            ? 'bg-blue-400 cursor-not-allowed opacity-70'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        <UploadCloud size={16} />
        {isLoading ? 'Sideloading...' : label}
      </label>
    </div>
  );
}
