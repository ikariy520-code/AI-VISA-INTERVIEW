# AI Visa Interview

这是一个面向 F1 / B2 的 AI 模拟面签项目。当前 F1 方案把“实时面签”和“最终报告”明确拆开：

- 豆包端到端实时语音负责听取回答和朗读面签官问题。
- 本地 `f1InterviewController` 负责从固定 22 题中选择、重复或结束，豆包不能在面签中自由编题。
- 面试结束后，DeepSeek 只调用一次，并严格按照 F1 官方依据、证据引用和结构化报告合同生成最终综合报告。

## F1 面签规则

1. 所有主问题与实质追问都必须来自固定 22 题。
2. Q1、Q19、Q20、Q21 必须覆盖。
3. 题量根据用户背景、有效回答和剩余时间动态决定，不固定为 10 题，也不会把 22 题全部问完。
4. 没听清时原样重复当前问题；答非所问时最多原样重复一次。
5. 最长 10 分钟，结束语固定为 `Thank you. This concludes the practice interview.`
6. 面试过程的下一步判断由本地控制器负责，最终报告 API 不参与逐轮选题。

## 最终报告原则

- 只评估本次练习准备情况，不预测获签、拒签或“过签率”。
- 依据脱敏背景、实际问答、美国国务院学生签证说明和适用的 FAM 条目。
- 每个重要判断必须带用户资料或回答中的原文证据，以及官方规则编号。
- 不按回答长度、词汇高级程度、书面程度、口音或语法评分。简短、口语化但完整回答问题的答案可以获得高分。
- 不编造学校、课程、收入、资金、家庭情况、文件内容或回国计划。
- 分析 API 失败时只展示原始问答，不生成本地假分数。

官方依据版本位于：

- `src/modules/practice/data/f1OfficialCriteria.ts`（前端）
- `server/shared/f1OfficialCriteria.mjs`（服务端）

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
- `test:f1-report`：验证隐私脱敏、证据真实性、官方依据、简短回答和禁用获签预测。
- `test:architecture`：确保浏览器只访问同源报告接口，豆包只负责实时语音，DeepSeek 只负责最终报告。
- `smoke:deepseek`：用极小请求检查 DeepSeek 密钥、模型和网络连接。
- `smoke:report`：使用非真实个人资料调用 DeepSeek，验证最终报告能够被严格数据合同接收。

## 团队协作

两个人共同开发时通过 Git 拉取、提交和推送代码同步，不需要先购买服务器。服务器只在对外测试或正式上线时需要。
