/**
 * Disposable Phase-3 test data. Every record is created fresh in the run's
 * in-memory database and disappears with it — nothing to clean up, nothing
 * reaches a shared system. Ids are prefixed `e2e-` so evidence is readable.
 */
const DAY = 86_400_000;

export const SEED = {
  password: 'E2e-Pass-2026!',
  users: {
    super: { _id: 'e2e-super', email: 'super@e2e.test', displayName: 'Sara Super', role: 'super_admin', phone: '+201000000001' },
    admin: { _id: 'e2e-admin', email: 'admin@e2e.test', displayName: 'Adam Admin', role: 'admin', phone: '+201000000002' },
    coachA: { _id: 'e2e-coach-a', email: 'coach.a@e2e.test', displayName: 'Coach Amira', role: 'coach', phone: '+201000000003', currency: 'EGP' },
    coachB: { _id: 'e2e-coach-b', email: 'coach.b@e2e.test', displayName: 'Coach Basem', role: 'coach', phone: '+201000000004', currency: 'EGP' },
    coachPro: { _id: 'e2e-coach-pro', email: 'coach.pro@e2e.test', displayName: 'Coach Pro', role: 'coach', phone: '+201000000005', currency: 'EGP' },
    clientA: { _id: 'e2e-client-a', email: 'client.a@e2e.test', displayName: 'Client Aya', role: 'client', phone: '+201000000006', assignedCoachId: 'e2e-coach-a' },
    clientB: { _id: 'e2e-client-b', email: 'client.b@e2e.test', displayName: 'Client Bilal', role: 'client', phone: '+201000000007', assignedCoachId: 'e2e-coach-b' },
    clientFree: { _id: 'e2e-client-free', email: 'client.free@e2e.test', displayName: 'Client Free', role: 'client', phone: '+201000000008' },
  },
  /** The ONE Forma product config (coachPlanTiers/forma). Trial limit 2 keeps the seeded trial coaches' at-cap scenarios. */
  tiers: [
    {
      _id: 'forma',
      label: 'Forma',
      trialEnabled: true,
      trialDurationDays: 15,
      trialClientLimit: 2,
      maxClients: 25,
      priceMonthly: 499,
      currency: 'EGP',
      billingInterval: 'month',
      termDays: 30,
      publicVisible: true,
      signupEnabled: true,
      marketingTitle: { en: 'Forma', ar: 'فورما' },
      marketingDescription: { en: 'One plan. Everything included.', ar: 'خطة واحدة. كل شيء مشمول.' },
      marketingFeatures: {
        en: ['Complete client tracking', 'Workout & nutrition programming', 'Direct client messaging', '100% Coach-Led — No AI replacing you'],
        ar: ['متابعة كاملة للعملاء', 'برمجة التمارين والتغذية', 'مراسلة مباشرة مع العملاء', 'بقيادة المدرب 100% — بدون ذكاء اصطناعي يحل محلك'],
      },
    },
  ],
  /** Internal capacity add-on (never public). */
  capacityPackages: [
    { _id: 'e2e-pkg-20', name: { en: '+20 clients', ar: '+٢٠ عميل' }, badge: { en: 'Popular', ar: 'الأكثر طلبًا' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1, active: true, coachVisible: true, promotional: false, sortOrder: 0, validFrom: null, validUntil: null, archived: false },
  ],
  plans: (now) => [
    { _id: 'e2e-coach-a', plan: 'trial', status: 'active', maxClients: 2, baseMaxClients: 2, addonClientCapacity: 0, manualCapacityAdjustment: 0, startedAt: now - 2 * DAY, endsAt: now + 13 * DAY, trialNotified: {}, activeClientCount: 1, history: [], createdAt: now - 2 * DAY, updatedAt: now },
    { _id: 'e2e-coach-b', plan: 'trial', status: 'active', maxClients: 2, baseMaxClients: 2, addonClientCapacity: 0, manualCapacityAdjustment: 0, startedAt: now - 2 * DAY, endsAt: now + 13 * DAY, trialNotified: {}, activeClientCount: 1, history: [], createdAt: now - 2 * DAY, updatedAt: now },
    { _id: 'e2e-coach-pro', plan: 'forma', status: 'active', maxClients: 25, baseMaxClients: 25, addonClientCapacity: 0, manualCapacityAdjustment: 0, subscription: { priceMonthly: 499, currency: 'EGP', billingInterval: 'month', termDays: 30, maxClients: 25, requestId: 'e2e-seed' }, startedAt: now - 10 * DAY, endsAt: now + 20 * DAY, trialNotified: {}, activeClientCount: 0, history: [], createdAt: now - 40 * DAY, updatedAt: now },
  ],
  relationships: (now) => [
    { _id: 'e2e-coach-a__e2e-client-a', coachId: 'e2e-coach-a', clientId: 'e2e-client-a', status: 'active', createdBy: 'e2e-coach-a', createdAt: now - DAY, updatedAt: now, subscription: { status: 'active', startAt: now - DAY, endAt: now + 29 * DAY, months: 1, price: 800, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } },
    { _id: 'e2e-coach-b__e2e-client-b', coachId: 'e2e-coach-b', clientId: 'e2e-client-b', status: 'active', createdBy: 'e2e-coach-b', createdAt: now - DAY, updatedAt: now, subscription: { status: 'active', startAt: now - DAY, endAt: now + 29 * DAY, months: 1, price: 700, currency: 'EGP', frozenFrom: null, frozenUntil: null, updatedAt: now } },
  ],
  clientProfiles: (now) =>
    ['e2e-client-a', 'e2e-client-b', 'e2e-client-free'].map((id, i) => ({
      _id: id,
      clientId: id,
      profile: { id, name: ['Client Aya', 'Client Bilal', 'Client Free'][i], age: 28, weightKg: 70, heightCm: 172, goal: 'fat_loss', activityLevel: 'moderate', locale: 'en', createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY },
      assessment: { status: 'submitted', completed: true, submittedAt: now - 9 * DAY, basic: { fullName: ['Client Aya', 'Client Bilal', 'Client Free'][i] } },
      updatedAt: now - 9 * DAY,
    })),
};
