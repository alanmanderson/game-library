---
name: security-review
description: Complete a security review of the pending changes on the current branch, blocking PR creation until issues are resolved.
argument-hint: [optional: specific area to focus on, e.g. "auth" or "websocket"]
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
---

# Security Code Review

Review all pending changes on the current branch for security vulnerabilities before a PR is created. This skill is designed to run automatically as a pre-PR gate but can also be invoked manually.

## Instructions

### Step 1: Identify the changes to review

Determine the base branch and collect the full diff:

```bash
# Find the merge base with main
BASE=$(git merge-base HEAD main)

# List all changed files
git diff --name-only $BASE HEAD

# Get the full diff for analysis
git diff $BASE HEAD
```

Also check for any uncommitted changes that would be included:

```bash
git diff --name-only          # Unstaged
git diff --cached --name-only # Staged
```

If there are uncommitted changes, include them in the review scope.

### Step 2: Classify changed files

Map each changed file to its security domain so you can apply the right checks:

| Path pattern | Domain | Priority checks |
|---|---|---|
| `*/auth*`, `*/jwt*`, `*/login*`, `*/register*` | Authentication | Token handling, password hashing, session management |
| `*/websocket*`, `*/ws*`, `*/socket*` | WebSocket | Auth on connect, input validation, message rate limiting |
| `*/api/*`, `*/routes*`, `*/endpoints*` | API surface | Input validation, authorization, CORS, rate limiting |
| `*/models*`, `*/schema*`, `*/migration*` | Data layer | SQL injection, mass assignment, sensitive field exposure |
| `*/config*`, `*/settings*`, `*.env*` | Configuration | Hardcoded secrets, insecure defaults, debug mode |
| `Dockerfile*`, `docker-compose*`, `Caddyfile` | Infrastructure | Privilege escalation, exposed ports, missing security headers |
| `requirements*.txt`, `package*.json` | Dependencies | Known vulnerabilities, version pinning |
| `*.html`, `*.tsx`, `*.jsx`, `*.vue` | Frontend | XSS, unsafe rendering, token exposure |

### Step 3: Run the security checklist

For EVERY changed file, apply the relevant checks from the domains above. Read each changed file in full (not just the diff) to understand context. The checks below are specific to patterns found in this monorepo.

#### 3a. Authentication & Authorization

- [ ] **JWT secret strength**: No hardcoded secrets or weak defaults like `"dev-secret-key-change-in-production"` without runtime validation in production mode. Check that `SECRET_KEY` / `JWT_SECRET` values come from environment variables and are validated at startup.
- [ ] **JWT algorithm pinning**: Verify `algorithms=["HS256"]` is explicitly set in `jwt.decode()` calls (prevents algorithm confusion attacks). Never accept the algorithm from the token header.
- [ ] **Password hashing**: Must use bcrypt (or argon2). Never store plaintext. Verify `passlib` CryptContext or `bcrypt.hashpw` usage.
- [ ] **Token expiry**: All JWTs must have an `exp` claim. Check that expiry is reasonable (< 24 hours for access tokens).
- [ ] **Authorization checks**: Verify that endpoints check the authenticated user has permission to access/modify the requested resource (not just that they're logged in).
- [ ] **Google OAuth validation**: ID tokens must be verified against Google's tokeninfo endpoint or `google-auth` library, not just decoded locally.
- [ ] **OAuth state parameter**: OAuth callback must validate the `state` parameter to prevent CSRF.
- [ ] **Token in URL**: Tokens should not appear in URL query strings (they leak via Referer headers and server logs). URL fragments (`#token=...`) are acceptable but `?token=...` is not.

#### 3b. Input Validation & Injection

- [ ] **SQL injection**: All database queries must use SQLAlchemy ORM or parameterized queries. Flag any raw SQL string formatting (`f"SELECT ... {user_input}"`, `.format()`, `%` interpolation in SQL strings).
- [ ] **Command injection**: No `os.system()`, `subprocess.call(shell=True)` with user input. Check for `eval()`, `exec()` with untrusted data.
- [ ] **Path traversal**: Static file serving must use framework-provided `StaticFiles` or equivalent, not manual path construction. Check for `os.path.join(base, user_input)` without canonicalization.
- [ ] **XSS**: No `dangerouslySetInnerHTML`, `innerHTML`, `v-html`, or `document.write()` with user-controlled content. React JSX escaping is safe by default but check string interpolation into HTML attributes.
- [ ] **Request body validation**: API endpoints must validate input via Pydantic models (FastAPI), Zod schemas (Node), or equivalent. Flag endpoints that read raw request body without validation.
- [ ] **Player name / chat sanitization**: User-provided display names and chat messages must be length-limited and should not contain control characters or HTML.

#### 3c. WebSocket Security

- [ ] **Authentication on connect**: WebSocket endpoints must validate JWT before accepting the connection. Check that unauthenticated connections are rejected (closed with appropriate code like 4401).
- [ ] **Per-message validation**: Each incoming WebSocket message should be validated for expected structure (JSON parse errors caught, required fields checked).
- [ ] **No message replay**: Game-state-changing messages should validate that the action is legal in the current game state (prevents replay of old moves).
- [ ] **Broadcast data leakage**: Verify that WebSocket broadcasts don't leak private game state to opponents or spectators (e.g., other players' cards, hidden information).

#### 3d. Configuration & Secrets

- [ ] **No committed secrets**: No API keys, passwords, tokens, or private keys in the diff. Check for patterns: long hex/base64 strings, `password =`, `secret =`, `api_key =`, `token =` with literal values.
- [ ] **Debug mode**: `DEBUG = True`, `FLASK_DEBUG=true`, or equivalent must not be set in production configs. Check for proper environment-based configuration switching.
- [ ] **CORS configuration**: `allow_origins=["*"]` with `allow_credentials=True` is a critical vulnerability. Verify origins are explicitly listed in production. Default-to-wildcard is acceptable only if credentials are disabled.
- [ ] **Environment variable fallbacks**: Sensitive config values must not have usable default fallbacks (e.g., `os.getenv("SECRET_KEY", "some-default")` is dangerous).

#### 3e. Infrastructure & Docker

- [ ] **Non-root containers**: Dockerfiles should use `USER appuser` (or equivalent non-root user) before `CMD`/`ENTRYPOINT`.
- [ ] **No secrets in build**: No `COPY .env`, `ARG SECRET_KEY`, or secrets baked into Docker images.
- [ ] **Caddy security headers**: If the Caddyfile is modified, verify it includes (or a `header` block adds): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] **Port exposure**: Only Caddy should expose external ports. Game containers should only be accessible on the internal Docker network.

#### 3f. Dependencies

- [ ] **Pinned versions**: New dependencies should be version-pinned (not `*` or `latest`).
- [ ] **Known vulnerabilities**: If requirements.txt or package.json changed, run `pip audit` or `npm audit` if available and report findings.
- [ ] **Unnecessary dependencies**: Flag new dependencies that duplicate existing functionality or introduce large attack surface for minimal benefit.

### Step 4: Check for common anti-patterns in this repo

These are repo-specific patterns that have been identified as recurring risks:

1. **Weak secret defaults in spades/Flask apps**: The spades app uses `os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')` without runtime validation. Any new Flask/config code should validate secrets at startup in production mode.
2. **CORS wildcard in bughouse**: The bughouse app defaults CORS to `"*"` when `CORS_ALLOWED_ORIGINS` env var is unset. New services should default to restrictive CORS.
3. **Missing WebSocket rate limiting**: None of the current apps rate-limit individual WebSocket messages. New WebSocket handlers should consider per-connection message rate limits.
4. **Token in redirect URLs**: OAuth callbacks sometimes put JWT tokens in redirect URLs. Prefer URL fragments (`#token=`) over query strings (`?token=`).
5. **Logging sensitive data**: WebSocket handlers sometimes log raw message payloads. Ensure new logging doesn't include tokens, passwords, or PII.
6. **Missing security headers in Caddyfile**: The current Caddyfile has no security headers configured. If modifying it, consider adding them.

### Step 5: Produce the security report

Output a structured report with the following format:

---

## Security Review: `<branch name>`

**Scope**: X files changed, Y security-relevant

### Critical Issues (must fix before merge)

> Issues that represent exploitable vulnerabilities or credential exposure.

| # | Severity | File | Line(s) | Issue | Recommendation |
|---|----------|------|---------|-------|----------------|
| 1 | CRITICAL | path/to/file.py | 42-45 | Description | Fix suggestion |

### Warnings (should fix)

> Issues that weaken security posture but are not immediately exploitable.

| # | Severity | File | Line(s) | Issue | Recommendation |
|---|----------|------|---------|-------|----------------|
| 1 | WARNING | path/to/file.py | 10 | Description | Fix suggestion |

### Informational

> Observations, suggestions for hardening, or areas to monitor.

- Item 1
- Item 2

### Summary

**Verdict**: PASS / PASS WITH WARNINGS / FAIL

- FAIL: One or more critical issues found. These MUST be resolved before creating a PR.
- PASS WITH WARNINGS: No critical issues, but warnings should be addressed. PR can proceed.
- PASS: No security issues found in the changed code.

---

### Step 6: Act on the verdict

- **If FAIL**: List the critical issues clearly and explain exactly what needs to change. Do NOT proceed with PR creation. Tell the user what to fix.
- **If PASS WITH WARNINGS**: Present the warnings and ask the user if they want to address them before the PR or proceed as-is.
- **If PASS**: Confirm the changes are security-clean and proceed.

## Notes

- This review focuses on the **changed code**, not the entire codebase. Pre-existing issues are noted only if the changes interact with them.
- When a focus area is specified (e.g., `/security-review auth`), prioritize that domain but still scan all changes.
- False positives are better than false negatives — flag anything questionable and let the developer decide.
- This is a code-level review, not a penetration test. It catches common vulnerability patterns but does not replace security testing.
