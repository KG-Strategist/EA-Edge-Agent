/**
 * File System Access API Permission Management
 * Handles verification and restoration of persistent directory handle permissions
 */

export type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * Query the current permission status of a FileSystemDirectoryHandle
 * @param handle - The FileSystemDirectoryHandle to query
 * @returns The current permission status
 */
export async function queryDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<PermissionStatus> {
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return permission as PermissionStatus;
  } catch (err) {
    console.warn('Failed to query directory permission:', err);
    return 'unknown';
  }
}

/**
 * Request permission for a FileSystemDirectoryHandle
 * **IMPORTANT:** This must be called directly from a user interaction (click event)
 * Browsers will block async permission requests.
 * @param handle - The FileSystemDirectoryHandle to request permission for
 * @returns True if permission was granted, false otherwise
 */
export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch (err) {
    console.error('Failed to request directory permission:', err);
    return false;
  }
}

/**
 * Check if a handle has active write permission
 * @param handle - The FileSystemDirectoryHandle to check
 * @returns True if the handle has granted write permission
 */
export async function hasActiveDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const status = await queryDirectoryPermission(handle);
  return status === 'granted';
}

/**
 * Verify permission and attempt restoration if needed
 * If permission is suspended (returns 'prompt' or 'denied'),
 * returns false to indicate restoration is needed
 * @param handle - The FileSystemDirectoryHandle to verify
 * @returns True if permission is currently granted, false if restoration needed
 */
export async function verifyAndRestorePermission(
  handle: FileSystemDirectoryHandle
): Promise<{ isGranted: boolean; status: PermissionStatus }> {
  const status = await queryDirectoryPermission(handle);
  return {
    isGranted: status === 'granted',
    status
  };
}
