# JAITRA Play — Face Recognition Rework Brief v2

Status: agreed implementation specification; acceptance measurements pending.

**Step Zero now comes first:** follow the [measurement addendum](../deploy/face_eval/STEP_ZERO.md) before §11. Its comparison determines which runtime changes are justified; the architecture and numerical targets below remain provisional.

This is the single current brief. It supersedes the original pasted brief written
against `ad0cde2` and incorporates the subsequent review and accepted amendments.
It describes required behavior, not a claim that the rework is implemented.
The pending clock activity is unrelated work and must be preserved.

## 1. Objective and scope

**Acquire once, then hold.** Acquire a named person's identity from a clear face,
maintain it through reliable track continuity, and recover through explicit face
review or the existing hand-raise challenge when continuity genuinely breaks.
Do not demand a successful face match on every frame or promise recognition at a
particular distance without measurements.

Apply the service to Jaitra and all enrolled family members. Preserve stable person
IDs, names, relationships to Jaitra, profile deletion, manual correction, and the
ability to share enrollment data with a separate client through the local core.

The live video stays visible and continues processing while new or uncertain face
crops appear in a separate review section below it. Naming or approving a face
labels its corresponding live track when that association is still valid.
Do not attach an old review card to whichever person currently occupies its area.

## 2. Non-negotiable constraints

- Recognition is entirely local. No cloud or question-provider calls, and no
  descriptors, crops, names or relationship data added to general telemetry.
- Diagnostic exports contain no descriptors or images. Include operational timing,
  model/configuration identifiers and matching outcomes needed for evaluation.
- Ordinary live frames are transient and not recorded to disk. Enrollment retains
  only bounded, temporary candidate crops in memory for explicit parent review.
  Release crops when saved, discarded, cancelled, expired or the view closes.
- Disk recording is a separate explicit evaluation action. Keep collected clips,
  labelled datasets and predictions in private, git-ignored `.local/` storage.
  Browser downloads cannot enforce a destination; describe this accurately rather
  than claiming every download is automatically placed under `.local/`.
- Never update a saved gallery because of an automatic match, pose continuity,
  a hand raise, or a confidence estimate. Only explicit approval/save may write it.
- Preserve voice and gesture recovery, retry, skip and manual selection. Uncertainty
  must not block the child's activity indefinitely.
- Body shape, height and clothing cannot confirm identity. Pose and spatial motion
  may associate an already confirmed track, subject to ambiguity rejection.
- Keep existing regression coverage; revise expectations only for deliberate v2
  behavior changes, with replacement tests demonstrating the new guarantees.

## 3. Corrected diagnosis of the existing implementation

The current `PersonTracker.update()` retains `target` when that same person ID
remains in `next`, including a body-only observation. A missing face resets
`matches`, destroying **acquisition evidence**, but does not by itself destroy an
already established target.

There are two separate holding failures:

1. An absent visible track clears `target` even while its association information
   remains in the recent-track retention cache.
2. A single face that fails `faceMatches()` clears a face-confirmed target
   immediately. This has no contradictory-evidence hysteresis.

Fix both, while treating missing, low-quality, contradictory and ambiguous evidence
as different events. Do not describe the existing system as losing every established
identity on any missing-face frame.

Current browser baseline settings:

| Setting | Baseline |
| --- | --- |
| Capture request | ideal 1920 × 1080; log actual dimensions |
| Analysis width | 640 |
| TinyFaceDetector input size | 320 |
| Detector score threshold | 0.65 |
| Minimum face box | 45 analysis pixels in both dimensions |
| TensorFlow backend | CPU |
| Pose | lite model, four poses, CPU in identity view |
| Pacing | 200 ms wait after completed processing |
| Recognition | mean of three nearest Euclidean distances < 0.42 |

Increasing analysis width can preserve more captured detail. Doubling the minimum
box from 45 at width 640 to 90 at width 1280 keeps the same relative admission gate:
`45 / 640 == 90 / 1280`. It does not extend the gate's admitted range.

Evaluate a lower relative gate separately, including approximately 50–60 absolute
pixels at width 1280 as experimental candidates. Do not turn geometric distance
estimates into accuracy claims. Use the source face-width bucket results to decide.
A lower detector threshold may increase non-human detections; measure that tradeoff.

## 4. Baseline isolation and truthful configuration

Create one typed configuration source with explicit named baseline and candidate
live configurations. Preserve all existing baseline defaults exactly. Changes to
live width, detector size, minimum box, thresholds, backend, pacing or tracking
must not silently change an offline baseline replay.

Candidate browser live settings to evaluate:

- analysis width 1280;
- detector input size 512 and detector score threshold 0.5;
- minimum face size independently configurable;
- WebGL attempted when GPU is requested, with explicit CPU fallback;
- pose worker follows `readSettings().preferGpu`;
- adaptive one-frame-in-flight scheduling with an initial 33 ms scheduling floor.

These are experimental configuration values, not calibrated operating points.
The original baseline uses CPU even after a live GPU session. Account for the
TensorFlow backend's shared runtime: serialize backend changes or isolate contexts
so a replay cannot silently inherit WebGL or switch a running inference underneath it.

Diagnostics must read the effective runtime configuration, including actual backend,
model, capture and analysis dimensions, detector settings, matcher settings, pacing,
and configuration/calibration identifier. A configuration change starts a new session
or emits an explicit configuration-change record. Remove hardcoded diagnostic duplicates.

## 5. Acquisition, retention and presence

Use a shared identity-state implementation for Jaitra and other family members.
Keep evidence time-aware so behavior does not change unintentionally at 3 versus
10 FPS. Do not accumulate repeated UI renders as new camera observations.

Required states distinguish at least unknown, acquiring, confirmed-visible and
confirmed-retained-but-not-visible. Track last observation and last reliable face
match separately. Reject stale/out-of-order frame results.

- Matching evidence accumulates across brief misses instead of hard-resetting.
- Missing or unusable face evidence is not proof of a different identity.
- A reliable continuing body track may retain its previously acquired identity
  without repeated successful face matches.
- Contradictory face evidence also accumulates before revocation. A single failed
  threshold comparison must not revoke a confirmed identity. Use separate entry
  and exit thresholds plus time/evidence requirements, all configurable.
- Consecutive contradictory evidence must eventually revoke identity; never hold
  a prior name indefinitely through a genuine person replacement.
- Ambiguous track association or a multi-person crossing is a separate safety
  case: clear/suspend association immediately rather than allowing hysteresis to
  transfer a name to an ambiguous person. Offer manual/gesture recovery.
- Retain identity memory through at least two seconds of full occlusion within a
  bounded retention window. Expire genuinely lost tracks and stale positions.
- Duplicate assignment of one saved identity to multiple visible tracks yields
  uncertainty rather than choosing an arbitrary winner.

Events consumed by activities must distinguish identity memory from **current
presence**. “Jaitra, go to Father” requires exactly one currently visible,
unambiguously identified father with fresh tracking evidence. Retained identity,
an old coordinate, an enrollment card, or a stale reply is insufficient.

## 6. Matching and model compatibility

### Browser compatibility path

Unify `faceMatches`, `identifyPerson` and relevant live diagnostic scoring around
one shared scorer and one threshold source. Keep the baseline top-three Euclidean
rule intact in baseline mode. Family identification must compare all eligible
profiles, including Jaitra, rather than running independent matchers that ignore
one another as competitors.

### Core ArcFace path

Use L2-normalized embeddings and maximum cosine similarity over each person's
approved gallery. Open-set identification requires all three conditions:

1. the person has the highest gallery score among eligible profiles;
2. that score passes a calibrated absolute similarity threshold;
3. the score exceeds the runner-up by the calibrated margin.

Otherwise the result is explicitly **unknown**. For a single enrolled person,
there is no runner-up but the absolute threshold still applies. Reject malformed,
non-finite, zero-norm or incompatible embeddings. Require at least three approved
views for automatic identification under either live model.

Naming is independent of automatic eligibility: one confirmed crop may save a name
and relationship and explicitly confirm a current track. Indicate “more approved
views needed” until automatic eligibility is met. Never fabricate duplicate samples
to satisfy the minimum.

Version stored formats and identify the embedder/model explicitly. Preserve the
identity/people API operations and names/relationships. Profiles from the old model
must remain readable/deletable and display **re-enrollment required** when the new
model is selected. Do not match, convert, pad or mix their 128-dimensional vectors
with new embeddings. Saving re-enrollment replaces incompatible gallery data only
through explicit approval; it must not discard family names or relationships.

An uncertain face card may show the suggested name and a percentage, but label it
as an **estimated similarity**, not a calibrated probability unless probability
calibration is actually performed. Keep approve, correct-to-existing-person,
create-new-person, skip and not-a-person actions. A guessed name never writes a profile.

## 7. Enrollment and manual review

Preserve immediate still-face naming while the live video runs. Add an optional
60–90 second guided enrollment session for a selected person, with prompts for
varied angles, lighting and practical play distances.

Do not keep 60–90 seconds of full-resolution frames. Process a rolling stream and
retain only candidate crops and their descriptors/metadata after quality checks.
Configure and enforce both a candidate-count cap and a byte cap, plus maximum crop
dimensions and session duration. Target 15–25 approved diverse views if enough good
candidates are available; report insufficient variety instead of filling a quota.

Use `cropMetrics` or equivalent measured sharpness/luminance, clipping checks and
near-duplicate rejection. Quality and diversity parameters are configuration values
that require measurement. A bounded candidate reservoir may replace weaker samples
with better diverse views. Clear all temporary data on cancellation and shutdown.

Remove the `distance(samples[0], candidate) > 0.5` enrollment restriction. It is not
an appropriate diversity filter. Removing it does not authorize harvesting every
face: capture only from the selected, unambiguous track; pause capture when tracking
breaks or becomes ambiguous, then require reselection/confirmation.

Parents inspect candidate crops and may select/deselect them before saving. No
background gallery learning. Rejecting a non-human detection excludes it from the
current review/recognition selection; document whether that correction is track-local
rather than pretending it retrains the detector permanently.

For missed detections, retain freeze-and-draw face selection and discarding controls.
Manual selection may request a crop inference, but must not fabricate an embedding
when no usable face can be extracted.

## 8. Core architecture and transport measurement

Target deployment: Ubuntu with RTX 3050 6 GB. CPU on Windows/WSL is for functional
checks, not a substitute for target GPU latency measurements.

Promote the shared `Embedder` protocol and `InsightFaceEmbedder` from
`deploy/face_eval/arcface.py` into the core package. Keep model/runtime dependencies
optional and lazily loaded so the app and baseline tests work without a GPU stack.
Keep the offline runner operational through the shared implementation, including
its explicit CPU opt-in and refusal to present CPU fallback as a GPU benchmark.
Preserve a swappable embedder. Record the pretrained-model licensing restriction
in deployment documentation; the application is a local family build.

Initial architecture: **the UI owns camera capture, preview, pose and tracking**.
Take one immutable captured frame per cycle. Pose uses that frame and face inference
receives its JPEG representation through the existing local core API. Tag request,
response and pose with the same frame ID and capture timestamp. Associate only
results from that exact frame, not the current preview or nearest response time.

Keep one frame in flight or explicitly bounded backpressure. Put limits on request
bytes, decoded image dimensions, inference queue depth and request lifetime. Cancel
or discard results after camera restart/pause or a session-generation change.
Use the existing restricted Electron bridge in production, not an unrestricted
renderer network capability. Do not log request payloads or retain uploaded images.

**Measure transport before locking in the architecture.** Record capture/resize,
JPEG encode, IPC/HTTP round trip, core decode, face inference, pose inference,
association and total cycle timing, plus bytes/frame and actual backend. Avoid
adding overlapping timings as if they were sequential. Report percentile timings
and achieved FPS, not inference latency alone.

If encoding/transport dominates the measured target cycle, revisit shared memory
or core-owned capture/preview streaming. Do not assume either will be faster without
measurement. State the implemented capture/association architecture explicitly in
the implementation commit message and record the evidence behind any later switch.

## 9. Evaluation and joint calibration

Extend the existing harness with per-person IDs while retaining legacy
`jaitra`/`other` manifest support. Unknown visitors and non-human detections must be
represented in evaluation; “other” cannot stand in for evaluating Father versus
Mother confusion. Model comparisons must use the same labels and splits.

Collect 15–20 consented full-resolution clips, 20–30 seconds each: entry, floor
play, seated, turning away, walking, near/far, daylight/evening, parent alone,
parent with child, multiple family members and an unenrolled person where available.
Enrollment, calibration and test use separate sessions. Never split adjacent frames
from one session across these sets. Record actual capture dimensions.

1. Annotate visible faces and explicit empty frames. Extend the local label tool
   to assign stable person IDs. Preserve source-normalized xywh boxes.
2. Run baseline and candidate pipelines on identical labelled frames. Preserve
   IoU 0.3 one-to-one association and missing-prediction validation.
3. Sweep **both the absolute threshold and runner-up margin** on calibration only.
   Store per-person scores needed to rescore without rerunning inference; these
   evaluation files must not contain embeddings or crops.
4. Choose an operating point using declared false-identification versus miss costs.
   Include open-set false accepts, wrong-family assignments and duplicate matches.
   Do not select thresholds by watching the live preview.
5. Freeze a versioned calibration artifact identifying model, detector/preprocessing,
   gallery eligibility, threshold, margin and dataset/split provenance. Reject an
   artifact for an incompatible model/configuration. Never deploy an invented
   ArcFace threshold as calibrated; absent calibration must be explicit in the UI.
6. Score the held-out test split after freezing. Do not tune against its results.
7. Report detection recall, identification misses, wrong-person identifications,
   false accepts, unmatched detections and latency with raw denominators. Stratify
   by source face width: <40, 40–60, 60–90, 90–130, 130+ pixels.
8. Add sequence-level evaluation for acquisition time, occlusion retention,
   identity switches, ambiguity recovery and current-presence correctness. Existing
   frame-only scores cannot establish those temporal acceptance criteria.

The threshold, runner-up margin and relative face-size gate all need data. No
near-zero-recall prediction or range estimate substitutes for an actual bucket table.

## 10. Acceptance and verification

### Deterministic automated requirements

- Intermittent missing faces do not hard-reset acquisition evidence.
- One contradictory frame does not revoke an established identity; accumulated
  contradictions do, according to explicit time-aware settings.
- Full occlusion retains identity memory for at least two seconds while marking
  the person not currently visible and withholding stale activity instructions.
- Ambiguous crossings, duplicate identity assignments and unknown visitors do not
  receive an arbitrary confirmed identity.
- All automatic match paths use the shared scoring/eligibility/configuration rules.
- One-view naming and explicit track confirmation work; automatic identification
  requires three approved views.
- Old-model galleries cannot match new embeddings and remain deletable with clear
  re-enrollment status.
- Enrollment storage stays within byte/count/time bounds; quality/diversity filters,
  parent selection, cancellation and ambiguous-track pauses have tests.
- Delayed/out-of-order replies and camera restarts cannot cross-associate frames.
- Diagnostic headers reflect actual settings/backends and exports omit descriptors,
  images and raw frame payloads.
- Baseline replay preserves its original detector, geometry, matching and CPU path.
- Existing core/UI/privacy/fault tests pass, with intentional behavior changes
  covered explicitly rather than weakening unrelated assertions.

### Measured target acceptance — do not claim from code

- Acquire Jaitra within two seconds of facing the camera at 1.5 m.
- Retain acquired identity through at least two seconds of face loss/full occlusion
  and avoid state flicker during ordinary room movement.
- Measure false identifications and identity switches on held-out multi-person
  recordings; reject ambiguity. Do not promise “never wrong.”
- Sustain at least 10 processed frames/second on the Ubuntu RTX 3050 target,
  reporting end-to-end percentiles, transport cost and actual backend.
- Publish stratified held-out accuracy and the frozen threshold/margin artifact.

Hardware, recordings and calibration results are external verification inputs.
Mark these acceptance items pending until those inputs are available and the
measurements have actually been performed.

## 11. Implementation sequence

1. Preserve the baseline and establish runtime configuration/diagnostic plumbing.
2. Introduce unified scoring and the shared time-aware identity state machine,
   including current-presence events and safe activity consumers.
3. Implement bounded candidate enrollment and review without losing existing
   naming, relationship and manual-correction flows.
4. Promote the embedder, add version-aware storage and bounded local frame ingest;
   measure transport using the same-frame UI capture architecture.
5. Extend per-person labelling, both pipeline outputs, threshold/margin sweeps and
   sequence evaluation; wire frozen calibration into runtime configuration.
6. Run automated regression coverage. Run target GPU and held-out measurements
   when hardware/data are available, then report which acceptance items passed.

Record actual completion and evidence separately from this specification. Do not
rewrite pending requirements as completed merely because implementation exists.
