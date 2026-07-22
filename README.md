# AI Visa Interview

这是一个面向 F1 / B2 的 AI 模拟面签项目。两类签证都把“实时面签”和“最终报告”明确拆开：

- 豆包端到端实时语音负责听取回答和朗读面签官问题。
- 本地 F1 / B2 控制器负责从各自受控题库中选择、重复或结束，豆包不能在面签中自由编题。
- 面试结束后，DeepSeek 只调用一次，并严格按照对应签证的官方依据、证据引用和结构化报告合同生成最终综合报告。

## F1 面签规则

1. 所有主问题与实质追问都必须来自固定 22 题。
2. Q1、Q19、Q20、Q21 必须覆盖。
3. 题量根据用户背景、有效回答和剩余时间动态决定，不固定为 10 题，也不会把 22 题全部问完。
4. 没听清时原样重复当前问题；答非所问时最多原样重复一次。
5. 最长 10 分钟，结束语固定为 `Thank you. This concludes the practice interview.`
6. 面试过程的下一步判断由本地控制器负责，最终报告 API 不参与逐轮选题。

## B2 面签规则

1. 默认使用中文提问和中文语音，F1 英文路径不受影响。
2. 问题只能来自 B2 受控题库，覆盖访问目的、行程、费用、当前状态、美国联系人、旅行史和访问结束后的安排。
3. 每次根据脱敏背景和实际回答动态选择，通常 6–9 个问题，最多 9 个问题，不会遍历整套题库。
4. 没听清时原样重复当前问题；回答不清时最多原样重复一次。
5. 最长 6 分钟，结束语固定为 `好的，谢谢。今天的模拟面签到这里结束。`
6. 表单只收集 DS-160 面签摘要，不收集完整表格、护照号、申请编号、详细地址、联系方式或银行账户。

## 最终报告原则

- 只评估本次练习准备情况，不预测获签、拒签或“过签率”。
- 依据脱敏背景、实际问答、对应签证的美国国务院说明和适用的 FAM 条目。
- 每个重要判断必须带用户资料或回答中的原文证据，以及官方规则编号。
- 不按回答长度、词汇高级程度、书面程度、口音或语法评分。简短、口语化但完整回答问题的答案可以获得高分。
- 不编造学校、课程、收入、资金、家庭情况、文件内容或回国计划。
- 分析 API 失败时只展示原始问答，不生成本地假分数。

官方依据版本位于：

- `src/modules/practice/data/f1OfficialCriteria.ts`（前端）
- `server/shared/f1OfficialCriteria.mjs`（服务端）
- `src/modules/practice/data/b2OfficialCriteria.ts`（前端）
- `server/shared/b2OfficialCriteria.mjs`（服务端）

更新官方依据时必须同步修改版本号，并运行全部测试。

## 本地配置

复制 `.env.example` 为 `.env.local`，填写真实凭证：

```dotenv
DOUBAO_APP_ID=端到端语音应用ID
DOUBAO_ACCESS_KEY=端到端语音Access Token
DOUBAO_REALTIME_URL=wss://openspeech.bytedance.com/api/v3/realtime/dialogue

DEEPSEEK_API_KEY=DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro

VITE_DEV_PORT=5173
```

`.env.local` 已被 Git 忽略。不要把真实密钥发送到聊天、截图或提交到仓库。

## 常用命令

```bash
npm run dev
npm test
npm run build
npm run smoke:realtime
npm run smoke:deepseek
npm run smoke:report
```

- `test:f1-controller`：验证 22 题边界、必问题、动态题量、重复和超时。
- `test:b2-controller`：验证中文受控题库、背景触发、动态题量、重复和超时。
- `test:f1-report`：验证隐私脱敏、证据真实性、官方依据、简短回答和禁用获签预测。
- `test:b2-report`：验证 B2 摘要脱敏、回答证据、官方依据和禁用获签预测。
- `test:architecture`：确保浏览器只访问同源报告接口，豆包只负责实时语音，DeepSeek 只负责最终报告。
- `smoke:deepseek`：用极小请求检查 DeepSeek 密钥、模型和网络连接。
- `smoke:report`：使用非真实个人资料调用 DeepSeek，验证最终报告能够被严格数据合同接收。

## 团队协作

两个人共同开发时通过 Git 拉取、提交和推送代码同步，不需要先购买服务器。服务器只在对外测试或正式上线时需要。

## 邀请码管理

- `.env.production` 中现有的 `INVITE_CODES` 是无限次数的 VIP 邀请码。
- `server/inviteCodes.json` 只保存测试邀请码的 SHA-256 哈希与额度，不保存明文。
- 测试邀请码在实时语音上游连接成功时消耗一次；登录、浏览页面和连接失败不消耗。
- 已用次数保存在 `data/invite-usage.json`，该目录不会进入 Git，部署也不会覆盖。
- 明文邀请码只在生成时写入 `private/invite-codes_*.csv`，该目录不会进入 Git。

```bash
# 首次生成测试邀请码（已有 seed 时会拒绝覆盖）
npm run invite:generate -- --count 20 --uses 3

# 查看每个邀请码的已用与剩余次数
npm run invite:status

# 管理员为指定编号恢复全部次数
npm run invite:reset -- --id T01
```
