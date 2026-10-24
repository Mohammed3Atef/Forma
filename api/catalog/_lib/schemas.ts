import { z } from 'zod';
import { BODY_PARTS, DIFFICULTY, EQUIPMENT, FOOD_CATEGORIES, FOOD_STATES, MUSCLES, PATTERNS } from './taxonomy.js';

/**
 * B4 — the catalog dataset contract. A dataset file that fails this schema is never served
 * (`dataset.test.ts` validates the committed files; the build scripts refuse to write one).
 *
 * Rules the schema itself enforces:
 *  - every item and every media file carries an allowed licence and its provenance;
 *  - Forma-written text (names, aliases, instructions) is Forma's own (`FORMA-PROPRIETARY`) — no
 *    third-party prose is copied in, so no share-alike reaches it;
 *  - a published video is browser-safe H.264/MP4; anything else is excluded with a reason;
 *  - a food's values are per 100 g of the food AS DESCRIBED (raw / cooked / dry …), from a named
 *    source record, or a recipe built from catalog ingredients (labelled an estimate);
 *  - a household portion has a gram weight from food-specific evidence only.
 */
const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const text = z.string().trim().min(1).max(400);
const words = z.array(z.string().trim().min(1).max(80)).max(20);
export const BilingualSchema = z.object({ en: text, ar: text });
const https = z.string().url().refine((u) => u.startsWith('https://'), 'https only');

export const MuscleIdSchema = z.enum(keys(MUSCLES));
export const EquipmentIdSchema = z.enum(keys(EQUIPMENT));
export const PatternIdSchema = z.enum(keys(PATTERNS));
export const BodyPartIdSchema = z.enum(keys(BODY_PARTS));
export const DifficultyIdSchema = z.enum(keys(DIFFICULTY));
export const FoodCategoryIdSchema = z.enum(keys(FOOD_CATEGORIES));
export const FoodStateIdSchema = z.enum(keys(FOOD_STATES));

const THIRD_PARTY_LICENSE = z.enum(['CC0-1.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']);

const InstructionSetSchema = z.object({
  setup: z.array(text).min(1).max(6),
  steps: z.array(text).min(2).max(8),
  cues: z.array(text).min(1).max(5),
  mistakes: z.array(text).min(1).max(5),
  safety: z.array(text).max(3),
});
export type InstructionSet = z.infer<typeof InstructionSetSchema>;

const CdnPath = z.string().regex(/^catalog\/[a-z0-9/_.-]+$/);

/**
 * One demonstration file (B4; video model completed in B4.1). An exercise may have several (`role`
 * primary / alternate, each with a bilingual `label` such as "Side view"). Where it is served from:
 *  - `hosting: 'source'`     the original public file (`url`), e.g. a wger image — served as is;
 *  - `hosting: 'forma-cdn'`  a converted copy (`cdnPath`) on Forma's PUBLIC catalog CDN — served only
 *                            once that CDN is configured (`FORMA_CATALOG_MEDIA_URL`), i.e. after the
 *                            owner has uploaded the files. `url` stays the provenance of the original.
 * Nothing is served unless its rights are verified, a person approved it (`review`) and it is
 * `published`. Unverified sources (e.g. the 593 "Free Exercise DB" videos) never enter a dataset.
 */
export const MediaSchema = z
  .object({
    id: z.string().regex(/^(img|vid)_[a-z0-9_-]+$/),
    kind: z.enum(['image', 'video']),
    /** The original file at its source (provenance; also what is served when `hosting` is `source`). */
    url: https,
    hosting: z.enum(['source', 'forma-cdn']),
    /** The file on Forma's public catalog CDN (required for `forma-cdn`). */
    cdnPath: CdnPath.optional(),
    role: z.enum(['primary', 'alternate']),
    label: BilingualSchema.optional(),
    format: z.enum(['png', 'jpg', 'webp', 'gif', 'mp4']),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4']),
    /** Videos: the codec of the SERVED file, checked by the build (only H.264 is served). */
    codec: z.enum(['h264']).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    bytes: z.number().int().positive().optional(),
    durationSec: z.number().positive().max(600).optional(),
    /** Videos: a light still (WebP) shown before playback — on the catalog CDN. */
    poster: z.object({ cdnPath: CdnPath, width: z.number().int().positive(), height: z.number().int().positive(), bytes: z.number().int().positive() }).optional(),
    license: THIRD_PARTY_LICENSE,
    /** As credited by the source; "wger.de contributors" when the source names nobody. */
    author: z.string().trim().min(1).max(200),
    /** The page a reader can follow for the work and its licence. */
    sourcePage: https,
    source: z.object({ provider: z.enum(['wger']), id: z.string().min(1) }),
    /** How the build confirmed it shows THIS exercise: looked at, or the source's own link only. */
    verified: z.enum(['visual', 'source-link']),
    rights: z.enum(['verified', 'pending']),
    review: z.enum(['approved', 'pending']),
    publication: z.enum(['published', 'unpublished']),
  })
  .refine((m) => m.kind !== 'video' || (m.format === 'mp4' && m.codec === 'h264' && m.mime === 'video/mp4'), 'a served video must be H.264 MP4')
  .refine((m) => m.hosting !== 'forma-cdn' || !!m.cdnPath, 'a Forma-hosted file needs its cdnPath')
  .refine((m) => m.publication !== 'published' || (m.rights === 'verified' && m.review === 'approved'), 'only verified, approved media can be published');
export type CatalogMedia = z.infer<typeof MediaSchema>;

const SourceRefSchema = z.object({
  provider: z.enum(['wger', 'usda-fdc', 'forma']),
  id: z.string().min(1),
  url: https.optional(),
  /** What the reference contributes: identity/media only, or the nutrient values. */
  role: z.enum(['media', 'identity', 'nutrients', 'portions', 'recipe-ingredient']),
  license: z.enum(['CC0-1.0', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0', 'FORMA-PROPRIETARY']),
  /** The source's own description (USDA food description, wger name) — kept verbatim for audit. */
  description: z.string().max(300).optional(),
  dataType: z.enum(['sr_legacy', 'survey_fndds', 'foundation']).optional(),
});

const ContentSchema = z.object({
  license: z.literal('FORMA-PROPRIETARY'),
  author: z.literal('Forma'),
  /** `draft` until a qualified coach / dietitian signs the item off. */
  review: z.enum(['draft', 'expert-reviewed']),
  /** Arabic wording: `draft` until a native speaker signs it off. */
  translation: z.enum(['draft', 'native-reviewed']),
});

export const CatalogExerciseSchema = z
  .object({
    id: z.string().regex(/^fx_[a-z0-9_]+$/),
    status: z.enum(['published', 'draft']),
    rev: z.number().int().min(1),
    name: BilingualSchema,
    aliases: z.object({ en: words, ar: words, eg: words }),
    bodyPart: BodyPartIdSchema,
    primaryMuscles: z.array(MuscleIdSchema).min(1).max(3),
    secondaryMuscles: z.array(MuscleIdSchema).max(6),
    equipment: z.array(EquipmentIdSchema).min(1).max(4),
    pattern: PatternIdSchema,
    mechanics: z.enum(['compound', 'isolation']),
    difficulty: DifficultyIdSchema,
    laterality: z.enum(['bilateral', 'unilateral', 'alternating']),
    instructions: z.object({ en: InstructionSetSchema, ar: InstructionSetSchema }),
    media: z.array(MediaSchema).max(6),
    sources: z.array(SourceRefSchema),
    content: ContentSchema,
    /** Another catalog id this is a variation of (grouping; never a merge). */
    variantOf: z.string().regex(/^fx_[a-z0-9_]+$/).optional(),
    /** Ids this replaces in the legacy starter dataset (`wger-<n>`), for the reviewed mapping. */
    legacyIds: z.array(z.string()).max(10),
  })
  .refine((e) => !e.primaryMuscles.some((m) => e.secondaryMuscles.includes(m)), 'a muscle is primary or secondary, not both')
  .refine((e) => e.media.every((m) => e.sources.some((s) => s.provider === m.source.provider && s.role === 'media')), 'media must trace to a listed media source');
export type CatalogExercise = z.infer<typeof CatalogExerciseSchema>;

/**
 * B4.1 — a picture of a catalog food. Found on an open-licence source (Wikimedia Commons: CC0, public
 * domain, CC BY, CC BY-SA — never NC / ND), LOOKED AT by a person (right food, right state — raw vs
 * cooked —, no brand, no people, no watermark), then re-hosted on Forma's public catalog CDN as two
 * light WebP variants without metadata: `thumb` (square, lists) and `card` (serving chooser). Served
 * only once that CDN is configured. `url` / `sourcePage` keep the provenance; the credit is shown.
 */
const ImageVariantSchema = z.object({ cdnPath: CdnPath, width: z.number().int().positive(), height: z.number().int().positive(), bytes: z.number().int().positive() });
export const FoodImageSchema = z
  .object({
    id: z.string().regex(/^fimg_[a-z0-9_]+$/),
    role: z.enum(['primary', 'alternate']),
    url: https,
    sourcePage: https,
    variants: z.object({ thumb: ImageVariantSchema, card: ImageVariantSchema }),
    alt: BilingualSchema,
    license: z.enum(['CC0-1.0', 'PD', 'CC-BY-2.0', 'CC-BY-2.5', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-2.0', 'CC-BY-SA-2.5', 'CC-BY-SA-3.0', 'CC-BY-SA-4.0']),
    licenseUrl: https.optional(),
    author: z.string().trim().min(1).max(200),
    credit: z.string().trim().max(300).optional(),
    source: z.object({ provider: z.enum(['wikimedia-commons']), id: z.string().min(1).max(300) }),
    rights: z.enum(['verified', 'pending']),
    /** `needs-replacement`: correct and licensed, shown, but a better photo is wanted. */
    review: z.enum(['approved', 'pending', 'needs-replacement']),
    publication: z.enum(['published', 'unpublished']),
    rev: z.number().int().min(1),
  })
  .refine((i) => i.publication !== 'published' || (i.rights === 'verified' && i.review !== 'pending'), 'only verified, reviewed images can be published');
export type CatalogFoodImage = z.infer<typeof FoodImageSchema>;

const Per100gSchema = z
  .object({
    kcal: z.number().min(0).max(900),
    protein: z.number().min(0).max(100),
    carbs: z.number().min(0).max(100),
    fat: z.number().min(0).max(100),
    fiber: z.number().min(0).max(100).optional(),
  })
  .refine((v) => v.protein + v.carbs + v.fat <= 101, 'macros cannot exceed 100 g per 100 g');

export const PortionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  label: BilingualSchema,
  grams: z.number().positive().max(2000),
  source: z.enum(['usda-sr-weight', 'usda-fndds-portion', 'usda-foundation-portion', 'recipe']),
  /** The source record the weight comes from (e.g. `fdc:168878 seq 1`). */
  ref: z.string().min(1).max(120),
});
export type CatalogPortion = z.infer<typeof PortionSchema>;

export const CatalogFoodSchema = z
  .object({
    id: z.string().regex(/^ff_[a-z0-9_]+$/),
    status: z.enum(['published', 'needs-review']),
    rev: z.number().int().min(1),
    name: BilingualSchema,
    aliases: z.object({ en: words, ar: words, eg: words }),
    category: FoodCategoryIdSchema,
    state: FoodStateIdSchema,
    preparation: BilingualSchema.optional(),
    per100g: Per100gSchema,
    energySource: z.enum(['usda-1008', 'usda-2048', 'usda-2047', 'recipe-sum']),
    portions: z.array(PortionSchema).max(8),
    /**
     * source-values: the named USDA record IS this food. recipe-estimate: computed from catalog
     * ingredients (`recipe`). proxy-estimate: a local food with no record of its own, valued from the
     * nearest named record — always shown with `matchNote` (e.g. baladi bread from whole-wheat pita).
     */
    verification: z.enum(['source-values', 'recipe-estimate', 'proxy-estimate']),
    matchNote: BilingualSchema.optional(),
    sources: z.array(SourceRefSchema).min(1),
    recipe: z
      .object({
        ingredients: z.array(z.object({ foodId: z.string().regex(/^ff_[a-z0-9_]+$/), grams: z.number().positive() })).min(2),
        yieldGrams: z.number().positive().optional(),
        note: BilingualSchema,
      })
      .optional(),
    content: ContentSchema,
    images: z.array(FoodImageSchema).max(4),
    legacyIds: z.array(z.string()).max(10),
  })
  .refine((f) => f.images.every((i) => i.variants.thumb.cdnPath.startsWith(`catalog/foods/${f.id}/`) && i.variants.card.cdnPath.startsWith(`catalog/foods/${f.id}/`)), "a food's pictures live in its own folder")
  .refine((f) => (f.verification === 'recipe-estimate') === !!f.recipe, 'a recipe estimate has a recipe, and only it')
  .refine((f) => f.verification === 'recipe-estimate' || f.sources.some((s) => s.role === 'nutrients' && s.provider === 'usda-fdc'), 'values name their USDA record')
  .refine((f) => (f.verification === 'proxy-estimate') === !!f.matchNote, 'a proxy estimate says what it was matched to, and only it');
export type CatalogFood = z.infer<typeof CatalogFoodSchema>;

const DatasetMetaSchema = z.object({
  version: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-\d+$/),
  builtAt: z.string(),
  generator: z.string(),
  sources: z.array(z.object({ provider: z.string(), version: z.string(), retrievedAt: z.string(), license: z.string(), attribution: z.string() })),
  /** Source records considered and left out, with why — the audit trail of the curation. */
  excluded: z.array(z.object({ provider: z.string(), id: z.string(), reason: z.string() })),
});

export const ExerciseDatasetSchema = DatasetMetaSchema.extend({ kind: z.literal('exercises'), items: z.array(CatalogExerciseSchema) });
export const FoodDatasetSchema = DatasetMetaSchema.extend({ kind: z.literal('foods'), items: z.array(CatalogFoodSchema) });
export type ExerciseDataset = z.infer<typeof ExerciseDatasetSchema>;
export type FoodDataset = z.infer<typeof FoodDatasetSchema>;
