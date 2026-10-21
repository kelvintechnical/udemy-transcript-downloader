# Udemy Transcript Downloader

WXT / TypeScript browser extension for downloading available English lecture captions from enrolled Udemy courses into chapter-organized Markdown ZIPs.

## Two-course MVP

- Add multiple course URLs, or add an open Udemy course tab.
- Process up to **two courses concurrently** (default 2; choose 1 for single-course downloads).
- Independent progress, errors, pause/resume, and ZIP exports per course.
- Pause all / Resume all controls. Resume all resumes individually paused jobs too.
- Recover interrupted jobs from local checkpoints; recovery is paused until Resume.
- Paginated curricula and bounded, abortable HTTP retry/backoff.
- A separate ZIP per course, with numbered chapter folders, lecture files, and a complete merged transcript. Missing English captions are marked explicitly.

Use only courses you are enrolled in and have permission to download. Follow Udemy's applicable terms, API restrictions, and copyright requirements. The extension uses your browser session and does not bypass authentication or enrollment. Access failures stop the affected course.

## Development

Prerequisites: Node.js 22+ and Bun 1.3.1+. The checked-in `bun.lock` pins dependencies.

```sh
bun install --frozen-lockfile
bun run compile
bun test
bun run build
```

For live development: `bun run dev`. Production Chromium/Edge output is `.output/chrome-mv3`. `bun run build:firefox` creates `.output/firefox-mv3`; Firefox runtime behavior still needs manual validation. `bun run zip` creates the extension distribution package (separate from course transcript ZIPs).

In the prepared cloud environment, Bun is at `/workspace/.tools/udemy-bun/node_modules/.bin/bun`; use this absolute executable if Bun is not on PATH. No backend, API key, or cloud Udemy login is needed for development.

## Load the unpacked extension in Microsoft Edge

1. Build with `bun run build` and copy the `.output/chrome-mv3` directory to your local machine if building in the cloud.
2. Open `edge://extensions`, enable **Developer mode**, select **Load unpacked**, and choose that directory (the one containing `manifest.json`).
3. Sign in to Udemy normally in Edge and verify you can open both enrolled course learning pages.
4. Click the extension icon, then **Open download queue**.
5. Paste one or more `https://www.udemy.com/course/<course-name>/` URLs, one per line, and select **Add courses**. Alternatively choose **Add current Udemy tab**.
6. Keep the queue tab open and the browser awake. Allow multiple downloads if Edge prompts. Each completed course requests its own ZIP download.

Only one queue tab owns processing. A second tab explains that the queue is already open. Closing the queue tab or browser stops processing; reopen and select Resume to continue saved work. Failed courses can be retried after resolving the reported cause. Long server cooldowns require waiting before resuming.

Completed jobs have **Export ZIP again** to repeat the export without downloading captions. Export status indicates the ZIP request was issued; inspect your browser's download list to verify it was saved. Interruption at final export may produce a duplicate ZIP on resume.

## Output

```text
CourseTitle_CourseID_Transcripts.zip
├── 01_Chapter/
│   ├── 01_Lecture.md
│   └── 02_Lecture.md
└── CourseTitle_CourseID_Full.md
```

Non-video lectures and quizzes are skipped. Video lectures without English captions get a placeholder. A failed HTTP request remains an error rather than being silently converted to a missing-caption placeholder.

## Architecture and limits

See [architecture and initial audit](docs/architecture.md). Scheduling, API access, persistence, ZIP generation, and UI are separate modules. The dedicated extension tab owns a Web Lock and serialized writes, avoiding content-script races and MV3 worker lifetime assumptions.

The queue stores transcripts in extension-local storage. `unlimitedStorage` supports large courses subject to disk limits. Host access is restricted to Udemy and its caption CDN; no external application server receives transcripts. Old single-course state is preserved but not migrated. Remove extension storage to erase saved transcripts; individual job removal is not yet implemented.

Concurrency above 2 is deliberately disabled. The roadmap to 5–10 requires memory/soak tests, more granular persistence, shared rate-limit controls, and authenticated browser lifecycle coverage. The current implementation stores full snapshots and builds ZIPs in memory.

## Validation

Automated coverage uses synthetic, enrolled-style API responses, not a live Udemy account:

- Concurrent workers and queue draining; single-course mode.
- Individual/global pause and rapid resume; interrupted checkpoints and course error isolation.
- Storage failure stops new processing.
- 429 / Retry-After, transient 5xx, bounded attempts, abort, and terminal authentication errors.
- Curriculum pagination, English selection, and chapter/merged ZIP contents.

See [validation results](docs/validation.md) for actual commands and outcomes. After building, `bun run test:browser` checks the production UI with mocked browser APIs and Udemy responses. It requires Chromium at `/usr/bin/chromium` or a `CHROMIUM_PATH` override; it does not load an actual extension or authenticate to Udemy.

### Manual authenticated Edge checklist

- Load the unpacked Chromium build and add two enrolled courses with English captions.
- Verify progress advances independently and both ZIPs contain complete chapters and merged transcripts; compare representative lectures with Udemy's displayed captions.
- Test one course alone, then two together. Pause/resume one while the other runs, and pause/resume all.
- Close/reopen the queue tab during a lecture; confirm recovery is paused and Resume retains saved work.
- Open a second queue tab; confirm only one owner processes work.
- Check permission/download prompts, refresh/restart behavior, and a course without English captions.
- Verify signed-out and unenrolled courses fail clearly without exporting misleading incomplete ZIPs. Do not intentionally generate load to provoke live rate limits; use automated retry tests.

Manual authentication and browser validation are required before calling live Udemy downloads verified. API markup or policies may change independently of the extension.

## License

[MPL-2.0](LICENSE). Based on [InvictusNavarchus/udemy-transcript-downloader](https://github.com/InvictusNavarchus/udemy-transcript-downloader).
