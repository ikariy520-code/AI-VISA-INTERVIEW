# Windows 本地桌面版

桌面版面向不想维护云服务器的用户：安装后双击打开，首次启动填写一套实时语音凭据和一套报告模型凭据，后续直接使用。

## 支持范围

实时语音模型：

- 豆包端到端实时语音：`App ID` + `Access Token / Access Key`
- Gemini Live：`Gemini API Key`
- OpenAI Realtime：`OpenAI API Key`

反馈报告模型：

- DeepSeek
- OpenAI Chat Completions
- 其他 OpenAI-compatible Chat Completions 接口，包括仅绑定 `localhost` 的本地模型服务

三种语音适配器共享同一套 F-1/B2 面签角色、追问边界、动态选题和结束规则。适配器只负责鉴权、实时连接、音频、转写、打断和事件映射，不另外实现逐题脚本。

## 用户使用

1. 安装并打开 `AI Visa Interview`。
2. 在“实时语音面签模型”区域选择豆包、Gemini Live 或 OpenAI Realtime。
3. 按页面显示填写该供应商所需凭据。豆包的 `App ID` 与 `Access Token / Access Key` 是两个独立输入项。
4. 选择报告模型，填写 API Key、模型名和 API Base URL。
5. 点击“保存并进入应用”。应用会重启内置本地服务，之后可以直接开始练习。

可从左下角“模型设置”或菜单“应用 → 模型设置”重新配置。密钥不会写入仓库或浏览器存储；桌面主进程使用 Electron `safeStorage`，在 Windows 上交给系统加密能力保护。

## 开发与打包

要求：Windows 10/11、Node.js 22.12 或更高版本。

```powershell
npm install
npm test
npm run desktop:run
```

生成免安装目录：

```powershell
npm run desktop:dist
```

产物位于 `release/win-unpacked/`。生成带桌面快捷方式的 NSIS 安装器：

```powershell
npm run desktop:installer
```

安装器产物应位于 `release/AI-Visa-Interview-Setup-<version>-x64.exe`。

在 GitHub Releases 发布前，建议补充项目图标和 Windows 代码签名证书。未签名安装器可能触发 Windows SmartScreen 提示。

## 连接架构

- 豆包：渲染器通过本机 `127.0.0.1` 服务连接安全 WebSocket 代理；长期凭据只存在桌面主进程和本地服务进程中。
- Gemini：本机服务用长期 API Key 签发一次性受限 token，渲染器连接 Gemini Live WebSocket。
- OpenAI：本机服务用长期 API Key 签发 ephemeral client secret，渲染器用 WebRTC 连接 Realtime API。
- 报告：渲染器只请求同源 `/api/ai-report`；长期 API Key 由本机服务调用 OpenAI-compatible 接口。

应用只监听 `127.0.0.1`，使用随机端口，不对局域网提供服务。桌面版自动关闭网站订单校验，线上部署逻辑不变。

## 验证边界

仓库测试会验证三家语音供应商的配置分流、长期密钥不返回渲染器、临时凭据请求格式，以及模型无关的面签策略。要确认某个账户在真实服务中可用，仍需该用户自己的有效 API Key、对应模型访问权限、余额和网络环境；这些无法用伪造凭据替代。
