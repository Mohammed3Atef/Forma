/**
 * Central registry of stable `data-testid` values used across the suite.
 *
 * Tests should prefer these over fragile text/CSS selectors. Every value here
 * must correspond to a `data-testid` rendered in src/. Keep this file in sync
 * with the components — it is the contract between the app and the QA suite.
 */
export const TID = {
  // Auth ---------------------------------------------------------------------
  loginForm: 'login-form',
  loginEmail: 'login-email',
  loginPassword: 'login-password',
  loginSubmit: 'login-submit',
  loginToggleMode: 'login-toggle-mode',
  loginError: 'login-error',
  accountPending: 'account-pending',
  accountSuspended: 'account-suspended',

  // App shell / nav ----------------------------------------------------------
  appShell: 'app-shell',
  bottomNav: 'bottom-nav',
  navItem: (key: string) => `nav-${key}`,
  brandBar: 'brand-bar',

  // Client -------------------------------------------------------------------
  waitingForCoach: 'waiting-for-coach',
  clientHome: 'client-home',

  // Coach --------------------------------------------------------------------
  coachClients: 'coach-clients',
  coachAddClient: 'coach-add-client',
  coachClientRow: 'coach-client-row',
  coachAddForm: 'coach-add-client-form',
  coachAddName: 'coach-add-name',
  coachAddEmail: 'coach-add-email',
  coachAddPassword: 'coach-add-password',
  coachAddSubmit: 'coach-add-submit',

  coachClientDetail: 'coach-client-detail',
  coachViewActivity: 'coach-view-activity',

  // Coach: assessment review ------------------------------------------------
  coachViewAssessment: 'coach-view-assessment',
  coachClientAssessment: 'coach-client-assessment',
  assessmentStatusBadge: 'assessment-status-badge',
  assessmentStatusPill: 'assessment-status',
  assessmentCoachNotes: 'assessment-coach-notes',
  assessmentSaveNotes: 'assessment-save-notes',
  assessmentMarkReviewed: 'assessment-mark-reviewed',
  assessmentReset: 'assessment-reset',
  assessmentBuild: (kind: string) => `assessment-build-${kind}`,
  // Client wizard
  assessmentWizard: 'assessment-wizard',
  assessmentSaveProgress: 'assessment-save-progress',
  assessmentNext: 'assessment-next',
  assessmentSubmit: 'assessment-submit',
  assessmentGoDashboard: 'assessment-go-dashboard',
  coachManage: 'coach-manage',
  coachEditWorkout: 'coach-edit-workout',
  coachEditNutrition: 'coach-edit-nutrition',
  coachEditCardio: 'coach-edit-cardio',
  coachSetTargets: 'coach-set-targets',
  coachAddNote: 'coach-add-note',
  coachNoteBody: 'coach-note-body',
  coachNoteSave: 'coach-note-save',
  coachTargetsField: (k: string) => `targets-${k}`,
  coachTargetsSave: 'coach-targets-save',

  // Coach: workout editor (drill-down PlanBuilder) ---------------------------
  coachWorkoutEditor: 'coach-workout-editor',
  workoutSave: 'workout-save',
  workoutPlanName: 'workout-plan-name',
  workoutUnsaved: 'workout-unsaved',
  saveAsTemplate: 'save-as-template',
  templateFromPlanName: 'template-from-plan-name',
  // PlanBuilder levels + actions
  builderPlan: 'builder-plan',
  builderDay: 'builder-day',
  builderSection: 'builder-section',
  builderAddDay: 'builder-add-day',
  builderAddSection: 'builder-add-section',
  builderAddExercise: 'builder-add-exercise',
  builderDayCard: 'builder-day-card',
  // Exercise picker sheet
  exercisePicker: 'exercise-picker',
  pickerSearch: 'picker-search',
  pickerQuickCreate: 'picker-quick-create',
  pickerLibItem: 'picker-lib-item',
  // Exercise form (used in picker + library)
  exerciseForm: 'exercise-form',
  exName: 'ex-name',
  exTarget: 'ex-target',
  exWarmupSets: 'ex-warmup-sets',
  exWorkingSets: 'ex-working-sets',
  exReps: 'ex-reps',
  exRest: 'ex-rest',
  exVideo: 'ex-video',
  exNotes: 'ex-notes',
  exSave: 'ex-save',
  preset: (k: string) => `preset-${k}`,

  // Coach: library hub (exercises / foods / groups) --------------------------
  coachLibrary: 'coach-library',
  libNew: 'lib-new',
  libSearch: 'lib-search',
  libItem: 'lib-item',
  libTab: (tab: string) => `lib-tab-${tab}`,
  // Foods
  foodNew: 'food-new',
  foodItem: 'food-item',
  lfName: 'lf-name',
  lfQuantity: 'lf-quantity',
  lfMacro: (k: string) => `lf-${k}`,
  lfSave: 'lf-save',
  // Food groups
  groupNew: 'group-new',
  groupItem: 'group-item',
  grpName: 'grp-name',
  grpSave: 'grp-save',
  grpFood: (id: string) => `grp-food-${id}`,
  // Nutrition substitutions (coach editor + client)
  subPolicy: 'sub-policy',
  policyFlag: (k: string) => `policy-${k}`,
  mealAllowedGroup: 'meal-allowed-group',
  foodAllowCustom: 'food-allow-custom',
  clientSwap: 'client-swap',
  swapSheet: 'swap-sheet',
  swapApprovedItem: 'swap-approved-item',
  swapCustom: 'swap-custom',
  subBadge: 'sub-badge',
  activitySubstitutions: 'activity-substitutions',

  // Coach: workout templates -------------------------------------------------
  coachTemplates: 'coach-templates',
  templateNew: 'template-new',
  templateCard: 'template-card',
  templateAssign: 'template-assign',
  assignClientBtn: 'assign-client',
  coachTemplateEditor: 'coach-template-editor',
  templateName: 'template-name',
  templateSave: 'template-save',

  // Coach: plan versions -----------------------------------------------------
  versionSaveNew: 'version-save-new',
  versionHistory: 'version-history',
  versionReason: 'version-reason',
  versionSaveConfirm: 'version-save-confirm',
  planVersionHistory: 'plan-version-history',
  versionRow: 'version-row',
  versionRestoreFor: (n: number) => `version-restore-${n}`,
  versionActive: 'version-active',

  // Coach: nutrition editor --------------------------------------------------
  coachNutritionEditor: 'coach-nutrition-editor',
  nutritionSave: 'nutrition-save',
  nutritionPlanName: 'nutrition-plan-name',
  nutritionTarget: (k: string) => `nutrition-target-${k}`,
  nutritionWaterTarget: 'nutrition-water-target',
  nutritionAddMeal: 'nutrition-add-meal',
  nutritionAddFood: 'nutrition-add-food',
  foodForm: 'food-form',
  foodName: 'food-name',
  foodQuantity: 'food-quantity',
  foodMacro: (k: string) => `food-${k}`,
  foodSave: 'food-save',

  // Coach: cardio editor -----------------------------------------------------
  coachCardioEditor: 'coach-cardio-editor',
  cardioSave: 'cardio-save',
  cardioPlanName: 'cardio-plan-name',
  cardioAddSession: 'cardio-add-session',
  cardioSessionForm: 'cardio-session-form',
  cardioType: (ty: string) => `cardio-type-${ty}`,
  sessDuration: 'sess-duration',
  sessFrequency: 'sess-frequency',
  sessNotes: 'sess-notes',
  sessSave: 'sess-save',

  // Admin --------------------------------------------------------------------
  adminOverview: 'admin-overview',
  adminAccounts: 'admin-accounts',
  adminAssignments: 'admin-assignments',
  adminGovernance: 'admin-governance',
  adminAnalytics: 'admin-analytics',
  adminClientDetail: 'admin-client-detail',

  // Admin: accounts ----------------------------------------------------------
  adminCreateAccount: 'admin-create-account',
  accountRow: 'account-row',
  cannotEditAccount: 'cannot-edit-account',
  createAccountForm: 'create-account-form',
  createEmail: 'create-email',
  createName: 'create-name',
  createPassword: 'create-password',
  createRole: (r: string) => `create-role-${r}`,
  createSubmit: 'create-submit',
  createError: 'create-error',
  setRole: (r: string) => `set-role-${r}`,
  setStatus: (s: string) => `set-status-${s}`,
  roleOptions: 'role-options',
  statusOptions: 'status-options',

  // Admin: assignments -------------------------------------------------------
  assignClientRow: 'assign-client-row',
  assignCoachRow: 'assign-coach-row',
  assignUnassign: 'assign-unassign',

  // Confirm dialog -----------------------------------------------------------
  confirmDialog: 'confirm-dialog',
  confirmAccept: 'confirm-accept',
  confirmCancel: 'confirm-cancel',
} as const;

/** Build a `[data-testid="..."]` CSS selector. */
export function byId(id: string): string {
  return `[data-testid="${id}"]`;
}
