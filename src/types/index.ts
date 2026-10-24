/**
 * Central domain model for Gym Tracker.
 * All dates that represent a *calendar day* use ISO `YYYY-MM-DD` strings (local day).
 * All timestamps (instants) use epoch milliseconds (number).
 */

/** Coach-authored/admin-authored bilingual text. `ar` covers both `ar` and `ar-eg` (Egyptian visitors see the same Arabic text) — resolved via `useLocalized()`. */
export type LocalizedText = { en: string; ar: string };

/** Same idea as `LocalizedText` but for an ordered list (e.g. plan feature bullets) — both language lists kept in the same order/length by the editing UI. */
export type LocalizedTextList = { en: string[]; ar: string[] };

export type Locale = 'en' | 'ar' | 'ar-eg';
export type Theme = 'dark' | 'light';

/** A day key in `YYYY-MM-DD` form. */
export type DayKey = string;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type Goal = 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintenance' | 'strength';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  weightKg: number;
  heightCm: number;
  goal: Goal;
  activityLevel: ActivityLevel;
  locale: Locale;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Accounts, roles & access control (Forma platform)
// ---------------------------------------------------------------------------

/** Platform roles, from most to least privileged. */
export type Role = 'super_admin' | 'admin' | 'coach' | 'client';

/** Lifecycle state of an account. Only `active` accounts may use the platform. */
export type AccountStatus = 'active' | 'suspended' | 'pending' | 'disabled';

/**
 * Granular permission keys. Each role implies a baseline set (see
 * `ROLE_PERMISSIONS` in src/services/auth/roles.ts); `UserRecord.permissions`
 * can grant extras beyond that baseline. The server (`api/_lib/rbac.ts`) enforces the same set.
 */
export type Permission =
  | 'users.read' // list/read other users' identity docs
  | 'users.create' // provision new accounts
  | 'users.manageRoles' // change role / permissions on other users
  | 'users.manageStatus' // suspend / disable / reactivate accounts
  | 'coaches.assign' // create/transfer coach⇄client relationships
  | 'clients.readAll' // read ANY client's clientData (admin oversight)
  | 'clients.writeAll' // write plans/notes to ANY client
  | 'flags.manage' // manage the featureFlags collection
  | 'audit.read'; // read adminAuditLogs

/**
 * Identity / access-control document at `users/{uid}`. Deliberately separate
 * from `UserProfile` (the fitness profile, which lives at
 * `clientData/{uid}/profile`). A user can never elevate their own role,
 * permissions, or status — that is enforced server-side (`auth.updateProfile`).
 */
export interface UserRecord {
  id: string; // == Firebase Auth uid
  email: string;
  displayName: string;
  phone?: string; // contact number, collected at sign-up / account creation
  photoUrl?: string; // avatar (Bunny CDN url); falls back to initials
  timezone?: string; // IANA tz (coach-set; display-only for now)
  mustChangePassword?: boolean; // set when an admin/coach provisions with a temp password
  role: Role;
  accountStatus: AccountStatus;
  permissions: Permission[];
  featureFlags: Record<string, boolean>;
  createdBy: string; // actor uid, or 'self' for open sign-up
  assignedCoachId?: string; // clients managed by a coach
  /** Lowercased displayName for case-insensitive prefix search (existing-client lookup). */
  displayNameLower?: string;
  /** Invite code used at signup (invite-driven self-assignment); audit/trace only. */
  inviteCode?: string;
  // Coach profile (all optional; populated as the coach completes onboarding).
  bio?: string;
  specialty?: string;
  yearsExperience?: number;
  instagram?: string;
  whatsapp?: string;
  /** Coach's default billing currency (e.g. "EGP", "USD"); applied to plans + new terms. */
  currency?: string;
  /** Coach onboarding checklist progress (Phase 1). Derived from real data where possible. */
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Coach plan (Layer A — the coach's own subscription to Forma). NEW collection
// `coachPlans/{coachId}`. Distinct from the per-client `Subscription` (Layer B).
// ---------------------------------------------------------------------------

/**
 * FORMA is ONE product: Free Trial → monthly subscription, every feature
 * included. `plan` is the PHASE ('trial' | 'forma'; pre-refactor test rows
 * may carry an old key — read `phase` instead). Extra client capacity is
 * sold as internal capacity add-ons, never as another plan.
 */
export type CoachPlanTier = string;
export type CoachPlanPhase = 'trial' | 'forma';
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';
export type CoachPlanState = 'trial' | 'active' | 'expired' | 'suspended' | 'none';

/** Super-Admin-editable Forma configuration (Mongo `coachPlanTiers/forma`). */
export interface FormaConfig {
  key: 'forma';
  label: string;
  trialEnabled: boolean;
  trialDurationDays: number;
  /** null = the Trial gets the full base limit. */
  trialClientLimit: number | null;
  /** Base active-client limit included in Forma (before add-ons). */
  maxClients: number;
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  termDays: number;
  publicVisible: boolean;
  signupEnabled: boolean;
  marketingTitle: LocalizedText;
  marketingDescription: LocalizedText;
  marketingFeatures: LocalizedTextList;
  createdAt: number;
  updatedAt: number;
}

/** Signed-out pricing card — the safe public subset. */
export interface PublicFormaPlan {
  key: 'forma';
  marketingTitle: LocalizedText;
  marketingDescription: LocalizedText;
  marketingFeatures: LocalizedTextList;
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  maxClients: number;
  trialEnabled: boolean;
  trialDurationDays: number | null;
  trialClientLimit: number;
  signupEnabled: boolean;
}

export interface SubscriptionTermSnapshot {
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  termDays: number;
  maxClients: number;
  requestId: string;
  termStartsAt?: number;
  confirmedAt?: number;
}

export interface CoachPlan {
  coachId: string; // == doc id
  plan: CoachPlanTier;
  phase: CoachPlanPhase;
  /** Effective state with the end date folded in (server-computed at read time). */
  state: CoachPlanState;
  status: CoachPlanStatus;
  /** EFFECTIVE client limit = base + add-ons + manual adjustment. */
  maxClients: number;
  baseMaxClients: number;
  addonClientCapacity: number;
  manualCapacityAdjustment: number;
  manualCapacityNote?: { reason: string; by: string; at: number };
  startedAt: number;
  endsAt: number | null;
  /** The confirmed paid term (absent during the Trial). */
  subscription?: SubscriptionTermSnapshot;
  /** Maintained client-usage counter (server-side). */
  activeClientCount?: number;
  history?: PlanHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

/** One entry in the coach plan's change history (newest pushed last). */
export interface PlanHistoryEntry {
  at: number;
  action: string;
  detail?: string;
  by?: string;
}

/** subscription / renewal / trial_expired = the Forma subscription; capacity_addon = a capacity package. Legacy test rows may carry new_signup / trial_upgrade / plan_change. */
export type PlanRequestType = 'subscription' | 'renewal' | 'trial_expired' | 'capacity_addon' | 'new_signup' | 'trial_upgrade' | 'plan_change';
export type PlanRequestStatus = 'awaiting' | 'processing' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

export interface PlanSnapshot {
  tierKey: string;
  label: LocalizedText;
  priceMonthly: number;
  currency: string;
  billingInterval?: 'month';
  maxClients: number;
  termDays: number;
}

export interface CapacitySnapshot {
  packageId: string;
  name: LocalizedText;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  durationMonths: number | null;
}

/**
 * A coach's request (Mongo `coachPlanRequests`) with an IMMUTABLE snapshot.
 * Entitlements never come from a request — only a Super Admin confirmation
 * applies the snapshot.
 */
export interface CoachPlanRequest {
  id: string;
  coachId: string;
  type: PlanRequestType;
  requestKey?: string;
  requestedTierKey?: string;
  planSnapshot?: PlanSnapshot;
  capacitySnapshot?: CapacitySnapshot;
  status: PlanRequestStatus;
  requestedAt: number;
  confirmationDeadline: number;
  confirmedAt?: number;
  confirmedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  cancelledAt?: number;
  expiredAt?: number;
  adminNote?: string;
  reason?: string;
}

/** Super Admin queue row — request + coach identity + their CURRENT plan. */
export interface AdminPlanRequestRow extends CoachPlanRequest {
  coachName: string | null;
  coachEmail: string | null;
  currentPlan: CoachPlan | null;
}

/** Super-Admin capacity package (internal; never public). */
export interface CapacityPackage {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  badge?: LocalizedText;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  durationMonths?: number;
  active: boolean;
  coachVisible: boolean;
  promotional?: boolean;
  sortOrder: number;
  validFrom?: number | null;
  validUntil?: number | null;
  targetCoachIds?: string[];
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Admin list only. */
  activeHolders?: number;
}

/** What a coach sees of a package they can request. */
export interface CoachCapacityOffer {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  badge: LocalizedText | null;
  additionalClients: number;
  price: number;
  currency: string;
  billingInterval: 'month' | 'one_time';
  durationMonths: number | null;
  promotional: boolean;
  validUntil: number | null;
}

export interface CapacityEntitlement {
  id: string;
  coachId: string;
  sourcePackageId: string | null;
  source: 'request' | 'admin_package' | 'admin_custom';
  snapshot: CapacitySnapshot;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: number;
  endsAt: number | null;
  requestId: string | null;
  confirmedBy: string;
  note?: string;
  renewals?: { at: number; requestId: string | null; by: string; snapshot: CapacitySnapshot; endsAt: number | null }[];
  cancelledAt?: number;
  cancelReason?: string;
  expiredAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Coach My Plan — one bounded read. */
export interface CoachCommercialOverview {
  config: FormaConfig;
  plan: CoachPlan | null;
  activeEntitlements: CapacityEntitlement[];
  pastEntitlements: CapacityEntitlement[];
  requests: CoachPlanRequest[];
  availablePackages: CoachCapacityOffer[];
}

/** Super Admin coach detail — same as the coach view plus the full catalogue. */
export interface AdminCoachCommercial {
  config: FormaConfig;
  plan: CoachPlan | null;
  activeEntitlements: CapacityEntitlement[];
  pastEntitlements: CapacityEntitlement[];
  requests: CoachPlanRequest[];
  packages: CapacityPackage[];
}

// ---------------------------------------------------------------------------
// Client invitations (Phase 1). NEW collection `signupInvites/{code}`. A coach
// generates a single-use code; the visitor claims it at `/invite/:code`, sets a
// password, and is auto-assigned to that coach.
// ---------------------------------------------------------------------------

export type SignupInviteStatus = 'pending' | 'claimed' | 'revoked';

/**
 * What the PUBLIC claim screen may learn about an invite (B3.0.1 / B3-S03):
 * no invitee email or phone, no coach id, no price. `emailHint` is masked
 * (`m•••@gmail.com`); the server uses the invite's real email on claim.
 */
export interface PublicInvite {
  code: string;
  status: SignupInviteStatus;
  claimable: boolean;
  expiresAt?: number | null;
  coachName?: string;
  displayName?: string;
  hasEmail: boolean;
  emailHint?: string;
}

export interface SignupInvite {
  code: string; // == doc id
  coachId: string;
  /** Coach display name, denormalised so the pre-auth claim screen can show it without a users read. */
  coachName?: string;
  email?: string;
  displayName?: string;
  phone?: string;
  // Client subscription the coach chose on this invite; applied on claim so no
  // invited client is ever assigned without a subscription state. Defaults to trial.
  subStatus?: SubscriptionStatus;
  subPlanName?: string;
  subPrice?: number;
  subCurrency?: string;
  subBillingCycle?: BillingCycle;
  subMonths?: number; // for an 'active' term (1 or 3)
  subDays?: number; // for an 'active' term measured in days (coach plan with unit='days')
  subTrialDays?: number; // for a 'trial' (default 14)
  status: SignupInviteStatus;
  /** B4.1: what happened to the invite email (absent: no email on the invite). `unconfirmed` = no answer in time. */
  emailStatus?: 'sent' | 'not-sent' | 'unconfirmed';
  emailAttemptAt?: number;
  claimedByUid?: string | null;
  createdAt: number;
  claimedAt?: number | null;
  expiresAt?: number | null;
}

// ---------------------------------------------------------------------------
// Client onboarding assessment
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female';
export type AssessmentGoal =
  | 'fat_loss'
  | 'muscle_gain'
  | 'recomp'
  | 'strength'
  | 'general_fitness'
  | 'endurance';
export type OccupationType = 'desk' | 'moderate' | 'physical';
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingLocation = 'commercial_gym' | 'home_gym' | 'both';
export type InjuryArea = 'shoulder' | 'elbow' | 'wrist' | 'back' | 'knee' | 'ankle';
export type FoodBudget = 'low' | 'medium' | 'high';
export type AssessmentChallenge =
  | 'consistency'
  | 'time'
  | 'hunger'
  | 'eating_out'
  | 'travel'
  | 'motivation'
  | 'other';

export interface AssessmentBasic {
  fullName: string;
  dateOfBirth: string; // ISO YYYY-MM-DD
  age: number; // derived from dateOfBirth on submit
  gender: Gender;
  heightCm: number;
  weightKg: number;
}
export interface AssessmentGoals {
  primaryGoal: AssessmentGoal;
  /** Optional ordered priorities (most → least important). */
  goalPriorities?: AssessmentGoal[];
  targetWeightKg?: number;
  deadlineMonths?: number;
}
export interface AssessmentLifestyle {
  occupation: OccupationType;
  sleepHours: number; // 4–12
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number; // 1–7
}
export interface AssessmentTraining {
  level: TrainingLevel;
  location: TrainingLocation;
}
export interface AssessmentHealth {
  injuries: InjuryArea[];
  noInjuries: boolean;
  injuryDetails?: string;
  hasMedicalConditions: boolean;
  medicalDetails?: string;
}
export interface AssessmentNutrition {
  likes: string[];
  dislikes: string[];
  allergies: string[];
  /** Foods the client won't give up — helps build a realistic plan. */
  mustHaveFoods: string[];
  budget: FoodBudget;
  mealsPerDay: number; // 2–6
}
export interface AssessmentMotivation {
  biggestChallenge: AssessmentChallenge;
  commitmentLevel: number; // 1–10
}
export interface AssessmentPhotos {
  front?: string;
  side?: string;
  back?: string;
}

/**
 * Lifecycle of the onboarding assessment. `not_started` = no doc; `in_progress`
 * = client saved a draft; `submitted` = client finished; `reviewed` = the coach
 * has reviewed it. Legacy docs (no `status`, `completed:true`) read as
 * `submitted` via `assessmentStatus()` in src/lib/assessment.ts.
 */
export type AssessmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review';

/**
 * Mandatory client onboarding assessment, stored in structured sections at
 * `clientData/{clientId}/profile/assessment`. Client-owned (writes their own
 * until the coach marks it reviewed); the assigned coach + admins read it, and
 * the assigned coach writes the review fields (coachNotes / reviewed / reset).
 */
export interface ClientAssessment {
  basic: AssessmentBasic;
  goals: AssessmentGoals;
  lifestyle: AssessmentLifestyle;
  training: AssessmentTraining;
  health: AssessmentHealth;
  nutrition: AssessmentNutrition;
  motivation: AssessmentMotivation;
  progressPhotos: AssessmentPhotos;
  /** 0–100; set to 100 on completion (room for partial-completion UI later). */
  completionPercentage: number;
  completed: boolean;
  completedAt: number | null;
  updatedAt: number;
  // ---- review loop (additive; legacy docs derive status from `completed`) ----
  status?: AssessmentStatus;
  submittedAt?: number | null;
  /** Coach review metadata. */
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  /** Free-text notes the coach records while reviewing. */
  coachNotes?: string;
}

export type CoachClientStatus = 'active' | 'pending' | 'ended';

/** Coaching subscription lifecycle (stored on the coach⇄client relationship). */
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'custom';
/** Coaching subscription state. trial/active = full; pending = limited; expired/cancelled/frozen = read-only (full gating lands in Phase 2). */
export type SubscriptionStatus = 'trial' | 'active' | 'pending' | 'expired' | 'cancelled' | 'frozen' | 'ended';

/**
 * A client's coaching subscription, kept on the `coachClients/{coachId__clientId}`
 * relationship (coach-owned, client-readable). A freeze pauses the term and
 * extends `endAt` by the frozen duration. `status` is the coach's explicit state;
 * use `effectiveSubscriptionStatus()` to fold in the current date.
 */
export interface Subscription {
  startAt: number;
  endAt: number;
  months?: number; // original term, for display
  price?: number; // amount the coach charges for this term (coach-set, client-read)
  currency?: string; // e.g. "EGP", "USD" — coach-set
  planName?: string; // coach-facing label
  billingCycle?: BillingCycle;
  cancelledAt?: number | null;
  status: SubscriptionStatus;
  frozenFrom?: number | null;
  frozenUntil?: number | null;
  /** B3.0.1: compensation (ms) a scheduled freeze added to `endAt`; absent on freezes stored before B3.0.1. */
  freezeCredit?: number | null;
  note?: string; // coach note (e.g. why frozen)
  updatedAt: number;
  /**
   * B3.8 (fixed-day terms, Fix C, payments) — absent on terms written before B3.8, which work
   * from `startAt` / `endAt` alone. `termId`: the economic term (corrections keep it, a renewal
   * starts a new one, payments point at it). `startDate` / `endDate`: the term's calendar days
   * `[startDate, endDate)` in `zone` — `endDate` is EXCLUSIVE (30 days from 1 Oct covers 1–30 Oct,
   * the next term starts 31 Oct). `days`: the booked length (1 month = 30 days).
   */
  termId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  zone?: string;
}

/**
 * An archived subscription term, kept on the relationship's `subscriptionHistory`
 * so coach and client can see how long / how much the client has subscribed.
 * B3.8: only a RENEWAL archives (`archivedBy: 'renew'`), with the term's real end;
 * entries without it were archived by the pre-B3.8 "Set term" and are kept as they are.
 */
export interface SubscriptionPeriod {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  status: SubscriptionStatus; // 'expired' = it had run out; 'ended' = renewed (or replaced) while running
  endedAt: number; // when this period was archived
  termId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  zone?: string;
  planName?: string;
  archivedBy?: 'renew';
}

/** B3.8 — how the coach says a client paid them (manual record; Forma verifies nothing). */
export type PaymentMethod = 'cash' | 'mobile_wallet' | 'instapay';

/**
 * B3.8 (owner decision 1) — a payment a coach RECORDED (or the reversal of one). Amounts are whole
 * piastres (EGP minor units). Never edited or deleted: a mistake is reversed (`reversedById`), a
 * correction is a reversal plus a new payment (`correctsId`). Coach-only; clients never read these.
 */
export interface ClientPayment {
  id: string;
  kind: 'payment' | 'reversal';
  coachId: string;
  clientId: string;
  relationshipId: string;
  termId: string | null;
  amountMinor: number;
  currency: 'EGP';
  method: PaymentMethod;
  paidAt: number;
  reference?: string;
  note?: string;
  reversesId?: string;
  reversedById?: string;
  reversedAt?: number;
  reason?: string;
  correctsId?: string;
  requestId: string;
  createdBy: string;
  createdByRole: 'coach' | 'admin';
  createdAt: number;
}

/**
 * A coach-defined, reusable client subscription plan (e.g. "3 Months", "Monthly").
 * Stored at `coachAssets/{coachId}/plans/{id}`. The coach picks one when assigning
 * a subscription; it seeds the duration + price (still overridable per client).
 */
export interface CoachSubscriptionPlan {
  id: string;
  coachId: string;
  name: string;
  /** Duration unit + value, e.g. 90 `days` or 3 `months`. */
  unit: 'days' | 'months';
  duration: number;
  /** Price in the coach's default currency (omit for a free plan). */
  price?: number;
  /** When true, assigning creates a `trial` subscription (free-access semantics). */
  isTrial?: boolean;
  /** Sort order in the picker (ascending). */
  order?: number;
  /** Soft-delete — archived plans drop out of the picker but keep history. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Coach⇄client link. Doc id is deterministic: `${coachId}__${clientId}`. */
export interface CoachClientRelationship {
  id: string;
  coachId: string;
  clientId: string;
  status: CoachClientStatus;
  /** Coaching subscription term + freeze state (absent until the coach sets it). */
  subscription?: Subscription;
  /** Past subscription terms (newest pushed last), for the history view. */
  subscriptionHistory?: SubscriptionPeriod[];
  /** Invite code that established the relationship (invite-driven self-claim). */
  inviteCode?: string;
  // ---- lifecycle close metadata (set when status becomes 'ended') ----
  /** When the relationship was closed (release / transfer / unassign). */
  endedAt?: number;
  /** Actor uid who closed it. */
  endedBy?: string;
  /** Why it closed — drives the coaching timeline. */
  endReason?: 'released' | 'transferred' | 'unassigned';
  /** Transfer mode, when it ended because the client was transferred. */
  mode?: TransferMode;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /**
   * B3.4 / B3-S13: earlier stints of the same coach ⇄ client pair, archived when the client
   * returned (oldest first). Another coach sees their facts only (dates, how they ended).
   */
  previousStints?: (Omit<CoachClientRelationship, 'id' | 'coachId' | 'clientId' | 'previousStints' | 'createdBy'> & { createdBy?: string; archivedAt: number })[];
}

/** How a transfer treats the previous coach's plans/content. */
export type TransferMode = 'fresh_start' | 'keep_plans';
/** How a transfer treats the coaching subscription. */
export type TransferSubHandling = 'keep' | 'new' | 'expire';
export type TransferRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

/**
 * A coach→admin/current-coach request to take over a client owned by another
 * coach, at top-level `transferRequests/{toCoachId__clientId}`. The requesting
 * (prospective) coach creates it `pending`; the current coach or an admin
 * resolves it (`accepted`/`rejected`), or the requester `cancelled`s it.
 */
export interface ClientTransferRequest {
  id: string; // `${toCoachId}__${clientId}`
  clientId: string;
  fromCoachId: string; // current coach
  toCoachId: string; // requesting (prospective) coach
  mode?: TransferMode;
  subscriptionHandling?: TransferSubHandling;
  reason: string;
  status: TransferRequestStatus;
  requestedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  adminNote?: string;
  updatedAt: number;
}

export type FreezeRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

/**
 * A client-initiated request to freeze their subscription, at
 * `clientData/{clientId}/subscriptionRequest/current`. The client writes the
 * request (status `pending`/`cancelled`); the assigned coach writes the decision
 * (`accepted`/`rejected` + `coachNote`) and, on accept, applies the freeze.
 */
export interface FreezeRequest {
  id: string; // always 'current'
  clientId: string;
  from?: number | null;
  until?: number | null;
  reason: string;
  status: FreezeRequestStatus;
  requestedAt: number;
  decidedAt?: number | null;
  decidedBy?: string | null;
  coachNote?: string;
  updatedAt: number;
}

/** Best-effort audit record (client-written; immutable once created). */
export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  targetUserId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export type FeatureFlagScope = 'global' | 'coach' | 'client';

export interface FeatureFlag {
  id: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  targetId?: string; // uid the flag applies to when scope is 'coach' | 'client'
  updatedAt: number;
}

/** Which client-app screen a note/notification points at. */
export type NoteScreen = 'nutrition' | 'workout' | 'cardio' | 'progress' | 'measurements' | 'photos';

/** B0 / CO-02: `private` (default, coach-only) or explicitly shared with the `client`. Missing = private. */
export type NoteVisibility = 'private' | 'client';

/**
 * The kind of entity a coach note is attached to. Notes are anchored by
 * (entityType, entityId) — NEVER by screen coordinates — so they render next to
 * the right item on any device/layout and survive UI redesigns.
 */
export type NoteEntityType =
  | 'meal'
  | 'food'
  | 'water'
  | 'supplement'
  | 'exercise'
  | 'workout_day'
  | 'cardio_session'
  | 'measurement'
  | 'weight_entry'
  | 'progress_photo'
  | 'checkin';

/** A coach's note about a client. Lives at `clientData/{clientId}/coachNotes`. */
export interface CoachNote {
  id: string;
  clientId: string;
  authorId: string;
  authorRole: Role;
  body: string;
  /** Distinguishes one-off notes from broadcast announcements. */
  kind?: 'note' | 'announcement';
  /** Who can read it. The server never returns private notes to the client. */
  visibility?: NoteVisibility;
  // ---- entity anchoring (all optional; legacy/general notes have none) ----
  /** Client screen the note belongs to (drives notification deep-link). */
  screen?: NoteScreen;
  /** Day the note refers to (for day-scoped entities). */
  date?: DayKey;
  /** What the note is attached to. */
  entityType?: NoteEntityType;
  /** Stable id of the anchored entity (meal id, exercise id, photo id, measurement key…). */
  entityId?: string;
  /** Reserved for a future visual-placement hint; unused today. */
  anchor?: { placement?: 'inline' | 'above' | 'below' | 'badge' };
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

/** Why a notification was raised. The first group targets the client, the second the coach. */
export type NotificationType =
  | 'coach_note'
  | 'plan_assigned'
  | 'targets_updated'
  | 'subscription_updated'
  | 'freeze_decided'
  | 'measurement_added'
  | 'assessment_reviewed'
  | 'freeze_requested'
  | 'assessment_submitted'
  | 'checkin_requested'
  | 'checkin_submitted'
  | 'checkin_reviewed'
  | 'message_received'
  | 'trial_expiring'
  | 'plan_change_requested'
  | 'plan_decided'
  | 'coach_assigned'
  | 'client_released';

/**
 * An in-app notification. Lives at `clientData/{clientId}/notifications/{id}` and
 * is written by whichever party acted (coach or client) — `forRole` says who
 * should see it. Read-state lives here (`seenAt`). The deep-link target mirrors
 * the note anchoring fields so tapping a notification jumps to the exact place.
 */
export interface AppNotification {
  id: string;
  clientId: string;
  forRole: 'client' | 'coach';
  type: NotificationType;
  /** Short preview text; the title is derived from `type` via i18n at render time. */
  body?: string;
  // ---- deep-link target ----
  screen?: NoteScreen;
  date?: DayKey;
  entityType?: NoteEntityType;
  entityId?: string;
  /** Explicit fallback route when there's no screen/entity mapping. */
  route?: string;
  /** DONE: the task it asked for was completed (B0 / NT-03) — also counts as read. */
  resolvedAt?: number | null;
  /** READ: seen by the user — the unread badge counts rows where this is null. */
  seenAt?: number | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** Weekly check-in lifecycle: coach requests → client submits → coach reviews. */
export type CheckInStatus = 'requested' | 'submitted' | 'reviewed';

/**
 * One weekly check-in, at `clientData/{clientId}/checkIns/{weekStart}` (one per
 * ISO week; the doc id IS the weekStart date). The coach creates it (`requested`),
 * the client fills + submits it once (`submitted`), and the coach reviews it with
 * feedback (`reviewed`). Online read (React Query) — not in the local SyncEngine.
 */
export interface WeeklyCheckIn {
  id: string; // the record key: weekStart, or `weekStart__coachId` for a second coach's record of that week (B3.4)
  clientId: string;
  coachId: string;
  weekStart: string; // YYYY-MM-DD (Mon)
  weekEnd: string; // YYYY-MM-DD (Sun)
  status: CheckInStatus;
  submittedAt?: number;
  reviewedAt?: number;
  currentWeight?: number; // kg, decimal
  adherenceTraining?: number; // 0..100
  adherenceNutrition?: number; // 0..100
  hungerLevel?: number; // 1..10
  energyLevel?: number; // 1..10
  sleepQuality?: number; // 1..10
  notes?: string;
  progressPhotos: { front?: string; side?: string; back?: string }; // Bunny CDN urls
  coachFeedback?: string;
  /** B3.4 (client reads only): a previous coach's request left open — it can no longer be answered. */
  closed?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Optional category for a coach broadcast message (plain 1:1 chat omits it). */
export type MessageCategory = 'message' | 'announcement' | 'offer' | 'reminder' | 'update';

/**
 * A single chat message in the 1:1 coach⇄client thread at
 * `clientData/{clientId}/messages/{id}`. Both parties read+write. `seenAt` is set
 * when the OTHER party opens the thread (Sent → Seen). Broadcasts are normal
 * messages fanned into each client's thread with `broadcast: true` + a category.
 */
/** A CDN-hosted attachment on a message (image / video / audio / document). */
export interface MessageAttachment {
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  name?: string;
  size?: number;
  /** Original file MIME type, e.g. `image/svg+xml`. Additive — absent on messages sent before this field existed; renderers fall back to extension-based detection on `name` when it's missing. */
  mimeType?: string;
}

/** The fixed set of reactions `messages.react` accepts — keep in sync with `api/messages/_data.ts`'s `REACTION_VALUES`. */
export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
/** How long after sending a message its sender may still edit/delete it — mirrors `EDIT_WINDOW_MS` in `api/messages/_data.ts`; the server is the real enforcement, this is only for the client to know when to hide the action. */
export const MESSAGE_EDIT_WINDOW_MS = 2 * 60 * 1000;

export interface Message {
  id: string;
  clientId: string;
  /** The conversation (coach id) it belongs to — B3.0.1 / B3-S14. Absent on legacy messages. */
  coachId?: string;
  fromUserId: string;
  fromRole: Role;
  body: string;
  attachment?: MessageAttachment;
  category?: MessageCategory;
  broadcast?: boolean;
  seenAt?: number | null;
  createdAt: number;
  updatedAt: number;
  /** Client-generated idempotency key set on send — see `sendMessage` in `messagesApi.ts`. */
  clientMsgId?: string;
  /** Set once the sender edits the message within the edit window. */
  editedAt?: number;
  /** Soft-delete tombstone — once set, `body`/`attachment`/`reactions` arrive redacted from the server. */
  deletedAt?: number;
  /** One reaction per user: `userId -> emoji`. */
  reactions?: Record<string, string>;
}

/** One prescribed cardio session in a coach's cardio plan. */
export interface CardioSession {
  id: string;
  type: CardioType;
  durationMin: number;
  /** Free-text frequency, e.g. "3×/week" or "after every workout". */
  frequency: string;
  notes: string;
}

/** Coach-authored cardio plan at `clientData/{clientId}/plan/cardio`. */
export interface CardioPlan {
  id: string;
  name: string;
  sessions: CardioSession[];
  meta?: AssignedPlanMeta;
  updatedAt: number;
}

/**
 * Coach-assigned daily targets. Singleton doc `current` at
 * `clientData/{clientId}/coachTargets`. The client app reads and applies these.
 */
export interface CoachTargets {
  id: string; // always 'current'
  clientId: string;
  waterMl?: number;
  steps?: number;
  cardioMin?: number;
  calories?: number;
  protein?: number;
  updatedBy: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Workout plan
// ---------------------------------------------------------------------------

/** B4 — structured, bilingual technique notes copied from the Forma catalog. */
export interface CatalogInstructionSet {
  setup: string[];
  steps: string[];
  cues: string[];
  mistakes: string[];
  safety: string[];
}

/** B4 — the credit a demonstration image / video must show wherever it is shown (licence + author + source). */
export interface MediaCredit {
  url: string;
  kind: 'image' | 'video';
  author: string;
  license: string;
  sourcePage?: string;
}

/**
 * B4 — what a food row's macros were computed from, when it came from the Forma catalog (or the
 * Open Food Facts search): values per 100 g, the serving, the state, and the source to credit.
 */
export interface FoodProvenance {
  catalogId?: string;
  catalogRev?: number;
  per100g?: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number };
  /** The serving: a household portion (or `g` for plain grams) × amount = grams. */
  portion?: { id: string; amount: number; grams: number; label?: LocalizedText };
  foodState?: 'raw' | 'cooked' | 'dry' | 'prepared' | 'as-sold';
  /** `recipe-estimate` / `proxy-estimate` are shown as estimates, with `sourceNote`. */
  verification?: 'source-values' | 'recipe-estimate' | 'proxy-estimate';
  sourceNote?: LocalizedText;
  source?: { provider: 'forma-catalog' | 'open-food-facts'; license: string; attribution: string; url?: string };
}

export interface Exercise {
  id: string;
  name: string;
  targetMuscle: string;
  /** Free-text describing warm-up sets, e.g. "1 set, 15-20 reps". */
  warmupSets: string;
  /** Coach-set number of warm-up sets (overrides the free-text `warmupSets`). */
  warmupSetCount?: number;
  /** Number of working sets prescribed. */
  workingSets: number;
  /** Free-text rep range, e.g. "8-12" or "AMRAP". */
  repRange: string;
  /** Reps in reserve (target effort). */
  rir: string;
  /** Tempo notation, e.g. "1:02:01". */
  tempo: string;
  notes: LocalizedText;
  /** Default rest in seconds for this exercise. */
  restSec: number;
  videoId: string | null;
  /** Coach-assigned direct video URL (YouTube or file), shown to the client. */
  videoUrl?: string | null;
  // ---- Coach exercise-library fields (optional; used when authoring) -------
  /** Body part / category, e.g. "Chest", "Back". */
  category?: string;
  /** Equipment, e.g. "Barbell", "Dumbbell", "Machine", "Bodyweight". */
  equipment?: string;
  /** Free-form tags for search/filter. */
  tags?: string[];
  /** Coach progression guidance shown to the client. */
  progressionNotes?: string;
  /** Demo image (e.g. seeded library); coaches may still attach a video. */
  imageUrl?: string | null;
  images?: string[];
  /** B4.1: the still shown before a catalog demonstration (`videoUrl`) plays. */
  videoPosterUrl?: string | null;
  // ---- Import provenance (seeded/imported exercises only) -------------------
  /** External catalog id this row was imported from (e.g. a wger exercise id). */
  sourceId?: string;
  sourceProvider?: 'wger';
  /** Raw category name from the source provider (kept distinct from `category`, which uses Forma's own vocabulary). */
  sourceCategory?: string;
  /** Full primary+secondary muscle name list from the source provider (richer than `targetMuscle`). */
  muscles?: string[];
  secondaryMuscles?: string[];
  /** Structured equipment list from the source provider (alongside the legacy joined `equipment` string). */
  equipmentList?: string[];
  // ---- Library → template/plan link (embedded copies only; never set on a
  // real `coachExercises` library doc) ----------------------------------------
  /** The coach-library exercise id this embedded copy was picked from. */
  libraryExerciseId?: string;
  /** Whether this embedded copy still receives auto-sync from the library exercise (see `pickFromLibrary`/`SYNCED_EXERCISE_FIELDS`). */
  librarySyncEnabled?: boolean;
  // ---- B4: copy taken from the Forma catalog (all optional) ---------------
  /** The catalog exercise this copy came from, and its revision at that time. */
  catalogId?: string;
  catalogRev?: number;
  /** Bilingual name from the catalog — the UI shows it in the reader's language (`name` stays the fallback). */
  names?: LocalizedText;
  instructions?: { en: CatalogInstructionSet; ar: CatalogInstructionSet };
  mediaCredits?: MediaCredit[];
}

/** A logical block inside a workout day, e.g. Chest / Warm-up / Finisher. */
export type SectionKind = 'normal' | 'warmup' | 'working' | 'mobility' | 'finisher';
export interface WorkoutSection {
  id: string;
  title: string;
  kind: SectionKind;
  exerciseIds: string[];
}

export interface WorkoutDay {
  id: string;
  dayIndex: number;
  title: string;
  focus: string;
  /** Canonical flat ordered exercise list (always = `sections` flattened). */
  exerciseIds: string[];
  /** Optional section grouping (coach-authored). Absent on seed/legacy plans. */
  sections?: WorkoutSection[];
}

/**
 * Metadata on an assigned client plan that was created from a coach template.
 * The assigned plan is an independent SNAPSHOT — never live-linked to the
 * template. `isCustomized` flips true once the coach edits the assigned copy.
 */
export interface AssignedPlanMeta {
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  assignedAt: number;
  assignedBy: string;
  isCustomized: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  weeklyVolume?: Record<string, string>;
  meta?: AssignedPlanMeta;
  updatedAt: number;
}

export type WorkoutGoal = 'hypertrophy' | 'fat_loss' | 'strength' | 'beginner' | 'advanced' | 'custom';
export type SplitType = 'ppl' | 'upper_lower' | 'full_body' | 'bro_split' | 'custom';

/** A coach-owned reusable workout template at `coachAssets/{coachId}/workoutTemplates`. */
export interface WorkoutTemplate {
  id: string;
  coachId: string;
  name: string;
  goal: WorkoutGoal;
  splitType: SplitType;
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  createdAt: number;
  updatedAt: number;
}

/** Coach-owned reusable food at `coachAssets/{coachId}/foods` (nutrition architecture). */
export interface LibraryFood extends FoodItem {
  category?: string;
  tags?: string[];
}

/**
 * A coach-owned group of interchangeable foods at `coachAssets/{coachId}/foodGroups`.
 * Attaching a group to a planned meal item snapshots its `foods` onto the item
 * as `allowedAlternatives` (the client swaps among them without changing the plan).
 */
export interface FoodGroup {
  id: string;
  coachId: string;
  name: string;
  foods: LibraryFood[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** How a logged meal item compares to the coach's plan (for adherence). */
export type SubstitutionSource = 'matched_plan' | 'approved_substitution' | 'client_custom_substitution';

/** Coach-owned reusable nutrition template at `coachAssets/{coachId}/nutritionTemplates`. */
export interface NutritionTemplate {
  id: string;
  coachId: string;
  name: string;
  meals: Meal[];
  targets: Macros;
  supplements: Supplement[];
  waterTargetMl: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Workout logging
// ---------------------------------------------------------------------------

export type SetType = 'warmup' | 'working';

export interface SetLog {
  setIndex: number;
  type: SetType;
  targetReps: string;
  actualReps: number | null;
  weightKg: number | null;
  rpe: number | null;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  sets: SetLog[];
  done: boolean;
}

export interface WorkoutLog {
  id: string; // == date
  date: DayKey;
  dayId: string;
  /** When the session timer was started. null = opened but not started yet. */
  startedAt: number | null;
  endedAt: number | null;
  durationSec: number;
  exercises: ExerciseLog[];
  /** When false, this is an in-progress session (used for recovery). */
  finished: boolean;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'postWorkout';

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodItem extends FoodProvenance {
  id: string;
  name: LocalizedText;
  quantity: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
  // ---- approved alternatives (planned items only; snapshotted onto the plan) ----
  /** Provenance: the coach FoodGroup this item's alternatives were copied from. */
  allowedAlternativeGroupId?: string;
  /** Coach-approved swaps for this item, denormalized so the client can read them. */
  allowedAlternatives?: FoodItem[];
  /** Whether the client may swap this item for a free-text custom food. */
  allowCustomSubstitution?: boolean;
  /** B4.1: the food's picture — a copy, so a plan keeps the picture it was built with. */
  image?: FoodImageRef | null;
}

/**
 * B4.1 — a food's picture as a library food or a plan item carries it: the coach's own upload
 * (sanitized, in their `foods` folder) or an approved Forma catalog picture of that catalog food.
 * Who may use which picture is enforced by the server on every save.
 */
export interface FoodImageRef {
  source: 'upload' | 'forma-catalog';
  url: string;
  thumbUrl: string;
  width?: number;
  height?: number;
  alt?: LocalizedText;
  catalogFoodId?: string;
  author?: string;
  license?: string;
  sourcePage?: string;
  /** A replacement is a new file (new rev): earlier plans keep showing the picture they were saved with. */
  rev: number;
  uploadedAt: number;
}

export interface Meal {
  id: string;
  slot: MealSlot;
  label: LocalizedText;
  items: FoodItem[];
}

export interface Supplement {
  id: string;
  name: string;
  dose: LocalizedText;
  /** When / how to take it, e.g. "before workout", "after dinner". Coach free-text. */
  timing?: LocalizedText;
}

/** A coach-owned reusable supplement at `coachAssets/{coachId}/supplements`. */
export interface LibrarySupplement extends Supplement {
  category?: string;
  tags?: string[];
}

export interface MealPlan {
  id: string;
  name: string;
  meals: Meal[];
  targets: Macros;
  supplements: Supplement[];
  waterTargetMl: number;
  beverageNotes: LocalizedText[];
  generalNotes: LocalizedText[];
  meta?: AssignedPlanMeta;
  /** Coach policy governing client food substitutions for this plan. */
  substitutionPolicy?: SubstitutionPolicy;
  updatedAt: number;
}

/** Coach controls for whether/how the client may swap planned foods. */
export interface SubstitutionPolicy {
  allowClientSubstitutions: boolean;
  allowCustomFoods: boolean;
  /** Legacy (B3.9, owner D6): no longer offered or read — kept so stored plans round-trip unchanged. */
  requireCoachApproval?: boolean;
}

/** The three plan kinds that can be versioned. */
export type PlanVersionKind = 'workout' | 'nutrition' | 'cardio';

/**
 * A point-in-time snapshot of one of a client's plans, stored at
 * `clientData/{clientId}/planVersions/{versionId}` (coach-owned, client reads).
 * The assigned `plan/{kind}` doc always equals the `active` version's snapshot —
 * that's the single source the client tracker reads.
 */
export interface PlanVersion {
  id: string;
  kind: PlanVersionKind;
  versionNumber: number;
  name: string;
  createdAt: number;
  createdBy: string;
  reason?: string;
  snapshot: WorkoutPlan | MealPlan | CardioPlan;
  active: boolean;
}

export interface NutritionLog {
  id: string; // == date
  date: DayKey;
  /** mealId -> eaten? */
  mealsEaten: Record<string, boolean>;
  /** supplementId -> taken? */
  supplementsTaken: Record<string, boolean>;
  customFoods: FoodItem[];
  /**
   * Per-day swaps of a PLANNED food item (keyed by the original item id):
   * a FoodItem = replacement for that day; null = removed for that day.
   * The original stays in the plan and is shown struck-through.
   */
  itemOverrides: Record<string, FoodItem | null>;
  /**
   * Adherence tag for each swapped item (keyed by the original planned item id):
   * whether it was an approved alternative or a custom food, and whether it's
   * flagged for coach review. Items with no entry are `matched_plan`.
   */
  substitutions?: Record<string, { source: Exclude<SubstitutionSource, 'matched_plan'>; pendingApproval?: boolean }>;
  /** Extra foods added to a planned meal for that day (keyed by mealId). */
  extraItems: Record<string, FoodItem[]>;
  waterMl: number;
  creatineTaken: boolean;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

// ---------------------------------------------------------------------------
// Cardio / Steps / Weight
// ---------------------------------------------------------------------------

export type CardioType = 'walking' | 'treadmill' | 'running' | 'cycling' | 'other';

export interface CardioLog {
  id: string;
  date: DayKey;
  type: CardioType;
  durationSec: number;
  distanceKm: number | null;
  caloriesBurned: number | null;
  steps: number | null;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

export interface WeightLog {
  id: string; // == date
  date: DayKey;
  weightKg: number;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

export type MeasurementKey =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'upperBack'
  | 'arm'
  | 'forearm'
  | 'wrist'
  | 'waist'
  | 'abdomen'
  | 'hips'
  | 'glutes'
  | 'thigh'
  | 'calf'
  | 'ankle';

/** A user-defined measurement part (in addition to the built-in ones). */
export interface CustomMeasurement {
  key: string;
  label: string;
}

/**
 * Body measurements (cm) logged on a given day, for before/after comparison.
 * Keyed by a built-in MeasurementKey OR a custom part key.
 */
export interface MeasurementLog {
  id: string; // == date
  date: DayKey;
  values: Record<string, number>;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

// ---------------------------------------------------------------------------
// Progress photos
// ---------------------------------------------------------------------------

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  date: DayKey;
  pose: PhotoPose;
  /** Key into the local blob store (IndexedDB). */
  localKey: string;
  /** Public Bunny CDN URL (set after a best-effort upload; lets the coach / other devices view it). */
  cdnUrl?: string;
  weightKg?: number;
  note?: string;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

// ---------------------------------------------------------------------------
// Habit / daily checklist / streaks / reminders
// ---------------------------------------------------------------------------

export interface ChecklistItemState {
  done: boolean;
  /** True when flipped by an auto-rule (vs manual toggle). */
  auto: boolean;
}

export interface DailyChecklist {
  id: DayKey; // == date
  date: DayKey;
  items: Record<string, ChecklistItemState>;
  completionPct: number;
  fullyComplete: boolean;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

export type ReminderKind =
  | 'meal'
  | 'supplements'
  | 'creatine'
  | 'water'
  | 'workout'
  | 'cardio';

export interface Reminder {
  id: string;
  kind: ReminderKind;
  label: string;
  /** "HH:mm" 24h local time. */
  time: string;
  enabled: boolean;
  /** Days of week 0 (Sun) - 6 (Sat). Empty = every day. */
  repeatDays: number[];
  lastFiredDate?: DayKey;
  updatedAt: number;
  dirty: boolean;
  /** Server revision this copy is based on (B0 / PWA-06; managed by the SyncEngine). */
  _rev?: number;
}

export interface StreakValue {
  current: number;
  longest: number;
  lastDate: DayKey | null;
}

export interface Streaks {
  workout: StreakValue;
  nutrition: StreakValue;
  water: StreakValue;
  steps: StreakValue;
  overall: StreakValue;
}

// ---------------------------------------------------------------------------
// Settings & targets
// ---------------------------------------------------------------------------

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  waterMl: number;
  steps: number;
  cardioMinutes: number;
}

export interface AppSettings {
  locale: Locale;
  theme: Theme;
  restDefaultSec: number;
  /** Target number of workouts per week (shown on the Home weekly-goal ring). */
  weeklyWorkoutGoal: number;
  keepAwakeDuringWorkout: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  targets: DailyTargets;
  /** Extra body-measurement parts the user added. */
  customMeasurements: CustomMeasurement[];
  updatedAt: number;
}

