# 服务器部署

这份说明只适用于需要对外提供网站的维护者。Windows 桌面版在用户电脑上启动内置服务，不需要云服务器。

## 部署前先判断风险

互联网部署与本地桌面版的责任不同：服务器保存的是运营者的模型凭据，所有访问者都会消耗运营者的额度。当前项目没有用户账号、付费、邀请码或完整的防滥用系统。公开服务前至少应补充：

- 身份验证和访问控制；
- 实时语音连接数、报告请求数和单用户速率限制；
- 供应商预算上限与费用告警；
- 只记录脱敏技术日志，不记录原始 Key、音频或完整申请资料；
- 防火墙只开放 80/443，Node 服务只监听 `127.0.0.1`。

## 基本要求

- Node.js 22.12 或更高版本
- npm
- HTTPS 域名与反向代理（例如 Nginx）
- 可选：PM2，用于进程守护

## 手动部署

```bash
git clone https://github.com/ikariy520-code/ai-visa-interview.git
cd ai-visa-interview
npm ci
npm test
npm run build
cp .env.production.example .env.production
```

编辑 `.env.production`，只保留实际使用的供应商配置。服务器文件权限应限制为当前服务账户可读：

```bash
chmod 600 .env.production
NODE_ENV=production npm start
```

服务默认监听 `127.0.0.1:3000`。不要把 `HOST` 改成 `0.0.0.0` 后直接暴露到互联网。

健康检查：

```bash
curl http://127.0.0.1:3000/api/app-health
curl http://127.0.0.1:3000/api/realtime-health
curl http://127.0.0.1:3000/api/report-health
```

`/api/app-health` 只说明本地进程正常以及两套模型是否已经配置，不会发起付费模型请求。

## Nginx

以 `nginx-visa-interview.conf` 为起点，替换示例域名和证书路径后再启用。必须保留：

- `/api/realtime-voice` 的 WebSocket `Upgrade` 和长连接超时；
- `/api/ai-report` 足够长的读取超时；
- `X-Forwarded-Proto`、`X-Real-IP` 等代理头；
- HTTPS 与 HSTS。

配置完成后运行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## PM2

`ecosystem.config.cjs` 使用项目目录自身作为工作目录，不再绑定某个用户名或绝对路径：

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

## 可选部署脚本

仓库脚本只接受显式环境变量，不包含固定服务器 IP：

```bash
export DEPLOY_HOST="ubuntu@example.com"
export DEPLOY_SSH_KEY="$HOME/.ssh/your-key.pem"
export DEPLOY_REMOTE_DIR="/home/ubuntu/ai-visa-interview"
npm run deploy
```

脚本不会上传本地 `.env.production`。首次部署后，需要在服务器上单独创建该文件并设置权限。

## 上线后检查

1. 用无真实个人信息的测试资料完成一次语音面签。
2. 确认 WebSocket 没有被代理在短时间内断开。
3. 生成一次完整报告并下载 PDF。
4. 检查日志中没有 Key、临时 token、原始音频或完整问答。
5. 设置供应商费用告警，并验证达到预算时的停用流程。
6. 定期运行 `npm run licenses:check` 和依赖安全更新。
