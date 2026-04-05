import React, { useState, useRef } from 'react';
import { UploadCloud, ChevronRight, ChevronLeft, Download, FileSpreadsheet, File as FileIcon, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStateContext } from '../context/StateContext';
import { generateDDQ } from '../lib/ddqEngine';
import { db } from '../lib/db';
import { useMasterData } from '../hooks/useMasterData';

export default function ReviewIntake() {
  const { activeBianDomains, activeTags } = useStateContext();
  const reviewTypes = useMasterData('Review Type');
  const appTiers = useMasterData('Application Tier');
  const hostingModels = useMasterData('Hosting Model');
  
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    projectName: '',
    type: '',
    appTier: '',
    hostingModel: '',
    bianDomainId: '',
    tags: [] as string[],
  });
  
  const [vendorDdqFiles, setVendorDdqFiles] = useState<File[]>([]);
  const [architectureFiles, setArchitectureFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTagToggle = (tagName: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagName) 
        ? prev.tags.filter(t => t !== tagName)
        : [...prev.tags, tagName]
    }));
  };

  const handleGenerateDDQ = () => {
    if (!formData.projectName) {
      alert("Please enter a project name first.");
      return;
    }
    generateDDQ(formData.projectName, formData.type, formData.tags, formData.appTier, formData.hostingModel);
  };

  const handleDdqUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => f.name.endsWith('.xlsx'));
    
    if (validFiles.length > 0) {
      setVendorDdqFiles(prev => [...prev, ...validFiles]);
    } else {
      alert("Please upload valid .xlsx DDQ files.");
    }
  };

  const removeDdqFile = (index: number) => {
    setVendorDdqFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateAndAddFiles = (files: File[]) => {
    setFileError('');
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml'];
    const validFiles: File[] = [];
    let hasInvalid = false;

    files.forEach(file => {
      if (allowedTypes.includes(file.type)) {
        validFiles.push(file);
      } else {
        hasInvalid = true;
      }
    });

    if (hasInvalid) {
      setFileError('Some files were rejected. Only .pdf, .png, .jpg, and .svg are allowed.');
    }

    if (validFiles.length > 0) {
      setArchitectureFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    validateAndAddFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
    }
  };

  const removeArchitectureFile = (index: number) => {
    setArchitectureFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    try {
      const activeWorkflow = await db.review_workflows
        .filter(wf => wf.triggerReviewType === formData.type && wf.status === 'Active')
        .first();

      await db.review_sessions.add({
        projectName: formData.projectName || 'Untitled Project',
        type: formData.type,
        workflowId: activeWorkflow?.id,
        currentStageIndex: 0,
        bianDomainId: formData.bianDomainId ? parseInt(formData.bianDomainId) : null,
        tags: formData.tags,
        status: 'Draft',
        ddqBlobs: vendorDdqFiles.map(f => ({ name: f.name, type: f.type, blob: f })),
        architectureBlobs: architectureFiles.map(f => ({ name: f.name, type: f.type, blob: f })),
        createdAt: new Date()
      });
      setIsSaved(true);
    } catch (error) {
      console.error("Failed to save draft:", error);
      alert("Failed to save draft. Check console for details.");
    }
  };

  if (isSaved) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Draft Saved Successfully</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">Your review session has been securely saved to the local database.</p>
        <button 
          onClick={() => {
            setStep(1);
            setFormData({ projectName: '', type: '', appTier: '', hostingModel: '', bianDomainId: '', tags: [] });
            setVendorDdqFiles([]);
            setArchitectureFiles([]);
            setIsSaved(false);
          }}
          className="px-6 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
        >
          Start New Review
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-20">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Review Intake Wizard</h2>
        <p className="text-gray-600 dark:text-gray-400">Submit new architecture artifacts for automated review.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-gray-200 dark:bg-gray-800 -z-10"></div>
        {[1, 2, 3].map(s => (
          <div key={s} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
            {s}
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 min-h-[400px] shadow-sm dark:shadow-none">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Step 1: Context & Metadata</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Name</label>
              <input 
                type="text" 
                value={formData.projectName}
                onChange={e => setFormData({...formData, projectName: e.target.value})}
                placeholder="e.g., Core Banking Migration"
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Review Type</label>
                <select 
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value})}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Review Type...</option>
                  {reviewTypes.map(rt => (
                    <option key={rt.id} value={rt.name}>{rt.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">BIAN Domain</label>
                <select 
                  value={formData.bianDomainId}
                  onChange={e => setFormData({...formData, bianDomainId: e.target.value})}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Domain...</option>
                  {activeBianDomains.map(domain => (
                    <option key={domain.id} value={domain.id}>{domain.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Application Tier</label>
                <select 
                  value={formData.appTier}
                  onChange={e => setFormData({...formData, appTier: e.target.value})}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Tier...</option>
                  {appTiers.map(tier => (
                    <option key={tier.id} value={tier.name}>{tier.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hosting Model</label>
                <select 
                  value={formData.hostingModel}
                  onChange={e => setFormData({...formData, hostingModel: e.target.value})}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="">Select Hosting Model...</option>
                  {hostingModels.map(model => (
                    <option key={model.id} value={model.name}>{model.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tags</label>
              <div className="flex flex-wrap gap-2">
                {activeTags.map(tag => {
                  const isSelected = formData.tags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagToggle(tag.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        isSelected 
                          ? `border-blue-500 ${tag.colorCode}` 
                          : 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Step 2: DDQ Gate</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Generate a dynamic Due Diligence Questionnaire based on your project context, have the vendor fill it out, and upload it back here.</p>
            
            <div className="p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-gray-900 dark:text-white font-medium mb-1">1. Generate Questionnaire</h4>
                <p className="text-sm text-gray-500">Creates a customized .xlsx file.</p>
              </div>
              <button 
                onClick={handleGenerateDDQ}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Download size={18} />
                Download DDQ
              </button>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-gray-900 dark:text-white font-medium mb-1">2. Upload Completed DDQ</h4>
                  <p className="text-sm text-gray-500">Upload the vendor's response (.xlsx)</p>
                </div>
                <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors cursor-pointer">
                  <UploadCloud size={18} />
                  Browse Files
                  <input type="file" accept=".xlsx" multiple className="hidden" onChange={handleDdqUpload} />
                </label>
              </div>
              
              {vendorDdqFiles.length > 0 && (
                <div className="space-y-2">
                  {vendorDdqFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <FileSpreadsheet className="text-green-600 dark:text-green-400" size={24} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => removeDdqFile(idx)} className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Step 3: Architecture Artifacts</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Upload BDAT diagrams, network topologies, or architecture documents.</p>

            {fileError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm mb-4">
                <AlertCircle size={16} />
                {fileError}
              </div>
            )}

            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 flex flex-col items-center justify-center text-center hover:border-blue-500 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mb-4">
                <UploadCloud size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Drag & Drop Artifacts</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Strictly accepts .pdf, .png, .jpg, and .svg files.
              </p>
              <input 
                type="file" 
                multiple 
                accept=".pdf,.png,.jpg,.jpeg,.svg" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
            </div>

            {architectureFiles.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Uploaded Artifacts ({architectureFiles.length})</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {architectureFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                      <FileIcon className="text-blue-600 dark:text-blue-400" size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button onClick={() => removeArchitectureFile(idx)} className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between mt-8">
        <button 
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg font-medium transition-colors shadow-sm dark:shadow-none"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        
        {step < 3 ? (
          <button 
            onClick={() => setStep(Math.min(3, step + 1))}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm dark:shadow-none"
          >
            Next Step
            <ChevronRight size={18} />
          </button>
        ) : (
          <button 
            onClick={handleSaveDraft}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors shadow-sm dark:shadow-none"
          >
            Save to Drafts
            <CheckCircle2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
