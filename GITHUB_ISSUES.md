# Vision MVP — GitHub Issues Breakdown

Generated from the PraxisForma Capture v1 project plan.

---

## Senior Architect Review

### Gotchas Specific to This Stack

| Area | Gotcha | Mitigation |
|------|--------|------------|
| **VisionCamera + Expo** | Requires native module → no Expo Go, must use dev builds from day one | Add `react-native-vision-camera` config plugin in `app.json`, commit a dev build profile in `eas.json` in Phase 1 |
| **Skia + Expo** | Also requires native module; touch/gesture events on Skia canvas conflict with ScrollView/gesture handlers on Android | Install `@shopify/react-native-skia` config plugin alongside `react-native-gesture-handler`; test gesture exclusion zones early in Phase 4b |
| **expo-video** | Package is still maturing (SDK 51+); seek accuracy and slow-motion differ between iOS/Android; no background playback needed, but foreground audio session must be configured | Pin to a specific version; write a quick seek accuracy smoke test during Phase 4a |
| **Firebase JS SDK vs Native SDK** | All required packages (VisionCamera, Skia) already force a dev build, so there is no cost to using the native Firebase SDK — and it gives better performance and offline persistence | Use `@react-native-firebase/*` with its Expo config plugin rather than the web Firebase SDK |
| **Firestore share-token rules** | Security rules cannot read URL query parameters, so `?t=token` cannot be enforced at the rules layer alone | Store the token inside the clip document (`share.token`) and make the public read rule check `resource.data.share.token != null && resource.data.share.token == request.resource.data.share.token` — see Phase 5 issue for exact rule pattern |
| **Resumable upload + app backgrounding** | `uploadBytesResumable` task is lost when the app is killed | Persist the upload task reference/metadata to AsyncStorage on start; on AppState `active` resume from stored reference; mark Phase 2 scope as foreground-only with graceful resume |
| **RevenueCat device testing** | StoreKit sandbox on iOS Simulator is flaky; Android billing tester must be a licensed tester account | Gate Phase 1 RevenueCat work on physical device availability; document sandbox credentials in a private repo secret |
| **EAS Build cold-start time** | First EAS build with all native modules (~6 packages) can take 20-40 min | Set up EAS build profiles early (Phase 1) and keep a development build on test devices throughout |
| **Delete + partial Storage failure** | Deleting a Firestore doc before its Storage files leaves orphaned blobs | Always delete Storage files first, then the Firestore doc; wrap in a try/catch that logs orphans to Sentry |
| **Offline queue complexity** | Full offline-first is out of scope, but "queue until online" is listed as required | Scope to: detect offline → write pending upload record to AsyncStorage → on next foreground+online, retry; do not implement full sync conflict resolution |

### Compression Recommendation: `react-native-video-compressor`

Use **`react-native-video-compressor`** (not `ffmpeg-kit-react-native`).

**Rationale:**
- ~5 MB binary overhead vs. ~40–50 MB for ffmpeg-kit per platform
- Simpler API: `VideoCompressor.compress(uri, { compressionMethod: 'manual', maxSize: 1280, bitrate: 2_000_000 })` — sufficient for 720p / 1.5–2.5 Mbps target
- An Expo config plugin exists; compatible with EAS Build without manual Podfile/gradle edits
- ffmpeg-kit is warranted only if you need frame extraction, audio mixing, or complex filters — none of which are in v1 scope

**Target output:** 720p (1280×720), 1.5–2.5 Mbps video bitrate, AAC audio at 128 kbps. Generate thumbnail by seeking to 1 s with `expo-image-manipulator` or the compressor's thumbnail callback.

---

## Issues by Phase

> **Label key:** `phase:1` … `phase:6`, `type:feature`, `type:infra`, `type:bug`, `priority:p0` (blocker), `priority:p1` (high), `priority:p2` (normal)

---

### Phase 1 — Scaffold + Auth + Billing + EAS

---

#### Issue 1 · [P1] Initialize Expo project with TypeScript, Expo Router, and EAS Build

**Labels:** `phase:1` `type:infra` `priority:p0`

**Description**
Bootstrap the repo with a production-grade Expo + TypeScript project that can build on both iOS and Android via EAS from day one. All subsequent packages depend on this foundation.

**Acceptance Criteria**
- [ ] `npx create-expo-app` (or equivalent) with TypeScript template committed to `main`
- [ ] Expo Router v3+ installed; root layout defines `(auth)` and `(app)` route groups
- [ ] `eas.json` defines three profiles: `development` (dev-client, internal distribution), `preview` (internal distribution, no store), `production` (store)
- [ ] `app.config.ts` (not `app.json`) used for dynamic config; `EXPO_PUBLIC_*` env vars pattern documented in `.env.example`
- [ ] `eas build --profile development --platform ios` completes without error (CI or local)
- [ ] `eas build --profile development --platform android` completes without error
- [ ] Minimum SDK/OS targets set: iOS 16+, Android API 26+
- [ ] ESLint + Prettier configured; `npm run lint` passes on clean repo

---

#### Issue 2 · [P1] Firebase Auth + Firestore user document lifecycle

**Labels:** `phase:1` `type:feature` `priority:p0`

**Description**
Wire up `@react-native-firebase/auth` and `@react-native-firebase/firestore` with the Expo config plugin. Users must be able to sign up, log in, and have their `users/{uid}` document created on first login.

**Acceptance Criteria**
- [ ] `@react-native-firebase/app`, `/auth`, `/firestore` installed with Expo config plugin entries in `app.config.ts`
- [ ] `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) stored as EAS secrets; injected at build time
- [ ] Email/password sign-up and sign-in flows implemented on a minimal Auth screen (`/login`, `/register`)
- [ ] On first successful sign-in, `users/{uid}` document is created with `{ createdAt, displayName: null, subscriptionCache: { status: 'unknown', expiration: null, lastCheckedAt: null } }`
- [ ] Auth state listener redirects authenticated users to `(app)` route group and unauthenticated to `(auth)` route group
- [ ] Sign-out clears local state and redirects to login
- [ ] Firestore security rules deployed: authenticated users can read/write only their own `users/{uid}` document
- [ ] Dev build smoke-tested on both platforms

---

#### Issue 3 · [P1] RevenueCat SDK init + subscription gate hook

**Labels:** `phase:1` `type:feature` `priority:p0`

**Description**
Initialize RevenueCat (`react-native-purchases`) and expose a `useSubscription()` hook that the rest of the app uses to gate upload/record actions. RevenueCat is the single source of truth; the app caches status in Firestore only for UX.

**Acceptance Criteria**
- [ ] `react-native-purchases` installed with Expo config plugin
- [ ] RevenueCat API keys stored as EAS secrets (`REVENUECAT_IOS_KEY`, `REVENUECAT_ANDROID_KEY`); SDK initialized in app root with the correct platform key
- [ ] `useSubscription()` hook returns `{ isActive: boolean, isLoading: boolean, customerInfo: CustomerInfo | null }`
- [ ] Hook identifies users by Firebase UID (`Purchases.logIn(uid)`) on auth state change
- [ ] `subscriptionCache` in `users/{uid}` updated after each RevenueCat fetch (status + expiration + lastCheckedAt)
- [ ] Paywall screen scaffolded (placeholder UI acceptable for Phase 1); accessible from a "Upgrade" CTA
- [ ] 7-day free trial offering configured in RevenueCat dashboard and reflected in paywall screen copy
- [ ] `isActive === false` blocks the "Record" and "Import" actions (entry points return early with paywall redirect)
- [ ] Tested on a physical device with sandbox account in trial state

---

#### Issue 4 · [P1] Sentry error monitoring + crash reporting

**Labels:** `phase:1` `type:infra` `priority:p1`

**Description**
Wire Sentry into the app before any feature work so all subsequent phases have error visibility from the start.

**Acceptance Criteria**
- [ ] `@sentry/react-native` installed with Expo config plugin
- [ ] Sentry DSN stored as EAS secret; injected via `EXPO_PUBLIC_SENTRY_DSN`
- [ ] Sentry initialized in app entry point with `release` set from `expo-updates` manifest or `app.config.ts` version
- [ ] `ErrorBoundary` component wraps the root navigator and reports unhandled React errors to Sentry
- [ ] Source maps uploaded to Sentry as part of EAS `production` build profile (`sentry-expo` or `@sentry/react-native/metro` plugin configured)
- [ ] A manual test error (triggered in dev) appears in the Sentry dashboard
- [ ] Firebase UID attached to Sentry scope on login (`Sentry.setUser({ id: uid })`)

---

### Phase 2 — Capture → Compress → Upload → List

---

#### Issue 5 · [P2] Camera capture + photo library import (VisionCamera)

**Labels:** `phase:2` `type:feature` `priority:p0`

**Description**
Allow users to record a new clip (up to 5 minutes) or import an existing video from the device library. Gate both actions behind the subscription check from Issue 3.

**Acceptance Criteria**
- [ ] `react-native-vision-camera` v4 installed with Expo config plugin; camera/microphone permissions declared in `app.config.ts`
- [ ] Record screen uses `<Camera>` component; recording starts/stops via `camera.startRecording()` / `stopRecording()`
- [ ] Recording is capped at 5 minutes (300 s); a countdown timer is visible during recording
- [ ] "Import from library" uses `expo-image-picker` with `mediaTypes: 'videos'`; selected video duration is validated ≤ 300 s before proceeding
- [ ] Both flows hand off a local `file://` URI to the compression pipeline (Issue 6)
- [ ] `isActive` check from `useSubscription()` is evaluated before opening the camera or picker; inactive users see the paywall
- [ ] Back-camera default; no front-camera toggle in v1
- [ ] Permissions denied state handled with a user-facing message and Settings deep-link

---

#### Issue 6 · [P2] Video compression + thumbnail generation

**Labels:** `phase:2` `type:feature` `priority:p0`

**Description**
Compress the captured/imported video to 720p at 1.5–2.5 Mbps and generate a thumbnail image before upload.

**Acceptance Criteria**
- [ ] `react-native-video-compressor` installed with Expo config plugin
- [ ] Compression target: 1280×720 max dimension, 2 000 000 bps video bitrate, AAC 128 kbps audio
- [ ] Progress callback updates a `compressionProgress` state (0–1) shown in UI
- [ ] Output file written to `FileSystem.cacheDirectory` with a UUID filename (`{clipId}_processed.mp4`)
- [ ] Thumbnail extracted at t=1 s (or first keyframe) as JPEG, max 640×360, stored at `{clipId}_thumb.jpg`
- [ ] If source video is already ≤ 720p and ≤ 2.5 Mbps, skip compression and copy file directly (pass-through with a flag)
- [ ] `processedFile.sizeBytes` and `originalFile.sizeBytes` are captured and stored in the clip document (Issue 8)
- [ ] Errors during compression are reported to Sentry and surfaced to the user with a retry option

---

#### Issue 7 · [P2] Resumable foreground upload pipeline (Firebase Storage)

**Labels:** `phase:2` `type:feature` `priority:p0`

**Description**
Upload the processed video and thumbnail to Firebase Storage using resumable uploads. Handle progress, retry on transient failure, and resume if the user backgrounds the app mid-upload and returns.

**Acceptance Criteria**
- [ ] `@react-native-firebase/storage` upload uses `putFile()` with `uploadTask` handle
- [ ] Upload progress (0–1) displayed per file in the UI
- [ ] Upload task reference (storage path + resume token) persisted to AsyncStorage under key `pendingUpload:{clipId}`
- [ ] `AppState` listener: on transition to `active`, checks AsyncStorage for any pending uploads and resumes them
- [ ] Retry logic: up to 3 automatic retries with 2 s, 4 s, 8 s backoff on network error
- [ ] Upload paths follow spec: `users/{uid}/clips/{clipId}/processed.mp4` and `users/{uid}/clips/{clipId}/thumb.jpg`
- [ ] On success, `pendingUpload:{clipId}` entry removed from AsyncStorage
- [ ] Upload failures after all retries are reported to Sentry; user sees a "Retry" CTA

---

#### Issue 8 · [P2] Clip Firestore document creation + clip list screen

**Labels:** `phase:2` `type:feature` `priority:p0`

**Description**
After a successful upload, create the `clips/{clipId}` document and display all clips in a scrollable list ordered by `createdAt` descending.

**Acceptance Criteria**
- [ ] `clips/{clipId}` document created with all required fields from the data model: `ownerId`, `createdAt`, `recordedAt`, `title` (null), `sport` (null), `athlete` (null), `tags: []`, `notes: ''`, `durationSec`, `originalFile`, `processedFile`, `thumbnail`, `share: { token: null, createdAt: null, revokedAt: null }`
- [ ] Clip list screen (`/clips`) queries `clips` collection where `ownerId == uid`, ordered by `createdAt` desc, with a 20-item pagination limit using Firestore cursors
- [ ] Each list item shows: thumbnail, title (or "Untitled"), duration, `createdAt` date, and tag count
- [ ] Empty state shown when no clips exist
- [ ] Pull-to-refresh triggers a Firestore re-query
- [ ] Firestore security rules: owner can read/write their own clips (`request.auth.uid == resource.data.ownerId`); no other access
- [ ] Clip list is accessible from the main navigation tab or drawer

---

### Phase 3 — Tagging + Search + Clip Detail

---

#### Issue 9 · [P3] Clip detail screen + tag and notes editing

**Labels:** `phase:3` `type:feature` `priority:p1`

**Description**
A dedicated clip detail screen shows metadata and allows editing of title, sport, athlete, tags, and notes. Edits are saved to the `clips/{clipId}` document.

**Acceptance Criteria**
- [ ] Route: `/clips/[clipId]` — receives `clipId` as a path param
- [ ] Displays: thumbnail, title, sport, athlete, tags (pill chips), notes, durationSec, recordedAt
- [ ] Inline edit mode for: title, sport, athlete, notes (TextInput); tags use a chip input (type to add, tap chip to remove)
- [ ] "Save" writes only the changed fields via `updateDoc` (partial update)
- [ ] Unsaved changes prompt a discard confirmation on back navigation
- [ ] All field updates validated client-side (title max 100 chars, notes max 2000 chars, tags max 20 items, each tag max 30 chars)
- [ ] Firestore write errors surfaced to user and reported to Sentry

---

#### Issue 10 · [P3] Clip search + tag filter + date grouping on clip list

**Labels:** `phase:3` `type:feature` `priority:p1`

**Description**
Users can filter the clip list by tag and search by text (title, athlete, sport). Clips are grouped by calendar date in the list view.

**Acceptance Criteria**
- [ ] Tag filter: a horizontally scrollable row of tag chips above the clip list; tapping a chip filters to clips containing that tag
- [ ] Tag chips sourced from a union of all tags in the user's clips (client-side aggregation from the Firestore query result; no separate collection needed)
- [ ] Text search: a search bar filters the current in-memory result set by `title`, `athlete`, `sport` (case-insensitive substring match)
- [ ] Active tag filter + search are combinable (AND logic)
- [ ] Clip list rows are grouped under date headers (e.g., "Today", "Yesterday", "Feb 20 2026") based on `createdAt`
- [ ] Clearing all filters returns to the full paginated list
- [ ] Empty state shown per-filter with a "Clear filters" CTA

---

#### Issue 11 · [P3] Delete clip (Firestore + Storage cleanup)

**Labels:** `phase:3` `type:feature` `priority:p1`

**Description**
Users can delete a clip. All associated Storage files are deleted first, then the Firestore document and subcollection documents.

**Acceptance Criteria**
- [ ] Delete CTA accessible from the clip detail screen (with a confirmation dialog)
- [ ] Deletion order: Storage `processed.mp4` → Storage `thumb.jpg` → Storage `original.mp4` (if present) → Firestore `annotations` subcollection docs → Firestore `clips/{clipId}` document
- [ ] Each Storage delete step caught individually; partial failures logged to Sentry with `clipId` context but do not block the Firestore delete
- [ ] On success, user is navigated back to the clip list; the deleted clip is removed from the list immediately (optimistic update)
- [ ] If the clip has a share token, deletion implicitly revokes it (token field set to null before delete, or accepted as revoked-by-delete)
- [ ] Firestore security rules allow owner to delete their clip documents

---

### Phase 4a — Playback (expo-video)

---

#### Issue 12 · [P4a] Stable video playback with scrub timeline

**Labels:** `phase:4a` `type:feature` `priority:p0`

**Description**
Integrate `expo-video` for playback in the clip detail screen. The player must support play/pause, seek via a scrub bar, and report current position accurately enough for annotation anchoring.

**Acceptance Criteria**
- [ ] `expo-video` installed; `<VideoView>` rendered in the clip detail screen below the metadata section
- [ ] Video source loaded from Firebase Storage download URL (fetched via `getDownloadURL` and cached per session)
- [ ] Play / pause button with correct icon state
- [ ] Scrub bar: a `Slider` (or custom Skia-drawn bar) driven by `player.currentTime`; dragging seeks to the target position
- [ ] Current time and total duration displayed as `mm:ss / mm:ss`
- [ ] Seek is frame-accurate to within ±100 ms (verified manually on both platforms)
- [ ] Player pauses and releases resources on screen unmount
- [ ] Audio session configured correctly on iOS (does not interrupt ambient audio unless playing)
- [ ] Video loads within 3 s on a standard LTE connection for a 10 MB processed clip (acceptable; not a hard pass criterion but documented)

---

#### Issue 13 · [P4a] Slow-motion playback control

**Labels:** `phase:4a` `type:feature` `priority:p1`

**Description**
Add a slow-motion toggle to the playback controls. Supports 0.5× and 0.25× playback speed.

**Acceptance Criteria**
- [ ] Speed selector shows options: 0.25×, 0.5×, 1× (default)
- [ ] `player.playbackRate` set to the selected value
- [ ] Audio is muted at speeds below 1× to avoid pitch artifacts (or uses pitch-correction if available)
- [ ] Speed selection persists for the session (not persisted to Firestore)
- [ ] Speed selector visible only when video is paused or playing (not in an error state)
- [ ] Tested on both iOS and Android — confirm `playbackRate` < 1 is supported by `expo-video` version in use; document any platform limitations

---

### Phase 4b — Draw Overlay (Skia)

---

#### Issue 14 · [P4b] Skia overlay canvas + annotation data model

**Labels:** `phase:4b` `type:feature` `priority:p0`

**Description**
Mount a transparent Skia canvas over the video player. Wire up the annotation data model in Firestore and define the serialization format for line and free-draw primitives.

**Acceptance Criteria**
- [ ] `@shopify/react-native-skia` installed with Expo config plugin; renders without crashing on both platforms in a dev build
- [ ] `<Canvas>` positioned absolutely over `<VideoView>` with `pointerEvents="none"` (read-only mode) and `pointerEvents="box-only"` (draw mode); mode toggled by a toolbar button
- [ ] Annotation data model defined in TypeScript: `type Annotation = { id: string; type: 'line' | 'free_draw'; timeMs: number; data: LineData | FreeDrawData; createdAt: Timestamp }`
- [ ] `LineData = { x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth: number }` (normalized 0–1 coordinates relative to video frame dimensions)
- [ ] `FreeDrawData = { points: Array<{ x: number; y: number }>; color: string; strokeWidth: number }` (normalized coordinates)
- [ ] Firestore write: `clips/{clipId}/annotations/{annotationId}` document created with the above shape on save
- [ ] Firestore read: annotations for the current clip loaded on screen mount; filtered to show only annotations at `|annotation.timeMs - player.currentTime| < 500 ms`
- [ ] Security rules: only clip owner can read/write annotations subcollection

---

#### Issue 15 · [P4b] Line tool + free draw tool + undo/clear

**Labels:** `phase:4b` `type:feature` `priority:p0`

**Description**
Implement the two drawing tools, undo, and clear. Annotations are saved to Firestore and rendered as an overlay during playback.

**Acceptance Criteria**
- [ ] **Line tool**: tap-and-drag draws a straight line; endpoint snaps on gesture end; rendered as a `<Line>` Skia primitive
- [ ] **Free draw tool**: continuous path drawn as the user drags; rendered as a `<Path>` Skia primitive using `path.lineTo` for each touch point
- [ ] Tool selector in a floating toolbar: Line | Draw | (future tools placeholder)
- [ ] Stroke color picker: minimum 5 preset colors (white, red, yellow, cyan, black)
- [ ] Stroke width selector: thin / medium / thick (2 px / 4 px / 8 px at 1× scale)
- [ ] **Undo**: removes the last drawn annotation from the local buffer and deletes it from Firestore
- [ ] **Clear**: removes all annotations for the current `timeMs` window from local buffer and Firestore
- [ ] Drawing is only possible while the video is **paused**; toolbar draw buttons are disabled during playback
- [ ] Annotations saved with `timeMs = Math.round(player.currentTime * 1000)` at the moment drawing begins
- [ ] Annotations render as overlay during playback within the ±500 ms window (from Issue 14)
- [ ] Coordinate normalization ensures annotations render correctly at any screen size / orientation

---

### Phase 5 — Sharing + Gating Polish

---

#### Issue 16 · [P5] Share token generation + deep link handling

**Labels:** `phase:5` `type:feature` `priority:p1`

**Description**
Generate a shareable link for a clip using a random token stored in the Firestore document. Handle the incoming deep link in-app and in a minimal web fallback.

**Acceptance Criteria**
- [ ] "Share" button on clip detail screen generates a UUID v4 token and writes it to `clips/{clipId}.share = { token, createdAt: now(), revokedAt: null }`
- [ ] Share link format: `https://vision.app/clip/{clipId}?t={token}` — copied to clipboard and shown in a share sheet via `expo-sharing`
- [ ] Deep link scheme configured in `app.config.ts` (`scheme: 'vision'`) and `intentFilters` for Android
- [ ] On app open from deep link, route to `/clips/[clipId]` if the user is authenticated AND owns the clip, otherwise show a read-only "Shared Clip" view
- [ ] Shared Clip view: shows thumbnail, title, duration, play button; no editing; no annotation drawing
- [ ] If the app is not installed, `https://vision.app/clip/...` can show a placeholder "Download the app" page (static HTML acceptable for v1; can be a GitHub Pages or Netlify deploy — not in the mobile app)
- [ ] Expo Router handles `vision://clip/[clipId]?t=[token]` deep link path

---

#### Issue 17 · [P5] Share token revocation + Firestore security rules for token access

**Labels:** `phase:5` `type:feature` `priority:p1`

**Description**
Allow owners to revoke a share link. Enforce token-based read access in Firestore security rules so only the owner or a holder of the valid token can read the clip.

**Acceptance Criteria**
- [ ] "Revoke link" action on clip detail screen sets `clips/{clipId}.share.token = null` and `share.revokedAt = now()`
- [ ] After revocation, any attempt to open the share link (in-app or web) shows a "Link revoked" error state
- [ ] Firestore security rules for `clips/{clipId}`:
  ```
  allow read: if request.auth != null && request.auth.uid == resource.data.ownerId
              || (resource.data.share.token != null
                  && resource.data.share.revokedAt == null
                  && request.query.limit == 1);
  ```
  (Note: exact rule syntax depends on query structure; document the chosen pattern)
- [ ] Storage security rules: video URL is a signed/public download URL; no additional Storage-rule token enforcement needed for v1
- [ ] Share token is a UUID v4 (cryptographically random); not derived from clip ID or UID
- [ ] "Share" button label updates to "Update Link" if a token already exists; shows current share status (active / revoked)

---

#### Issue 18 · [P5] Offline upload queue + subscription gating polish

**Labels:** `phase:5` `type:feature` `priority:p1`

**Description**
Finalize offline upload queuing (started in Issue 7) and ensure subscription gating is consistently enforced across all upload and record entry points.

**Acceptance Criteria**
- [ ] Offline detection via `@react-native-community/netinfo`; when offline, attempted uploads are queued in AsyncStorage under `uploadQueue` (array of `{ clipId, processedPath, thumbPath, metadata }`)
- [ ] On app foreground when online, `uploadQueue` is drained in order (one at a time); progress shown in a persistent banner or notification badge on the clip list tab
- [ ] Queue survives app restart (AsyncStorage is not cleared on kill)
- [ ] If an item in the queue fails after 3 retries, it is moved to an `uploadFailed` list; user sees a "Some uploads failed" prompt with a manual retry CTA
- [ ] Subscription gate enforced at: Record screen entry, Import picker open, Upload queue drain (if subscription lapses between queue and drain, uploads are paused and user notified)
- [ ] `useSubscription()` re-fetches from RevenueCat on each app foreground (`AppState` `active`) to catch subscription state changes
- [ ] `subscriptionCache` in Firestore updated after each RevenueCat re-fetch

---

### Phase 6 — Store Readiness + Buffer

---

#### Issue 19 · [P6] Privacy policy, terms of service, and required app store metadata

**Labels:** `phase:6` `type:infra` `priority:p1`

**Description**
Prepare all legal screens and metadata required for App Store and Google Play submission.

**Acceptance Criteria**
- [ ] Privacy Policy screen accessible from: login screen footer, settings screen, paywall screen — loads a WebView or static text pointing to a hosted URL
- [ ] Terms of Service screen accessible from the same locations
- [ ] Privacy policy and ToS URLs stored in `app.config.ts` as `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL`; hosted externally (e.g., a simple static page)
- [ ] App Store metadata prepared: app name, subtitle, description (up to 4000 chars), keywords, support URL, marketing URL
- [ ] Screenshots and app preview video prepared for: iPhone 6.5", iPhone 5.5", iPad Pro 12.9" (if universal), Android phone
- [ ] App icon (1024×1024 px) and adaptive icon (Android) committed to repo assets
- [ ] `expo-tracking-transparency` permission prompt configured (iOS) if any third-party analytics SDKs are present

---

#### Issue 20 · [P6] Demo account + App Store reviewer instructions

**Labels:** `phase:6` `type:infra` `priority:p1`

**Description**
Set up a demo account with pre-loaded sample content so App Store reviewers can test all features, including the subscription-gated ones.

**Acceptance Criteria**
- [ ] Demo Firebase account created (`demo@vision.app` or similar) with a known password stored in a private EAS secret
- [ ] Demo account has at least 3 pre-loaded clips in Firestore/Storage (covering: a tagged clip, a clip with annotations, a clip with a share link)
- [ ] Demo account subscribed to the 7-day trial offering in RevenueCat sandbox (or granted entitlement directly for review purposes)
- [ ] App Store Connect "Notes for Reviewer" text drafted and included in repo at `docs/app-store-reviewer-notes.md`: includes demo credentials, how to trigger each gated feature, and a note that StoreKit sandbox must be used for IAP testing
- [ ] Google Play reviewer instructions drafted similarly
- [ ] Demo account credentials NOT committed to the repo; stored only in EAS secrets and shared via a secure channel with the submission owner

---

#### Issue 21 · [P6] Crash-free audit + EAS Submit configuration

**Labels:** `phase:6` `type:infra` `priority:p0`

**Description**
Run a final crash-free audit against the production build and configure EAS Submit for both platforms.

**Acceptance Criteria**
- [ ] Production build (`eas build --profile production`) completed successfully for both platforms
- [ ] Sentry release attached to production build; source maps uploaded
- [ ] Manual smoke-test checklist completed on physical devices (iOS + Android): auth, record, import, compress, upload, list, search, annotate, share, revoke, delete, paywall, restore purchases
- [ ] Zero P0/P1 Sentry errors from smoke test session
- [ ] `eas submit` configured in `eas.json` for both platforms; submission credentials (App Store Connect API key, Google Play service account JSON) stored as EAS secrets
- [ ] `eas submit --platform ios` and `--platform android` run successfully against the production build
- [ ] Buffer issue: track any Apple/Google rejection and re-submission within this issue

---

### Cross-Cutting (Required, Phase-Independent)

---

#### Issue 22 · [Cross] Firebase Storage cost monitoring + soft quota policy

**Labels:** `type:infra` `priority:p2`

**Description**
Implement a soft storage quota to prevent unexpected Firebase Storage costs and set up billing alerts.

**Acceptance Criteria**
- [ ] Firebase billing alert configured at $10, $25, $50 thresholds (Google Cloud Budgets)
- [ ] Soft quota policy: a user whose total `processedFile.sizeBytes` sum exceeds 20 GB is shown a warning banner and upload is blocked until they delete older clips (enforced client-side by querying total size before upload)
- [ ] Total storage used per user calculated as a Firestore aggregation query (`sum(processedFile.sizeBytes)` over `clips` where `ownerId == uid`) — run before each upload
- [ ] Sentry custom metric logged on each upload: `{ uid, clipSizeBytes, totalStorageBytes }`
- [ ] README (or internal doc) documents the quota policy and how to adjust the threshold

---

#### Issue 23 · [Cross] Firestore security rules — baseline and final review

**Labels:** `type:infra` `priority:p0`

**Description**
Define and deploy the complete Firestore security rules baseline covering all collections. Reviewed and updated as features are added in each phase.

**Acceptance Criteria**
- [ ] `firestore.rules` file committed to repo and deployed via `firebase deploy --only firestore:rules`
- [ ] Rules cover: `users/{uid}` (owner only), `clips/{clipId}` (owner + valid-token read), `clips/{clipId}/annotations/{annotationId}` (owner only), `clips/{clipId}/voiceovers/{voiceoverId}` (owner only, if used)
- [ ] No wildcard `allow read, write: if true` anywhere in production rules
- [ ] Firebase Emulator Suite used for rules unit tests; at least these cases covered:
  - Authenticated owner can CRUD their clip
  - Unauthenticated request cannot read any clip
  - Authenticated non-owner cannot read another user's clip
  - Request with valid `clipId` and matching `share.token` can read the clip document (read-only)
  - Request with revoked token (`revokedAt != null` or `token == null`) is denied
- [ ] Rules tests run in CI (e.g., via `firebase emulators:exec`)

---

## Issue Summary Table

| # | Phase | Title | Priority |
|---|-------|-------|----------|
| 1 | P1 | Initialize Expo project with TypeScript, Expo Router, and EAS Build | P0 |
| 2 | P1 | Firebase Auth + Firestore user document lifecycle | P0 |
| 3 | P1 | RevenueCat SDK init + subscription gate hook | P0 |
| 4 | P1 | Sentry error monitoring + crash reporting | P1 |
| 5 | P2 | Camera capture + photo library import (VisionCamera) | P0 |
| 6 | P2 | Video compression + thumbnail generation | P0 |
| 7 | P2 | Resumable foreground upload pipeline (Firebase Storage) | P0 |
| 8 | P2 | Clip Firestore document creation + clip list screen | P0 |
| 9 | P3 | Clip detail screen + tag and notes editing | P1 |
| 10 | P3 | Clip search + tag filter + date grouping | P1 |
| 11 | P3 | Delete clip (Firestore + Storage cleanup) | P1 |
| 12 | P4a | Stable video playback with scrub timeline | P0 |
| 13 | P4a | Slow-motion playback control | P1 |
| 14 | P4b | Skia overlay canvas + annotation data model | P0 |
| 15 | P4b | Line tool + free draw tool + undo/clear | P0 |
| 16 | P5 | Share token generation + deep link handling | P1 |
| 17 | P5 | Share token revocation + Firestore rules for token access | P1 |
| 18 | P5 | Offline upload queue + subscription gating polish | P1 |
| 19 | P6 | Privacy policy, terms, and app store metadata | P1 |
| 20 | P6 | Demo account + App Store reviewer instructions | P1 |
| 21 | P6 | Crash-free audit + EAS Submit configuration | P0 |
| 22 | Cross | Firebase Storage cost monitoring + soft quota | P2 |
| 23 | Cross | Firestore security rules — baseline and final review | P0 |

**Total: 23 issues across 8 labels / 6 phases**
