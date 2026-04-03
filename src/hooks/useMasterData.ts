import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

export function useMasterData(type: string) {
  return useLiveQuery(
    () => db.master_categories
      .where('type').equals(type)
      .filter(cat => cat.isActive)
      .toArray(),
    [type]
  ) || [];
}
