import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalUser } from '../../lib/db';
import { Shield, Lock, CheckCircle, Plus, X, UserPlus, Globe, Server, Wifi, Users, Edit2, Trash2 } from 'lucide-react';
import { registerLocalUser, generatePseudonym, createTempUserByAdmin, getCurrentUser } from '../../lib/authEngine';
import PageHeader from '../ui/PageHeader';

/** Static tier metadata (styling, labels). Active state is derived at render time. */
const TIER_META = [
  {
    id: 'standalone',
    matchMode: 'AIR_GAPPED' as const,
    label: 'Standalone Air-Gap',
    subtitle: 'Local Pseudonyms via Dexie',
    icon: Shield,
    plannedBadge: null,
  },
  {
    id: 'intranet',
    matchMode: null,
    label: 'Intranet Air-Gap',
    subtitle: 'On-Premise AD / LDAP',
    icon: Server,
    plannedBadge: 'v1.1',
  },
  {
    id: 'hybrid',
    matchMode: 'HYBRID' as const,
    label: 'Hybrid Cloud',
    subtitle: 'External SSO / SAML / OIDC',
    icon: Globe,
    plannedBadge: 'v1.2',
  },
] as const;

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

export default function UserAccessTab() {
  const users = useLiveQuery(() => db.users.toArray());

  // ── Derive auth mode from DB instead of hardcoding ─────────────────
  const globalSettings = useLiveQuery(() => db.global_settings.get('SSO_CONFIG'));
  const activeMode = globalSettings?.connection_mode ?? 'AIR_GAPPED';

  // ── Compute tier card states dynamically ───────────────────────────
  const tiers = useMemo(() =>
    TIER_META.map(tier => {
      // A tier is "active" if its matchMode equals the DB-derived activeMode.
      // Tiers with matchMode === null (intranet/LDAP) are always locked (no v1.0 support).
      const isActive = tier.matchMode !== null && tier.matchMode === activeMode;
      const isLocked = !isActive;

      return {
        ...tier,
        isActive,
        badge: isActive ? 'Active' : (tier.plannedBadge ?? 'Locked'),
        badgeColor: isActive
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : tier.id === 'intranet'
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
        borderColor: isActive
          ? 'border-green-400 dark:border-green-600'
          : 'border-gray-200 dark:border-gray-700',
        bgColor: isActive
          ? 'bg-green-50/50 dark:bg-green-900/10'
          : 'bg-gray-50/50 dark:bg-gray-800/30',
        isLocked,
      };
    }), [activeMode]);

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
  const initialRole = userToEdit?.demographics?.roleToken || 'Viewer';

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tiers.map(tier => {
            const TierIcon = tier.icon;
            return (
              <div
                key={tier.id}
                className={`relative rounded-lg border-2 p-4 transition-colors ${tier.borderColor} ${tier.bgColor} ${
                  tier.isLocked ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {/* Badge */}
                <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${tier.badgeColor}`}>
                  {tier.badge}
                </span>

                <div className="flex items-center gap-2.5 mb-2">
                  {tier.isActive
                    ? <CheckCircle size={18} className="text-green-500 shrink-0" />
                    : <Lock size={16} className="text-gray-400 shrink-0" />
                  }
                  <TierIcon size={16} className={tier.isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
                </div>
                <h4 className={`text-sm font-semibold ${tier.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  {tier.label}
                </h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{tier.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Local Identities Table ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registered Local Identities</h3>
          <button
            id="create-local-profile-btn"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Plus size={14} />
            Create Local Profile
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 dark:bg-gray-900/50">
            <tr>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Pseudonym</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Role</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Auth Mode</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Joined</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users?.map(u => {
              const role = getRole(u);
              const isPending = u.requiresPinSetup;
              const joinedDate = new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <tr key={u.pseudokey} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-5 py-4 font-mono font-medium text-gray-900 dark:text-white">{u.pseudokey}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleBadgeClass(role)}`}>
                      {role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 uppercase">{u.authMode}</td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">{joinedDate}</td>
                  <td className="px-5 py-4">
                    {isPending ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending Setup</span>
                    ) : u.isActive === false ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Deactivated</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="Edit Role"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => openDeleteModal(u)}
                        disabled={role === 'System Admin' && adminCount <= 1}
                        className={`p-1.5 transition-colors ${role === 'System Admin' && adminCount <= 1 ? 'opacity-50 cursor-not-allowed text-gray-400' : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'}`}
                        title={role === 'System Admin' && adminCount <= 1 ? "Cannot delete the last System Admin" : "Manage User Access"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!users || users.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">No local identities registered.</td>
              </tr>
            )}
          </tbody>
        </table>
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
                {userToDelete.isActive === false ? 'Reactivate Account' : 'Status: Soft Deactivation'}
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
                    : 'border border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-500/10'
                }`}
              >
                {isDeleting ? 'Processing...' : (userToDelete.isActive === false ? 'Reactivate User' : 'Deactivate User')}
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
