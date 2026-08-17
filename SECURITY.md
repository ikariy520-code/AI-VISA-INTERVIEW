# Security policy

## Supported versions

安全修复优先应用到最新的 `1.x` 版本和 `main` 分支。测试阶段不会承诺为更早的预发布提交提供长期支持。

## 私密报告漏洞

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/ikariy520-code/ai-visa-interview/security/advisories/new)。不要在公开 Issue 中提交：

- API Key、Access Token、临时凭据或完整配置文件；
- 真实申请人的资料、录音、转写或反馈报告；
- 可以直接利用但尚未修复的攻击步骤。

报告应包含受影响版本、影响范围、最小复现步骤和建议缓解方式。请使用合成数据，并在截图和日志中删除密钥与个人信息。

维护者会尽力在 7 天内确认收到报告，并在复现和修复后协调披露时间。该时间是维护目标，不是服务等级承诺。

## 不属于私密漏洞的情况

一般功能错误、供应商临时故障、模型回答质量和已脱敏的安装问题可以使用公开 Bug 模板。怀疑凭据已经泄漏时，应先到对应供应商撤销并重新生成凭据，再提交脱敏报告。

