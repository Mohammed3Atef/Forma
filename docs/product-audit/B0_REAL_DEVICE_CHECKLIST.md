# B0 — Real-device checklist (installed PWA)

> **Status of every row: PENDING REAL DEVICE.** None of these have been run on a physical phone. B0 was verified in desktop Chrome, emulated mobile viewports (390 / 430, Pixel 7 and iPhone 14 profiles) and a production-build service-worker simulation. Those cover the logic, not the OS behaviour below.
>
> **Devices:** one iPhone (iOS 17+, Safari, Add to Home Screen) and one Android phone (Chrome, Install app). Use **test accounts only**. Never use a real client's account, and never run this against data you can't lose.
>
> **Build:** the B0 build deployed to a preview/staging URL backed by the **test** database. Do not run steps that sign out, switch accounts or go offline against production data.
>
> For each row record: device · OS version · PASS / FAIL · a note or screenshot. A FAIL on any row marked **(P0)** blocks B1.

## A. Session and offline (PWA-01, PWA-08)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-01 (P0) | Offline cold launch | Sign in as a client, open Today, wait 10 s. Kill the app (swipe away). Turn on airplane mode. Open the installed app. | Today renders from local data with the offline banner. No login screen, no crash, no endless splash. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-02 (P0) | Offline background → foreground | With the app open, turn on airplane mode, switch to another app for 2+ minutes, come back. | Still signed in, same screen, data intact. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-03 (P0) | Offline deep link | Offline, open the app from a recent notification or a saved link to Progress / Settings. | The screen renders (or the shell with an offline message). No splash loop. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-04 (P0) | Offline sign-out stays signed out | Offline, log one weight, then Settings › Account › Sign out. Read the dialog, then confirm. Turn the network back on and reopen the app. | The dialog says 1 change hasn't synced and stays on the device. After reconnecting, the app stays on the login screen and does not sign back in. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-05 | Offline login screen | Signed out and offline, open the app. | The login screen renders (not a crash or a blank page). Signing in says it needs a connection. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## B. Shared device / account isolation (PWA-02, PWA-03, PWA-05, PWA-14)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-06 (P0) | A → B → A | Client A logs a weight offline and signs out (R-04). Client B signs in online and opens Today, Progress › Weight and Progress › Photos. B signs out. A signs in. | B sees none of A's weight, photos, name or plan, not even briefly. A's offline weight is still there and syncs to A (check it on A's coach view). | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-07 | Coach on a client's phone | On a client's installed app, sign out, sign in as the coach, then sign back in as the client. | The coach session never shows client data and never syncs. The client's data is intact afterwards. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## C. Live activity survives the OS (PWA-07)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-08 (P0) | Live cardio after an OS kill | Start a live cardio timer, lock the phone for 3 minutes, then kill the app and reopen it. | The timer is still running with the correct elapsed time. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-09 | Rest timer after an OS kill | Start a 90 s rest timer, kill the app after 30 s, reopen within 60 s. | About 60 s remain. A timer that ended while the app was closed is not shown as running. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-10 | Set logged just before a kill | Tick a set, then kill the app within 1 s. Reopen. | The set is still ticked with its values. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## D. Update ready (PWA-09, B0 scope)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-11 | Update during a workout | Start a workout. Deploy a new build. Bring the app to the foreground so it checks, then background and foreground it a few times. | The "Update available" pill appears. The app never reloads by itself during the workout. Tapping it asks first. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-12 | Idle update installs | With no workout, timer or check-in running, deploy a new build. Wait for the pill, then background the app. | On return the app runs the new build (check the version in Settings or the network panel). Nothing was lost. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-13 | Update after a long session on one tab | Do a check-in, then a live cardio session, stop it, go to Today. Deploy a new build, then background the app. | The update installs at this safe point. **In automated Chrome this exact sequence did not activate the waiting worker (see the implementation log); the same flow on a fresh tab did.** This row decides whether that was an automation artefact. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## E. Check-in, keyboard and layout (CL-42, CO-04, RTL)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-14 | Check-in at phone size | Open a pending check-in. Answer each step with the on-screen keyboard open. | Continue / Submit is always visible above the keyboard. No bottom tabs. One submit only. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-15 | Check-in resumes | Answer 3 steps, kill the app, reopen the check-in. | Answers are restored. Leaving mid-way asks first. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-16 | Check-in in Arabic (RTL) | Switch to العربية / مصري and repeat R-14. | Layout mirrored; the CTA is still reachable; numbers entered with the Arabic keyboard are accepted. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-17 (P0) | Coach composer with a banner + keyboard | As a coach whose plan shows a "term ending" banner, open a client thread and focus the composer. | The composer and Send stay above the keyboard and the bottom nav. The message sends. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-18 | Arabic keyboard digits | In Arabic, enter a weight like ٧٥٫٥ and reps ١٠ using the system Arabic keyboard. | Saved as 75.5 and 10, never dropped or zeroed. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-19 | Egyptian-Arabic dates | In مصري, open Today and History. | Dates and weekdays are in Arabic, not English. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## F. Video and media honesty (EX-01/03/04, CL-34, MD-01 deferred)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-20 | HEVC (iPhone .mov) playback | Play an exercise whose video is an HEVC upload. | It plays, or the player says the device can't play this format, with Retry and "Open video". Never a silent 0:00 player. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-21 | YouTube link | Play an exercise with a YouTube link. | It plays in the embedded player. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-22 | No video | Open an exercise without a video. | No video button is shown at all. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-23 | Photo upload failure is honest | Offline (or while MD-01 is unresolved), add a progress photo. | The toast says "Saved on this device only". The photo shows "Not uploaded". It uploads by itself on a later launch once uploads work. | PENDING REAL DEVICE | PENDING REAL DEVICE |

## G. Notifications (NT-01, NT-02, NT-03)

| # | Check | Steps | Expected | iPhone | Android |
|---|---|---|---|---|---|
| R-24 | No toast replay at launch | Have 5+ old notifications, then cold-launch the app. | No stack of old toasts. Only something that arrived in the last few minutes may toast once. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-25 | Dated notification doesn't move the day | Receive a coach-note notification about a past day. | The selected day stays today until the notification is tapped. New logs land on today. | PENDING REAL DEVICE | PENDING REAL DEVICE |
| R-26 | Mark all read | Open the feed and tap "Mark all read". | The badge clears and stays cleared after a relaunch. | PENDING REAL DEVICE | PENDING REAL DEVICE |
