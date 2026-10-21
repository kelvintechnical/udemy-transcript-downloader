# Multi-course downloader architecture

## Initial audit

The initial WXT 0.20 / TypeScript extension uses a popup to message a lecture-page content script. That script owns a long-running loop and a single `local:udemy_dl_state` record. Multiple tabs or repeated Start/Resume messages can race over that record. Closing the lecture tab stops work. Curriculum retrieval reads only the first page, and transcript retrieval returns null for both missing captions and HTTP errors. Video filtering differs between the total and processing loops. ZIP generation already uses a local file map, but state shared between runs can contaminate its input. There is no automated suite.

Bun's checked-in lockfile is the dependency authority. Node 24 and Bun 1.3.1 were used for validation. No backend or cloud-held Udemy credentials are required. Browser session authentication and enrollment remain prerequisites for live downloads.

## Ownership and separation

- `queue/model.ts`: URL validation, versioned job state, video eligibility.
- `queue/scheduler.ts`: dependency-injected course workers, configurable limit (1–2), pause/resume, checkpoints, error isolation.
- `queue/http.ts`: abortable requests and bounded retries.
- `queue/api.ts`: enrolled learning-page course discovery, paginated curriculum, English caption selection and conversion.
- `queue/storage.ts`: extension-local queue persistence, independent from the old single-course key.
- `utils/file-generator.ts`: independent archive bytes and browser download delivery.
- `entrypoints/queue`: dedicated extension tab and controls. The popup opens this tab; the legacy content worker is removed.

A Web Lock elects exactly one queue owner across extension tabs. A second tab displays a message instead of acquiring writers. Keeping a visible extension tab avoids relying on an MV3 service worker surviving a long course. No hidden keepalive, access-control bypass, or background request loop is used. The queue tab must stay open and the browser must remain awake for progress.

Each course has one worker; lecture requests within that worker are sequential and paced. The active-worker map prevents duplicate work during rapid pause/resume. An aborted worker keeps its slot until it exits. Lowering concurrency lets existing work finish before starting more. State snapshots are serialized to storage; workers update distinct job objects. A save failure pauses the queue and aborts requests, rather than continuing without checkpoints.

Each successful lecture (including a confirmed absence of English captions) is checkpointed. On startup, interrupted running and pending jobs recover paused. Resume skips saved lectures, retries the failed lecture, and never treats an authorization failure as an absent transcript. Course failures leave other workers running. Global controls operate on all unfinished courses; Resume all also resumes individually paused courses. A course resumed while the global queue is paused remains queued until Resume all.

Exports receive a detached course snapshot. Each ZIP has numbered chapter folders, individual lecture Markdown, and a merged transcript. Course ID is included in archive names to distinguish matching titles. No archive is exported while a lecture is unresolved. Completion means ZIP delivery was requested, not that the browser or user accepted and saved it. Browser settings may require permission for multiple downloads. If interruption occurs after ZIP delivery but before the completed checkpoint, Resume can deliver a duplicate ZIP; exactly-once delivery is not claimed. Completed courses can be re-exported without API traffic.

## Request policy

Only HTTPS `www.udemy.com/course/<slug>/` input is accepted. The existing browser Udemy session is sent only to Udemy. Pagination must stay on the same course curriculum endpoint; loops are rejected. Caption downloads are restricted to HTTPS Udemy/udemycdn hosts, with CDN requests omitting credentials. No cookie extraction or authentication override is implemented.

Requests retry network failures, 429, and selected transient 5xx responses at most four times (five attempts). Backoff is exponential with jitter and respects Retry-After. Server cooldowns over 60 seconds stop the job with an explicit wait-and-resume instruction rather than retrying early. 401/403 and other terminal HTTP errors fail the course immediately. Pausing aborts requests and cooldown timers. Signed caption URLs are used transiently rather than saved with transcript checkpoints.

## Persistence and limits

Queue contents and downloaded transcripts are stored locally using `storage.local`; `unlimitedStorage` supports larger courses subject to available disk. This data is not uploaded elsewhere. Old `udemy_dl_state` data is left untouched and is not migrated; old jobs must be re-added. Clear the extension's local storage or uninstall it to erase retained transcripts. There is currently no individual removal control.

Whole-state snapshots and in-memory ZIP construction are acceptable for the two-course MVP but may be expensive for very large courses. Before enabling 5–10 workers, add per-course/chunked persistence, memory benchmarks, a shared rate-limit budget, performance/soak coverage on large courses, and authenticated Chromium/Edge lifecycle tests. The scheduler currently rejects values above 2, including values injected from the UI or saved state.

## Verification boundaries

`bun test` runs deterministic scheduler and HTTP tests plus mocked API-to-ZIP integration. It does not contact Udemy. Real enrollment, learning-page markup, CDN policy, browser downloads, tab suspension, and authenticated Edge behavior need the checklist in README. A Firefox build alone does not prove Firefox runtime support.
