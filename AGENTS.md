# AGENTS.md — 关注列表整理工具

面向在本仓库工作的 AI 助手与人类协作者的约定。

## 项目概览

Manifest V3 浏览器扩展（桌面版 Edge / Chrome），用于批量整理 B 站关注列表。无后端、无外部请求。

## 文档索引

| 文档 | 路径 | 用途 |
|---|---|---|
| 本文件 | `AGENTS.md` | 协作约定与目录说明 |
| 项目说明 | `README.md` | 功能、安装、使用、开发入口 |
| 隐私声明 | `PRIVACY.md` | 数据流向与不收集承诺 |
| 设计规格 | `docs/superpowers/specs/2026-10-07-bili-follow-cleaner-design.md` | 架构、功能规格、验收清单 |
| 实现计划 | `docs/superpowers/plans/2026-10-07-bili-follow-cleaner-plan.md` | 里程碑与任务拆解 |
| 真机清单 | `docs/e2e-checklist.md` | 上架前人工验证步骤 |

## 目录结构

| 路径 | 说明 |
|---|---|
| `src/core/` | 纯逻辑：md5、wbi 签名、错误码、退避、任务状态机、备份序列化、设置、存储封装 |
| `src/content-main/` | 页面世界（MAIN world）fetch 执行器 |
| `src/content-ui/` | 隔离世界：面板 UI、调度 controller、入口 wiring |
| `src/background/` | service worker：图标点击、补注入、系统通知 |
| `src/assets/` | 图标（由 `scripts/gen-icon.mjs` 生成） |
| `tests/` | Vitest 单测 |
| `dist/` | 构建产物（商店上传的即此目录） |

## 常用命令

```bash
npm run build      # 构建到 dist/
npm run watch      # 监听构建
npm run pack       # 构建并产出商店上传用 zip
npm test           # Vitest 单测
npm run typecheck  # tsc --noEmit
node scripts/gen-icon.mjs  # 生成图标
```

## 约定

- 核心逻辑放 `src/core/`（纯函数、可单测）；DOM / chrome API 胶水放各入口文件
- 改核心行为必须补/改 `tests/` 单测，保持 `npm test`、`npm run typecheck` 全绿
- 改 manifest 权限、接口、目录结构时，同步更新 README、PRIVACY.md 与 docs/ 下文档
- 对外文案不使用「哔哩哔哩 / B 站官方」字样与官方 logo，始终声明「非官方工具」
- 不引入远程代码；wbi 映射表硬编码，平台变更时发新版本
- 面板不得跳转或刷新当前页面（历史事故：跳转导致刷新循环）
- 打开面板依赖 `bfc-open` 消息的 `{ok:true}` 应答；改协议需同步 `src/background/` 与 `src/content-ui/`
