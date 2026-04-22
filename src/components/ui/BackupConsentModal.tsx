import { useState, useEffect } from 'react';
import { HardDriveDownload, AlertTriangle, Trash2, FolderOutput } from 'lucide-react';
import { db } from '../../lib/db';
import { useStateContext } from '../../context/StateContext';

type ConsentMode = 'initial' | 'reconfigure' | 'revoke';

interface BackupConsentEventDetail {
  mode: ConsentMode;
  backupPath?: string;
  existingConsent?: boolean;
}

export default function BackupConsentModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ConsentMode>('initial');
  const [backupPath, setBackupPath] = useState<string>('');
  const [existingConsent, setExistingConsent] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { identity } = useStateContext();

  useEffect(() => {
    const handleConsentEvent = (e: Event) => {
      const customEvent = e as CustomEvent<BackupConsentEventDetail>;
      setMode(customEvent.detail.mode);
      setBackupPath(customEvent.detail.backupPath || '');
      setExistingConsent(customEvent.detail.existingConsent ?? false);
      setHasAcknowledged(false);
      setIsOpen(true);
    };

    window.addEventListener('EA_BACKUP_CONSENT_REQUIRED', handleConsentEvent);
    return () => window.removeEventListener('EA_BACKUP_CONSENT_REQUIRED', handleConsentEvent);
  }, []);

  const handleAccept = async () => {
    if (!hasAcknowledged) return;
    setIsProcessing(true);

    try {
      // Log consent to audit trail with primitive details only
      const actionType = mode === 'revoke' ? 'SYSTEM_BACKUP_REVOKED' : 'SYSTEM_BACKUP_CONFIGURED';
      const auditDetails = {
        mode,
        ...(mode !== 'revoke' && { path: backupPath || '(Selected Directory)' })
      };

      await db.audit_logs.add({
        timestamp: new Date(),
        action: actionType,
        tableName: 'app_settings',
        pseudokey: (identity as any)?.pseudokey || (identity as any)?.username || 'SYSTEM',
        details: JSON.stringify(auditDetails)
      });

      if (mode === 'revoke') {
        // Store revocation state
        await db.app_settings.put({ key: 'autoDumpConsent', value: false });
        await db.app_settings.put({ key: 'consentTimestamp', value: null });
        await db.app_settings.put({ key: 'backupConfigured', value: false });
        await db.app_settings.put({ key: 'backupStatus', value: 'revoked' });
        await db.app_settings.put({ key: 'backupDirectoryHandle', value: null });

        // Notify caller
        window.dispatchEvent(new CustomEvent('EA_BACKUP_REVOKE_SUCCESS'));
      } else {
        // Store initial/reconfigure consent
        const now = new Date().toISOString();
        await db.app_settings.put({ key: 'autoDumpConsent', value: true });
        await db.app_settings.put({ key: 'consentTimestamp', value: now });

        // Notify caller to proceed with file system picker
        window.dispatchEvent(new CustomEvent('EA_BACKUP_CONSENT_ACCEPTED', {
          detail: { mode, timestamp: now }
        }));
      }

      setIsOpen(false);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to log backup consent to IDB:', error);
      setIsProcessing(false);
      alert('Security Audit Error: Failed to write to Audit Log. Operation aborted to maintain compliance.');
    }
  };

  const handleReject = () => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('EA_BACKUP_CONSENT_REJECTED'));
  };

  if (!isOpen) return null;

  const isDestructive = mode === 'revoke';
  const iconBgClass = isDestructive
    ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
    : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400';
  const Icon = isDestructive ? Trash2 : HardDriveDownload;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 rounded-xl shrink-0 ${iconBgClass}`}>
            <Icon size={28} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {mode === 'revoke' ? 'Revoke Local Backup Access' : 'Authorize Automated Local Backups'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {mode === 'revoke'
                ? 'Confirm removal of backup configuration'
                : existingConsent
                  ? 'Update backup directory'
                  : 'Initial setup for automated backups'}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="mb-8 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            {mode === 'revoke' ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Removing this configuration disables automated log pruning. Without a local backup path, your browser's internal database may eventually reach its storage quota, resulting in degraded application performance.
                </p>
                <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400 font-medium">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>This action cannot be easily reversed. You will need to reconfigure backup access if performance issues arise.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  By proceeding, you grant EA-NITI permission to automatically export and prune system audit logs to this local directory. This is required to optimize browser performance and prevent IndexedDB storage limits.
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc pl-5">
                  <li><strong>Purpose:</strong> Automated backup and pruning of audit logs</li>
                  <li><strong>Scope:</strong> System audit records only (no user data)</li>
                  <li><strong>Frequency:</strong> Background workers will manage this process</li>
                  <li><strong>Offline:</strong> All operations remain local to your device</li>
                </ul>
              </div>
            )}
          </div>

          {/* Acknowledgment Checkbox */}
          {!isProcessing && (
            <div className={`p-3 rounded-lg border ${isDestructive
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
              : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAcknowledged}
                  onChange={(e) => setHasAcknowledged(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className={`text-xs ${isDestructive
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-gray-700 dark:text-gray-300'}`}>
                  <strong>I acknowledge and consent to this configuration.</strong>{' '}
                  {mode === 'revoke'
                    ? 'I understand the performance risks of disabling backup pruning.'
                    : 'I understand this enables automated backup export to the local file system.'}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          {!isProcessing && (
            <button
              onClick={handleReject}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}

          <button
            onClick={handleAccept}
            disabled={!hasAcknowledged || isProcessing}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-transform active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${isDestructive
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'}`}
          >
            {isProcessing ? (
              <>
                <span className="animate-spin">⏳</span>
                Processing...
              </>
            ) : (
              <>
                {mode === 'revoke' ? <Trash2 size={18} /> : <FolderOutput size={18} />}
                {mode === 'revoke' ? 'Confirm Revocation' : 'Authorize Backup'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
