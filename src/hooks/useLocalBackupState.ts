import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { queryDirectoryPermission, type PermissionStatus } from '../lib/fileSystemPermissions';

export function useLocalBackupState() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [isPermissionCheckComplete, setIsPermissionCheckComplete] = useState(false);

  const settings = useLiveQuery(() =>
    db.app_settings.where('key').anyOf(
      'backupConfigured',
      'lastBackupDate',
      'backupPath',
      'backupStatus',
      'backupDirectoryHandle',
      'autoDumpConsent',
      'consentTimestamp'
    ).toArray()
  );

  const isConfigured = settings?.find(s => s.key === 'backupConfigured')?.value ?? false;
  const lastBackupDate = settings?.find(s => s.key === 'lastBackupDate')?.value ?? null;
  const backupPath = settings?.find(s => s.key === 'backupPath')?.value ?? null;
  const backupStatus = settings?.find(s => s.key === 'backupStatus')?.value ?? null;
  const backupDirectoryHandle = settings?.find(s => s.key === 'backupDirectoryHandle')?.value ?? null;
  const autoDumpConsent = settings?.find(s => s.key === 'autoDumpConsent')?.value ?? false;
  const consentTimestamp = settings?.find(s => s.key === 'consentTimestamp')?.value ?? null;

  // Check permission status on mount and when handle changes
  useEffect(() => {
    const checkPermission = async () => {
      if (backupDirectoryHandle && isConfigured) {
        try {
          const status = await queryDirectoryPermission(backupDirectoryHandle);
          setPermissionStatus(status);
        } catch (err) {
          console.warn('Failed to check backup directory permission:', err);
          setPermissionStatus('unknown');
        }
      } else {
        setPermissionStatus('unknown');
      }
      setIsPermissionCheckComplete(true);
    };

    checkPermission();
  }, [backupDirectoryHandle, isConfigured]);

  return {
    isConfigured,
    lastBackupDate,
    backupPath,
    backupStatus,
    backupDirectoryHandle,
    autoDumpConsent,
    consentTimestamp,
    permissionStatus,
    isPermissionCheckComplete,
    isPermissionSuspended: isConfigured && backupDirectoryHandle && (permissionStatus === 'prompt' || permissionStatus === 'denied')
  };
}