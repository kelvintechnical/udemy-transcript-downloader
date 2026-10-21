# Validation record

Validated in the cloud on 2026-10-21 with Node 24.19.0, Bun 1.3.1, WXT 0.20.13, TypeScript 5.9.3, and Chromium 154.

| Check | Outcome |
| --- | --- |
| `bun install --frozen-lockfile` | Passed using the committed Bun lockfile |
| `bun run compile` | Passed |
| `bun test` | 12 passed, 0 failed, 54 assertions across 2 files |
| `bun run build` | Passed; `.output/chrome-mv3` |
| `bun run build:firefox` | Passed; runtime behavior not verified |
| `bun run test:browser` | Passed against the production Chromium bundle with synthetic browser storage and Udemy responses: two courses, two ZIP download events, duplicate-owner prevention, completion retained after reload, no page errors |
| Direct unpacked-extension load in cloud Chromium | Unavailable: load flags did not load the extension; experimental CDP method unavailable |
| Authenticated Udemy / Microsoft Edge | Not run; requires the user's local browser session |

The browser UI smoke requires a Chromium executable (defaults to `/usr/bin/chromium`; override with `CHROMIUM_PATH`). Run `bun run build` before `bun run test:browser`. It uses a temporary loopback HTTP server and injected browser APIs, not a real extension origin, so it cannot establish real extension permissions or live Udemy compatibility.

Automated tests use synthetic API responses and no Udemy credentials. ZIP contents are decompressed and checked in unit/integration tests. The browser smoke verifies ZIP download events and names, not whether Windows or Edge accepts the final downloaded files.

Repository source and lockfile changes are part of the explicitly requested feature implementation. Environment installation instructions are saved separately in the onboarding draft; saving does not publish the environment.

GitHub API requests returned Forbidden despite successful HTTPS Git reads. This blocks automatic PR creation. The environment draft includes `api.github.com` as a requested network destination; it must be reviewed/saved to apply. API authentication/authorization will still need verification after network access is available.
