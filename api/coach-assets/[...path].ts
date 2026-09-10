import type { VercelRequest, VercelResponse } from '@vercel/node';

import billingPlans from './_handlers/billing-plans.js';
import billingPlansDetail from './_handlers/billing-plans-detail.js';
import exercises from './_handlers/exercises.js';
import exercisesDetail from './_handlers/exercises-detail.js';
import foodGroups from './_handlers/food-groups.js';
import foodGroupsDetail from './_handlers/food-groups-detail.js';
import foods from './_handlers/foods.js';
import foodsDetail from './_handlers/foods-detail.js';
import nutritionTemplates from './_handlers/nutrition-templates.js';
import nutritionTemplatesDetail from './_handlers/nutrition-templates-detail.js';
import supplements from './_handlers/supplements.js';
import supplementsDetail from './_handlers/supplements-detail.js';
import workoutTemplates from './_handlers/workout-templates.js';
import workoutTemplatesDetail from './_handlers/workout-templates-detail.js';
import seedStarterLibrary from './_handlers/seed-starter-library.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

/**
 * Catch-all router for /api/coach-assets/*.
 *
 * Vercel Hobby plan caps deployments at 12 serverless functions; this module
 * alone used to account for 15. Collapsing it into a single catch-all keeps
 * every route's original handler logic untouched (see `./_handlers/*`) while
 * only consuming one function slot.
 */
const routes: Record<string, { list: Handler; detail: Handler }> = {
  'billing-plans': { list: billingPlans, detail: billingPlansDetail },
  exercises: { list: exercises, detail: exercisesDetail },
  'food-groups': { list: foodGroups, detail: foodGroupsDetail },
  foods: { list: foods, detail: foodsDetail },
  'nutrition-templates': { list: nutritionTemplates, detail: nutritionTemplatesDetail },
  supplements: { list: supplements, detail: supplementsDetail },
  'workout-templates': { list: workoutTemplates, detail: workoutTemplatesDetail },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.query.path;
  const segments = Array.isArray(path) ? path : path ? [path] : [];

  if (segments.length === 1 && segments[0] === 'seed-starter-library') {
    await seedStarterLibrary(req, res);
    return;
  }

  const [resource, id] = segments;
  const route = resource ? routes[resource] : undefined;

  if (route && segments.length === 1) {
    await route.list(req, res);
    return;
  }

  if (route && segments.length === 2) {
    req.query.id = id;
    await route.detail(req, res);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
