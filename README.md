# AI Visa Interview

AI Visa Interview 是一个在真实语音对话中练习美国签证面谈的开源项目。它不是题库播放器：语音模型需要听懂申请人的回答，在签证审查范围内决定下一问；练习结束后，另一套模型根据整场证据生成详细复盘。

当前版本支持 F-1 学生签证和 B-2 访问签证。项目仍处于测试阶段，不隶属于美国政府、任何使领馆或模型供应商，也不预测真实签证结果。

## 一次练习会发生什么

1. 用户填写一份脱敏的申请摘要，以及最担心被问到的情况。
2. 实时语音模型以签证官身份进行连续对话，不在每道题之间重建会话。
3. 模型根据已经得到的事实、尚未建立的资格要件和具体疑点决定主问或追问。
4. 达到动态结束条件、问题上限或时间上限后结束面谈。
5. 报告模型先提取逐题证据，再做整场判断；程序负责校验、评分、排版和 PDF 输出。

没有邀请码、订单码或练习次数扣减。桌面版使用者只需提供自己的语音模型凭据和报告模型凭据。

## 模型支持

| 用途 | 当前适配 | 用户需要填写 |
| --- | --- | --- |
| 实时语音 | 豆包端到端实时语音 | App ID、Access Token / Access Key |
| 实时语音 | Gemini Live | Gemini API Key |
| 实时语音 | OpenAI Realtime | OpenAI API Key |
| 反馈报告 | DeepSeek | API Key、模型名、API Base URL |
| 反馈报告 | OpenAI | API Key、模型名、API Base URL |
| 反馈报告 | OpenAI-compatible / 本地模型 | 模型名、API Base URL；远程接口通常还需要 Key |

豆包已经用于真实测试。Gemini 和 OpenAI 目前完成了不需要 Key 的协议、事件和音频映射测试；发布前仍需使用各自有效账户做一次真实语音验收。测试状态和验收清单见 [docs/PROVIDER_TESTING.md](docs/PROVIDER_TESTING.md)。

## Windows：最省事的使用方式

正式版本发布后，可从 GitHub Releases 下载 Windows 安装包。安装完成后双击打开，首次选择两套模型并填写凭据，以后直接从桌面快捷方式启动。

桌面版会：

- 把长期密钥交给 Windows 系统加密存储，不写入浏览器存储；
- 在 `127.0.0.1` 的随机端口启动内置服务，不向局域网开放；
- 为 Gemini 和 OpenAI 向浏览器签发短期凭据，豆包则经本机 WebSocket 代理连接；
- 在加载页面前检查本地服务是否健康，异常退出时进行有限恢复；
- 提供不发送 API Key 的网络检查，分别检查语音服务和报告服务是否可达。

从源码运行需要 Windows 10/11、Node.js 22.12 或更高版本：

```powershell
git clone https://github.com/ikariy520-code/ai-visa-interview.git
cd ai-visa-interview
npm install
npm test
npm run desktop:run
```

生成安装包：

```powershell
npm run desktop:installer
```

完整说明见 [docs/WINDOWS_DESKTOP.md](docs/WINDOWS_DESKTOP.md)。

## 面签规则

### F-1

F-1 不再把旧的 22 道题当成白名单或固定流程。实时模型可以自己组织自然英文问题，但每一问必须服务于下面至少一个方向：

- 学校、项目和 I-20 所对应的真实学习计划；
- 学习目的与学术准备；
- 学费及生活费的可解释资金来源；
- 完成学习后的当前离境意图；
- 申请摘要和前后回答中的具体一致性问题。

追问必须源自上一回答中的明确疑点，并索取新的事实。回答简短不等于需要追问；没有听清时才可以原样重复。用户填写的“最担心被问到的情况”若属于审查范围，必须在正常结束前自然覆盖。

面试采用动态结束：关键方向已经获得足够信息且没有待解决的重大疑点时可以结束；主问与追问合计最多 16 问，最长 10 分钟。不同面签官类型会影响节奏、追问强度和通常题量，但不会改变资格边界。

核心策略位于 `src/modules/practice/services/f1OfficerPolicy.ts`。它与供应商无关，新语音模型只需把同一策略注入自己的高优先级指令，并实现统一的音频与事件接口。

### B-2

B-2 当前使用中文受控题库，围绕访问目的、行程、费用、当前状态、美国联系人、旅行史和访问结束后的安排动态选题。通常 6–9 问，最多 9 问，最长 6 分钟。

## 报告为什么拆成两层

报告质量比短输出更重要，但不能让模型同时承担领域判断、巨大 JSON、评分和页面排版。因此当前链路是：

```text
脱敏背景与完整问答
        ↓
模型：逐题证据提取与整场资格分析
        ↓
程序：证据引用和边界校验
        ↓
程序：统一评分、章节组织和 PDF 排版
```

模型返回的是较小的证据分析包。每道题都要说明核查目的、是否直接回应、提供了哪些事实、是否与前文一致、对资格判断有什么作用，以及下一步应核查什么。证据作用只有四类：支持、中性、尚未建立、实质疑点。

程序只允许模型引用预先生成的 `evidenceId`，防止它改写或编造用户原话。缺少信息不能直接写成负面事实；矛盾必须同时引用冲突证据，并优先建议中立澄清。模型输出第一次不合格时允许按校验错误修复一次，仍不合格则退回无推测分数的基础证据复盘。

这套分工使不同报告模型也能得到相同的章节、评分口径和 PDF 结构。详细合同位于：

- `server/shared/f1ReportContract.mjs`
- `server/shared/b2ReportContract.mjs`
- `server/reportApi.mjs`

## 本地网页开发

复制示例配置：

```powershell
Copy-Item .env.example .env.local
```

至少选择一套语音供应商，并配置报告模型：

```dotenv
VOICE_PROVIDER=doubao
DOUBAO_APP_ID=
DOUBAO_ACCESS_KEY=

REPORT_PROVIDER=deepseek
REPORT_API_KEY=
REPORT_BASE_URL=https://api.deepseek.com
REPORT_MODEL=deepseek-v4-pro
```

然后运行：

```powershell
npm install
npm run dev
```

真实 `.env` 文件已被 Git 忽略。不要把 API Key、真实签证材料、录音或申请人身份信息提交到仓库、Issue 或截图中。

## 服务器部署

Windows 桌面版不需要云服务器。只有对外提供网站时才需要部署 `dist/` 和 `server/`，并用 HTTPS 反向代理转发普通 API 与 WebSocket。

通用部署说明见 [docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md)。仓库中的脚本不再包含固定服务器 IP 或本机密钥路径，必须通过 `DEPLOY_HOST`、`DEPLOY_SSH_KEY` 和 `DEPLOY_REMOTE_DIR` 显式指定目标。

公开网站会使用运营者配置的模型额度。当前仓库没有用户账号、付费、邀请码或完整的防滥用系统；在向互联网公开之前，运营者必须自行加入身份验证、速率限制、预算告警和日志脱敏。

## 测试

```powershell
npm test
npm run build
npm run licenses:check
npm run test:providers:offline
npm run test:desktop-network
npm run check:provider-network
```

- 离线测试不需要任何 Key，可检查三家语音适配器的会话合同、事件、字幕、打断和结束映射。
- 网络检查不发送 Key，只证明 DNS、端口和 TLS 可达，不证明鉴权、余额或模型权限。
- `smoke:realtime` 和 `smoke:report` 会真实调用供应商，只有在明确准备好测试账户和费用时再运行。
- 每次修改面签策略、报告合同或官方依据后，都应运行完整 `npm test`。

## 目录

```text
desktop/   Windows 桌面主进程、加密配置和本地网络诊断
server/    本地/服务器 API、语音代理和报告生成
src/       React 页面、面签策略、语音适配器和报告展示
scripts/   离线测试、真实 smoke test、许可证与部署工具
docs/      使用、供应商验收和部署说明
```

## 数据与边界

- 表单只收集练习所需摘要，不应填写护照号、申请编号、银行账号或完整住址。
- 报告只评估本次回答是否建立了相关事实，不给出“过签率”。
- 评分不依据口音、回答长度、词汇高级程度或书面程度。
- 语音和报告仍受模型能力、网络、账户权限及供应商变更影响；模拟练习不能替代官方说明或专业法律意见。

## 作者与贡献

核心作者及分工见 [AUTHORS.md](AUTHORS.md)。仓库不使用公开的百分比分配来替代实际提交版权；商业合作或收益安排由相关作者另行书面约定。

欢迎改进模型适配、面签真实性、报告证据质量、隐私、可访问性和 Windows 稳定性。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CLA.md](CLA.md)。

## 许可证

社区版本使用 [GNU AGPL v3 only](LICENSE)。AGPL 允许商业使用，但必须遵守其源码提供等条件。需要闭源集成、白标分发或其他不适用 AGPL 的方式，可另行洽谈[商业授权](COMMERCIAL_LICENSE.md)。第三方依赖仍受各自许可证约束，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目名称与标识不随代码许可证自动授权，见 [TRADEMARKS.md](TRADEMARKS.md)。
