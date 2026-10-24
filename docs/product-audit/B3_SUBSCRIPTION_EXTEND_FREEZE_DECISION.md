# B3-S07 — Client subscription "Extend" and "Freeze": decision matrix and approved rules

> **Status (2026-10-16): approved by the owner — E2 for Extend and F-C for Freeze, with conditions.** §0 is the exact rule set B3.0.1 implements (day boundaries, time zones, interactions), written down **before** the code as the owner required. §1–§4 keep the original analysis the owner approved from.
> Code checked: `api/coach-clients/_service.ts` (`updateSubscription`), `src/lib/subscription.ts` and its server copy `api/admin/_lib/subscription.ts` (`effectiveSubscriptionStatus`), `src/pages/coach/CoachSubscriptionPanel.tsx`, `src/services/platform/coachDashboardApi.ts` (revenue).

## 0. Approved rules (owner, 2026-10-16) — exact definitions

### 0.1 Owner conditions

| Area | Owner condition |
|---|---|
| Extend | `max(now, currentEndAt) + days`. Refuse for stored **expired, ended or cancelled** terms (Renewal is the path). Allowed for **frozen** terms without changing their freeze window. No payment-ledger entry for a goodwill extension, but an **auditable subscription-change event** |
| Freeze | A scheduled freeze applies **only between `frozenFrom` and `frozenUntil`**. A **finite end date** is required. Paid days are preserved by extending the subscription end. **Early unfreeze removes the compensation for unused frozen days.** Calendar-day and time-zone boundaries defined explicitly. Invalid or out-of-term windows refused — **no accidental free service** |
| Migration | **No silent migration** of existing subscription records |

### 0.2 Time model (applies to every rule below)

- All stored dates are **instants** (Unix milliseconds, UTC). The server never guesses a time zone.
- **Date pickers are local to the coach's device.** The subscription panel converts a picked date `YYYY-MM-DD` to the coach's **local midnight** (`new Date('YYYY-MM-DDT00:00:00')`), exactly as today (B0 / CO-14). A freeze "From 10 Oct, Until 17 Oct" picked in Cairo is `[10 Oct 00:00 Cairo, 17 Oct 00:00 Cairo)`.
- **`frozenUntil` is the return day** (exclusive): the client is frozen on 10–16 Oct and back on 17 Oct. This is today's meaning of the field (`now < frozenUntil`), now written down.
- **One day = 86 400 000 ms** for Extend and for the early-unfreeze rounding. Across a daylight-saving change a boundary can move by one hour; this is accepted and documented, never rounded silently into an extra day.
- The client's access follows the same instants, wherever the client is.

### 0.3 Extend (E2)

| Stored status (`subscription.status`) | Result |
|---|---|
| `active`, `trial` | `endAt = max(now, endAt) + days × 1 day`. A lapsed term (`endAt ≤ now`) restarts from now, so the client gets exactly `days` usable days |
| `frozen` (scheduled, running or finished freeze) | Same formula. `frozenFrom`, `frozenUntil` and the freeze compensation are **unchanged** |
| `expired`, `ended`, `cancelled` | **Refused** — `CONFLICT`, reason `RENEWAL_REQUIRED` (the coach uses Renew / set term, which writes the ledger) |
| `pending` / no subscription | **Refused** — `RENEWAL_REQUIRED` (there is no term to extend) |

- `days` is a positive integer (unchanged input contract).
- No `subscriptionHistory` (ledger) entry and no price change (unchanged).
- **New: an audit event** is appended atomically to the relationship's `subscriptionEvents` (§0.6).

### 0.4 Freeze (F-C)

**Validity** (all must hold, else `CONFLICT` with a reason; nothing is written):

| # | Rule | Reason code |
|---|---|---|
| F1 | Stored status is `active`, **or** `frozen` whose freeze is already over (`frozenUntil ≤ now`). Trial, pending, expired, ended and cancelled terms cannot be frozen (a trial has no paid days to preserve; the panel already offers Freeze only for an active term) | `FREEZE_NOT_ALLOWED` |
| F2 | The term has not lapsed: `endAt > now` | `FREEZE_NOT_ALLOWED` |
| F3 | Both dates given and finite, `frozenUntil > frozenFrom` (a finite end date is required) | `FREEZE_INVALID_WINDOW` |
| F4 | Not in the past: `frozenFrom ≥ now − 1 day`. "Today" is allowed (today's local midnight is less than one day ago in every time zone); yesterday or earlier is refused — a back-dated freeze would compensate days the client already had | `FREEZE_INVALID_WINDOW` |
| F5 | Inside the paid term: `frozenUntil ≤ endAt` (the end **before** this freeze's compensation) and `frozenFrom ≥ startAt − 1 day` — a freeze may begin on the term's first calendar day (the picker sends local midnight; a term usually starts later that day) | `FREEZE_OUT_OF_TERM` |

**Effect when accepted:**
- `status = 'frozen'`, `frozenFrom`, `frozenUntil` stored as given.
- New field **`freezeCredit = frozenUntil − max(frozenFrom, startAt)`** (ms): the compensation granted — only frozen time **inside the paid term** counts, so a freeze that begins on the term's first day before the term's start hour creates no free time.
- `endAt = endAt + freezeCredit` — the paid days are kept.

**Effective status:** `frozen` **only while `frozenFrom ≤ now < frozenUntil`**. Before the window the client keeps full access; after it the term is `active` again (or `expired` if past the new `endAt`). Same function on client and server, proven by a shared test vector.

### 0.5 Unfreeze, early unfreeze and cancelling a scheduled freeze

Unfreeze is allowed only when the stored status is `frozen` (else `CONFLICT`, `NOT_FROZEN`). With `t = now`:

| When | `endAt` change | Why |
|---|---|---|
| `t ≤ frozenFrom` (the freeze never started) | `endAt − freezeCredit` | no day was frozen — all compensation removed |
| `frozenFrom < t < frozenUntil` (early unfreeze) | `endAt − (freezeCredit − kept)`, where `kept = min(freezeCredit, ceil(used / 1 day) × 1 day)` and `used = t − max(frozenFrom, startAt)` | the client keeps compensation for every day actually frozen inside the paid term — the day of the unfreeze counts whole (the client lost part of it) — and never more than was credited; the unused days are removed |
| `t ≥ frozenUntil` (finished) | none | every frozen day was used |

Then `status = 'active'`, and `frozenFrom`, `frozenUntil` and `freezeCredit` are cleared. The real freeze window stays in `subscriptionEvents`.

**Worked example** (term 1–31 Oct, freeze 10 → 17 Oct accepted 5 Oct): accepted → end **7 Nov**. Unfreeze on 5 Oct → end back to 31 Oct. Unfreeze on 12 Oct at 15:00 → used = 2 days 15 h → 3 days kept (10, 11 and 12 Oct) → 4 days removed → end **3 Nov**. Unfreeze on 18 Oct → end stays 7 Nov.

### 0.6 Interactions

| Sequence | Rule |
|---|---|
| Freeze, then **Extend** | `endAt = max(now, endAt) + days` on top of the compensated end; window and `freezeCredit` unchanged, so a later early unfreeze still removes exactly the unused frozen days |
| Freeze, then **Renewal** (`setTerm`) | The renewal is a new term: the outgoing term is archived exactly as today (`endAt = min(endAt, max(now, startAt))`, status `ended` / `expired`) and the new term starts **unfrozen**. A scheduled or running freeze ends with the old term; its compensation is not carried into the new term |
| Freeze, then **End** / **Cancel** | As today (status `ended` / `cancelled`; End sets `endAt = now`). The freeze fields stay for the record; the terminal status wins |
| A second freeze | Refused while a freeze is scheduled or running (F1); allowed once the previous one has finished |
| Price change | No effect on dates |
| Client freeze request | The coach's **Accept** now applies the freeze **first** and marks the request accepted only if the freeze succeeded (before, the request was marked accepted even when the freeze write failed) |

**Audit event** (`subscriptionEvents`, a new optional array on the relationship, newest last, capped at 200, written in the same update as the change): `{ at, op, actorRole: 'coach' | 'admin', before, after }`, where `before` / `after` hold `status, startAt, endAt, frozenFrom, frozenUntil, freezeCredit`. Written for **every** subscription change. Admin changes additionally write an `auditLogs` row (who, which relationship, before / after).

### 0.6a Owner review of the implementation (2026-10-17)

| Refinement | Owner decision | Implemented as |
|---|---|---|
| A freeze may begin on the term's first calendar day | **Approved**, provided compensation counts only time inside the actual term | `freezeCredit = until − max(from, startAt)` (F5) |
| Early unfreeze counts the unfreeze day as a whole compensated day | **Approved**, with the resulting end date **shown before confirmation** | The Unfreeze confirmation states the end date the server will produce (`unfreezeEndAt`, proven equal to the server by a parity test over every freeze case, hour by hour) |
| Back-dated renewals make previously refused logs syncable | **Approved**, provided they are **explicitly confirmed, audited and explained** | A renewal starting before today over unpaid time (the old term had lapsed / ended, or the start moves earlier) opens "Start in the past?", which says the client's blocked logs from that date will sync; the audit event carries `backdated: true` (client and server use the same rule, parity-tested). Re-saving a running term at its own start asks nothing |

### 0.7 Existing records — no migration

- A freeze stored **before** B3.0.1 has no `freezeCredit`. It keeps **today's** behaviour until a coach unfreezes it: frozen from now until `frozenUntil` (or indefinitely when `frozenUntil` is empty), `endAt` untouched; Unfreeze clears it without moving `endAt`. Nothing is rewritten.
- Past extensions keep the dates they produced.
- A one-off compensation for clients frozen under the old rule would be a separate, explicit owner action.

### 0.8 Financial effect

- Price is never changed by Extend, Freeze or Unfreeze; nothing is collected.
- Coach "Due" moves with `endAt` (a freeze pushes the due date later by the frozen days; an early unfreeze pulls it back by the unused days).
- Lapsed-this-month counts fall when an Extend reactivates a lapsed active / trial term.

### 0.9 Tests (B3.0.1)

- Pure rule tests: the E2 table, F1–F5, every unfreeze branch incl. the worked example, scheduled-freeze effective status.
- Client and server `effectiveSubscriptionStatus` agree on a shared vector (incl. legacy freezes).
- API: refusal reasons, audit events, admin audit rows, no `subscriptionHistory` entry for Extend / Freeze; e2e 20 (extend / freeze / unfreeze) green.

## 1. What the code does today

| Rule | Behaviour today | Verified at |
|---|---|---|
| **Extend** (server) | `endAt = currentEndAt + days`, even when `currentEndAt` is in the past. Status, price and history are unchanged | `_service.ts` `case 'extend'` |
| **Extend** (screen) | The confirmation promises `max(now, currentEndAt) + days` | `CoachSubscriptionPanel.tsx` `doExtend` |
| **Freeze** (server) | Status becomes `frozen` immediately and `frozenFrom` / `frozenUntil` are stored. `endAt` is **not** moved | `_service.ts` `case 'freeze'` |
| **Freeze** (effective status) | `frozen` while `now < frozenUntil`. **`frozenFrom` is ignored**, so a freeze dated next week applies today. When `frozenUntil` passes, the stored status stays `frozen` but the effective status falls back to `active`, or `expired` if past `endAt` | `effectiveSubscriptionStatus` (client and server copies) |
| **Unfreeze** | Status becomes `active` and the freeze fields are cleared. `endAt` is unchanged | `_service.ts` `case 'unfreeze'` |
| **Stored terminal statuses** | Stored `expired`, `ended` and `cancelled` override every date, so extending one of them changes nothing the client can use | `effectiveSubscriptionStatus` |
| **Client access** | `frozen`, `expired`, `ended` and `cancelled` make the plans read-only (client logging blocked) | `subscriptionAccess` |
| **Revenue** (coach dashboard) | "Due" counts only trial / active terms ending this month, so frozen terms are not counted as due. Extend and Freeze create **no** ledger or history entry and do not change the price | `coachDashboardApi.ts` |

**Defects today:**
- An Extend on a lapsed term can leave the end date **in the past** while the confirmation said otherwise. Example: lapsed 40 days ago, +30 days → still lapsed 10 days ago.
- A future-dated freeze blocks the client **immediately**.
- Frozen days are taken out of the paid term with no compensation.

## 2. Extend — options

| | E1 (today, server) | **E2 (owner's direction)** |
|---|---|---|
| New end | `currentEndAt + d` | **`max(now, currentEndAt) + d`** |
| Active term (end in the future) | end + d | end + d (same) |
| Lapsed term (end in the past) | may still be in the past | now + d: the client has `d` usable days |
| Matches the confirmation the coach sees | no | **yes** |

**Open sub-decisions for E2:**

| # | Question | Options | Recommendation |
|---|---|---|---|
| E2-a | Stored status `expired` (set by an archive or by an admin): does Extend reactivate it? | (i) Extend sets status `active` when the new end is in the future; (ii) Extend is refused, so the coach must "Renew / set term" | **(ii) refuse.** Renewal is the path that writes the ledger (CO-15); Extend stays a goodwill adjustment |
| E2-b | `ended` / `cancelled` | Refused (they are terminal) | **Refuse** |
| E2-c | `frozen` | Extend moves `endAt` and leaves the freeze as is | **Allow** |
| E2-d | History / ledger | No entry (as today) or a "goodwill extension" note in `subscriptionHistory` | **No ledger entry** (no payment happened). Keep the existing toast, plus the audit entry from B3.0.1 §5 for admin corrections only |

**Financial effect of E2:**
- The price is unchanged and nothing is collected.
- "Due" moves to the month of the new end.
- Lapsed-this-month figures drop if the client becomes active again.

**Migration:** none. Past extensions keep the dates they produced.

## 3. Freeze — options

| | F-A (today) | F-B | **F-C (recommended)** | F-D |
|---|---|---|---|---|
| Takes effect | immediately (ignores `frozenFrom`) | immediately | **on `frozenFrom`** (scheduled) | on `frozenFrom` |
| Client blocked (read-only) | from today until `frozenUntil` | from today until `frozenUntil` | **from `frozenFrom` until `frozenUntil`** | from `frozenFrom` until `frozenUntil` |
| `endAt` | unchanged: the client **loses** the frozen days | extended by `frozenUntil − now` | **extended by `frozenUntil − frozenFrom`** (the paid days are kept) | unchanged |
| Early unfreeze | end unchanged | end keeps the full extension, or is shortened (sub-decision) | **end shortened by the unused frozen days** | end unchanged |
| Open-ended freeze (`frozenUntil` empty) | allowed, never extends | can't compute an extension | **require an end date**, or extend on unfreeze by the days actually frozen | allowed |
| Matches the freeze-request dates the client asked for | no (starts now) | no | **yes** | yes |
| Coach revenue | price unchanged; the term ends on the original date | price unchanged; the end moves later, so "due" moves | price unchanged; the end moves later, so "due" moves | price unchanged |
| Client fairness | loses paid days | keeps paid days | keeps paid days | loses paid days |

### Worked example

Term 1 Oct → 31 Oct, freeze requested for 10 Oct → 17 Oct, coach accepts on 5 Oct:

| Option | 5–9 Oct | 10–16 Oct | Term ends |
|---|---|---|---|
| **F-A** | read-only (wrong) | read-only | 31 Oct (7 paid days lost) |
| **F-B** | read-only | read-only | 31 Oct + 12 days = 12 Nov |
| **F-C** | full access | read-only | 31 Oct + 7 days = **7 Nov** |
| **F-D** | full access | read-only | 31 Oct |

**Implementation notes for F-C, if approved.** These are business-rule changes and need tests. There is no schema change.
- `effectiveSubscriptionStatus` (client **and** server copies, shared test vector): `frozen` only when `frozenFrom ≤ now < frozenUntil`.
- `updateSubscription('freeze')`: stores the dates and sets `endAt += (frozenUntil − frozenFrom)`. The original end is kept in a new optional field `endAtBeforeFreeze`, so the change is reversible and auditable.
- `unfreeze` before `frozenUntil`: `endAt = endAtBeforeFreeze + (now − frozenFrom)`, never earlier than `endAtBeforeFreeze`.
- The panel preview shows the new end date before the coach confirms.
- Tests:
  - api: a scheduled freeze is not effective early;
  - api: the end extended by the frozen length;
  - api: early unfreeze;
  - api: a freeze without an end is refused;
  - the client and server copies of the rule agree;
  - e2e: the client is read-only only inside the window.

**Migration.** None. Freezes already stored keep today's behaviour: their `endAt` is not touched. A one-off "apply compensation to current frozen clients" would be a separate, explicit owner action.

## 4. Owner answers (2026-10-16)

1. **Extend:** E2 approved — E2-a refuse (stored expired), E2-b refuse (ended / cancelled), E2-c allow frozen, E2-d no ledger entry **but** an auditable subscription-change event.
2. **Freeze:** **F-C** approved.
3. **Open-ended freezes:** a finite end date is **required**.
4. **No migration** of existing subscriptions.

The exact rules are §0. The F-C note above about `endAtBeforeFreeze` is superseded by `freezeCredit` (§0.4), which stays correct when an Extend happens during a freeze.
