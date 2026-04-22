import PrinciplesTab from '../components/admin/PrinciplesTab';
import WebProvidersTab from '../components/admin/WebProvidersTab';
import LayersTab from '../components/admin/LayersTab';
import CategoriesTab from '../components/admin/CategoriesTab';
import MetamodelTab from '../components/admin/MetamodelTab';
import ServiceDomainsTab from '../components/admin/ServiceDomainsTab';
import TagsTab from '../components/admin/TagsTab';
import NetworkIntegrationTab from '../components/admin/NetworkIntegrationTab';
import PromptsTab from '../components/admin/PromptsTab';
import AgentConfigTab from '../components/admin/AgentConfigTab';
import WorkflowTab from '../components/admin/WorkflowTab';
import TemplatesTab from '../components/admin/TemplatesTab';
import SystemTab from '../components/admin/SystemTab';
import TrainingEventsTable from '../components/admin/TrainingEventsTable';
import UserAccessTab from '../components/admin/UserAccessTab';
import AuditWorkspaceTab from '../components/admin/AuditWorkspaceTab';
import GlobalGuardrailsTab from '../components/admin/GlobalGuardrailsTab';
import ModelSandboxTab from '../components/admin/ModelSandboxTab';

export default function AdminPanel({ adminSubView, setAdminSubView: _setAdminSubView }: { adminSubView: string, setAdminSubView: (v: string) => void }) {
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
            {activeTab === 'service-domains' && <ServiceDomainsTab />}
            {activeTab === 'tags' && <TagsTab />}
            {activeTab === 'prompts' && <PromptsTab />}
            {activeTab === 'configs' && <AgentConfigTab />}
            {activeTab === 'workflows' && <WorkflowTab />}
            {activeTab === 'templates' && <TemplatesTab />}
            {activeTab === 'network' && <NetworkIntegrationTab />}
            {activeTab === 'knowledge' && <TrainingEventsTable />}
            {activeTab === 'web-providers' && <WebProvidersTab />}
            {activeTab === 'system' && <SystemTab />}
            {activeTab === 'users' && <UserAccessTab />}
            {activeTab === 'audit' && <AuditWorkspaceTab setAdminSubView={_setAdminSubView} />}
            {activeTab === 'dpdp' && <GlobalGuardrailsTab />}
            {activeTab === 'models' && <ModelSandboxTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
