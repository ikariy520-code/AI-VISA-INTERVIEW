# AI Visa Interview

AI Visa Interview 是一个本地优先的美国签证面谈练习工具。

它把一次练习拆成两件事：实时语音模型负责像签证官一样听、问和追问；报告模型在练习结束后复盘整场回答，说明哪些事实已经说清楚、哪些地方仍然薄弱，以及下一次应该怎样回答得更准确。

项目当前支持 **F-1 学生签证**和 **B-2 访问签证**，提供 Windows 桌面版，也可以从源码运行或部署成网页。

> 这是练习工具，不是美国政府或使领馆产品，也不能预测、保证或代替真实签证决定。

## 这个项目解决什么问题

很多面签练习只是把固定题库逐条念出来。真实面谈不是这样：签证官会根据申请背景和上一句话决定下一问，也会在发现具体疑点时继续追问。

AI Visa Interview 的目标是把这种连续性保留下来：

- 一场面试使用同一个实时语音会话，不会每问一题就重建 Session；
- 问题不是固定的 22 题流程，模型可以在签证审查范围内自行组织问题；
- 追问必须来自已经出现的事实、歧义或矛盾，不能把同一个问题换个说法再问一遍；
- 用户填写的“最担心被问到的问题”只要与签证审查相关，就会在正常结束前被覆盖；
- 用户说话时会等待完整音频端点，避免在句子中间抢问；
- 面试按信息覆盖情况动态结束，同时设有题量和时间上限，防止无限问下去；
- 报告引用本次问答中的证据，不凭空补充申请人的经历。

## 一次练习怎样进行

1. 选择 F-1 或 B-2，并填写一份不含证件号码的背景摘要。
2. 选择标准型、压力型等面签官模式。
3. 与实时语音模型连续对话。模型会在自己的角色和审查边界内决定主问、追问或结束。
4. 面试结束后，报告模型逐题提取事实，再对整场回答进行综合分析。
5. 在报告中查看资格维度、关键证据、逐题复盘和改进建议，也可以下载排版后的 PDF。

F-1 面试通常在关键方向得到足够信息后结束，主问和追问合计最多 16 问、最长 10 分钟。题量是上限，不是为了凑数的目标。

## Windows 用户如何使用

从 GitHub 的 **Releases** 页面下载安装包，按向导安装后即可从桌面快捷方式打开。

第一次启动需要配置两套模型：

- 一套实时语音模型，用于听取回答并现场提问；
- 一套报告模型，用于面试结束后的详细复盘。

凭据由使用者自己向模型供应商申请。项目不提供共用 Key，也没有邀请码、订单码或练习次数限制。桌面版会将长期凭据交给 Windows 加密存储，并在本机 `127.0.0.1` 的随机端口运行内置服务；普通使用不需要云服务器。

### 可配置的模型

| 用途 | 接口 | 首次使用时需要填写 |
| --- | --- | --- |
| 实时语音 | 豆包端到端实时语音 | App ID、Access Token / Access Key |
| 实时语音 | Gemini Live | Gemini API Key |
| 实时语音 | OpenAI Realtime | OpenAI API Key |
| 反馈报告 | DeepSeek | API Key、模型名、API Base URL；默认 `deepseek-v4-pro` |
| 反馈报告 | OpenAI | API Key、模型名、API Base URL |
| 反馈报告 | OpenAI-compatible / 本地模型 | 模型名、API Base URL；远程服务通常还需要 Key |

豆包已经完成真实面谈测试。Gemini Live 和 OpenAI Realtime 已完成无需 Key 的连接协议、音频和事件映射测试，但仍需要各自有效账户做发布级真实语音验收。这个区别很重要：离线测试能够证明适配器逻辑正确，不能证明账户权限、地区可用性、余额和供应商当前服务状态。

详细配置和验收状态见：

- [Windows 桌面版说明](docs/WINDOWS_DESKTOP.md)
- [语音供应商测试说明](docs/PROVIDER_TESTING.md)

## 报告是怎样生成的

报告不是让一个模型一次输出一大段复杂 JSON。当前流程分为两层：

```text
申请摘要与完整问答
        ↓
报告模型：逐题提取证据，分析整场资格信息
        ↓
项目代码：校验证据引用，统一评分和章节结构
        ↓
网页报告与 PDF
```

模型负责理解和判断，程序负责格式与边界。这样做有三个目的：

- 换用不同报告模型时，最终报告仍有稳定的章节和评分口径；
- 模型只能引用本次会话中已有的证据编号，减少改写或编造用户回答；
- 信息没说到会被标为“尚未建立”，不会自动推断成负面事实。

每道回答会记录核查目的、直接回应程度、关键事实、前后一致性、对签证资格的作用和下一步建议。综合报告再从学习或访问目的、资金、准备情况、离境意图和重要一致性等方向复盘整场表现。

报告合同位于：

- `server/shared/f1ReportContract.mjs`
- `server/shared/b2ReportContract.mjs`
- `server/reportApi.mjs`

## 从源码运行

### 环境要求

- Windows 10/11（桌面版开发与打包）
- Node.js 22.12 或更高版本
- npm

```powershell
git clone https://github.com/ikariy520-code/AI-VISA-INTERVIEW.git
cd AI-VISA-INTERVIEW
npm install
npm test
npm run desktop:run
```

生成 Windows 安装包：

```powershell
npm run desktop:installer
```

只运行网页开发环境：

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

示例环境变量只说明字段，不包含可用凭据。真实 `.env` 文件已被 Git 忽略。

## 服务器部署

桌面版不需要服务器。只有准备向其他人提供网站时，才需要部署前端和 Node.js 服务，并用 HTTPS 反向代理普通 API 与 WebSocket。

仓库不包含固定服务器 IP、SSH 私钥路径或生产凭据。部署目标必须通过 `DEPLOY_HOST`、`DEPLOY_SSH_KEY` 和 `DEPLOY_REMOTE_DIR` 明确配置，完整步骤见 [服务器部署说明](docs/SERVER_DEPLOYMENT.md)。

当前开源版本没有账号、计费和完整的防滥用系统。公开部署网站会消耗部署者自己的模型额度，因此上线前至少应补充身份验证、速率限制、预算告警和日志脱敏。这个限制不影响个人电脑上的本地使用。

## 测试

完整测试：

```powershell
npm test
npm run build
npm run licenses:check
npm run security:scan-history
```

无需 API Key 的供应商测试：

```powershell
npm run test:providers:offline
npm run test:desktop-network
npm run check:provider-network
```

`check:provider-network` 只检查 DNS、端口和 TLS，不会发送 Key，也不能代替真实鉴权测试。真实调用测试会产生供应商费用，应在准备好专用测试账户后再运行：

```powershell
npm run smoke:realtime
npm run smoke:report
```

GitHub Actions 会在 Windows 和 Linux 上执行测试、构建、许可证检查和完整 Git 历史密钥扫描。

## 项目结构

```text
desktop/   Electron 主进程、本机服务、配置加密和网络诊断
server/    实时语音代理、短期会话凭据和报告生成
src/       React 界面、面签规则、供应商适配器和报告展示
scripts/   测试、安全扫描、许可证和部署工具
docs/      Windows、供应商验收和服务器部署文档
```

面签规则与具体模型供应商分开。新增语音模型时，应实现统一的实时事件接口，并把同一套高优先级面签规则交给模型，而不是在页面里另写一套问答流程。

## 隐私与使用边界

- 不要填写或上传护照号、SEVIS/DS-160 编号、银行账号、完整住址、联系方式或其他不必要的身份信息。
- 不要把 API Key、真实申请材料、录音或用户数据提交到 GitHub Issue、日志或截图中。
- 报告评价的是本次练习中已经表达出来的证据，不提供“过签率”。
- 评分不以口音、回答长短、词汇高级程度或表达是否书面为标准。
- 模拟结果受模型、网络和供应商服务影响，不能代替官方信息或专业法律意见。

## 参与项目

项目由 [ikariy520-code](https://github.com/ikariy520-code) 发起并主要维护，[LZC20040216-OSS](https://github.com/LZC20040216-OSS) 作为共同作者参与。具体说明见 [AUTHORS.md](AUTHORS.md)。公开仓库不按提交次数或公开百分比分配作者权利；商业合作由相关权利人另行书面约定。

欢迎提交问题和改进。提交代码前请阅读：

- [贡献指南](CONTRIBUTING.md)
- [贡献者许可协议](CLA.md)
- [安全报告方式](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 许可证

社区版本采用 [GNU AGPL v3 only](LICENSE)。允许在遵守许可证的前提下使用、修改和商业使用。需要闭源集成、白标分发或其他不适用 AGPL 的使用方式，可与相关权利人另行协商[商业授权](COMMERCIAL_LICENSE.md)。

第三方组件使用各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目名称与标识不随代码许可证自动授权，见 [TRADEMARKS.md](TRADEMARKS.md)。
