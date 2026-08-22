# Movers Squad 宝塔面板部署与更新

## 1. 环境准备

在宝塔安装 Nginx、MySQL 8、PHP 8.3、Supervisor 和 Node.js 20+。PHP 开启 `bcmath`、`ctype`、`curl`、`dom`、`fileinfo`、`mbstring`、`openssl`、`pdo_mysql`、`tokenizer`、`xml` 扩展，并安装 Composer。

创建 MySQL 数据库 `movers`，字符集使用 `utf8mb4`。创建站点，例如 `/www/wwwroot/movers-squad`，站点运行目录指向 `/www/wwwroot/movers-squad/backend/public`。

## 2. 首次部署

```bash
cd /www/wwwroot
git clone https://github.com/hangymind/movers-squad.git
cd movers-squad/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
```

编辑 `backend/.env`，至少配置：

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://你的域名
FRONTEND_URL=https://你的域名
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=movers
DB_USERNAME=数据库用户
DB_PASSWORD=数据库密码
SESSION_DOMAIN=你的域名
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=你的域名
REVERB_HOST=127.0.0.1
REVERB_PORT=8081
REVERB_SCHEME=http
REVERB_SERVER_HOST=127.0.0.1
REVERB_SERVER_PORT=8081
REVERB_ALLOWED_ORIGINS=https://你的域名
REVERB_APP_ACCEPT_CLIENT_EVENTS_FROM=none
REVERB_APP_RATE_LIMITING_ENABLED=true
REVERB_APP_RATE_LIMIT_TERMINATE=true
REVERB_APP_MAX_CONNECTIONS=1000
```

生成随机 `REVERB_APP_ID`、`REVERB_APP_KEY`、`REVERB_APP_SECRET`。这三项是 Reverb 识别和签名连接所必需的，不能删除；其中 Key 会由登录接口安全地作为公开连接标识返回，只有 Secret 必须严格保存在服务器。前端不再需要任何 `VITE_REVERB_*` 配置。然后执行：

```bash
cd /www/wwwroot/movers-squad/backend
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache

cd ../frontend
npm ci
npm run build
```

把 `frontend/dist` 的内容复制到 Laravel 的 `public` 目录（不会覆盖 `index.php`）：

```bash
cp -a dist/. ../backend/public/
```

Nginx 增加 SPA 与 WebSocket 配置：

先在 Nginx 主配置的 `http {}` 中增加每 IP WebSocket 连接区：

```nginx
limit_conn_zone $binary_remote_addr zone=movers_ws_per_ip:10m;
limit_req_zone $binary_remote_addr zone=movers_api_per_ip:10m rate=10r/s;
```

```nginx
client_max_body_size 12m;
limit_req_status 429;

add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' ws: wss:" always;

location / {
    try_files $uri $uri/ /index.html;
}

location ^~ /api/ {
    limit_req zone=movers_api_per_ip burst=20 nodelay;
    try_files $uri $uri/ /index.php?$query_string;
}
location ^~ /sanctum/ {
    limit_req zone=movers_api_per_ip burst=10 nodelay;
    try_files $uri $uri/ /index.php?$query_string;
}
location ^~ /broadcasting/ {
    limit_req zone=movers_api_per_ip burst=20 nodelay;
    try_files $uri $uri/ /index.php?$query_string;
}

location ^~ /app/ {
    limit_conn movers_ws_per_ip 10;
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 70s;
    proxy_send_timeout 70s;
    proxy_buffering off;
}
```

浏览器始终连接 `wss://你的域名/app/{REVERB_APP_KEY}`，不会看到或连接内部 `8081` 端口。Nginx 负责把 `/app/` 转发给仅监听 `127.0.0.1:8081` 的 Reverb；应用页面使用的 `9191` 与 Reverb 内部监听端口不是同一个服务，不能互相替代。

在 PHP 8.3 的 `php.ini` 中将 `upload_max_filesize` 设置为 `10M`、`post_max_size` 设置为 `12M`，然后重载 PHP-FPM 和 Nginx。绑定截图由 Laravel 存放在 `storage/app/private/florr-bindings`，不要将该目录配置为公开静态资源。

在 Supervisor 添加守护进程：

```ini
[program:movers-reverb]
command=/www/server/php/83/bin/php artisan reverb:start --host=127.0.0.1 --port=8081
directory=/www/wwwroot/movers-squad/backend
autostart=true
autorestart=true
user=www
redirect_stderr=true
stdout_logfile=/www/wwwroot/movers-squad/backend/storage/logs/reverb.log
```

给 `storage`、`bootstrap/cache` 写权限并启用站点 HTTPS。

不要代理或公开 `.env`、`storage/app/private`、数据库文件和日志目录；生产环境保持 `APP_DEBUG=false`，数据库账户只授予当前数据库所需权限。

## 3. 从本机推送更新

本机完成代码修改和测试后执行：

```powershell
cd "E:\this computer\mine\webproject\movers"
git add .
git commit -m "update movers squad"
git push origin main
```

如果 GitHub 要求认证，使用 Personal Access Token 或先执行 `gh auth login`，不要使用账户密码。

## 4. 服务器拉取并发布

在宝塔终端执行：

```bash
cd /www/wwwroot/movers-squad
git pull --ff-only origin main

cd backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize:clear
php artisan config:cache
php artisan route:cache

cd ../frontend
npm ci
npm run build
rm -rf ../backend/public/assets ../backend/public/fonts ../backend/public/index.html
cp -a dist/. ../backend/public/

supervisorctl restart movers-reverb
```

发布后执行 `supervisorctl status movers-reverb`，再用 `curl -i https://你的域名/api/user` 确认 HTTP 服务可达（未登录时预期返回 401）。Reverb 配置或密钥变化后执行 `php artisan optimize:clear`、`php artisan config:cache` 并重启 `movers-reverb`；本版本的前端 Key 来自登录接口，无需写入前端构建环境，也无需因 Key 变化单独重建前端。

首次注册 Florr ID 为 `Xyiw46_`（大小写必须完全一致）的玩家会自动成为管理员，密码由该玩家在注册时设置。由于 Florr ID 唯一，之后无法重复注册该管理员 ID。

`npm run build` 会关闭 source map 并使用 OXC 压缩、重命名局部标识符。浏览器端代码无法做到真正保密，混淆只能提高阅读成本；数据库密码和 Reverb Secret 必须只放在服务器 `.env`，不要提交到 Git。
