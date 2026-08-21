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
SESSION_SECURE_COOKIE=true
SANCTUM_STATEFUL_DOMAINS=你的域名
REVERB_SCHEME=https
REVERB_HOST=你的域名
REVERB_PORT=443
REVERB_ALLOWED_ORIGINS=https://你的域名
```

生成随机 `REVERB_APP_ID`、`REVERB_APP_KEY`、`REVERB_APP_SECRET`，然后执行：

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

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location ^~ /api/ { try_files $uri $uri/ /index.php?$query_string; }
location ^~ /sanctum/ { try_files $uri $uri/ /index.php?$query_string; }
location ^~ /broadcasting/ { try_files $uri $uri/ /index.php?$query_string; }

location /app/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
}
```

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

首次注册 Florr ID 为 `Xyiw46_`（大小写必须完全一致）的玩家会自动成为管理员，密码由该玩家在注册时设置。由于 Florr ID 唯一，之后无法重复注册该管理员 ID。

`npm run build` 会关闭 source map 并使用 OXC 压缩、重命名局部标识符。浏览器端代码无法做到真正保密，混淆只能提高阅读成本；数据库密码和 Reverb Secret 必须只放在服务器 `.env`，不要提交到 Git。
