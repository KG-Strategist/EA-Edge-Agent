import React, { useState } from 'react';
import PrinciplesTab from '../components/admin/PrinciplesTab';
import LayersTab from '../components/admin/LayersTab';
import CategoriesTab from '../components/admin/CategoriesTab';
import MetamodelTab from '../components/admin/MetamodelTab';
import BianTab from '../components/admin/BianTab';
import TagsTab from '../components/admin/TagsTab';
import NetworkIntegrationTab from '../components/admin/NetworkIntegrationTab';
import PromptsTab from '../components/admin/PromptsTab';
import WorkflowTab from '../components/admin/WorkflowTab';
import TemplatesTab from '../components/admin/TemplatesTab';
import SystemTab from '../components/admin/SystemTab';
import TrainingEventsTable from '../components/admin/TrainingEventsTable';
import UserAccessTab from '../components/admin/UserAccessTab';
import AuditWorkspaceTab from '../components/admin/AuditWorkspaceTab';
import DpdpTab from '../components/admin/DpdpTab';
import ModelSandboxTab from '../components/admin/ModelSandboxTab';

export default function AdminPanel({ adminSubView, setAdminSubView }: { adminSubView: string, setAdminSubView: (v: string) => void }) {
  const activeTab = adminSubView;

  return (
    <div className="w-full h-full flex flex-col overflow-x-hidden">
      <div className="flex flex-col h-full flex-1 min-h-0">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0 min-w-0 shadow-sm dark:shadow-none overflow-hidden">
          <div className="flex-1 overflow-x-hidden min-h-0 p-5 md:p-8">
            {activeTab === 'categories' && <CategoriesTab />}
            {activeTab === 'metamodel' && <MetamodelTab />}
            {activeTab === 'layers' && <LayersTab />}
            {activeTab === 'principles' && <PrinciplesTab />}
            {activeTab === 'bian' && <BianTab />}
            {activeTab === 'tags' && <TagsTab />}
            {activeTab === 'prompts' && <PromptsTab />}
            {activeTab === 'workflows' && <WorkflowTab />}
            {activeTab === 'templates' && <TemplatesTab />}
            {activeTab === 'network' && <NetworkIntegrationTab />}
            {activeTab === 'knowledge' && <TrainingEventsTable />}
            {activeTab === 'system' && <SystemTab />}
            {activeTab === 'users' && <UserAccessTab />}
            {activeTab === 'audit' && <AuditWorkspaceTab />}
            {activeTab === 'dpdp' && <DpdpTab />}
            {activeTab === 'models' && <ModelSandboxTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
