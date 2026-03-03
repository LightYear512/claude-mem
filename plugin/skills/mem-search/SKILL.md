---
name: mem-search
description: Search claude-mem's persistent cross-session memory database. Use when user asks "did we already solve this?", "how did we do X last time?", or needs work from previous sessions.
argument-hint: "[session:current | session:all | session:id] <query>"
---

# Memory Search

Search past work across all sessions. Simple workflow: search -> filter -> fetch.

## Argument Parsing

When invoked as `/mem-search <args>`, parse the arguments. The `session:` prefix controls scope, followed by the required query.

- **`<query>`**: Search for `<query>` within current session (default: `session:current`)
- **`session:current <query>`**: Explicitly search current session
- **`session:all <query>`**: Search across ALL sessions (omit session_id filter)
- **`session:<id> <query>`**: Search within the specified session

Examples:
```
/mem-search authentication                      → search "authentication" in current session
/mem-search session:current fix all bugs        → search "fix all bugs" in current session
/mem-search session:all authentication          → search across all sessions
/mem-search session:abc12345 bug                → search "bug" in session abc12345
```

## Session Scope (Default Behavior)

**Always search within the current session by default.**

The CLAUDE.md context header contains `**Current session:** <session-id>`. Use this as the default `session_id` filter on every search — unless the user explicitly asks to search across all sessions or a different time range.

```
# Default: search only current session
search(query="...", session_id="<value from Current session header>", project="my-project")

# Cross-session: user asks "what did we do last week?" or "across all sessions"
search(query="...", project="my-project")  # omit session_id
```

## When to Use

Use when users ask about PREVIOUS work:

- "Did we already fix this?" → search current session first, then broaden if not found
- "How did we solve X last time?" → omit session_id to search across sessions
- "What happened last week?" → use dateStart/dateEnd, omit session_id

## 3-Layer Workflow (ALWAYS Follow)

**NEVER fetch full details without filtering first. 10x token savings.**

### Step 1: Search - Get Index with IDs

Use the `search` MCP tool:

```
search(query="authentication", limit=20, project="my-project")
```

**Returns:** Table with IDs, timestamps, types, titles (~50-100 tokens/result)

```
| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #11131 | 3:48 PM | 🟣 | Added JWT authentication | ~75 |
| #10942 | 2:15 PM | 🔴 | Fixed auth token expiration | ~50 |
```

**Parameters:**

- `query` (string) - Search term
- `limit` (number) - Max results, default 20, max 100
- `project` (string) - Project name filter
- `session_id` (string, optional) - **Hard filter** by memory_session_id. Use value from `**Current session:**` header in CLAUDE.md to isolate current session. Omit to search across all sessions.
- `type` (string, optional) - "observations", "sessions", or "prompts"
- `obs_type` (string, optional) - Comma-separated: bugfix, feature, decision, discovery, change
- `dateStart` (string, optional) - YYYY-MM-DD or epoch ms
- `dateEnd` (string, optional) - YYYY-MM-DD or epoch ms
- `offset` (number, optional) - Skip N results
- `orderBy` (string, optional) - "date_desc" (default), "date_asc", "relevance"

### Step 2: Timeline - Get Context Around Interesting Results

Use the `timeline` MCP tool:

```
timeline(anchor=11131, depth_before=3, depth_after=3, project="my-project")
```

Or find anchor automatically from query:

```
timeline(query="authentication", depth_before=3, depth_after=3, project="my-project")
```

**Returns:** `depth_before + 1 + depth_after` items in chronological order with observations, sessions, and prompts interleaved around the anchor.

**Parameters:**

- `anchor` (number, optional) - Observation ID to center around
- `query` (string, optional) - Find anchor automatically if anchor not provided
- `depth_before` (number, optional) - Items before anchor, default 5, max 20
- `depth_after` (number, optional) - Items after anchor, default 5, max 20
- `project` (string) - Project name filter

### Step 3: Fetch - Get Full Details ONLY for Filtered IDs

Review titles from Step 1 and context from Step 2. Pick relevant IDs. Discard the rest.

Use the `get_observations` MCP tool:

```
get_observations(ids=[11131, 10942])
```

**ALWAYS use `get_observations` for 2+ observations - single request vs N requests.**

**Parameters:**

- `ids` (array of numbers, required) - Observation IDs to fetch
- `orderBy` (string, optional) - "date_desc" (default), "date_asc"
- `limit` (number, optional) - Max observations to return
- `project` (string, optional) - Project name filter

**Returns:** Complete observation objects with title, subtitle, narrative, facts, concepts, files (~500-1000 tokens each)

## Examples

**Find recent bug fixes:**

```
search(query="bug", type="observations", obs_type="bugfix", limit=20, project="my-project")
```

**Find what happened last week:**

```
search(type="observations", dateStart="2025-11-11", limit=20, project="my-project")
```

**Understand context around a discovery:**

```
timeline(anchor=11131, depth_before=5, depth_after=5, project="my-project")
```

**Batch fetch details:**

```
get_observations(ids=[11131, 10942, 10855], orderBy="date_desc")
```

## Why This Workflow?

- **Search index:** ~50-100 tokens per result
- **Full observation:** ~500-1000 tokens each
- **Batch fetch:** 1 HTTP request vs N individual requests
- **10x token savings** by filtering before fetching
