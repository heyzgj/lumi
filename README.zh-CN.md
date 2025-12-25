<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="assets/LUMI.png" alt="LUMI" width="500" />
</p>

<p align="center">
  为 Coding Agent 打造的视觉编辑器
</p>
<p align="center">
  <a href="https://deepwiki.com/heyzgj/lumi"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>
<p align="center">
  <img src="assets/demo_showcase.gif" alt="LUMI DEMO" width="700" />
</p>

## Lumi 是什么？

Lumi 是一个 Chrome 扩展，能将你的视觉编辑和标注转化为高保真上下文，供 Cursor、Antigravity、Windsurf、Lovable 或你自己的 CLI 使用。每次点击和调整都会被捕获为结构化数据——DOM diff、计算样式和截图——让 AI 真正"看懂" UI，一次就能生成正确的代码。

## 核心功能

1. **视觉编辑器**  
   点击任意元素调整间距、颜色、字体和布局，实时预览。Lumi 将每次改动记录为精确的 DOM/CSS diff。

2. **标注模式**  
   直接在 UI 上绘制、高亮和注释。用它来可视化描述流程、逻辑变更和重构需求。

3. **上下文随处可用**  
   一键"复制 Prompt"，将 diff + 截图 + 意图导出为可移植的上下文块，可粘贴到 Cursor、Claude、Windsurf、Lovable 等任意工具。

4. **本地 Agent 运行**  
   将 Lumi 连接到本地 CLI（如 Codex 或 Claude Code）。直接从浏览器发送视觉上下文到终端，整个流程一气呵成。

## 即将推出

1. **实时 AI 生成预览**  
2. **支持更多 CLI coding agent**  

## 系统要求

**核心：**
- Node.js 20+
- Chrome 115+

**可选（用于聊天模式）：**
- 一个或多个支持的 AI CLI（见下文）

*（如果只使用"复制 Prompt"功能配合 Cursor/Lovable，则不需要）*

## 支持的 Provider

LUMI 支持以下 AI coding agent：

<details>
<summary><b>OpenAI Codex</b> - <code>codex</code></summary>

### 安装
参考官方 [Codex CLI](https://github.com/openai/codex) 安装指南。

### 认证
基于浏览器的 OAuth 登录。安装后运行一次即可认证：
```bash
codex --version   # 如需要会提示登录
```

LUMI 集成无需 API key。
</details>

<details>
<summary><b>Claude Code</b> - <code>claude</code></summary>

### 安装
参考官方 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 安装指南。

### 认证
基于浏览器的 OAuth 登录。安装后运行一次即可认证：
```bash
claude --version  # 如需要会提示登录
```

LUMI 集成无需 API key。
</details>

<details>
<summary><b>Factory Droid</b> - <code>droid</code> ⚠️ <em>需要 API Key</em></summary>

### 安装
```bash
curl -fsSL https://app.factory.ai/cli | sh
```

详见 [Droid CLI 文档](https://docs.factory.ai/cli/droid-exec/overview)。

### 认证
Droid 的非交互模式（`droid exec`）需要 API key：

1. **获取 API key**：访问 [Factory Settings](https://app.factory.ai/settings/api-keys)
2. **在环境中导出**（启动 LUMI server 前）：
   ```bash
   export FACTORY_API_KEY=fk-...
   ```
3. 然后启动 server：`npm run dev`

> **重要：** `FACTORY_API_KEY` 必须在运行 LUMI server 的同一终端会话中设置。
</details>

## 快速开始

### 方式 1：下载预构建扩展（最快）

1. 从 [最新 Release](https://github.com/heyzgj/lumi/releases/latest) 下载 `lumi-extension.zip`
2. 解压文件
3. 打开 Chrome → `chrome://extensions`
4. 启用"开发者模式"（右上角）
5. 点击"加载已解压的扩展程序" → 选择解压后的文件夹

> **注意：** 这只包含扩展。如需使用本地 CLI agent 的聊天模式，还需要运行 server（见方式 2 或 3）。

### 方式 2：一键安装（推荐用于聊天模式）

```bash
npx create-lumi lumi
cd lumi
```

这会克隆、安装依赖、构建扩展并启动 server。

**然后在 Chrome 中加载扩展：**
1. 打开 `chrome://extensions`
2. 启用"开发者模式"（右上角）
3. 点击"加载已解压的扩展程序" → 选择 `extension` 文件夹

### 方式 3：手动安装

1. **克隆仓库**
   ```bash
   git clone https://github.com/heyzgj/lumi
   cd lumi
   ```

2. **安装并初始化配置**
   ```bash
   npm run setup
   ```
   为 `extension/` 和 `server/` 安装依赖，询问 `config.json` 存储位置，并检查 CLI 是否在 `$PATH` 中。

3. **运行 server**
   ```bash
   npm run dev
   ```
   Server 监听 `http://127.0.0.1:3456`（如需其他端口可用 `LUMI_PORT=4567 npm run dev`）。

4. **构建并加载扩展**
   ```bash
   npm run build
   ```
   然后通过 `chrome://extensions` 加载 `extension/` 文件夹为未打包扩展。

## 配置

打开扩展的选项页面。以下是你需要了解的：

### **🔴 必须配置（Projects）**
这是**基础使用唯一需要修改的部分**：

- **Working Directory**：本地代码仓库的根目录（如 `/Users/you/code/my-app`）
- **Host Patterns**（可选）：逗号分隔的主机模式列表（如 `localhost:3000, 127.0.0.1:8080`）
  - 留空 = 通配符，匹配所有主机/file:// URL

**为什么需要？** Lumi 需要知道你的代码在哪里，这样 CLI 才能修改正确的文件。

### **🟡 可选配置**

<details>
<summary><b>Server</b></summary>

- **Port**：默认 `3456`
- **Default Engine**：`codex` 或 `claude`（如果两者都安装）
</details>

<details>
<summary><b>Features</b></summary>

- **Use JSON Timeline**：为 Codex 启用结构化事件流（需要 `codex exec --json` 支持）
</details>

<details>
<summary><b>Codex / Claude 参数</b></summary>

高级 CLI 参数（大多数用户无需修改）：
- Sandbox 模式
- Approval 策略
- 输出格式
</details>

## 使用方法

### 模式 1：复制 Prompt（适用于任意 Agent）

1. 在浏览器中打开你的本地项目（如 `localhost:3000`）
2. 点击 Lumi 图标打开 Dock
3. 选择元素或使用标注模式
4. 点击"复制 Prompt"
5. 粘贴到 Cursor、Windsurf、Lovable 或任意 AI 工具

### 模式 2：聊天模式（本地 CLI）

1. 确保 server 正在运行（`npm run dev`）
2. 在选项中配置项目
3. 选择元素 / 标注
4. 在 Dock 中输入你的意图
5. 点击发送 → Lumi 调用本地 CLI → 查看 Timeline 和结果

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 致谢

- 感谢 OpenAI、Anthropic 和 Factory 提供的出色 CLI 工具
- 感谢所有贡献者和早期用户的反馈

---

**有问题？** 在 [GitHub Issues](https://github.com/heyzgj/lumi/issues) 提问或加入我们的 [Discord](https://discord.gg/lumi)（如果有的话）
