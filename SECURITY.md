# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's **[private vulnerability reporting](https://github.com/eduardomartim/gta-v-story-mode-ai/security/advisories/new)** (Security tab → *Report a vulnerability*).

If that option is unavailable, open a minimal public issue that asks for a private contact channel and contains **no technical details**.

Please include:
- the affected file or endpoint;
- reproduction steps;
- the impact you observed.

This is a personal portfolio project maintained on a best-effort basis. There is no bug bounty and no guaranteed response time.

## Supported versions

Only the latest commit on `main` is supported.

## Threat model (summary)

The application is a public, read-only question-answering agent.
- It has no user accounts.
- It stores no user data: no database writes happen at request time, and conversation history lives in the browser.
- It never fetches URLs supplied by users.

| Surface | Controls |
|---|---|
| API input (`/api/chat`, `/api/search`) | Zod schemas (unknown fields stripped, length limits, role whitelist), 16 KB body cap checked on the stream, per-client rate limit, cross-site browser requests rejected, optional `API_ACCESS_KEY` |
| SQL | Parameterised queries only; full-text terms sanitised |
| XSS | Markdown with raw HTML disabled, unsafe protocols dropped, remote images not loaded, external links on an https allow-list, SVG text escaped, strict Content-Security-Policy |
| Secrets | Server-side environment variables only; `npm run audit:secrets` checks sources and the client bundle; logs redact key-like strings |
| Errors | Clients receive fixed, safe messages with a request id; provider bodies and stack traces stay server-side |
| Prompt injection | User text, client-supplied history and retrieved chunks are delimited and declared as data; delimiter tags in user-controlled text are neutralised; citations are validated against the actual context; cards are built from database rows, not model output |

## Known limitations

- **Prompt injection is mitigated, not solved.** A determined user can still influence the wording of the answer they receive. They cannot change the knowledge base, other users' answers or the server configuration, and the model has no tools.
- **Conversation history is supplied by the client** and is therefore untrusted. It is only used as context for that user's own request.
- **The in-memory rate limiter is per instance.** It keys on `x-forwarded-for` and must run behind a proxy that sets that header (for example Vercel). Without such a proxy the header can be spoofed.
- **Without `API_ACCESS_KEY` the API is an open demo.** Anyone who can reach a deployment can spend its LLM quota, limited only by the rate limiter.
- **Development-only advisories remain.** `npm audit` reports high-severity `braces` advisories in the ESLint toolchain (`eslint-config-next` → `fast-glob` → `micromatch`). They do not ship to users (`npm audit --omit=dev` is clean). The only automated fix is a breaking downgrade.
