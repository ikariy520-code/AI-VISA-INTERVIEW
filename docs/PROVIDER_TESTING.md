# 实时语音供应商测试

本项目把“无需 Key 的代码验证”和“使用真实账号的官方服务验证”明确分开。测试结果不能越级标注。

## 零成本离线自检

```powershell
npm run test:providers:offline
```

该命令完全不会访问豆包、Gemini 或 OpenAI，也不会产生模型费用。它验证：

- 后端按所选供应商构造临时会话请求；
- Gemini/OpenAI 长期密钥不会返回浏览器；
- 模型名、音色、面签规则和低敏感度 VAD 参数正确传递；
- Gemini/OpenAI 的用户转写、模型字幕、真实音频开始、结束、打断和错误事件能映射为项目统一事件；
- 供应商返回的多段音频不会被误判为多次回答开始。

通过该命令只能标记为：

```text
OFFLINE_PROTOCOL_TESTED
```

## 无 Key 网络检查

检查全部供应商：

```powershell
npm run check:provider-network
```

只检查 Gemini 或 OpenAI：

```powershell
npm run check:provider-network -- --provider gemini
npm run check:provider-network -- --provider openai
```

该命令只做 DNS 解析和经过证书校验的 TLS 握手，不发送 API 请求、不需要 Key、不会产生模型 token。成功状态为：

```text
NETWORK_REACHABLE_AUTH_NOT_TESTED
```

它不能证明 API Key 有效、账号有模型权限、余额充足，也不能证明麦克风音频能够完整往返。

失败时会区分 `DNS_UNREACHABLE` 与 `DNS_REACHABLE_TLS_UNREACHABLE`。后者通常表示域名可以解析，但本地网络、防火墙、代理或运营商路径无法完成到官方服务的 TLS 连接。

## 发布前真实验收

真实验收必须由测试者在自己的电脑上填写自己的 Key，项目维护者不收集 Key。每个供应商至少完成一次 30～60 秒面试，并记录：

1. 临时会话或 WebSocket 鉴权成功；
2. 麦克风语音能够被正确转写；
3. 模型直接返回可播放语音，而不是本地文字转语音；
4. 字幕与实际语音属于同一回答；
5. 用户打断后旧回答停止；
6. 用户停顿时不会被明显过早抢话；
7. 一次追问和一次正常结束均成功；
8. 日志和截图中没有长期 API Key。

只有完成上述真实验收，才能把对应版本标记为 `LIVE_VERIFIED`。缺少真实 Key 时应保留 `LIVE_VALIDATION_PENDING`，不能把 TLS 可达或 HTTP 401/403 写成“官方连接成功”。

## 当前兼容性声明

| 供应商 | 无 Key 离线测试 | 无 Key 网络检查 | 真实账号验证 |
|---|---|---|---|
| 豆包 | 支持 | 支持 | 需要用户自己的 App ID 与 Access Key |
| Gemini Live | 支持 | 支持 | 需要用户自己的 Gemini API Key |
| OpenAI Realtime | 支持 | 支持 | 需要用户自己的 OpenAI API Key |

发布说明应记录测试日期、应用版本、模型名和 `OFFLINE_PROTOCOL_TESTED` / `LIVE_VALIDATION_PENDING` / `LIVE_VERIFIED` 状态，不得在仓库中记录 Key。
