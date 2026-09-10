import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathSegments } from '../_lib/routePath.js';
import assessmentHandler from './_handlers/assessment.js';
import workoutPlanHandler from './_handlers/workout-plan.js';
import nutritionPlanHandler from './_handlers/nutrition-plan.js';
import cardioPlanHandler from './_handlers/cardio-plan.js';
import coachNotesHandler from './_handlers/coach-notes.js';
import coachTargetsHandler from './_handlers/coach-targets.js';
import checkInsHandler from './_handlers/check-ins.js';
import measurementsHandler from './_handlers/measurements.js';
import subscriptionRequestHandler from './_handlers/subscription-request.js';
import planVersionsHandler from './_handlers/plan-versions.js';
import profileHandler from './_handlers/profile.js';
import logsWorkoutHandler from './_handlers/logs-workout.js';
import logsNutritionHandler from './_handlers/logs-nutrition.js';
import logsWeightHandler from './_handlers/logs-weight.js';
import logsCardioHandler from './_handlers/logs-cardio.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = getPathSegments(req, '/api/client');
  const key = segments.join('/');
  switch (key) {
    case 'assessment': return assessmentHandler(req, res);
    case 'workout-plan': return workoutPlanHandler(req, res);
    case 'nutrition-plan': return nutritionPlanHandler(req, res);
    case 'cardio-plan': return cardioPlanHandler(req, res);
    case 'coach-notes': return coachNotesHandler(req, res);
    case 'coach-targets': return coachTargetsHandler(req, res);
    case 'check-ins': return checkInsHandler(req, res);
    case 'measurements': return measurementsHandler(req, res);
    case 'subscription-request': return subscriptionRequestHandler(req, res);
    case 'plan-versions': return planVersionsHandler(req, res);
    case 'profile': return profileHandler(req, res);
    case 'logs/workout': return logsWorkoutHandler(req, res);
    case 'logs/nutrition': return logsNutritionHandler(req, res);
    case 'logs/weight': return logsWeightHandler(req, res);
    case 'logs/cardio': return logsCardioHandler(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
