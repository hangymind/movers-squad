# Movers Squad · Florr.io 组队招募

一个面向 Florr.io 的前后端分离 4 人组队应用。前端使用 React + TypeScript，后端使用 Laravel 12 + PHP 8.3，生产环境使用 MySQL，并通过 Laravel Reverb 向在线队员发送浏览器系统通知。

## 功能

- 使用 Florr ID 和密码注册登录，头像在个人档案中管理
- 发布游戏招募和备注，创建者自动成为队长
- 每队最多 4 人，支持加入、成员退出、队长关闭招募
- MySQL 事务与行锁防止并发超员
- 私有 Reverb 频道和浏览器 Notification API
- 满员后进入持久化文字房间，并通过自建 LiveKit 提供 4 人音频通话
- 招募详情、唯一活跃队伍限制和全局构建版本标识
- 管理员用户管理、Ban ID 搜索、封禁/解封和密码重置
- Florr 游戏截图绑定、管理员审批、私有图片资源管理和绑定结果补发
- 首次注册精确 Florr ID `Xyiw46_` 的玩家自动获得管理员权限
- 桌面端与移动端响应式界面

## 环境要求

- PHP 8.3，启用 `curl`、`fileinfo`、`mbstring`、`openssl`、`pdo_mysql` 扩展
- Composer 2
- MySQL 8.0+
- Node.js 20+
- 可长期运行 `php artisan reverb:start` 的进程管理器

## 本地启动

1. 创建数据库：

   ```sql
   CREATE DATABASE movers CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. 配置并启动后端：

   ```bash
   cd backend
   composer install
   cp .env.example .env
   php artisan key:generate
   # 在 .env 中填写 DB_USERNAME、DB_PASSWORD、Reverb 密钥和 LIVEKIT_* 配置
   php artisan migrate
   php artisan serve --host=127.0.0.1 --port=8000
   ```

3. 另开终端启动 Reverb：

   ```bash
   cd backend
   php artisan reverb:start --host=0.0.0.0 --port=8081
   ```

4. 配置并启动前端：

   ```bash
   cd frontend
   npm install
   cp .env.example .env
   npm run dev
   ```

访问 `http://localhost:9191`。Vite 会将 `/api`、`/sanctum`、`/broadcasting` 和 Reverb WebSocket 转发到内部服务。登录进入大厅时会自动申请浏览器通知权限；浏览器拦截时可使用顶栏按钮重试。语音服务搭建见 [`vcserver.md`](vcserver.md)。

## 测试

```bash
cd backend
php artisan test

cd ../frontend
npm run build
npm test
npx playwright test
```

PHPUnit 默认使用内存 SQLite 快速验证业务规则。上线前应在测试 MySQL 库执行测试和迁移，确认目标服务器的事务隔离与 `SELECT ... FOR UPDATE` 行为。

## 生产部署

宝塔面板的完整首次部署、Nginx、Supervisor 和后续更新命令见 [`BAOTA_DEPLOY.md`](BAOTA_DEPLOY.md)。

- 前端构建产物位于 `frontend/dist`，建议整站统一通过 `9191` 对外提供；将 `/api`、`/sanctum` 和 `/broadcasting` 转发到 Laravel，将 `/app` WebSocket 路径转发到 Reverb。
- 站点必须启用 HTTPS；浏览器通过同源 `/app` 连接 WebSocket，Nginx 将其转发到仅监听 `127.0.0.1:8081` 的 Reverb。完整环境变量和安全配置见部署文档。
- 使用 Supervisor、systemd 或服务器面板守护 `php artisan reverb:start`。反向代理需允许 WebSocket Upgrade。
- 为 `REVERB_APP_SECRET` 使用随机强密钥，执行 `php artisan config:cache`，并将 `APP_DEBUG` 设置为 `false`。
- 当前版本只有网页保持打开时接收通知；浏览器完全关闭后不会推送或补发。
