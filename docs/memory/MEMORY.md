# Claude-Mem Project Memory

## 项目架构要点
- Fork 项目：main 跟踪 upstream (thedotmack/claude-mem)，dev 是开发分支
- 分析 bug 时必须区分 upstream vs dev 来源（`git log dev --not main -- <file>`）
- 构建：`npm run build`，测试：`npm test`（Bun 运行时）

## 代码审查记录
- [2026-02-13 完整审查报告](code-review-2026-02-13.md) — CRITICAL: 2, HIGH: 9, MEDIUM: 13

## 关键模式
- Worker 退出码策略：exit(0) 防止 Windows Terminal 标签页累积
- Budget 两阶段提交：reserve → commit/rollback，SDK agent 是特例（单次 reserve 覆盖整会话）
- UNRECOVERABLE_ERROR_PATTERNS：防止生成器无限重启循环
- 用户语言偏好：中文交流
