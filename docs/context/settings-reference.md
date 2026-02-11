# Claude-Mem 配置字段参考

> **配置文件**: `~/.claude-mem/settings.json`
>
> **优先级**: 环境变量 > settings.json > 默认值
>
> 所有字段值均为字符串类型，布尔值使用 `"true"` / `"false"` 表示。

| # | 字段 | 类别 | 默认值 | 说明 | 示例 | 备注 |
|---|------|------|--------|------|------|------|
| 1 | `CLAUDE_MEM_MODEL` | 核心 | `claude-sonnet-4-5` | SDK Agent 使用的 AI 模型名称 | `"claude-sonnet-4-5"` | |
| 2 | `CLAUDE_MEM_WORKER_PORT` | 核心 | `37777` | Worker HTTP API 监听端口 | `"38888"` | |
| 3 | `CLAUDE_MEM_WORKER_HOST` | 核心 | `127.0.0.1` | Worker HTTP API 监听地址 | `"0.0.0.0"` | |
| 4 | `CLAUDE_MEM_DATA_DIR` | 核心 | `~/.claude-mem` | 数据存储根目录（SQLite、日志、向量数据库） | `"/data/claude-mem"` | |
| 5 | `CLAUDE_MEM_LOG_LEVEL` | 核心 | `INFO` | 日志级别：`DEBUG` / `INFO` / `WARN` / `ERROR` | `"DEBUG"` | |
| 6 | `CLAUDE_MEM_PYTHON_VERSION` | 核心 | `3.13` | ChromaDB 使用的 Python 版本（由 uv 管理） | `"3.12"` | |
| 7 | `CLAUDE_CODE_PATH` | 核心 | `""` | Claude CLI 路径，空值时 `which claude` 自动检测 | `"/usr/local/bin/claude"` | |
| 8 | `CLAUDE_MEM_MODE` | 核心 | `code` | 模式配置，控制观察记录的语言和风格 | `"code--zh"` | |
| 9 | `CLAUDE_MEM_SKIP_TOOLS` | 核心 | `ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion` | 跳过记录的工具名称（逗号分隔） | `"SlashCommand,Skill"` | |
| 10 | `CLAUDE_MEM_PROVIDER` | AI 提供商 | `claude` | AI 提供商：`claude` / `gemini` / `openrouter` | `"gemini"` | |
| 11 | `CLAUDE_MEM_CLAUDE_AUTH_METHOD` | AI 提供商 | `cli` | Claude 认证方式：`cli`=订阅计费，`api`=API Key | `"api"` | |
| 12 | `CLAUDE_MEM_GEMINI_API_KEY` | Gemini | `""` | Gemini API 密钥 | `"AIzaSy..."` | |
| 13 | `CLAUDE_MEM_GEMINI_API_URL` | Gemini | `https://generativelanguage.googleapis.com/v1beta/models` | Gemini API 端点 URL，支持自定义兼容端点 | `"https://proxy.example.com/v1beta/models"` | 🆕 dev 新增 |
| 14 | `CLAUDE_MEM_GEMINI_MODEL` | Gemini | `gemini-2.5-flash-lite` | Gemini 模型：`gemini-2.5-flash-lite` / `gemini-2.5-flash` / `gemini-3-flash-preview` | `"gemini-2.5-flash"` | |
| 15 | `CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED` | Gemini | `true` | 启用 Gemini 免费层速率限制 | `"false"` | |
| 16 | `CLAUDE_MEM_OPENROUTER_API_KEY` | OpenRouter | `""` | OpenRouter API 密钥 | `"sk-or-..."` | |
| 17 | `CLAUDE_MEM_OPENROUTER_MODEL` | OpenRouter | `xiaomi/mimo-v2-flash:free` | OpenRouter 模型 ID | `"google/gemini-2.5-flash-preview:free"` | |
| 18 | `CLAUDE_MEM_OPENROUTER_SITE_URL` | OpenRouter | `""` | 站点 URL（用于 OpenRouter 分析面板） | `"https://myapp.com"` | |
| 19 | `CLAUDE_MEM_OPENROUTER_APP_NAME` | OpenRouter | `claude-mem` | 应用名称（用于 OpenRouter 分析面板） | `"my-agent"` | |
| 20 | `CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES` | OpenRouter | `20` | 上下文窗口中的最大消息数量 | `"30"` | |
| 21 | `CLAUDE_MEM_OPENROUTER_MAX_TOKENS` | OpenRouter | `100000` | 最大估算 token 数（安全限制） | `"50000"` | |
| 22 | `CLAUDE_MEM_CONTEXT_OBSERVATIONS` | 上下文注入 | `50` | SessionStart 时注入的观察记录数量上限 | `"100"` | |
| 23 | `CLAUDE_MEM_CONTEXT_FULL_COUNT` | 上下文注入 | `5` | 显示完整内容（而非仅标题索引）的最近记录条数 | `"10"` | |
| 24 | `CLAUDE_MEM_CONTEXT_FULL_FIELD` | 上下文注入 | `narrative` | 完整显示时使用的字段名 | `"text"` | |
| 25 | `CLAUDE_MEM_CONTEXT_SESSION_COUNT` | 上下文注入 | `10` | 注入的会话总结数量 | `"20"` | |
| 26 | `CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES` | 观察过滤 | `bugfix,feature,refactor,discovery,decision,change` | 允许注入的观察类型（逗号分隔） | `"bugfix,decision"` | |
| 27 | `CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS` | 观察过滤 | `how-it-works,why-it-exists,what-changed,problem-solution,gotcha,pattern,trade-off` | 允许注入的观察概念（逗号分隔） | `"problem-solution,gotcha"` | |
| 28 | `CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS` | Token 经济学 | `true` | 显示每条记录的"阅读成本"（~N tokens） | `"false"` | |
| 29 | `CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS` | Token 经济学 | `true` | 显示产出该记录的"工作投入" | `"false"` | |
| 30 | `CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT` | Token 经济学 | `true` | 显示通过记忆复用节省的 token 绝对数量 | `"false"` | |
| 31 | `CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT` | Token 经济学 | `true` | 显示节省百分比 | `"false"` | |
| 32 | `CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY` | 功能开关 | `true` | 在新会话中注入上一个会话的 AI 总结 | `"false"` | |
| 33 | `CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE` | 功能开关 | `false` | 在新会话中注入上一个会话 AI 的最后一条消息 | `"true"` | |
| 34 | `CLAUDE_MEM_EMBEDDING_FUNCTION` | 向量搜索 | `default` | Embedding 模型。`default`=all-MiniLM-L6-v2 (384d, 英文)；可选 `sentence-transformers/multilingual-MiniLM-L12-v2` (384d, 50+语言)、`shibing624/text2vec-base-chinese` (768d, 中文)、`sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (768d, 50+语言)。⚠️ 更改后需 `npm run vector:reset` | `"sentence-transformers/multilingual-MiniLM-L12-v2"` | 🆕 dev 新增 |
| 35 | `CLAUDE_MEM_BUDGET_ENABLED` | 预算跟踪 | `false` | 启用预算跟踪功能 | `"true"` | 🆕 dev 新增 |
| 36 | `CLAUDE_MEM_BUDGET_PRESET` | 预算跟踪 | `claude-haiku` | 定价预设 ID：`claude-haiku` / `claude-max` / `custom` 等 | `"claude-max"` | 🆕 dev 新增 |
| 37 | `CLAUDE_MEM_BUDGET_DAILY_LIMIT` | 预算跟踪 | `1.00` | 每日限额（token 计费为 USD，消息计费为条数） | `"5.00"` | 🆕 dev 新增 |
| 38 | `CLAUDE_MEM_BUDGET_MONTHLY_LIMIT` | 预算跟踪 | `20.00` | 每月限额 | `"100.00"` | 🆕 dev 新增 |
| 39 | `CLAUDE_MEM_BUDGET_CUSTOM_PRICING` | 预算跟踪 | `""` | 自定义定价 JSON，仅 preset=`custom` 时生效 | `"{\"input\":0.25,\"output\":1.25}"` | 🆕 dev 新增 |
| 40 | `CLAUDE_MEM_EXCLUDED_PROJECTS` | 排除设置 | `""` | 排除的项目路径（逗号分隔 glob 模式） | `"/tmp/*,/home/user/scratch/*"` | |
| 41 | `CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED` | 排除设置 | `false` | 启用文件夹级 CLAUDE.md 自动生成 | `"true"` | |
| 42 | `CLAUDE_MEM_FOLDER_MD_EXCLUDE` | 排除设置 | `[]` | 排除 CLAUDE.md 生成的文件夹路径（JSON 数组） | `"[\"/workspace/vendor\"]"` | |

---

## dev 分支变更摘要

dev 分支相对于 upstream/main **新增 7 个字段**，现有字段无默认值变更：

| 字段 | 类别 | 说明 |
|------|------|------|
| `CLAUDE_MEM_GEMINI_API_URL` | Gemini | 支持自定义 Gemini 兼容 API 端点 |
| `CLAUDE_MEM_EMBEDDING_FUNCTION` | 向量搜索 | 支持选择不同的 embedding 模型 |
| `CLAUDE_MEM_BUDGET_ENABLED` | 预算跟踪 | 预算跟踪总开关 |
| `CLAUDE_MEM_BUDGET_PRESET` | 预算跟踪 | 定价预设选择 |
| `CLAUDE_MEM_BUDGET_DAILY_LIMIT` | 预算跟踪 | 每日限额 |
| `CLAUDE_MEM_BUDGET_MONTHLY_LIMIT` | 预算跟踪 | 每月限额 |
| `CLAUDE_MEM_BUDGET_CUSTOM_PRICING` | 预算跟踪 | 自定义定价 JSON |
