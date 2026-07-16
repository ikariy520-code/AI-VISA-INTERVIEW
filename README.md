# AI Visa Interview

当前版本的 F1 模拟面签只连接一个外部 AI 服务：豆包端到端实时语音模型。

## F1 运行逻辑

1. 端到端模型负责识别用户语音，并用自然的美式英语朗读面签官问题。
2. 本地 `f1InterviewController` 根据背景和上一轮回答，从固定 22 题中选择下一题。
3. 每轮回答后都会结束旧的实时会话，再开启一个新会话朗读批准的问题，避免模型自由生成的内容被播放。
4. Q1、Q19、Q20、Q21 必须覆盖；问题总数通常为 8 至 10 题，复杂背景会提高目标题数，但不会问满 22 题。
5. 没听清会原样重复当前问题；模糊回答最多原样重复一次。任何新问题都必须是 22 题中的一个题号。
6. 最长 10 分钟，结束时固定朗读：`Thank you. This concludes the practice interview.`
7. 面签后的反馈暂时由本地规则生成，不调用第二个 AI API。

## 本地配置

复制 `.env.example` 为 `.env.local`，填写：

```dotenv
DOUBAO_APP_ID=你的端到端语音应用ID
DOUBAO_ACCESS_KEY=你的端到端语音Access Token
DOUBAO_REALTIME_URL=wss://openspeech.bytedance.com/api/v3/realtime/dialogue
VITE_DEV_PORT=5173
```

`.env.local` 已被 Git 忽略，不要把真实密钥发到聊天、截图或提交到仓库。

## 常用命令

```bash
npm run dev
npm run test:f1-controller
npm run build
npm run smoke:realtime
```

- `test:f1-controller`：验证必问题、动态题量、重复、超时和零题外输出。
- `build`：检查 TypeScript 和生产构建。
- `smoke:realtime`：使用真实凭证验证两轮端到端会话切换和指定问题朗读。

## 团队协作

两个人共同开发时通过 Git 拉取、提交和推送代码同步；不需要先买服务器。服务器只在对外测试或正式上线时需要。
