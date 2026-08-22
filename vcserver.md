# Movers Squad 语音服务器部署

本项目使用自建 LiveKit SFU 提供 4 人音频通话。Laravel 只签发 10 分钟有效的房间令牌，并在成员退出或队伍关闭时通过 Room Service 强制断开参与者；音频直接在浏览器与 LiveKit 之间传输，不经过 Laravel 或 Reverb。

以下示例按 Ubuntu 22.04/24.04、Docker Compose、独立语音子域名编写，并固定使用 LiveKit `v1.13.5`。建议至少准备 2 核 CPU、2 GB 内存和公网 IPv4。

## 1. DNS 与端口

将 `voice.example.com` 和 `turn.example.com` 的 A 记录指向语音服务器公网 IP。开放：

| 端口 | 协议 | 用途 |
|---|---|---|
| 80、443 | TCP | HTTPS/WSS 信令和证书签发 |
| 7881 | TCP | ICE/TCP 媒体回退，不能由 HTTP 反向代理代转 |
| 50000–50100 | UDP | WebRTC 媒体端口范围 |
| 3478 | UDP | LiveKit 内置 TURN/UDP |
| 5349 | TCP | 可选 TURN/TLS；最严格网络建议改为独立主机/IP 的 443 |

宝塔安全组、云厂商安全组和系统防火墙三处都要放行。UFW 示例：

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 50000:50100/udp
ufw allow 3478/udp
ufw allow 5349/tcp
```

## 2. 创建配置

```bash
mkdir -p /opt/movers-livekit
cd /opt/movers-livekit
openssl rand -hex 16
openssl rand -hex 32
```

第一条输出作为 API Key，第二条输出作为 API Secret。Secret 至少 32 字节，不要提交到 Git。

创建 `/opt/movers-livekit/livekit.yaml`：

```yaml
port: 7880

redis:
  address: 127.0.0.1:16379

rtc:
  use_external_ip: true
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100

keys:
  这里替换为API_KEY: 这里替换为至少32字节的API_SECRET

room:
  empty_timeout: 300
  departure_timeout: 20
  max_participants: 4
  enabled_codecs:
    - mime: audio/opus

turn:
  enabled: true
  udp_port: 3478
  domain: turn.example.com
```

创建 `/opt/movers-livekit/docker-compose.yml`：

```yaml
services:
  redis:
    image: redis:7-alpine
    network_mode: host
    command: ["redis-server", "--bind", "127.0.0.1", "--port", "16379", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    restart: unless-stopped

  livekit:
    image: livekit/livekit-server:v1.13.5
    network_mode: host
    command: ["--config", "/etc/livekit.yaml"]
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis-data:
```

`network_mode: host` 只适用于 Linux，能避免 Docker NAT 向 WebRTC 广播错误地址。启动并检查：

```bash
docker compose config
docker compose up -d
docker compose logs -f livekit
curl http://127.0.0.1:7880
ss -lntup | grep -E '7880|7881|3478|50000'
```

## 3. Nginx 信令代理

为 `voice.example.com` 申请 HTTPS 证书，在该站点加入：

```nginx
location / {
    proxy_pass http://127.0.0.1:7880;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

不要用 Nginx HTTP location 代理 `7881/TCP` 或 UDP 媒体范围；这些端口必须直接到达 LiveKit 主机。

## 4. Laravel 配置

在 Movers Squad 的 `backend/.env` 加入：

```dotenv
LIVEKIT_URL=wss://voice.example.com
LIVEKIT_API_KEY=与livekit.yaml完全一致
LIVEKIT_API_SECRET=与livekit.yaml完全一致
```

然后执行：

```bash
cd /www/wwwroot/movers-squad/backend
composer install --no-dev --optimize-autoloader
php artisan optimize:clear
php artisan config:cache
```

主站 Nginx 必须允许麦克风和连接语音域名：

```nginx
add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' ws: wss: wss://voice.example.com;" always;
```

重载 Nginx 后重新构建并发布前端。麦克风 API 只在 HTTPS 或 localhost 安全上下文可用。

## 5. TURN/TLS 说明

内置 TURN/UDP 适合大多数网络；ICE/TCP `7881` 作为 UDP 不可用时的回退。若校园网、公司网仍无法连接，需要 TURN/TLS 监听公网 `443/TCP`。同一公网 IP 的 `443` 已被 Nginx 使用时，不能让 LiveKit 同时监听该端口，应选择以下之一：

- 为 TURN 增加独立公网 IP，并让 LiveKit 的 TURN/TLS 直接监听该 IP 的 443。
- 在独立主机部署 coturn，使用 `turn.example.com:443`，再通过 LiveKit `rtc.turn_servers` 配置共享密钥。
- 使用支持 TLS/UDP 分流的四层负载均衡器。

不要把 TURN/TLS 当作普通 HTTPS location 代理。证书域名必须与客户端看到的 TURN 域名一致。

## 6. 更新与排障

升级前先查看 [LiveKit Releases](https://github.com/livekit/livekit/releases)，修改 Compose 中的固定版本后执行：

```bash
cd /opt/movers-livekit
docker compose pull
docker compose up -d
docker compose logs --tail=100 livekit
```

常见检查：

- `voice-token` 返回 503：Laravel 的三个 `LIVEKIT_*` 环境变量未配置或配置缓存未刷新。
- 浏览器提示麦克风不可用：检查 HTTPS、站点权限和 `Permissions-Policy`。
- 能进房间但听不到声音：检查 UDP 范围、`7881/TCP`、公网 IP 探测和云安全组。
- 部分严格网络无法进入：部署 TURN/TLS 443，而不是继续扩大随机 UDP 端口。
- 修改 API Key/Secret 后：同时修改 LiveKit 与 Laravel，重启 LiveKit并执行 `php artisan config:cache`。
