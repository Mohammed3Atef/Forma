# Feature: Client Transfer & Existing-Client

**Purpose.** Move a client between coaches (admin) and let a coach add an existing Forma client / request a
transfer — without ever creating a duplicate account.

**Data model.** `coachClients/{coachId__clientId}` relationship (status active/ended, subscription,
endReason, mode); `users/{uid}.assignedCoachId`; `transferRequests/{toCoachId__clientId}` (coach→admin/current
coach takeover request); `displayNameLower` for search.

**Key services.** [`coachClientsApi.ts`](../../src/services/platform/coachClientsApi.ts)
(`assignExistingClient`, `releaseClient`, `transferClientWithMode`), [`transferApi.ts`](../../src/services/platform/transferApi.ts)
(submit/get/cancel/resolve transfer requests), [`accountsApi.ts`](../../src/services/platform/accountsApi.ts)
(`searchClients`).

**Key UI.** Coach: `AddExistingClient` (search → result → assign/transfer, single back control),
`IncomingTransferRequests`. Admin: `AdminAssignments` + `TransferWizard` (4-step: target coach → type → sub
handling → review; Fresh Start gated to super-admin).

**Permissions / rules.** A coach may only point `assignedCoachId` at themselves; transfer requests can't be
self-authored; Fresh Start (archive + clear) requires `clients.writeAll` (super-admin). Rules live on forma-14d33.

**Edge cases.** Owned-by-other → request transfer + wait; unassigned → assign with a required subscription;
single search match auto-opens; releasing keeps the account, frees the assignment. Transfer confirm is disabled
offline.

**Testing.** `e2e/existing-client.spec.ts`, `e2e/super-admin.spec.ts` (assign + transfer wizard).
