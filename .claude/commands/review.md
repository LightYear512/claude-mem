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

## Step 3: Consolidate Report

After all 3 subagents complete, consolidate their findings into a single report:

```
## Code Review Report

### Scope
[Files reviewed, with origin tags]

### Summary
- CRITICAL: N issues (dev: X, upstream: Y)
- HIGH: N issues (dev: X, upstream: Y)
- MEDIUM: N issues (dev: X, upstream: Y)

### Dev Issues (our code — fix directly)

#### CRITICAL
[file:line | description | fix]

#### HIGH
[file:line | description | fix]

#### MEDIUM
[file:line | description | fix]

### Upstream Issues (upstream code — minimal intervention)
[file:line | description | recommended approach: upstream PR / wrapper / defer]

### Recommendations
[Top 3 actionable recommendations, separated by origin]
```

## Step 4: Offer Next Steps

After presenting the report, ask the user:

> Would you like me to:
> 1. Fix the dev CRITICAL issues now?
> 2. Create a detailed fix plan for all dev issues?
> 3. File upstream issues as TODO comments or upstream PR candidates?
> 4. Focus on a specific dimension or file?

## Rules

- **Read before judging** - Subagents must read the actual code, not guess
- **Concrete fixes** - Every issue must include a specific fix, not "consider improving"
- **No false positives** - Only report real issues, not style preferences
- **Respect project conventions** - Check CLAUDE.md for project-specific rules before flagging
- **Fork-aware origin classification** - Every issue MUST be classified as `dev` or `upstream` using the pre-computed ORIGIN_CONTEXT (not ad-hoc git commands). This determines the action plan:
  - **dev issues** (in [new] or [modified] dev lines): Fix directly, no merge conflict risk
  - **upstream issues** (in [upstream] files or non-dev lines of [modified] files): Only flag CRITICAL or issues affecting our dev code. Prefer minimal intervention (wrapper/override), or defer to upstream fix
