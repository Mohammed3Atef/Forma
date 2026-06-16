import { setDoc, doc } from 'firebase/firestore';
import type { FbSession } from './firestore';

/**
 * Builders + writers for coach-authored plans, matching the exact Firestore
 * shapes the app reads (see src/types and src/services/platform/planApi.ts).
 * Used by the assigned-plan client suite to set up a known plan via a coach
 * session, then assert the client renders it precisely.
 *
 * Paths:
 *   clientData/{clientId}/plan/workout
 *   clientData/{clientId}/plan/nutrition
 *   clientData/{clientId}/plan/cardio
 *   clientData/{clientId}/coachTargets/current
 */

export const SAMPLE = {
  workout: {
    benchWarmup: 2,
    benchWorking: 4,
    benchReps: '6-8',
    benchRest: 150,
    benchVideo: 'https://example.com/bench-press.mp4',
    benchNotes: 'Pause at the chest, drive through the floor.',
    mobilityWarmup: 3, // warm-up-only
    plankWorking: 5, // working-only
  },
  nutrition: { calories: 2400, protein: 190, carbs: 220, fats: 70, water: 3500 },
  cardio: { type: 'cycling', duration: 40, frequency: '4×/week', notes: 'Steady state.' },
  targets: { waterMl: 3500, steps: 12000, cardioMin: 160 },
};

export async function assignWorkoutPlan(coach: FbSession, clientId: string): Promise<void> {
  const now = Date.now();
  const ex = (id: string, name: string, warmup: number, working: number, reps: string, rest: number, video?: string, notes = '') => ({
    id,
    name,
    targetMuscle: '',
    warmupSets: String(warmup),
    warmupSetCount: warmup,
    workingSets: working,
    repRange: reps,
    rir: '',
    tempo: '',
    notes: { en: notes, ar: notes },
    restSec: rest,
    videoId: null,
    videoUrl: video ?? null,
  });
  const exercises = {
    bench: ex('bench', 'Bench Press', SAMPLE.workout.benchWarmup, SAMPLE.workout.benchWorking, SAMPLE.workout.benchReps, SAMPLE.workout.benchRest, SAMPLE.workout.benchVideo, SAMPLE.workout.benchNotes),
    mobility: ex('mobility', 'Shoulder Mobility', SAMPLE.workout.mobilityWarmup, 0, '10', 30),
    plank: ex('plank', 'Plank', 0, SAMPLE.workout.plankWorking, '45s', 60),
  };
  await setDoc(doc(coach.db, 'clientData', clientId, 'plan', 'workout'), {
    id: 'wplan-e2e',
    name: 'E2E Push Day',
    days: [{ id: 'day1', dayIndex: 0, title: 'Day 1 — Push', focus: 'Chest', exerciseIds: ['bench', 'mobility', 'plank'] }],
    exercises,
    updatedAt: now,
  });
}

export async function assignNutritionPlan(coach: FbSession, clientId: string): Promise<void> {
  const n = SAMPLE.nutrition;
  await setDoc(doc(coach.db, 'clientData', clientId, 'plan', 'nutrition'), {
    id: 'mplan-e2e',
    name: 'E2E Meal Plan',
    meals: [
      {
        id: 'meal1',
        slot: 'breakfast',
        label: { en: 'Breakfast', ar: '' },
        items: [{ id: 'food1', name: { en: 'Oats & Whey', ar: '' }, quantity: '100g', protein: 30, carbs: 60, fats: 8, calories: 430 }],
      },
    ],
    targets: { calories: n.calories, protein: n.protein, carbs: n.carbs, fats: n.fats },
    supplements: [],
    waterTargetMl: n.water,
    beverageNotes: [],
    generalNotes: [],
    updatedAt: Date.now(),
  });
}

/**
 * Seed a meal plan whose single planned item carries coach-approved
 * alternatives (denormalized, as the nutrition editor would write them) plus a
 * permissive substitution policy — for the food-alternatives suite.
 */
export async function assignNutritionPlanWithAlternatives(coach: FbSession, clientId: string): Promise<{ mealId: string; itemId: string; altName: string }> {
  const mealId = 'meal-bf';
  const itemId = 'planned-oats';
  const altName = 'White Rice';
  await setDoc(doc(coach.db, 'clientData', clientId, 'plan', 'nutrition'), {
    id: 'mplan-alt',
    name: 'Alternatives Plan',
    meals: [
      {
        id: mealId,
        slot: 'breakfast',
        label: { en: 'Breakfast', ar: '' },
        items: [
          {
            id: itemId,
            name: { en: 'Oats', ar: '' },
            quantity: '80g',
            protein: 13,
            carbs: 54,
            fats: 7,
            calories: 350,
            allowedAlternativeGroupId: 'grp-carbs',
            allowCustomSubstitution: true,
            allowedAlternatives: [
              { id: 'alt-rice', name: { en: altName, ar: '' }, quantity: '150g', protein: 4, carbs: 45, fats: 1, calories: 205 },
              { id: 'alt-potato', name: { en: 'Sweet Potato', ar: '' }, quantity: '200g', protein: 4, carbs: 41, fats: 0, calories: 180 },
            ],
          },
        ],
      },
    ],
    targets: { calories: 2200, protein: 180, carbs: 200, fats: 60 },
    supplements: [],
    waterTargetMl: 3000,
    beverageNotes: [],
    generalNotes: [],
    substitutionPolicy: { allowClientSubstitutions: true, allowCustomFoods: true, requireCoachApproval: true },
    updatedAt: Date.now(),
  });
  return { mealId, itemId, altName };
}

export async function assignCardioPlan(coach: FbSession, clientId: string): Promise<void> {
  const c = SAMPLE.cardio;
  await setDoc(doc(coach.db, 'clientData', clientId, 'plan', 'cardio'), {
    id: 'cplan-e2e',
    name: 'E2E Cardio',
    sessions: [{ id: 'sess1', type: c.type, durationMin: c.duration, frequency: c.frequency, notes: c.notes }],
    updatedAt: Date.now(),
  });
}

export async function assignTargets(coach: FbSession, clientId: string): Promise<void> {
  const t = SAMPLE.targets;
  await setDoc(doc(coach.db, 'clientData', clientId, 'coachTargets', 'current'), {
    id: 'current',
    clientId,
    waterMl: t.waterMl,
    steps: t.steps,
    cardioMin: t.cardioMin,
    updatedBy: coach.uid,
    updatedAt: Date.now(),
  });
}

export async function assignNote(coach: FbSession, clientId: string, body: string): Promise<void> {
  const now = Date.now();
  await setDoc(doc(coach.db, 'clientData', clientId, 'coachNotes', `note-${now}`), {
    id: `note-${now}`,
    clientId,
    authorId: coach.uid,
    authorRole: 'coach',
    body,
    kind: 'note',
    createdAt: now,
    updatedAt: now,
  });
}

export async function assignAll(coach: FbSession, clientId: string): Promise<void> {
  await assignWorkoutPlan(coach, clientId);
  await assignNutritionPlan(coach, clientId);
  await assignCardioPlan(coach, clientId);
  await assignTargets(coach, clientId);
  await assignNote(coach, clientId, 'Welcome to Forma — let’s get to work.');
}
