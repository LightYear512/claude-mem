# OpenCode Integration for claude-mem

## Prerequisites

- [OpenCode](https://opencode.ai) installed and configured
- claude-mem worker running (`curl http://127.0.0.1:37777/api/health`)

## Installation

### Option A: File-based (recommended)

Copy the plugin to OpenCode's plugins directory:

```bash
# Default location
cp dist/opencode-plugin/index.js ~/.config/opencode/plugins/claude-mem.js

# If using custom config dir
cp dist/opencode-plugin/index.js $OPENCODE_CONFIG_DIR/plugins/claude-mem.js
```

### Option B: npm-based

Add to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["claude-mem"]
}
```

Note: This requires the plugin to be published as an npm package.

## What it does

The plugin connects OpenCode to claude-mem's memory system:

- **Tool observation capture**: Every tool execution is recorded via `tool.execute.after` interceptor
- **Session lifecycle**: Sessions are tracked via bus events (`session.created`, `session.deleted`, `session.compacted`)
- **Memory search**: A `claude_mem_search` custom tool is available in OpenCode sessions
- **Context injection**: Past session context is synced to `AGENTS.md` in your project directory

## Configuration

The plugin uses these defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| `workerPort` | `37777` | claude-mem worker HTTP port |
| `project` | auto-detected from git | Project name for memory grouping |
| `syncAgentsMd` | `true` | Sync memory context to AGENTS.md |

## Troubleshooting

### Worker not running

```bash
# Check worker health
curl http://127.0.0.1:37777/api/health

# Start worker (from claude-mem repo)
npm run worker:start
```

### No observations captured

Check that the plugin is loaded by OpenCode:
- Look for `[claude-mem]` log messages in OpenCode's output
- Verify the plugin file exists at the expected location

### Context not appearing

Ensure the worker has processed at least one session. Check:
```bash
curl "http://127.0.0.1:37777/api/context/inject?projects=your-project"
```
