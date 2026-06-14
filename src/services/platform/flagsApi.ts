import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { writeAudit } from './auditApi';
import type { FeatureFlag } from '@/types';

const FLAGS = 'featureFlags';

export async function listFlags(): Promise<FeatureFlag[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, FLAGS));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeatureFlag, 'id'>) }));
}

export async function saveFlag(flag: FeatureFlag): Promise<void> {
  const { db } = ensureFirebase();
  const payload: FeatureFlag = { ...flag, updatedAt: Date.now() };
  await setDoc(doc(db, FLAGS, flag.id), payload);
  await writeAudit({
    action: 'flag.update',
    targetUserId: flag.targetId ?? 'global',
    metadata: { flag: flag.id, enabled: flag.enabled, scope: flag.scope },
  });
}
