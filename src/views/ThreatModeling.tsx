import React, { useState, useEffect } from 'react';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DataFlowComponent, ComponentType, StrideThreat, ThreatModel,
  analyzeComponentsForThreats, buildMermaidDFD, generateThreatModelPrompt,
  generateComponentId, getThreatStats, STRIDE_CATEGORIES, StrideCategoryKey
} from '../lib/threatEngine';
import { generateReview } from '../lib/aiEngine';
import SafeMermaid from '../components/ui/SafeMermaid';
import { Plus, Trash2, Shield, BrainCircuit, Save, Download, Loader2, Link2, AlertTriangle, X } from 'lucide-react';

const COMPONENT_TYPES: ComponentType[] = ['External Entity', 'Process', 'Data Store', 'Data Flow', 'Trust Boundary'];
const TYPE_ICONS: Record<ComponentType, string> = {
  'External Entity': '👤',
  'Process':         '⚙️',
  'Data Store':      '🗄️',
  'Data Flow':       '🔀',
  'Trust Boundary':  '🛡️',
};

export default function ThreatModeling() {
  const [projectName, setProjectName] = useState('');
  const [components, setComponents] = useState<DataFlowComponent[]>([]);
  const [threats, setThreats] = useState<StrideThreat[]>([]);
  const [mermaidDFD, setMermaidDFD] = useState('');
  const [linkedSessionId, setLinkedSessionId] = useState<number | undefined>();
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedReport, setEnrichedReport] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Form state for adding components
  const [showAddForm, setShowAddForm] = useState(false);
  const [newComp, setNewComp] = useState<{ name: string; type: ComponentType; description: string; connectsTo: string[] }>({
    name: '', type: 'Process', description: '', connectsTo: []
  });

  const reviewSessions = useLiveQuery(() => db.review_sessions.toArray()) || [];

  // Auto-analyze whenever components change
  useEffect(() => {
    if (components.length > 0) {
      const analyzed = analyzeComponentsForThreats(components);
      setThreats(analyzed);
      const dfd = buildMermaidDFD(components);
      setMermaidDFD(dfd);
    } else {
      setThreats([]);
      setMermaidDFD('');
    }
  }, [components]);

  const handleAddComponent = () => {
    if (!newComp.name.trim()) return;
    const component: DataFlowComponent = {
      id: generateComponentId(newComp.type),
      name: newComp.name.trim(),
      type: newComp.type,
      description: newComp.description.trim(),
      connectsTo: newComp.connectsTo,
    };
    setComponents(prev => [...prev, component]);
    setNewComp({ name: '', type: 'Process', description: '', connectsTo: [] });
    setShowAddForm(false);
  };

  const handleRemoveComponent = (id: string) => {
    setComponents(prev => {
      const filtered = prev.filter(c => c.id !== id);
      // Also remove connections pointing to deleted component
      return filtered.map(c => ({
        ...c,
        connectsTo: c.connectsTo.filter(cid => cid !== id)
      }));
    });
  };

  const handleEnrichWithAI = async () => {
    if (threats.length === 0) return;
    setIsEnriching(true);
    setEnrichedReport('');
    try {
      const principles = await db.architecture_principles.where('status').equals('Active').toArray();
      const model: ThreatModel = {
        projectName: projectName || 'Untitled',
        components,
        threats,
        mermaidDFD,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const prompt = generateThreatModelPrompt(model, principles);
      await generateReview(prompt, (text) => setEnrichedReport(text), 'EA Core Model');
    } catch (error: any) {
      if (!error.message?.includes('CONSENT_REQUIRED')) {
        console.error('AI Enrichment error:', error);
      }
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSave = async () => {
    if (!projectName.trim()) {
      setSaveMessage('Project name is required.');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }
    setIsSaving(true);
    try {
      await db.threat_models.add({
        projectName: projectName.trim(),
        sessionId: linkedSessionId,
        components: components as any[],
        threats: threats as any[],
        mermaidDFD,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setSaveMessage('Threat model saved to local database.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      setSaveMessage('Failed to save threat model.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportMarkdown = () => {
    const stats = getThreatStats(threats);
    let md = `# STRIDE Threat Model: ${projectName || 'Untitled'}\n\n`;
    md += `**Generated:** ${new Date().toISOString()}\n\n`;
    md += `## Data Flow Diagram\n\n\`\`\`mermaid\n${mermaidDFD}\n\`\`\`\n\n`;
    md += `## Components (${components.length})\n\n`;
    md += `| ID | Name | Type | Description |\n|-----|------|------|-------------|\n`;
    components.forEach(c => { md += `| ${c.id} | ${c.name} | ${c.type} | ${c.description} |\n`; });
    md += `\n## STRIDE Threat Analysis (${threats.length} threats)\n\n`;
    (['S','T','R','I','D','E'] as StrideCategoryKey[]).forEach(cat => {
      const catThreats = threats.filter(t => t.category === cat);
      if (catThreats.length === 0) return;
      md += `### ${STRIDE_CATEGORIES[cat].name} (${catThreats.length})\n\n`;
      md += `| Component | Severity | Description | Mitigation |\n|-----------|----------|-------------|------------|\n`;
      catThreats.forEach(t => { md += `| ${t.componentName} | ${t.severity} | ${t.description} | ${t.mitigation} |\n`; });
      md += '\n';
    });
    if (enrichedReport) {
      md += `## AI-Enriched Analysis\n\n${enrichedReport}\n`;
    }
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STRIDE_${(projectName || 'threat_model').replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const threatStats = getThreatStats(threats);

  return (
    <div className="w-full pb-20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">STRIDE Threat Modeling</h2>
        <p className="text-gray-600 dark:text-gray-400">Build Data Flow Diagrams and auto-generate STRIDE-based threat analysis locally.</p>
      </div>

      {/* Header Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6 shadow-sm dark:shadow-none">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Project Name</label>
            <input
              type="text" value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="e.g., Payment Gateway Redesign"
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Attach to Review Session (Optional)</label>
            <select
              value={linkedSessionId || ''}
              onChange={e => setLinkedSessionId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Standalone (no session)</option>
              {reviewSessions.map(s => (
                <option key={s.id} value={s.id}>{s.projectName} ({s.type})</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
            <button onClick={handleExportMarkdown} disabled={threats.length === 0} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
              <Download size={14} /> Export .md
            </button>
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Component Builder */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm dark:shadow-none">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">DFD Components ({components.length})</h3>
              <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">
                {showAddForm ? <X size={12} /> : <Plus size={12} />} {showAddForm ? 'Cancel' : 'Add'}
              </button>
            </div>

            {showAddForm && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                <input type="text" value={newComp.name} onChange={e => setNewComp({ ...newComp, name: e.target.value })}
                  placeholder="Component name" className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none" />
                <select value={newComp.type} onChange={e => setNewComp({ ...newComp, type: e.target.value as ComponentType })}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none">
                  {COMPONENT_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                </select>
                <textarea value={newComp.description} onChange={e => setNewComp({ ...newComp, description: e.target.value })}
                  placeholder="Description..." className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none resize-none h-14" />
                {components.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Connects to:</label>
                    <div className="flex flex-wrap gap-1">
                      {components.map(c => (
                        <button key={c.id} onClick={() => {
                          setNewComp(prev => ({
                            ...prev,
                            connectsTo: prev.connectsTo.includes(c.id)
                              ? prev.connectsTo.filter(id => id !== c.id)
                              : [...prev.connectsTo, c.id]
                          }));
                        }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${newComp.connectsTo.includes(c.id) ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={handleAddComponent} disabled={!newComp.name.trim()} className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors">
                  Add Component
                </button>
              </div>
            )}

            {/* Component List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {components.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">Add components to start building the DFD.</p>
              ) : (
                components.map(c => (
                  <div key={c.id} className="flex items-start gap-2 p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 group">
                    <span className="text-sm mt-0.5">{TYPE_ICONS[c.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</div>
                      <div className="text-[10px] text-gray-500 uppercase">{c.type}</div>
                      {c.connectsTo.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400">
                          <Link2 size={8} />
                          {c.connectsTo.map(tid => components.find(tc => tc.id === tid)?.name || tid).join(', ')}
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleRemoveComponent(c.id)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* STRIDE Stats */}
          {threats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm dark:shadow-none">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> Threat Summary
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {(['S','T','R','I','D','E'] as StrideCategoryKey[]).map(cat => (
                  <div key={cat} className={`px-2.5 py-2 rounded-lg text-center ${STRIDE_CATEGORIES[cat].color}`}>
                    <div className="text-lg font-bold">{threatStats[cat].count}</div>
                    <div className="text-[9px] uppercase font-semibold leading-tight">{STRIDE_CATEGORIES[cat].name}</div>
                    {threatStats[cat].critical > 0 && (
                      <div className="text-[8px] mt-0.5 font-bold text-red-600">
                        {threatStats[cat].critical} Critical
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleEnrichWithAI}
                disabled={isEnriching || threats.length === 0}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isEnriching ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                {isEnriching ? 'Analyzing...' : 'Enrich with AI'}
              </button>
            </div>
          )}
        </div>

        {/* Center + Right Panel: DFD + Threats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Auto-DFD */}
          {mermaidDFD && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Live Data Flow Diagram</h3>
              <SafeMermaid chart={mermaidDFD} />
            </div>
          )}

          {/* STRIDE Threats Table */}
          {threats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} /> STRIDE Threat Register ({threats.length})
                </h3>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">ID</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Category</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Component</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400">Severity</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 min-w-[250px]">Description</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 dark:text-gray-400 min-w-[250px]">Mitigation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threats.map(t => (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2.5 font-mono text-gray-500">{t.id}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${STRIDE_CATEGORIES[t.category].color}`}>
                            {t.categoryName}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{t.componentName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.severity === 'Critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            t.severity === 'High' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                            t.severity === 'Medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                            'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                          }`}>
                            {t.severity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{t.description}</td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{t.mitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Enriched Report */}
          {enrichedReport && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-700/50 p-6 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <BrainCircuit size={14} /> AI-Enriched Threat Analysis
              </h3>
              <div className="prose dark:prose-invert max-w-none text-sm">
                <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-sans text-xs leading-relaxed bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  {enrichedReport}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
