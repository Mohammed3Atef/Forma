import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure } from '../trpc.js';
import { loadCatalog, servedFoodImage, type ExerciseEntry } from '../../catalog/_lib/dataset.js';
import { buildIndex, search, type SearchField } from '../../catalog/_lib/search.js';
import { EQUIPMENT, MUSCLES, type MuscleId } from '../../catalog/_lib/taxonomy.js';
import { EquipmentIdSchema, FoodCategoryIdSchema, MuscleIdSchema } from '../../catalog/_lib/schemas.js';
import { coachExercisesCol, coachFavoritesCol, coachFoodsCol } from '../../coach-assets/_lib/db.js';
import type { CoachExerciseDoc, CoachFoodDoc } from '../../coach-assets/_lib/types.js';
import { exerciseCard, foodCard } from './catalog.js';

/**
 * B4.3 — the coach's ONE library: Forma's shared catalog (1,343 exercises, 190 foods — read from the
 * versioned datasets, never copied into a coach's records) and the coach's own items (custom
 * exercises and foods, and their customised versions of catalog items), searched and paged
 * together on the server. Scopes:
 *  - `all`        shared + own; a catalog item the coach customised appears ONCE, as their version;
 *  - `favorites`  the coach's favourites (light references, `coachFavorites`);
 *  - `mine`       the coach's own items only.
 * Rows say where they come from (`kind`), so the UI can add a shared item to a plan directly (a
 * snapshot copy, as before) or use the coach's own item (its library link) — no import step.
 */
const Scope = z.enum(['all', 'favorites', 'mine']);
const Lang = z.enum(['en', 'ar']).default('en');
const Page = { limit: z.number().int().min(1).max(50).default(30), offset: z.number().int().min(0).max(5000).default(0) };
/** Own items rank above shared ones among equals (the coach made or chose them); curated above ExerciseDB. */
const OWN_BOOST = 0.4;

type OwnExercise = Omit<CoachExerciseDoc, '_id' | 'coachId' | 'createdAt' | 'updatedAt'>;
type OwnFood = Omit<CoachFoodDoc, '_id' | 'coachId' | 'createdAt' | 'updatedAt'>;
const strip = <T extends { _id: unknown; coachId: string; createdAt: number; updatedAt: number }>({ _id, coachId: _c, createdAt: _a, updatedAt: _u, ...rest }: T) => rest;

// ---- muscle / equipment of a coach's own exercise (free text, usually the English label) -----------
const byLabel = <T extends Record<string, { en: string; ar: string }>>(table: T) => {
  const m = new Map<string, keyof T & string>();
  for (const [id, l] of Object.entries(table)) {
    m.set(l.en.toLowerCase(), id as keyof T & string);
    m.set(l.ar, id as keyof T & string);
    m.set(id.toLowerCase(), id as keyof T & string);
  }
  return m;
};
const MUSCLE_BY_LABEL = byLabel(MUSCLES);
const EQUIPMENT_BY_LABEL = byLabel(EQUIPMENT);
const DELTS: MuscleId[] = ['delts', 'front-delts', 'side-delts', 'rear-delts'];
function musclesOf(e: OwnExercise): MuscleId[] {
  const raw = [e.targetMuscle, ...(e.muscles ?? []), ...(e.secondaryMuscles ?? [])].filter(Boolean).map((s) => String(s).trim());
  return [...new Set(raw.map((s) => MUSCLE_BY_LABEL.get(s.toLowerCase()) ?? MUSCLE_BY_LABEL.get(s)).filter((m): m is MuscleId => !!m))];
}
function equipmentOf(e: OwnExercise): string[] {
  const raw = [...(e.equipmentList ?? []), ...String(e.equipment ?? '').split(',')].map((s) => s.trim()).filter(Boolean);
  return [...new Set(raw.map((s) => EQUIPMENT_BY_LABEL.get(s.toLowerCase()) ?? EQUIPMENT_BY_LABEL.get(s)).filter((q): q is keyof typeof EQUIPMENT => !!q))];
}
/**
 * "Has a demonstration" for the coach's own exercise, by the app's rule (`lib/videoSource`): a link
 * Forma can play (YouTube, or an https video file) or a picture — a Drive / Vimeo link is not one.
 */
const YT = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;
function playable(raw: string | null | undefined): boolean {
  try {
    const u = new URL(String(raw ?? '').trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname))) return false;
    if (YT.test(u.hostname)) {
      const id = u.hostname.toLowerCase().endsWith('youtu.be') ? u.pathname.slice(1).split('/')[0] : (u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? '');
      return /^[\w-]{11}$/.test(id);
    }
    return VIDEO_FILE.test(u.pathname);
  } catch {
    return false;
  }
}
const ownHasDemo = (e: OwnExercise) => playable(e.videoUrl) || !!(e.imageUrl || e.thumbUrl || e.images?.length);
const worksMuscle = (all: MuscleId[], m: MuscleId) => all.includes(m) || (m === 'delts' ? all.some((x) => DELTS.includes(x)) : DELTS.includes(m) && all.includes('delts'));

function ownExerciseFields(e: OwnExercise): SearchField[] {
  return [
    { text: e.name, weight: 1 },
    ...(e.names ? [{ text: e.names.en, weight: 1 }, { text: e.names.ar, weight: 1 }] : []),
    ...(e.tags ?? []).map((text) => ({ text, weight: 0.6 })),
    ...[e.targetMuscle, e.equipment, e.category].filter(Boolean).map((text) => ({ text: String(text), weight: 0.45 })),
  ].filter((f) => f.text.trim());
}
function ownFoodFields(f: OwnFood): SearchField[] {
  return [
    { text: f.name.en, weight: 1 },
    { text: f.name.ar ?? '', weight: 1 },
    ...(f.tags ?? []).map((text) => ({ text, weight: 0.6 })),
    ...(f.category ? [{ text: f.category, weight: 0.4 }] : []),
  ].filter((x) => x.text.trim());
}

/** Shared rows first sort by their boost; within equal scores by the name in the reader's language. */
function byNameIn(lang: 'en' | 'ar') {
  const c = new Intl.Collator(lang === 'ar' ? 'ar' : 'en', { sensitivity: 'base', numeric: true });
  return (a: { name: string; score: number }, b: { name: string; score: number }) => b.score - a.score || c.compare(a.name, b.name);
}
const nameIn = (n: { en: string; ar?: string }, lang: 'en' | 'ar') => (lang === 'ar' ? n.ar?.trim() || n.en : n.en);

/** The coach's favourite references of one kind. */
async function favoritesOf(coachId: string, kind: 'exercise' | 'food'): Promise<Set<string>> {
  const rows = await (await coachFavoritesCol()).find({ coachId, kind }, { projection: { refId: 1 } }).toArray();
  return new Set(rows.map((r) => r.refId));
}

export type LibraryExerciseRow =
  | { kind: 'shared'; id: string; favorite: boolean; card: ReturnType<typeof exerciseCard> }
  | { kind: 'own'; id: string; favorite: boolean; customized: boolean; catalogId: string | null; exercise: OwnExercise; muscles: MuscleId[]; equipment: string[] };
export type LibraryFoodRow =
  | { kind: 'shared'; id: string; favorite: boolean; card: ReturnType<typeof foodCard> }
  | { kind: 'own'; id: string; favorite: boolean; customized: boolean; catalogId: string | null; food: OwnFood; image: ReturnType<typeof ownFoodImage> };

/** A coach's own food shows its own picture; a customised catalog food without one shows Forma's. */
function ownFoodImage(f: OwnFood) {
  if (f.image) return { thumbUrl: f.image.thumbUrl, cardUrl: f.image.url, ...(f.image.alt ? { alt: f.image.alt } : {}), forma: false };
  const canonical = f.catalogId ? loadCatalog().foodById.get(f.catalogId) : undefined;
  const served = canonical ? servedFoodImage(canonical) : null;
  return served ? { thumbUrl: served.thumbUrl, cardUrl: served.cardUrl, alt: served.alt, forma: true } : null;
}

export const libraryRouter = router({
  exercises: router({
    list: roleProcedure('coach')
      .input(z.object({ q: z.string().trim().max(80).default(''), scope: Scope.default('all'), muscle: MuscleIdSchema.optional(), equipment: EquipmentIdSchema.optional(), demo: z.boolean().optional(), lang: Lang, ...Page }))
      .query(async ({ ctx, input }) => {
        const coachId = ctx.user.id;
        const [ownDocs, favs] = await Promise.all([(await coachExercisesCol()).find({ coachId }).toArray(), favoritesOf(coachId, 'exercise')]);
        const own = ownDocs.map(strip);
        const c = loadCatalog();
        // Keyed by the item a catalog id resolves to today (an ExerciseDB id linked to a curated item → that item).
        const resolve = (id: string) => c.exerciseById.get(id)?.id ?? id;
        const customized = new Set(own.filter((e) => e.catalogId).map((e) => resolve(e.catalogId!)));
        const favKey = (id: string, catalogId: string | null) => favs.has(id) || (!!catalogId && favs.has(resolve(catalogId)));
        const rows: { row: LibraryExerciseRow; name: string; score: number }[] = [];

        // The coach's own items (custom + customised catalog items).
        const ownIndex = buildIndex(own, ownExerciseFields, { boost: () => OWN_BOOST, sortKey: (e) => e.name });
        const ownHits = search(ownIndex, input.q, {
          limit: 5000,
          filter: (e) => {
            const muscles = musclesOf(e);
            const equipment = equipmentOf(e);
            return (!input.muscle || worksMuscle(muscles, input.muscle)) && (!input.equipment || equipment.includes(input.equipment)) && (!input.demo || ownHasDemo(e)) && (input.scope !== 'favorites' || favKey(e.id, e.catalogId ?? null));
          },
        });
        for (const h of ownHits.hits) {
          const e = h.item;
          rows.push({ row: { kind: 'own', id: e.id, favorite: favKey(e.id, e.catalogId ?? null), customized: !!e.catalogId, catalogId: e.catalogId ?? null, exercise: e, muscles: musclesOf(e), equipment: equipmentOf(e) }, name: nameIn(e.names ?? { en: e.name, ar: e.name }, input.lang), score: h.score });
        }

        // Forma's shared catalog — minus what the coach customised (their version is listed instead).
        if (input.scope !== 'mine') {
          const shared = search(c.exerciseIndex, input.q, {
            limit: 5000,
            filter: (e: ExerciseEntry) => {
              if (customized.has(e.id)) return false;
              if (input.scope === 'favorites' && !favs.has(e.id)) return false;
              return (!input.muscle || worksMuscle([...e.primaryMuscles, ...e.secondaryMuscles], input.muscle)) && (!input.equipment || e.equipment.includes(input.equipment)) && (!input.demo || exerciseCard(e).media !== 'none');
            },
          });
          for (const h of shared.hits) rows.push({ row: { kind: 'shared', id: h.item.id, favorite: favs.has(h.item.id), card: exerciseCard(h.item) }, name: nameIn(h.item.name, input.lang), score: h.score });
        }
        rows.sort(byNameIn(input.lang));
        return { total: rows.length, items: rows.slice(input.offset, input.offset + input.limit).map((r) => r.row) };
      }),
  }),

  foods: router({
    list: roleProcedure('coach')
      .input(z.object({ q: z.string().trim().max(80).default(''), scope: Scope.default('all'), category: FoodCategoryIdSchema.optional(), lang: Lang, ...Page }))
      .query(async ({ ctx, input }) => {
        const coachId = ctx.user.id;
        const [ownDocs, favs] = await Promise.all([(await coachFoodsCol()).find({ coachId }).toArray(), favoritesOf(coachId, 'food')]);
        const own = ownDocs.map(strip);
        const customized = new Set(own.map((f) => f.catalogId).filter(Boolean) as string[]);
        const favKey = (id: string, catalogId: string | null) => favs.has(catalogId ?? id) || favs.has(id);
        const c = loadCatalog();
        const rows: { row: LibraryFoodRow; name: string; score: number }[] = [];

        const ownIndex = buildIndex(own, ownFoodFields, { boost: () => OWN_BOOST, sortKey: (f) => f.name.en });
        const ownHits = search(ownIndex, input.q, {
          limit: 5000,
          filter: (f) => (!input.category || (f.catalogId ? c.foodById.get(f.catalogId)?.category === input.category : false)) && (input.scope !== 'favorites' || favKey(f.id, f.catalogId ?? null)),
        });
        for (const h of ownHits.hits) {
          const f = h.item;
          rows.push({ row: { kind: 'own', id: f.id, favorite: favKey(f.id, f.catalogId ?? null), customized: !!f.catalogId, catalogId: f.catalogId ?? null, food: f, image: ownFoodImage(f) }, name: nameIn(f.name, input.lang), score: h.score });
        }
        if (input.scope !== 'mine') {
          const shared = search(c.foodIndex, input.q, {
            limit: 5000,
            filter: (f) => !customized.has(f.id) && (!input.category || f.category === input.category) && (input.scope !== 'favorites' || favs.has(f.id)),
          });
          for (const h of shared.hits) rows.push({ row: { kind: 'shared', id: h.item.id, favorite: favs.has(h.item.id), card: foodCard(h.item) }, name: nameIn(h.item.name, input.lang), score: h.score });
        }
        rows.sort(byNameIn(input.lang));
        return { total: rows.length, items: rows.slice(input.offset, input.offset + input.limit).map((r) => r.row) };
      }),
  }),

  favorites: router({
    /** Mark / unmark a favourite. `id`: a catalog id, or one of the coach's own items. */
    set: roleProcedure('coach')
      .input(z.object({ kind: z.enum(['exercise', 'food']), id: z.string().trim().min(1).max(120), on: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const coachId = ctx.user.id;
        const col = await coachFavoritesCol();
        const c = loadCatalog();
        // A linked ExerciseDB id is stored as the curated item it resolves to (one favourite per exercise).
        const refId = input.kind === 'exercise' ? (c.exerciseById.get(input.id)?.id ?? input.id) : input.id;
        if (!input.on) {
          await col.deleteMany({ coachId, id: { $in: [...new Set([`${input.kind}:${input.id}`, `${input.kind}:${refId}`])] } });
          return { favorite: false };
        }
        const exists =
          input.kind === 'exercise'
            ? c.exerciseById.has(input.id) || !!(await (await coachExercisesCol()).findOne({ coachId, id: input.id }, { projection: { _id: 1 } }))
            : c.foodById.has(input.id) || !!(await (await coachFoodsCol()).findOne({ coachId, id: input.id }, { projection: { _id: 1 } }));
        if (!exists) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such item' });
        await col.updateOne({ coachId, id: `${input.kind}:${refId}` }, { $setOnInsert: { coachId, id: `${input.kind}:${refId}`, kind: input.kind, refId, createdAt: Date.now() } }, { upsert: true });
        return { favorite: true };
      }),
  }),
});
