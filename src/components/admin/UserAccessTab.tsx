import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LocalUser } from '../../lib/db';
import { Shield, Lock, CheckCircle, Plus, X, UserPlus, Globe, Server, Wifi } from 'lucide-react';
import { registerLocalUser, generatePseudonym } from '../../lib/authEngine';

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

const ROLE_OPTIONS = ['Lead EA', 'Security Admin', 'Viewer'] as const;

/** Derive display role from demographics.roleToken with safe fallback for pre-RBAC users. */
function getRole(user: LocalUser): string {
  return user.demographics?.roleToken || 'Lead EA';
}

/** Map role string to badge color classes. */
function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'Lead EA':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Security Admin':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
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

  // ── Create Profile State ───────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPseudonym, setNewPseudonym] = useState(() => generatePseudonym());
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<string>('Viewer');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleCreate = useCallback(async () => {
    if (!newPseudonym.trim() || !newPassword.trim() || !newPin.trim()) return;
    setIsCreating(true);
    setCreateError('');

    try {
      await registerLocalUser(
        newPseudonym.trim(),
        newPassword,
        newPin,
        [],
        undefined,
        { regionToken: 'LOCAL', roleToken: newRole }
      );
      setShowCreateModal(false);
      setNewPseudonym(generatePseudonym());
      setNewPassword('');
      setNewPin('');
      setNewRole('Viewer');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsCreating(false);
    }
  }, [newPseudonym, newPassword, newPin, newRole]);

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setCreateError('');
  };

  return (
    <div className="w-full max-w-5xl">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="text-blue-500" />
          User Access Management
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage local offline identities and authentication strategy (Zero-PII architecture).</p>
      </div>

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
            onClick={() => setShowCreateModal(true)}
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
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Created At</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users?.map(u => {
              const role = getRole(u);
              return (
                <tr key={u.pseudokey} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-5 py-4 font-mono font-medium text-gray-900 dark:text-white">{u.pseudokey}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleBadgeClass(role)}`}>
                      {role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 uppercase">{u.authMode}</td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider">Active</td>
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

      {/* ── Create Local Profile Modal ─────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={handleCloseModal}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserPlus size={18} className="text-blue-500" />
                Create Local Profile
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close modal" title="Close">
                <X size={18} />
              </button>
            </div>

            {/* Pseudonym */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Pseudonym</label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newPseudonym}
                onChange={e => setNewPseudonym(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                aria-label="Pseudonym"
                title="Pseudonym"
                placeholder="Pseudonym"
              />
              <button
                type="button"
                onClick={() => setNewPseudonym(generatePseudonym())}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors font-medium"
              >
                Regenerate
              </button>
            </div>

            {/* Role */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
              aria-label="Role"
              title="Role"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Password */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Strong password"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none mb-3"
            />

            {/* PIN */}
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">PIN (2FA)</label>
            <input
              type="password"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="4-8 digit PIN"
              maxLength={8}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none mb-2"
            />

            {createError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{createError}</p>}

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={handleCloseModal} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors">Cancel</button>
              <button
                id="save-local-profile-btn"
                onClick={handleCreate}
                disabled={!newPseudonym.trim() || !newPassword.trim() || !newPin.trim() || isCreating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isCreating ? 'Creating…' : 'Create Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
