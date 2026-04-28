import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, CustomAgent } from '../../lib/db';
import { CheckCircle2, AlertTriangle, Activity, Plus, Edit, Archive as ArchiveIcon, ToggleLeft, ToggleRight, Loader2, X, Zap, Bot } from 'lucide-react';
import CreatableDropdown from '../ui/CreatableDropdown';
import CacheButton from '../ui/CacheButton';
import { useMasterData } from '../../hooks/useMasterData';
import { useArchive } from '../../hooks/useArchive';
import DataTable from '../ui/DataTable';
import { SUPPORTED_MLC_MODELS } from '../../lib/constants';
import PageHeader from '../ui/PageHeader';
import { useNotification } from '../../context/NotificationContext';

interface BaseConfig {
  id: string;
  url: string;
  modelLibUrl?: string;
  context: number;
  isActive: boolean;
  agentCategory: string;
  engineType: string;
  personaInstruction: string;
  modelSourceMode: 'Remote URL' | 'Offline Sideloaded';
  baseApiEndpoint: string;
  modelSize?: string;
  isValidated?: boolean;
}

const getDynamicEndpoint = () => typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:11434` : 'http://localhost:11434';

export default function AgentConfigTab() {
  const { addNotification } = useNotification();
  const [hardwareWarning, setHardwareWarning] = useState<string | null>(null);


  const defaultPrimary: BaseConfig = { 
    id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC', 
    url: 'https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC', 
    modelLibUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    context: 8192,
    isActive: true,
    agentCategory: 'MOE (Mixture of Experts)',
    engineType: 'WebLLM (Browser Cache)',
    personaInstruction: 'You are EA-NITI. Elite, air-gapped Enterprise Architecture AI.',
    modelSourceMode: 'Remote URL',
    baseApiEndpoint: getDynamicEndpoint()
  };

  const defaultTriage: BaseConfig = { 
    id: 'gemma-2b-it-q4f16_1-MLC', 
    url: 'https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC', 
    modelLibUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    context: 4096,
    isActive: true,
    agentCategory: 'Tiny Triage',
    engineType: 'WebLLM (Browser Cache)',
    personaInstruction: 'You are a Triage Agent. Analyze and categorize input.',
    modelSourceMode: 'Remote URL',
    baseApiEndpoint: getDynamicEndpoint()
  };

  const [primaryConfig, setPrimaryConfig] = useState<BaseConfig>(defaultPrimary);
  const [triageConfig, setTriageConfig] = useState<BaseConfig>(defaultTriage);

  const [savedPrimary, setSavedPrimary] = useState<BaseConfig>(defaultPrimary);
  const [savedTriage, setSavedTriage] = useState<BaseConfig>(defaultTriage);

  const [primarySaveError, setPrimarySaveError] = useState<string | null>(null);
  const [triageSaveError, setTriageSaveError] = useState<string | null>(null);
  const [isSavingPrimary, setIsSavingPrimary] = useState(false);
  const [isSavingTriage, setIsSavingTriage] = useState(false);

  const defaultCategories = useMasterData('AGENT_CATEGORIES');
  const defaultEngineTypes = useMasterData('AGENT_ENGINE_TYPES');

  const logs = useLiveQuery(() => 
    db.audit_logs
      .where('tableName')
      .equals('agent_configs')
      .reverse()
      .toArray()
  ) || [];

  useEffect(() => {
    const loadCoreConfigs = async () => {
      const p = await db.app_settings.get('core-primary');
      if (p?.value) {
        setPrimaryConfig(p.value);
        setSavedPrimary(p.value);
      }
      const t = await db.app_settings.get('core-triage');
      if (t?.value) {
        setTriageConfig(t.value);
        setSavedTriage(t.value);
      }
    };
    loadCoreConfigs();
  }, []);

  const offlineModels = useLiveQuery(() => db.model_registry.filter(m => m.isLocalhost).toArray()) || [];
  const allCustomAgents = useLiveQuery(() => db.custom_agents.toArray()) || [];

  const { showArchived, setShowArchived, archiveItem } = useArchive({
    tableName: 'custom_agents',
    statusField: 'status',
    archivedValue: 'PURGED',
    activeValue: 'Active'
  });

  const filteredCustomAgents = allCustomAgents.filter(agent => {
    if (showArchived) return agent.status === 'PURGED';
    return agent.status !== 'PURGED';
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [modalConfig, setModalConfig] = useState<BaseConfig & { name: string }>({
    name: '',
    id: '',
    url: '',
    context: 4096,
    isActive: true,
    agentCategory: '',
    engineType: '',
    personaInstruction: '',
    modelSourceMode: 'Remote URL',
    baseApiEndpoint: getDynamicEndpoint()
  });

  const isPrimaryDirty = JSON.stringify(primaryConfig) !== JSON.stringify(savedPrimary);
  const isTriageDirty = JSON.stringify(triageConfig) !== JSON.stringify(savedTriage);

  useEffect(() => {
    const checkGPU = async () => {
      if (!(navigator as any).gpu) {
        setHardwareWarning("System Requirement Alert: WebGPU unavailable. Browser instability may occur.");
        return;
      }
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) {
          setHardwareWarning("System Requirement Alert: WebGPU adapter not found. Browser instability may occur.");
        }
      } catch (e) {
        setHardwareWarning("System Requirement Alert: Error requesting WebGPU. " + e);
      }
    };
    checkGPU();
  }, []);

  const handlePullWebCache = (modelId: string, modelUrl: string) => {
    if (!navigator.onLine) {
       alert("Air-gap mode active. Please use sideloaded models.");
       return;
    }
    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
        detail: { networkEnabled: true, targetModelId: modelId, targetModelUrl: modelUrl, modelSize: (modelId === primaryConfig.id ? primaryConfig.modelSize : triageConfig.modelSize) || 'Size: Varies (Check documentation)' } 
    }));
  };

  const validateAndSave = async (
    config: BaseConfig,
    dbKey: 'core-primary' | 'core-triage',
    label: string,
    setSaved: (c: BaseConfig) => void,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    setError(null);
    setLoading(true);

    let validationWarning: string | null = null;

    try {
      // TASK 1: TRUST THE INTERNAL REGISTRY
      // Check if the selected model is in our trusted registry (excluding the 'custom' placeholder)
      const isRegistryModel = SUPPORTED_MLC_MODELS.some(
        m => m.modelId === config.id && m.modelId !== 'custom'
      );

      // If it's a known-good registry model, skip all network validation entirely
      if (isRegistryModel) {
        // Instantly pass validation for registered models — no network probes
        validationWarning = null;
      } else if (config.modelSourceMode === 'Remote URL' && config.url) {
        // TASK 2: SOFT-FAIL CUSTOM VALIDATION
        // For custom URLs, attempt validation but never block the save on network failure
        try {
          const probe = await fetch(config.url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(8000)
          });

          // Check response validity (treating 405 as OK — some servers don't allow HEAD)
          if (!probe.ok && probe.status !== 405) {
            validationWarning = `Network validation returned HTTP ${probe.status}. Configuration saved anyway.`;
          }
        } catch {
          // CRUCIAL: Network/CORS failures are NOT fatal — user may be offline or CORS-blocked
          // Log a soft warning but ALWAYS proceed with the save
          validationWarning = 'Network validation failed or offline. Saving custom configuration anyway.';
        }
      }

      // SAVE ALWAYS SUCCEEDS (unless DB write fails)
      // Validation warnings are informational only and never block persistence
      const validated: BaseConfig = { ...config, isValidated: !validationWarning };
      await db.app_settings.put({ key: dbKey, value: validated });

      // Audit trail
      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: sessionStorage.getItem('ea_niti_session') || 'Unknown',
        action: 'UPDATE',
        tableName: 'agent_configs',
        recordId: label,
        details: `Updated Model ID to "${config.id}" (${config.agentCategory}) — Registry: ${isRegistryModel}, Validation: ${!validationWarning ? 'Passed' : 'Warning'}`
      });

      setSaved(validated);

      // TASK 2 (continued): Surface soft warning AFTER successful save (non-blocking)
      // User sees a yellow/amber toast, not a blocking red error
      if (validationWarning) {
        setError(validationWarning);
      }
    } catch (err: any) {
      // Only real errors (DB write failures, etc.) stop the flow
      setError(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrimary = () =>
    validateAndSave(primaryConfig, 'core-primary', 'Primary EA Agent', (v) => {
      setPrimaryConfig(v);
      setSavedPrimary(v);
    }, setPrimarySaveError, setIsSavingPrimary);

  const handleSaveTriage = () =>
    validateAndSave(triageConfig, 'core-triage', 'Tiny Triage Agent', (v) => {
      setTriageConfig(v);
      setSavedTriage(v);
    }, setTriageSaveError, setIsSavingTriage);

  const openAddAgentModal = () => {
    setEditingAgentId(null);
    setModalConfig({
      name: '',
      id: '',
      url: '',
      context: 4096,
      isActive: true,
      agentCategory: '',
      engineType: '',
      personaInstruction: '',
      modelSourceMode: 'Remote URL',
      baseApiEndpoint: getDynamicEndpoint()
    });
    setIsModalOpen(true);
  };

  const openEditAgentModal = (agent: CustomAgent) => {
    setEditingAgentId(agent.id!);
    setModalConfig({
      name: agent.name,
      id: agent.modelId,
      url: agent.modelUrl,
      context: agent.context,
      isActive: agent.isActive,
      agentCategory: agent.agentCategory,
      engineType: agent.engineType,
      personaInstruction: agent.personaInstruction,
      modelSourceMode: agent.modelSourceMode,
      baseApiEndpoint: agent.baseApiEndpoint
    });
    setIsModalOpen(true);
  };

  const saveCustomAgent = async () => {
    const payload: Partial<CustomAgent> = {
      name: modalConfig.name,
      isActive: modalConfig.isActive,
      agentCategory: modalConfig.agentCategory,
      engineType: modalConfig.engineType,
      personaInstruction: modalConfig.personaInstruction,
      modelSourceMode: modalConfig.modelSourceMode,
      modelId: modalConfig.id,
      modelUrl: modalConfig.url,
      baseApiEndpoint: modalConfig.baseApiEndpoint,
      context: modalConfig.context,
      status: 'Active',
      updatedAt: new Date()
    };

    if (editingAgentId) {
      await db.custom_agents.update(editingAgentId, payload);
    } else {
      payload.createdAt = new Date();
      await db.custom_agents.add(payload as CustomAgent);
    }
    setIsModalOpen(false);
  };

  const renderConfigForm = (
    config: BaseConfig, 
    setConfig: React.Dispatch<React.SetStateAction<BaseConfig>>,
    isDirty: boolean,
    onSave: () => void,
    saveLabel: string,
    cardSaving: boolean,
    cardError: string | null,
    clearError: () => void
  ) => (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Active Status</label>
        <button
          onClick={() => setConfig({ ...config, isActive: !config.isActive })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.isActive ? 'bg-blue-600' : 'bg-gray-400'}`}
          aria-label="Toggle Active Status"
          title="Toggle Active Status"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Agent Category</label>
        <CreatableDropdown
           value={config.agentCategory}
           onChange={(val) => setConfig({ ...config, agentCategory: val })}
           options={defaultCategories.map(o => ({ label: o.name, value: o.name }))}
           categoryType="AGENT_CATEGORIES"
           placeholder="Select Category..."
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Engine Type</label>
        <CreatableDropdown
           value={config.engineType}
           onChange={(val) => setConfig({ ...config, engineType: val })}
           options={defaultEngineTypes.map(o => ({ label: o.name, value: o.name }))}
           categoryType="AGENT_ENGINE_TYPES"
           placeholder="Select Engine..."
        />
      </div>

      <div>
         <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Persona Instruction</label>
         <textarea 
            value={config.personaInstruction} 
            onChange={e => setConfig({...config, personaInstruction: e.target.value})} 
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[80px]"
            aria-label="Persona Instruction"
            title="Persona Instruction"
            placeholder="Enter persona instructions..."
         />
      </div>

      {config.engineType === 'WebLLM (Browser Cache)' && (
         <>
             <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                   <input type="radio" checked={config.modelSourceMode === 'Remote URL'} onChange={() => setConfig({...config, modelSourceMode: 'Remote URL'})} />
                   Remote URL
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                   <input type="radio" checked={config.modelSourceMode === 'Offline Sideloaded'} onChange={() => setConfig({...config, modelSourceMode: 'Offline Sideloaded'})} />
                   Offline Sideloaded
                </label>
             </div>
             {config.modelSourceMode === 'Remote URL' ? (
                <>
                  <div>
                    <label htmlFor="model-registry-select" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Registry</label>
                    <select
                      id="model-registry-select"
                      value={SUPPORTED_MLC_MODELS.find(m => m.modelId === config.id) ? config.id : 'custom'}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Clear any validation errors when user changes the model selection
                        clearError();
                        if (val === 'custom') {
                          setConfig({ ...config, id: '', url: '', modelLibUrl: '' });
                        } else {
                          const registryMatch = SUPPORTED_MLC_MODELS.find(m => m.modelId === val);
                          if (registryMatch) {
                            setConfig({
                              ...config,
                              id: registryMatch.modelId,
                              url: registryMatch.modelUrl,
                              modelLibUrl: '',
                              context: registryMatch.contextLimit
                            });
                          }
                        }
                      }}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm mb-3"
                    >
                      {SUPPORTED_MLC_MODELS.map(m => (
                        <option key={m.modelId} value={m.modelId}>{m.label}</option>
                      ))}
                    </select>

                    {(!SUPPORTED_MLC_MODELS.find(m => m.modelId === config.id && m.modelId !== 'custom')) && (
                      <div className="mb-3">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Custom Model ID</label>
                        <input
                          type="text"
                          value={config.id}
                          onChange={(e) => {
                            setConfig({
                              ...config,
                              id: e.target.value
                            });
                          }}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm"
                          aria-label="Model ID"
                          title="Model ID"
                          placeholder="Enter explicit Model ID"
                        />
                      </div>
                    )}
                    
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model URL</label>
                    <div className="flex gap-2">
                      <input type="text" value={config.url} onChange={(e) => setConfig({...config, url: e.target.value})} className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" aria-label="Model URL" title="Model URL" placeholder="Enter model URL" />
                      <CacheButton 
                        modelId={config.id}
                        modelUrl={config.url}
                        onPull={handlePullWebCache}
                        disabled={isDirty}
                      />
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between mb-1">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">WASM Library URL (model_lib_url)</label>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1">
                           <Zap size={10} className="text-amber-500" />
                           {(() => {
                             const isPredefined = config.id !== 'custom' && SUPPORTED_MLC_MODELS.some(m => m.modelId === config.id && m.modelId !== 'custom');
                             return isPredefined ? 'Auto-Managed' : 'Manual Entry';
                           })()}
                        </span>
                      </div>

                      {(() => {
                        const isPredefined = config.id !== 'custom' && SUPPORTED_MLC_MODELS.some(m => m.modelId === config.id && m.modelId !== 'custom');

                        if (isPredefined) {
                          return (
                            <>
                              <input
                                type="text"
                                value="Auto-managed by WebLLM version match"
                                disabled={true}
                                readOnly={true}
                                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-gray-600 dark:text-gray-500 text-sm opacity-50 cursor-not-allowed"
                                aria-label="WASM Library URL"
                                title="WASM auto-managed for predefined registry models"
                              />
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 flex items-center gap-1.5">
                                <CheckCircle2 size={12} /> Registry model WASM managed by @mlc-ai/web-llm native matcherNo manual entry needed.
                              </p>
                            </>
                          );
                        }

                        return (
                          <>
                            <input
                              type="text"
                              value={config.modelLibUrl || ''}
                              onChange={(e) => setConfig({...config, modelLibUrl: e.target.value})}
                              className={`w-full bg-white dark:bg-gray-800 border rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm ${!config.modelLibUrl ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-700'}`}
                              aria-label="WASM Library URL"
                              title="Enter WASM Library URL for custom models"
                              placeholder="Enter WASM Library URL"
                            />
                            {!config.modelLibUrl && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1.5">
                                <AlertTriangle size={12} /> WASM Library URL is required for custom models.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </>
             ) : (
                <div>
                   <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Select Sideloaded Model</label>
                   <select 
                      value={config.id} 
                      onChange={e => setConfig({...config, id: e.target.value, url: offlineModels.find(m => m.name === e.target.value)?.modelUrl || ''})} 
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm"
                      aria-label="Select Sideloaded Model"
                      title="Select Sideloaded Model"
                   >
                     {offlineModels.length === 0 ? <option value="">No sideloaded models found...</option> : offlineModels.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                     ))}
                   </select>
                </div>
             )}
         </>
      )}

      {config.engineType === 'Local API (Ollama/Custom)' && (
         <div>
             <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Base API Endpoint</label>
             <input type="text" value={config.baseApiEndpoint} onChange={(e) => setConfig({...config, baseApiEndpoint: e.target.value})} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" aria-label="Base API Endpoint" title="Base API Endpoint" placeholder="Enter base API endpoint" />
         </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-2">Context Limit (Tokens)</label>
        <input type="number" value={config.context} onChange={(e) => setConfig({...config, context: parseInt(e.target.value) || 0})} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" aria-label="Context Limit" title="Context Limit" placeholder="Enter context limit" />
      </div>

      {cardError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 flex items-start gap-3 mt-2">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={14} />
          <p className="flex-1 text-xs text-red-700 dark:text-red-300 font-medium">{cardError}</p>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 transition-colors" aria-label="Dismiss error" title="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      <button 
        onClick={onSave}
        disabled={!isDirty || cardSaving}
        className={`w-full px-4 py-2 mt-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          cardSaving ? 'bg-blue-500 cursor-wait' :
          isDirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 dark:bg-green-700 cursor-not-allowed'
        }`}
      >
        {cardSaving && <Loader2 size={14} className="animate-spin" />}
        {cardSaving ? 'Validating…' : isDirty ? saveLabel : '✓ Config Saved'}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-6 overflow-y-auto">
      <PageHeader 
        icon={<Bot className="text-blue-500" />}
        title="Agent Configurations & Personas"
        description="Configure local LLM routing parameters and strict persona governance boundaries."
      />

      {hardwareWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3 shrink-0">
          <AlertTriangle className="text-amber-500 shrink-0" size={20} />
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            {hardwareWarning}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Primary EA Agent
              <CheckCircle2 size={16} className={primaryConfig.isActive ? "text-green-500" : "text-gray-400"} />
            </h3>
          </div>
          {renderConfigForm(
            primaryConfig, 
            setPrimaryConfig, 
            isPrimaryDirty, 
            handleSavePrimary, 
            'Save Primary Configuration',
            isSavingPrimary,
            primarySaveError,
            () => setPrimarySaveError(null)
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Tiny Triage Agent
              <CheckCircle2 size={16} className={triageConfig.isActive ? "text-green-500" : "text-gray-400"} />
            </h3>
          </div>
          {renderConfigForm(
            triageConfig, 
            setTriageConfig, 
            isTriageDirty, 
            handleSaveTriage, 
            'Save Triage Configuration',
            isSavingTriage,
            triageSaveError,
            () => setTriageSaveError(null)
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 pt-6"></div>

      {/* Custom Mitra Registry */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm shrink-0">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
             <h3 className="text-lg font-bold text-gray-900 dark:text-white">Custom Mitra Registry (Specialist Nodes)</h3>
          </div>
          <div className="flex items-center gap-4">
             <button
               onClick={() => setShowArchived(!showArchived)}
               className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
             >
               {showArchived ? <ToggleRight size={20} className="text-blue-500" /> : <ToggleLeft size={20} />}
               Show Archived
             </button>
             <button
               onClick={openAddAgentModal}
               className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
             >
               <Plus size={16} /> Add Custom Mitra
             </button>
          </div>
        </div>

        <DataTable<CustomAgent>
          data={filteredCustomAgents}
          keyField="id"
          pagination={true}
          itemsPerPage={10}
          searchable={true}
          searchPlaceholder="Search custom mitras..."
          searchFields={['name', 'agentCategory', 'engineType']}
          exportable={true}
          exportFilename="niti-agent-configs.json"
          onImport={async (parsedData) => {
            try {
              await db.custom_agents.bulkPut(parsedData);
              addNotification('Import successful!', 'success', 3000);
            } catch {
              addNotification('Import failed.', 'error');
            }
          }}
          columns={[
              {
                key: 'name',
                label: 'Mitra Name',
                sortable: true,
                render: (row) => <span className="font-semibold text-gray-900 dark:text-white">{row.name}</span>
              },
              {
                key: 'agentCategory',
                label: 'Category',
                sortable: true,
                render: (row) => <span className="text-gray-600 dark:text-gray-400">{row.agentCategory}</span>
              },
              {
                key: 'engineType',
                label: 'Engine',
                sortable: true,
                render: (row) => <span className="text-gray-600 dark:text-gray-400">{row.engineType}</span>
              },
              {
                key: 'isActive',
                label: 'Status',
                sortable: true,
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${row.isActive ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {row.status === 'PURGED' && <span className="inline-flex px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400">Purged</span>}
                  </div>
                )
              }
            ]}
            actions={[
              {
                label: 'Edit',
                icon: <Edit size={16} />,
                onClick: (row) => openEditAgentModal(row),
                className: 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
              },
              {
                label: 'Archive',
                icon: <ArchiveIcon size={16} />,
                onClick: (row) => archiveItem(row.id!),
                className: 'text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400'
              }
            ]}
            emptyMessage="No custom mitras found."
            containerClassName="flex flex-col"
          />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm shrink-0">
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <Activity className="text-gray-500 dark:text-gray-400" size={18} />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Configuration Event Logs</h3>
          </div>
        </div>
        <DataTable
          data={logs}
          keyField="id"
          pagination={true}
          itemsPerPage={10}
          searchable={true}
          searchPlaceholder="Search configuration events..."
          searchFields={['pseudokey', 'recordId', 'action', 'details']}
          exportable={true}
          exportFilename="niti-agent-logs.json"
          onImport={async (parsedData) => {
            try {
              await db.audit_logs.bulkPut(parsedData);
              addNotification('Import successful!', 'success', 3000);
            } catch {
              addNotification('Import failed.', 'error');
            }
          }}
          columns={[
              {
                key: 'timestamp',
                label: 'Timestamp',
                sortable: true,
                render: (row) => <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{new Date(row.timestamp).toLocaleString()}</span>
              },
              {
                key: 'pseudokey',
                label: 'Updated By',
                sortable: true,
                render: (row) => (
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                      {row.pseudokey.charAt(0).toUpperCase()}
                    </div>
                    {row.pseudokey}
                  </div>
                )
              },
              {
                key: 'recordId',
                label: 'Agent',
                sortable: true,
                render: (row) => <span className="whitespace-nowrap font-medium">{row.recordId}</span>
              },
              {
                key: 'action',
                label: 'Action',
                sortable: true,
                render: (row) => <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{row.action}</span>
              },
              {
                key: 'details',
                label: 'Details',
                sortable: true,
                render: (row) => <span className="text-gray-600 dark:text-gray-400 truncate max-w-sm">{row.details}</span>
              }
            ]}
            emptyMessage="No configuration changes recorded."
            containerClassName="flex flex-col"
          />
      </div>
      <div className="pb-4" />

      {/* Add / Edit Agent Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-800">
             <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                   {editingAgentId ? 'Edit Custom Mitra' : 'Add Custom Mitra'}
                </h3>
             </div>
             
             <div className="p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                   <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Mitra Name</label>
                   <input 
                     type="text" 
                     value={modalConfig.name} 
                     onChange={e => setModalConfig({ ...modalConfig, name: e.target.value })} 
                     placeholder="e.g. Code Reviewer"
                     className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm" 
                   />
                </div>
                {renderConfigForm(
                  modalConfig as BaseConfig,
                  setModalConfig as any,
                  true,
                  () => {}, // Empty, handle save below in modal buttons
                  "",
                  false,
                  null,
                  () => {}
                )}
             </div>

             <div className="p-5 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
               <button 
                 onClick={() => setIsModalOpen(false)}
                 className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-semibold text-sm transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={saveCustomAgent}
                 disabled={!modalConfig.name || !modalConfig.agentCategory || !modalConfig.engineType}
                 className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
               >
                 Save Mitra
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}