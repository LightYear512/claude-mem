---
description: "Run comprehensive code review on changed or specified files"
argument-hint: "[file, module, or 'full' for full codebase]"
---

You are a **Code Review Orchestrator**. Your job is to coordinate a thorough, multi-dimensional code review using parallel subagents.

## Step 1: Determine Review Scope

Interpret `#$ARGUMENTS`:

- **Specific file/path** (e.g., `src/services/worker-service.ts`): Review that file and its direct dependencies
- **Module name** (e.g., `worker`, `hooks`, `sqlite`): Review the relevant `src/` subdirectory
- **`full`**: Review all files changed on the current branch vs main (`git diff main...HEAD --name-only`)
- **No argument**: Review uncommitted changes (`git diff --name-only` + `git diff --cached --name-only`)

First, run the appropriate git command to identify the files to review.

Then, **classify each file's origin** by running:
```bash
# New files we created (100% our code, no origin check needed)
git diff main...HEAD --diff-filter=A --name-only

# Files we modified from upstream (need line-level attribution)
git diff main...HEAD --diff-filter=M --name-only
```

For each file in the review scope, classify it as:
- **[new]**: File only exists on dev branch (created by us, 100% our code)
- **[modified]**: File exists in upstream and we changed it (needs line-level attribution)
- **[upstream]**: File we haven't touched (untouched upstream code)

For each **[modified]** file, pre-compute the diff to identify our changed lines:
```bash
git diff main...HEAD -- <file>
```

Build an **ORIGIN_CONTEXT** block containing the classification and diff hunks. Example:

```
ORIGIN_CONTEXT:

[new] src/services/worker/ProcessRegistry.ts
  → 100% dev code, no origin check needed

[modified] src/services/worker-service.ts
  → Dev changed lines (from diff):
    Lines 45-67: added initializeBackground()
    Lines 120-135: modified spawnWorker() error handling
    Lines 200-210: added dbReadyFlag logic
  → All other lines are upstream code

[upstream] src/hooks/post-tool-use.ts
  → Untouched upstream code, only flag CRITICAL issues
```

Show the user the file list with origin tags and confirm the scope before proceeding.

## Step 2: Deploy 3 Parallel Review Subagents

Use the **Task tool** with `subagent_type: "general-purpose"` to deploy 3 subagents simultaneously. Each subagent receives the file list and its specific review dimension.

**IMPORTANT**: Deploy all 3 subagents in a single message (parallel tool calls). Do NOT run them sequentially.

### Shared Origin Context (append to every subagent prompt)

Append the following to each subagent's prompt, followed by the ORIGIN_CONTEXT block you built in Step 1:

> **Origin & Priority Rules:**
> This is a fork project. `main` tracks upstream, `dev` is our branch. The ORIGIN_CONTEXT below tells you which files/lines are ours vs upstream. Use it to classify every issue.
>
> - **[new] files**: 100% our code. Review thoroughly, classify all issues as **dev**.
> - **[modified] files**: Use the provided diff line ranges. Issues on dev-changed lines → **dev**. Issues on other lines → **upstream**.
> - **[upstream] files**: Only report **CRITICAL** issues or issues that directly affect our dev code (e.g., a function we call that has a bug). Skip MEDIUM upstream-only issues — they are noise.
>
> Do NOT run `git diff` yourself — the line ranges are already provided below.
>
> [Paste ORIGIN_CONTEXT here]

### Subagent 1: Control Flow & Error Handling

Prompt the subagent with:

> You are reviewing these files for **control flow and error handling** issues: [FILE_LIST]
>
> Read each file carefully. Check for:
>
> **Switch/Case & Control Flow:**
> - switch/case missing `break` or `return` causing fall-through
> - `process.exit()` inside switch cases without `break`/`return` after it
> - Unreachable code after `return`/`throw`/`process.exit()`
>
> **Error Handling:**
> - Empty catch blocks (swallowing errors silently)
> - catch blocks that log but don't re-throw when they should
> - try/catch wrapping code that shouldn't be caught at that level
> - Missing error handling on critical paths (DB writes, file I/O, network)
>
> **Async/Promise:**
> - async functions called without `await` (fire-and-forget)
> - Promises without `.catch()` or not inside try/catch
> - `await` in loops where `Promise.all()` would be better
> - Missing `await` on async operations before `process.exit()`
>
> **Exit Codes (for hook files):**
> - Must follow contract: 0=success, 1=non-blocking error, 2=blocking error
> - `process.exit(1)` used for non-blocking, `process.exit(2)` for blocking
> - Worker errors should exit 0 to prevent Windows Terminal tab accumulation
>
> [ORIGIN_CONTEXT block appended here — see Step 1]
>
> For each issue found, report:
> - File path and line number
> - Origin: **dev** / **upstream** (who introduced this code)
> - Severity: CRITICAL / HIGH / MEDIUM
> - What's wrong and why it matters
> - Suggested fix (concrete code, not vague advice)

### Subagent 2: Concurrency & Race Conditions

Prompt the subagent with:

> You are reviewing these files for **concurrency and race conditions**: [FILE_LIST]
>
> Read each file carefully. Check for:
>
> **Process & Port Races:**
> - Port binding without retry or conflict detection
> - Process startup assumed synchronous (spawning then immediately using)
> - PID file read/write without atomicity (TOCTOU)
> - Health check polling without proper timeout/backoff
>
> **Shared Resource Races:**
> - Multiple sessions/processes writing to same DB/file without locking
> - Read-then-write patterns without transactions
> - Global/module-level mutable state accessed from multiple callers
> - Event emitter listeners not cleaned up (memory leaks)
>
> **Timer & Lifecycle Races:**
> - `setTimeout`/`setInterval` not cleared on shutdown
> - Server close callbacks racing with in-flight requests
> - Liveness checks vs readiness checks conflated
> - Startup initialization order dependencies not enforced
>
> [ORIGIN_CONTEXT block appended here — see Step 1]
>
> For each issue found, report:
> - File path and line number
> - Origin: **dev** / **upstream** (who introduced this code)
> - Severity: CRITICAL / HIGH / MEDIUM
> - The race condition scenario (step-by-step what can go wrong)
> - Suggested fix

### Subagent 3: Platform Compatibility & Security

Prompt the subagent with:

> You are reviewing these files for **platform compatibility and security**: [FILE_LIST]
>
> Read each file carefully. Check for:
>
> **Platform Compatibility (Windows/WSL2/macOS):**
> - Hardcoded Unix paths (`/tmp`, `/usr/bin`) without Windows alternatives
> - `process.kill()` behavior differences across platforms
> - File permissions (`chmod`) that don't work on Windows
> - Shell commands assuming bash (not available on base Windows)
> - Line ending issues (CRLF vs LF)
> - `detached` process spawning differences across platforms
>
> **Network & Origin:**
> - `localhost` vs `127.0.0.1` vs `0.0.0.0` binding implications
> - Origin/CORS checks that might block legitimate WSL2 access
> - Port assumptions (37777) without conflict handling
>
> **Input Validation & Security:**
> - User input passed to shell commands (command injection)
> - File paths from user input without sanitization (path traversal)
> - SQL queries built with string concatenation (SQL injection)
> - Missing input length/type validation at API boundaries
> - Secrets/tokens logged or exposed in error messages
>
> [ORIGIN_CONTEXT block appended here — see Step 1]
>
> For each issue found, report:
> - File path and line number
> - Origin: **dev** / **upstream** (who introduced this code)
> - Severity: CRITICAL / HIGH / MEDIUM
> - The vulnerability or compatibility issue
> - Suggested fix

## Step 3: Consolidate Raw Findings

After all 3 subagents complete, merge their findings into a **raw candidate list** (internal, not shown to user yet). Deduplicate issues reported by multiple subagents. Assign each issue a temporary ID (R1, R2, R3...).

Do NOT present this list to the user. Proceed directly to Step 4.

## Step 4: Verification Agent

Deploy a **single verification subagent** using the Task tool with `subagent_type: "general-purpose"`. This agent's sole job is to read the actual code and confirm or reject each candidate issue.

**IMPORTANT**: This step is mandatory. Never skip it. The review subagents in Step 2 are optimized for coverage (finding issues), which creates a bias toward over-reporting. The verification agent is optimized for precision (eliminating false positives).

Prompt the verification subagent with:

> You are a **Code Review Verifier**. You receive a list of candidate issues from a prior review. Your job is to **read the actual source code** for each issue and determine whether it is a real problem or a false positive.
>
> **Candidate issues to verify:**
> [Paste the raw candidate list with IDs, file:line, description, and suggested fix for each]
>
> **For each candidate issue, you MUST:**
>
> 1. **Read the exact file and line** referenced. Do not rely on the description alone.
> 2. **Read surrounding context** (at least ±30 lines) to check for existing guards, mitigations, or upstream patterns that make the issue moot.
> 3. **Trace callers/callees** when the issue is about a function's behavior — check how the function is actually called to see if the problematic scenario can occur in practice.
> 4. **Check for existing tests** that cover the scenario (search `tests/` for the function/module name).
>
> **Verdict for each issue — choose exactly one:**
>
> - **confirmed** — The issue is real. Code reading confirms the problem exists with no existing mitigation. Keep original severity.
> - **confirmed-downgraded** — The issue is real but less severe than reported (e.g., existing partial mitigation, unlikely trigger conditions). Downgrade severity by one level and explain why.
> - **false-positive** — The issue is not real. Explain what existing code/guard/pattern makes it a non-issue. Cite the specific file:line of the mitigation.
> - **wont-fix** — The issue is technically real but not worth fixing (e.g., theoretical race with no practical impact, upstream code we shouldn't touch for a MEDIUM issue). Explain the cost/benefit reasoning.
>
> **Output format:**
> For each candidate, report:
> ```
> [ID] file:line — [confirmed|confirmed-downgraded|false-positive|wont-fix]
> Evidence: [what you found when reading the code]
> [If confirmed/confirmed-downgraded: keep or update severity, keep or update description]
> ```
>
> **Rules:**
> - You MUST read the code. Do not rubber-stamp issues based on their description alone.
> - Aim for precision over coverage. It is better to drop a real issue than to pass through a false positive. False positives waste developer time and erode trust in the review process.
> - For MEDIUM issues: apply extra scrutiny. Only confirm if you are highly confident the issue causes real harm (crash, data loss, security hole, or significant user-facing bug). "Could be slightly better" is not enough.

## Step 5: Final Report

After the verification agent completes, build the final report using **only confirmed and confirmed-downgraded issues**:

```
## Code Review Report

### Scope
[Files reviewed, with origin tags]

### Summary
- CRITICAL: N issues (dev: X, upstream: Y)
- HIGH: N issues (dev: X, upstream: Y)
- MEDIUM: N issues (dev: X, upstream: Y)
- Filtered out: N false positives, N wont-fix

### Dev Issues (our code — fix directly)

#### CRITICAL
[ID] file:line | description | fix

#### HIGH
[ID] file:line | description | fix

#### MEDIUM
[ID] file:line | description | fix

### Upstream Issues (upstream code — minimal intervention)
[ID] file:line | description | recommended approach: upstream PR / wrapper / defer

### Filtered Issues
[ID] file:line | verdict | reason (so user can override if they disagree)

### Recommendations
[Top 3 actionable recommendations, separated by origin]
```

## Step 6: Offer Next Steps

After presenting the report, ask the user:

> Would you like me to:
> 1. Fix the dev CRITICAL issues now?
> 2. Create a detailed fix plan for all dev issues?
> 3. File upstream issues as TODO comments or upstream PR candidates?
> 4. Focus on a specific dimension or file?
> 5. Review the filtered issues (false positives / wont-fix)?

## Rules

- **Read before judging** - Subagents must read the actual code, not guess
- **Concrete fixes** - Every issue must include a specific fix, not "consider improving"
- **No false positives** - Only report real issues, not style preferences
- **Respect project conventions** - Check CLAUDE.md for project-specific rules before flagging
- **Fork-aware origin classification** - Every issue MUST be classified as `dev` or `upstream` using the pre-computed ORIGIN_CONTEXT (not ad-hoc git commands). This determines the action plan:
  - **dev issues** (in [new] or [modified] dev lines): Fix directly, no merge conflict risk
  - **upstream issues** (in [upstream] files or non-dev lines of [modified] files): Only flag CRITICAL or issues affecting our dev code. Prefer minimal intervention (wrapper/override), or defer to upstream fix

## False Positive Reduction Rules

Append these rules to **every subagent prompt** to reduce false positives:

> **False Positive Reduction — read these BEFORE reporting any issue:**
>
> 1. **Build pipeline awareness**: This project uses esbuild to bundle TypeScript. The worker service (`worker-service.ts`) is bundled as **CJS** (`format: 'cjs'`), not ESM. Hooks are bundled as ESM. Do NOT flag `require()` vs `import()` issues in CJS-bundled files — both work. Check the build config in CLAUDE.md before flagging module system issues.
>
> 2. **Idempotency check**: Before reporting a race condition, check whether the affected operations are **idempotent** (safe to call twice). For example: closing an already-closed HTTP server, killing an already-dead process, or deleting an already-deleted session are all no-ops. If the "race" only causes a redundant no-op, it is NOT a real issue.
>
> 3. **Trace existing guards**: Before reporting a concurrency issue, **fully trace** the existing guard logic. Look for: `generatorPromise` checks, `isShuttingDown` flags, Map.has() checks, `if (!session) return` guards. If the code already has a guard that prevents the reported scenario, do NOT report it.
>
> 4. **Known harmless patterns**: Do NOT flag these well-known patterns:
>    - `Promise.race()` with a timeout timer that isn't cleared on success — the orphaned timer resolves a GC'd promise, which is harmless in Node.js/Bun
>    - Fire-and-forget `.catch(() => {})` on intentionally best-effort operations (e.g., SSE broadcast, non-critical logging)
>    - `logger.error()` in catch blocks that don't re-throw — this is often intentional for non-critical paths per project convention
>
> 5. **Threat model awareness**: This is a **localhost-only** application (bound to 127.0.0.1). API endpoints are NOT exposed to the network. Do NOT flag missing input validation on localhost-only endpoints as HIGH/CRITICAL — the threat model is different from a public API. Only flag input validation issues at MEDIUM or lower, and only when they could cause crashes or data corruption (not unauthorized access).
>
> 6. **Confidence gate**: For every issue, honestly assess your confidence. If you are less than 80% confident the issue is real (not mitigated by code you haven't read), **downgrade it one severity level** and note your uncertainty.

## Consolidation Pre-filter (Step 3)

When merging subagent reports into the raw candidate list, the orchestrator SHOULD apply these quick filters to reduce the verification agent's workload:

1. **Dedup**: Remove exact duplicates reported by multiple subagents (same file, same line, same issue)
2. **Build format check**: If an issue relies on ESM vs CJS behavior, verify against the build config (worker=CJS, hooks=ESM). Drop obvious misunderstandings.
3. **Prior review dedup**: If this is not the first review round, check for issues that were already reported and evaluated in prior rounds. Do NOT re-submit issues that were previously verified as false-positive or wont-fix unless there is new code or context.

**Do NOT do deep validation here** — that is the verification agent's job in Step 4. The orchestrator should pass through anything it isn't 100% sure is a duplicate or build-config misunderstanding.
