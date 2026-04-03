import React, { useState } from 'react';
import PrinciplesTab from '../components/admin/PrinciplesTab';
import LayersTab from '../components/admin/LayersTab';
import CategoriesTab from '../components/admin/CategoriesTab';
import MetamodelTab from '../components/admin/MetamodelTab';
import BianTab from '../components/admin/BianTab';
import TagsTab from '../components/admin/TagsTab';
import NetworkIntegrationTab from '../components/admin/NetworkIntegrationTab';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('layers');

  const tabs = [
    { id: 'layers', label: 'Architecture Layers' },
    { id: 'principles', label: 'Architecture Principles' },
    { id: 'bian', label: 'BIAN Domains' },
    { id: 'metamodel', label: 'Content Metamodel' },
    { id: 'categories', label: 'Master Categories' },
    { id: 'tags', label: 'Tags' },
    { id: 'network', label: 'Network & Privacy' },
  ];

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Control Panel</h2>
      
      <div className="flex flex-col h-full flex-1 min-h-0">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0 shadow-sm dark:shadow-none">
          <div className="border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 pt-4 flex gap-4 md:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 text-sm font-medium transition-colors relative whitespace-nowrap ${
                  activeTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-500 rounded-t-full" />
                )}
              </button>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-24">
            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'metamodel' && <MetamodelTab />}
            {activeTab === 'layers' && <LayersTab />}
            {activeTab === 'principles' && <PrinciplesTab />}
            {activeTab === 'bian' && <BianTab />}
            {activeTab === 'tags' && <TagsTab />}
            {activeTab === 'network' && <NetworkIntegrationTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
