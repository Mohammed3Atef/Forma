import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { AccountStatus, Role } from '@/types';

export interface PlatformStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  suspended: number;
}

/** Aggregate account counts, computed server-side (no full-collection read). */
export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { db } = ensureFirebase();
  const users = collection(db, USERS_KEY);
  const countWhere = async (field: 'role' | 'accountStatus', value: Role | AccountStatus) =>
    (await getCountFromServer(query(users, where(field, '==', value)))).data().count;

  const [total, super_admin, admin, coach, client, pending, suspended] = await Promise.all([
    getCountFromServer(users).then((s) => s.data().count),
    countWhere('role', 'super_admin'),
    countWhere('role', 'admin'),
    countWhere('role', 'coach'),
    countWhere('role', 'client'),
    countWhere('accountStatus', 'pending'),
    countWhere('accountStatus', 'suspended'),
  ]);

  return {
    total,
    byRole: { super_admin, admin, coach, client },
    pending,
    suspended,
  };
}

const USERS_KEY = 'users';
