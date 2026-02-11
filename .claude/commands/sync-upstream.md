# Sync Upstream

将 upstream/main 的更新同步到本项目的 main 和 dev 分支。

本项目是 thedotmack/claude-mem 的 fork：
- `main` 分支镜像 `upstream/main`（只做 fast-forward）
- `dev` 分支是开发分支，通过合并 `main` 获取 upstream 更新

## 执行流程

### Phase 1: 预检查

1. 确认当前在 `dev` 分支上，如果不在则切换到 `dev`
2. 确认工作区干净（无未提交的更改），如果有未提交更改则停止并报告
3. 执行 `git fetch upstream`
4. 检查 `main` 落后 `upstream/main` 多少 commits：`git log --oneline main..upstream/main | wc -l`
5. 如果没有新 commits，报告已是最新并结束
6. 显示落后的 commit 数量和摘要（前 10 个 commit）

### Phase 2: 同步 main（fast-forward only）

1. `git checkout main`
2. `git merge --ff-only upstream/main`
3. 如果 fast-forward 失败 → **立即停止**，报告 main 分支被污染（有非 upstream 的 commit），需要手动处理
4. 成功后确认：`git rev-parse main` 应该等于 `git rev-parse upstream/main`
5. `git push origin main`（推送更新后的 main 到 origin）

### Phase 3: 合并 main 到 dev

1. `git checkout dev`
2. `git merge main`
3. 如果有冲突：
   - 列出所有冲突文件
   - 逐个分析冲突，区分 upstream 更改 vs dev 分支更改
   - 对于每个冲突，保留 dev 分支的定制化更改，同时整合 upstream 的新功能
   - 解决后 `git add` 并 `git commit`
4. 如果无冲突 → 自动完成合并

### Phase 4: 验证

1. `npm run build` — 确认构建通过
2. 显示合并摘要：
   - main 分支新位置（版本号/commit）
   - dev 分支合并了多少 upstream commits
   - 是否有冲突及解决情况
   - 构建状态
3. 推送 dev：`git push origin dev`

## 注意事项

- **绝不**在 main 分支上做非 fast-forward 的合并
- 如果 main 被污染，需要先手动修复 main 再运行此流程
- 冲突解决时优先保留 dev 的定制化内容
- 构建失败不阻塞合并，但需要报告并建议修复
