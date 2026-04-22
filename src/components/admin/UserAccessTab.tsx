import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalUser } from '../../lib/db';
import { Shield, Lock, CheckCircle, Plus, X, UserPlus, Globe, Server, Wifi, Users, Edit2, Trash2, FolderKey } from 'lucide-react';
import { generatePseudonym, createTempUserByAdmin, getCurrentUser } from '../../lib/authEngine';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';

const environmentMap: Record<string, string> = { 'AIR_GAPPED': 'Air-Gapped', 'HYBRID': 'Hybrid' };
const authMap: Record<string, string> = { 'S2FA': 'Standard 2FA', 'SSO': 'Enterprise SSO', 'LDAP': 'LDAP / Active Directory', 'OAUTH': 'Public OAuth' };

const ROLE_OPTIONS = ['System Admin', 'Lead EA', 'Viewer'] as const;

/** Derive display role from demographics.roleToken with safe fallback for pre-RBAC users. */
function getRole(user: any): string {
  const role = user.roleToken || user.demographics?.roleToken || user.role;
  if (role && ROLE_OPTIONS.includes(role as any)) {
    return role;
  }
  return 'System Admin';
}

/** Map role string to badge color classes. */
function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'System Admin':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'Lead EA':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Viewer':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
  }
}

/** Determine exact Global Nomenclature identity provider based on providerId */
function getUserIdentityProvider(user: LocalUser): 'Standard 2FA' | 'Enterprise SSO' | 'LDAP / Active Directory' | 'Public OAuth' {
  if (!user.providerId) return 'Standard 2FA';
  if (user.providerId.startsWith('enterprise-')) return 'Enterprise SSO';
  if (user.providerId.startsWith('ldap-')) return 'LDAP / Active Directory';
  return 'Public OAuth';
}

export default function UserAccessTab() {
  const users = useLiveQuery(() => db.users.toArray());

  // ── Derive auth mode from DB instead of hardcoding ─────────────────
  const globalSettings = useLiveQuery(() => db.global_settings.get('SSO_CONFIG'));

  const hasEnterpriseSSO = !!globalSettings?.local_enterprise_sso?.clientId;
  const hasLDAP = !!globalSettings?.local_ldap?.ldapUrl;
  const hasPublicSSO = globalSettings?.connection_mode === 'HYBRID' && globalSettings?.public_sso_enabled === true;

  const [activeFilter, setActiveFilter] = useState<'All' | 'Standard 2FA' | 'Enterprise SSO' | 'LDAP / Active Directory' | 'Public OAuth'>('All');

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (activeFilter === 'All') return users;
    return users.filter(u => getUserIdentityProvider(u) === activeFilter);
  }, [users, activeFilter]);



  const adminCount = users?.filter(u => getRole(u) === 'System Admin').length || 0;

  // ── Unified Modal State ────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<LocalUser | null>(null);

  // Danger Zone Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<LocalUser | null>(null);
  const [deleteValidation, setDeleteValidation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formPseudonym, setFormPseudonym] = useState(() => generatePseudonym());
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('Viewer');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Safe destructuring and nullish coalescing to prevent runtime crashes
  const currentUserId = userToEdit?.id ?? null;


  const openCreateModal = () => {
    setUserToEdit(null);
    setFormPseudonym(generatePseudonym());
    setFormPassword('');
    setFormRole('Viewer');
    setModalError('');
    setShowResetPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (user: LocalUser) => {
    setUserToEdit(user);
    setFormPseudonym(user.pseudokey);
    setFormPassword('');
    const currentRole = getRole(user);
    setFormRole(currentRole === 'UNKNOWN' ? 'Viewer' : currentRole);
    setModalError('');
    setShowResetPassword(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setUserToEdit(null);
    setModalError('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setModalError('');

    try {
      if (userToEdit && currentUserId) {
        // Edit flow
        const currentSessionPseudokey = getCurrentUser();
        const isSelfEdit = userToEdit.pseudokey === currentSessionPseudokey;
        const isDemoting = getRole(userToEdit) === 'System Admin' && formRole !== 'System Admin';

        if (isDemoting) {
          const systemAdmins = users?.filter(u => getRole(u) === 'System Admin') || [];
          if (systemAdmins.length <= 1) {
            alert("Security Violation: You are the final System Administrator. You cannot demote yourself without provisioning another Admin first.");
            throw new Error('Cannot demote the last System Admin.');
          }
          if (isSelfEdit) {
            const confirmed = window.confirm("WARNING: You are about to remove your own System Administrator privileges. This action is irreversible. Are you absolutely sure?");
            if (!confirmed) {
              setIsSaving(false);
              return;
            }
          }
        }

        const updates: any = {
          demographics: {
            ...userToEdit.demographics,
            regionToken: userToEdit.demographics?.regionToken || 'LOCAL',
            roleToken: formRole
          }
        };

        if (showResetPassword && formPassword.trim()) {
          const { hashSecret, generateSalt } = await import('../../lib/authEngine');
          const salt = generateSalt();
          const tempPasswordHash = await hashSecret(formPassword.trim(), salt);
          updates.salt = salt;
          updates.tempPasswordHash = tempPasswordHash;
          updates.requiresPinSetup = true;
          updates.passwordHash = '';
          updates.pinHash = '';
        }

        await db.users.update(currentUserId, updates);
      } else {
        // Create flow
        if (!formPseudonym.trim() || !formPassword.trim()) {
          throw new Error('Please fill in all required fields.');
        }
        await createTempUserByAdmin(
          formPseudonym.trim(),
          formPassword,
          formRole
        );
      }
      handleCloseModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = (user: LocalUser) => {
    if (getRole(user) === 'System Admin') {
      const systemAdmins = users?.filter(u => getRole(u) === 'System Admin') || [];
      if (systemAdmins.length <= 1) {
        alert('Security Violation: Cannot delete the last active System Administrator.');
        return;
      }
    }
    setUserToDelete(user);
    setDeleteValidation('');
    setIsDeleteModalOpen(true);
  };

  const handleDeleteClose = () => {
    setIsDeleteModalOpen(false);
    setUserToDelete(null);
    setDeleteValidation('');
  };

  const handleToggleActive = async (targetIsActive: boolean) => {
    if (!userToDelete?.id) throw new Error("Invalid user ID.");
    setIsDeleting(true);
    try {
      // Attempt standard partial update
      const updatedCount = await db.users.update(userToDelete.id, { isActive: targetIsActive });

      // Fallback for legacy records that reject uninitialized properties
      if (updatedCount === 0) {
        const existingUser = await db.users.get(userToDelete.id);
        if (!existingUser) throw new Error("User not found.");
        await db.users.put({ ...existingUser, isActive: targetIsActive });
      }

      // Trigger React state refresh to ensure UI synchronization
      // useLiveQuery will automatically trigger and re-fetch users from DB
      handleDeleteClose();
    } catch (error) {
      console.error("Dexie DB Error:", error);
      alert("Database Error: Failed to update user status.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeactivate = async () => {
    await handleToggleActive(false);
  };

  const handleReactivate = async () => {
    await handleToggleActive(true);
  };

  const handleHardDelete = async () => {
    if (!userToDelete?.id) return;
    setIsDeleting(true);
    try {
      const { executeHardDelete } = await import('../../lib/authEngine');
      await executeHardDelete(userToDelete.id, userToDelete.pseudokey);
      handleDeleteClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl">
      <PageHeader 
        icon={<Users className="text-blue-500" />}
        title="User Access Management"
        description="Manage local offline identities and authentication strategy (Zero-PII architecture)."
      />

      {/* ── Authentication & Identity Strategy Panel ────────────────── */}
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <Wifi size={15} className="text-blue-500" />
          Authentication & Identity Strategy
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          EA-NITI supports a 3-tier identity model. The active flow is determined by the deployment's Global Settings.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Standard 2FA */}
          <div className="relative rounded-lg border-2 p-4 transition-colors border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10">
            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Active</span>
            <div className="flex items-center gap-2.5 mb-2">
              <CheckCircle size={18} className="text-green-500 shrink-0" />
              <Shield size={16} className="text-green-600 dark:text-green-400" />
            </div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Standard 2FA</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Zero-Trust Local MFA</p>
          </div>

          {/* Enterprise SSO */}
          <div className={`relative rounded-lg border-2 p-4 transition-colors ${hasEnterpriseSSO ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60'}`}>
            <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${hasEnterpriseSSO ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{hasEnterpriseSSO ? 'Active' : 'Not Configured'}</span>
            <div className="flex items-center gap-2.5 mb-2">
              {hasEnterpriseSSO ? <CheckCircle size={18} className="text-green-500 shrink-0" /> : <Lock size={16} className="text-gray-400 shrink-0" />}
              <Server size={16} className={hasEnterpriseSSO ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
            </div>
            <h4 className={`text-sm font-semibold ${hasEnterpriseSSO ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Enterprise SSO</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Corporate Identity Federation</p>
          </div>

          {/* LDAP / Active Directory */}
          <div className={`relative rounded-lg border-2 p-4 transition-colors ${hasLDAP ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60'}`}>
            <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${hasLDAP ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{hasLDAP ? 'Active' : 'Not Configured'}</span>
            <div className="flex items-center gap-2.5 mb-2">
              {hasLDAP ? <CheckCircle size={18} className="text-green-500 shrink-0" /> : <Lock size={16} className="text-gray-400 shrink-0" />}
              <FolderKey size={16} className={hasLDAP ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
            </div>
            <h4 className={`text-sm font-semibold ${hasLDAP ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>LDAP / Active Directory</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Internal Directory Querying</p>
          </div>

          {/* Public OAuth */}
          <div className={`relative rounded-lg border-2 p-4 transition-colors ${hasPublicSSO ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60'}`}>
            <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${hasPublicSSO ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{hasPublicSSO ? 'Active' : 'Not Configured'}</span>
            <div className="flex items-center gap-2.5 mb-2">
              {hasPublicSSO ? <CheckCircle size={18} className="text-green-500 shrink-0" /> : <Lock size={16} className="text-gray-400 shrink-0" />}
              <Globe size={16} className={hasPublicSSO ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
            </div>
            <h4 className={`text-sm font-semibold ${hasPublicSSO ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Public OAuth</h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">External Identity Provider</p>
          </div>
        </div>
      </div>

      {/* ── Quick Filters ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setActiveFilter('All')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilter === 'All' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'}`}>All Identities</button>
        <button onClick={() => setActiveFilter('Standard 2FA')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilter === 'Standard 2FA' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'}`}>Standard 2FA</button>
        <button onClick={() => hasEnterpriseSSO && setActiveFilter('Enterprise SSO')} disabled={!hasEnterpriseSSO} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilter === 'Enterprise SSO' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : hasEnterpriseSSO ? 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50 dark:bg-gray-800 dark:text-purple-400 dark:border-purple-900/30 dark:hover:bg-purple-900/50' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60 cursor-not-allowed dark:bg-white/[0.02] dark:text-gray-600 dark:border-gray-800'}`}>Enterprise SSO</button>
        <button onClick={() => hasLDAP && setActiveFilter('LDAP / Active Directory')} disabled={!hasLDAP} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilter === 'LDAP / Active Directory' ? 'bg-amber-600 text-white border-amber-600 shadow-sm' : hasLDAP ? 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50 dark:bg-gray-800 dark:text-amber-400 dark:border-amber-900/30 dark:hover:bg-amber-900/50' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60 cursor-not-allowed dark:bg-white/[0.02] dark:text-gray-600 dark:border-gray-800'}`}>LDAP / Active Directory</button>
        <button onClick={() => hasPublicSSO && setActiveFilter('Public OAuth')} disabled={!hasPublicSSO} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilter === 'Public OAuth' ? 'bg-red-600 text-white border-red-600 shadow-sm' : hasPublicSSO ? 'bg-white text-red-700 border-red-200 hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-900/30 dark:hover:bg-red-900/50' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60 cursor-not-allowed dark:bg-white/[0.02] dark:text-gray-600 dark:border-gray-800'}`}>Public OAuth</button>
      </div>

      {/* ── Local Identities Table ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-blue-500" />
            Identity Directory
          </h4>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add Local Profile
          </button>
        </div>
        <DataTable
          data={filteredUsers}
          keyField="pseudokey"
          emptyMessage="No identities match the active filter or search query."
          searchable={true}
          searchPlaceholder="Search users..."
          searchFields={['pseudokey']}
          pagination={true}
          itemsPerPage={10}
          containerClassName="border-0 rounded-none shadow-none"
          columns={[
            {
              key: 'pseudokey',
              label: 'Pseudonym',
              render: (row) => <span className="font-mono font-medium text-gray-900 dark:text-white">{row.pseudokey}</span>
            },
            {
              key: 'role',
              label: 'Role',
              render: (row) => {
                const role = getRole(row);
                return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleBadgeClass(role)}`}>{role}</span>;
              }
            },
            {
              key: 'environment',
              label: 'Environment',
              render: (row) => <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{environmentMap[row.authMode || 'AIR_GAPPED'] || 'Unknown'}</span>
            },
            {
              key: 'idp',
              label: 'Identity Provider',
              render: (row) => {
                const idp = getUserIdentityProvider(row);
                return <span className="px-2 py-1 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 uppercase tracking-wider">{authMap[idp === 'Public OAuth' ? 'OAUTH' : idp === 'Enterprise SSO' ? 'SSO' : idp === 'LDAP / Active Directory' ? 'LDAP' : 'S2FA'] || 'Standard 2FA'}</span>;
              }
            },
            {
              key: 'joined',
              label: 'Joined',
              render: (row) => <span className="text-gray-500 dark:text-gray-400">{new Date(row.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            },
            {
              key: 'status',
              label: 'Status',
              render: (row) => {
                if (row.requiresPinSetup) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending Setup</span>;
                if (row.isActive === false) return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Suspended</span>;
                return <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>;
              }
            }
          ]}
          actions={[
            {
              label: 'Edit Role',
              icon: <Edit2 size={16} />,
              onClick: openEditModal,
              className: 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400',
              title: () => 'Edit Role'
            },
            {
              label: 'Manage User Access',
              icon: <Trash2 size={16} />,
              onClick: openDeleteModal,
              disabled: (row) => getRole(row) === 'System Admin' && adminCount <= 1,
              className: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400',
              title: (row) => getRole(row) === 'System Admin' && adminCount <= 1 ? "Cannot delete the last System Admin" : "Manage User Access"
            }
          ]}
        />
      </div>

      <div className="mt-4 px-2 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
        <span className="font-semibold uppercase tracking-wider">Federation Status:</span>
        <div className="flex gap-2">
          {hasEnterpriseSSO && <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-1 rounded font-bold">Enterprise SSO</span>}
          {hasLDAP && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded font-bold">LDAP</span>}
          {hasPublicSSO && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded font-bold">Public OAuth</span>}
          {!hasEnterpriseSSO && !hasLDAP && !hasPublicSSO && <span className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-2 py-1 rounded font-bold">Standard 2FA Only</span>}
        </div>
      </div>

      {/* ── Unified User Modal ───────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={handleCloseModal}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {userToEdit ? <Edit2 size={18} className="text-blue-500" /> : <UserPlus size={18} className="text-blue-500" />}
                {userToEdit ? 'Edit User Profile' : 'Add New Local Profile'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close modal" title="Close">
                <X size={18} />
              </button>
            </div>

            {userToEdit && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Account Status:</span>
                {userToEdit.requiresPinSetup ? (
                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending Setup</span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                )}
              </div>
            )}

            {/* Pseudonym */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Alias / Pseudokey</label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={formPseudonym}
                onChange={e => setFormPseudonym(e.target.value)}
                disabled={!!userToEdit}
                className={`flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono ${userToEdit ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75' : ''}`}
                aria-label="Pseudonym"
                title="Pseudonym"
                placeholder="Pseudonym"
              />
              {!userToEdit && (
                <button
                  type="button"
                  onClick={() => setFormPseudonym(generatePseudonym())}
                  className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors font-medium"
                >
                  Regenerate
                </button>
              )}
            </div>

            {/* Role */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={formRole}
              onChange={e => setFormRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3 font-mono"
              aria-label="Role"
              title="Role"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {!userToEdit ? (
              <>
                {/* Password */}
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Temporary Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder="Temporary password"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                />
              </>
            ) : (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                {!showResetPassword ? (
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Lock size={14} /> Reset User Credentials
                  </button>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <label className="block text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">New Temporary Password</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      placeholder="Enter new temporary password"
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none mb-2"
                    />
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                      This will revoke their current 2FA PIN and vault access. They must set a new PIN on next login.
                    </p>
                  </div>
                )}
              </div>
            )}

            {modalError && <p className="text-xs text-red-600 dark:text-red-400 mb-3 mt-3">{modalError}</p>}

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={handleCloseModal} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors">Cancel</button>
              <button
                id="save-local-profile-btn"
                onClick={handleSave}
                disabled={isSaving || (!userToEdit && (!formPseudonym.trim() || !formPassword.trim())) || (showResetPassword && !formPassword.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isSaving ? 'Saving…' : (userToEdit ? 'Save Profile' : 'Create Profile')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Danger Zone Modal ───────────────────────────────────────── */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={handleDeleteClose}>
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 rounded-xl p-6 w-[95%] max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield size={18} className="text-red-500" />
                Manage User Access: {userToDelete.pseudokey}
              </h3>
              <button onClick={handleDeleteClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            {/* Option 1: Toggle Deactivation/Reactivation */}
            <div className="mb-6 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                {userToDelete.isActive === false ? 'Restore Access' : 'Status: Soft Suspension'}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 tracking-tight">
                {userToDelete.isActive === false
                  ? "Restore this user's access and re-enable vault operations."
                  : 'Temporarily suspends the user\'s access while preserving their data vault and audit history.'
                }
              </p>
              <button
                onClick={userToDelete.isActive === false ? handleReactivate : handleDeactivate}
                disabled={isDeleting}
                className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  userToDelete.isActive === false
                    ? 'border border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-500/10'
                    : 'border border-amber-600 text-amber-600 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-500/10'
                }`}
              >
                {isDeleting ? 'Processing...' : (userToDelete.isActive === false ? 'Restore Access' : 'Suspend Access')}
              </button>
            </div>

            {/* Option 2: Hard Delete */}
            <div className="border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-500/10 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1.5">
                <Trash2 size={14} /> Danger Zone: Hard Delete
              </h4>
              <p className="text-xs text-red-600 dark:text-red-300 mb-3 tracking-tight leading-relaxed">
                <strong>Warning:</strong> This will permanently erase this user's vault and credentials. Historical logs will be anonymized.
              </p>
              
              <label className="block text-[11px] font-bold text-red-700 dark:text-red-400 mb-1 uppercase tracking-wider">
                Type &quot;DELETE-{userToDelete.pseudokey}&quot; to confirm
              </label>
              <input
                type="text"
                value={deleteValidation}
                onChange={e => setDeleteValidation(e.target.value)}
                placeholder={`DELETE-${userToDelete.pseudokey}`}
                className="w-full px-3 py-2 rounded border border-red-300 dark:border-red-800 bg-white dark:bg-black/30 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none mb-3 font-mono"
              />
              <button
                onClick={handleHardDelete}
                disabled={isDeleting || deleteValidation !== `DELETE-${userToDelete.pseudokey}`}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Permanent Hard Delete'}
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
