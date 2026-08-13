# dsh-auto-blame

![preview](docs/preview.webp)

当模型完成当前轮次对话后，将最后 3 条消息发送给 LLM，生成 3 条批判性跟进请求，显示在输入框上方作为可选项，点击直接发送。生成期间"领导视野"标签带 DeepSeek 蓝色流光扫过（同 Deep diving... 特效），建议到达后气泡依次淡入。

## 工作原理

```
[host] agent/turn-stopping 触发
  → fire-and-forget 调 ctx.llm.stream() 生成 3 条毒舌跟进
  → session.append('auto-blame/suggestions', { turn, suggestions })
  → projection unit 折叠该事件 → session/projection 推送帧
  ↓
[client] useProjection('autoBlame') 收到值
  → conversation.composer.dock 渲染 3 个气泡
  → 点击 → inputActions.setDraft(text) + submit()
```

- **fire-and-forget**：LLM 调用不阻塞 turn 关闭，建议晚几百 ms 出现
- **非 surface 事件**：`auto-blame/suggestions` 不进入 model-visible 历史，不干扰 agent loop
- **失败静默**：LLM 失败 / 解析失败 → 不 append 事件，不显示气泡
- **点击发送**：走 InputBar 同一路径（`inputActions.setDraft + submit`）
- **下一轮清空**：新 turn 开始时 projection 归零，旧气泡立即消失

## 开发

```sh
pnpm run typecheck    # tsc --noEmit
pnpm test             # vitest run（28 个单测）
pnpm run build        # tsc + tsdown → lib/index.js, lib/invariant.js, lib/client.js
pnpm run bundle:client # 只构建 client bundle
```

### 依赖链接（sibling dsh checkout）

本插件依赖 `@deepseek-ai/dsh-*` workspace 包。开发时需要手动 Junction 链接到 sibling dsh checkout：

```powershell
$dest = 'node_modules\@deepseek-ai'
New-Item -ItemType Directory -Path $dest -Force
# 参考 dsh-spur 的 node_modules 结构创建 Junction
```

或从 `dsh-spur` 复制 `node_modules`（含 typescript / tsdown / vitest / @types/* / cordis / @deepseek-ai/dsh-client-*），再补建 `dsh-agent` / `dsh-llm` / `dsh-session` / `dsh-session-projection` 的 Junction。

## 运行

```sh
# 本地开发（热更新）
dsh plugin --profile web add "link:D:/Projects/deepseek-harness/dsh-auto-blame"

# 远端引用（预构建策略，github: 安装开箱即用）
dsh plugin --profile web add "github:huanlinoto/dsh-plugin-auto-blame"
```

安装后重启 `dsh web` + 浏览器硬刷新（`Ctrl+Shift+R`）。

## 检查

- [x] 零源码 patch
- [x] `package.json` 声明 `dsh.bundle.patch`
- [x] `cordis.patch.yml` insert 行 id/name/config 齐全
- [x] `files` 含 `lib/` + `cordis.patch.yml`
- [x] `peerDependencies` 含 cordis + `@deepseek-ai/*`
- [x] typecheck / test / build script 齐全
- [x] 预构建策略（`lib/` 入库，无 `prepare` 脚本）
- [x] 不导出 default
- [x] 测试分层（Unit）
