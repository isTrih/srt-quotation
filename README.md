# 正经报价 2.0

Modern.js 3.9.3 + React + BFF + Bun 1.4.3 + SQLite。Bun 管理依赖并运行后端，Modern.js 构建工具使用 Node.js 24。生产采用 Bun slim Docker 镜像，只复制独立部署依赖、前端、中文字体、公章和备份脚本；不包含 Node.js、开发依赖、源码工作区或 Chromium。

Bun 编译程序在加载 Modern.js 动态依赖时未通过独立运行测试，因此采用 Docker 部署。

## 开发和构建

构建环境安装 Bun 1.4.3 和 Node.js 24：

```sh
bun install --frozen-lockfile
bun run dev
bun run test
bun run test:web
bun run build
bun run test:integration
```

开发地址为 http://localhost:4174/。第一次访问设置唯一管理员（密码至少12位）。旧浏览器中的报价和客户缓存仍可读取；换域名后可以通过 JSON 备份迁移本机草稿。

`bun run build` 执行类型检查、Modern.js 独立构建，生成 `output/runtime-时间戳/` 发布目录。`output/runtime-build.json` 记录最新目录和体积。运行依赖的目录链接会展开，发布包可以整体复制到另一台安装 Bun 的服务器，无需安装项目依赖。

进入发布目录运行：

```sh
PORT=8080 DATA_DIR=/opt/srt-quotation-data bun .output/index.js
```

PowerShell：

```powershell
$env:PORT = '8080'
$env:DATA_DIR = 'C:/quotation-data'
bun .output/index.js
```

也可在发布目录放 `.env`，Bun 启动时读取，外部环境变量优先：

```env
PORT=8080
DATA_DIR=/opt/srt-quotation-data
PUBLIC_ORIGIN=https://quote.example.com
COOKIE_SECURE=true
TRUST_PROXY=false
```

DATA_DIR 指向可写、持续保留的数据目录，包含账号、会话、报价、版本和下载校验码。建议用绝对路径；相对路径按启动工作目录解析。Docker 已固定端口8080、DATA_DIR=/app/data，宿主目录通过挂载指定。

## 工作台与网页报价

- 桌面并排显示编辑器和 HTML 网页预览；手机分为客户信息、报价明细、核对发布三个步骤。放大预览同样渲染网页表格。
- 预览实时更新，不嵌入 PDF、canvas 或 PDF 查看器，也不会在编辑时自动生成 PDF。
- 在线报价与核验页面使用同一个网页报价组件，访客直接查看固定版本的数据；PDF 只在主动导出或生成并下载 PDF时使用。
- 明细每次编辑20行，支持插入、复制、手动编号、删除及撤销。浏览器自动保存本机草稿，服务器草稿可在历史报价中搜索、继续编辑、复制、归档和恢复。
- 联系人/电话和询价单位保留独立下拉缓存，并补充最近100份服务器报价中的建议，允许输入新内容。
- HH 默认1%专票、FT 默认13%，可分别修改；录入单价为含税价，不重复加税。按行舍入到分，合计等于显示的小计之和。
- 发布仅保存不可变的报价数据快照和随机访客链接，PDF 仅在点击下载时生成；修改草稿不影响旧版本。重新发布创建新链接，旧链接提示历史版本。
- 撤销后访客页面及下载返回410；归档不撤销链接。访客无法访问后台、历史列表和系统设置。
- 后台“在线访问地址”填写真实域名。二维码固定使用发布当时的地址，修改设置只影响新版本。

## PDF 与核验

PDFKit 直接绘制中文文字、矢量表格和水印；公章与二维码为图像。Noto Sans SC 字体子集随 PDF 嵌入，字体许可证见 assets/fonts/LICENSE.txt。

- A4 内容水平居中，左右边距约15.2毫米；短产品30行可放进一页，实际容量受文字换行影响。
- 明细续页填满可用区域，“（有续表）”居中；明细页公章在右侧垂直居中，末页公章覆盖日期。
- 公章稳定随机旋转±60°，同一版本保持同一角度。
- 正式 PDF 左上角为约14毫米的小二维码和细圆角边框，附编号、版本和内容校验码。下载接口使用 attachment，网页预览不打开 PDF。
- 在线核验可选择收到的 PDF，在本机计算 SHA-256，并比对该版本历史下载的校验码，不上传文件；服务器只保存校验码。需要 HTTPS 或 localhost 安全环境。
- 水印可自定义或关闭。文件重新保存或压缩也可能改变哈希；升级 PDF 渲染器后，曾经下载过的文件校验码仍保留以便核验，图像公章和水印不是证书数字签名。
- 网页按屏幕宽度响应式排版，PDF 按 A4 分页，两种展示使用同一份报价数据。

## Docker：外部挂载数据

镜像名称固定为 `trhilp/srt-quotation`。Dockerfile 使用多阶段构建；运行阶段基于 oven/bun:1.4.3-slim，使用 UID/GID 10001 的普通用户。开发工具仅留在构建阶段。

在 Linux 服务器准备配置及数据目录：

```sh
cp .env.example .env
mkdir -p ./data
sudo chown 10001:10001 ./data
# 修改 .env 的 PUBLIC_ORIGIN 为实际域名
# DATA_PATH 可改为绝对宿主路径，例如 /opt/srt-quotation-data

docker compose pull
docker compose up -d --no-build
```

自己构建：`docker compose up -d --build`。

目录映射：`${DATA_PATH:-./data}`（服务器目录） → `/app/data`（容器目录）；容器内 `DATA_DIR=/app/data`。只有 SQLite 数据库（账号、报价、版本、校验码）保存在宿主机持久目录；PDF 在内存中生成并直接下载，不写入磁盘。更新镜像继续使用相同 DATA_PATH，应用程序与数据分开存放。

Compose 端口为本机127.0.0.1:8080，使用 Nginx/Caddy 配置 HTTPS 反向代理。设置正确 Host、限制请求体到1MB；公网部署使用 COOKIE_SECURE=true。TRUST_PROXY=true 仅用于可信代理，才按传入IP区分登录限流；默认共享每10分钟12次登录尝试。

默认一个实例、384MB内存上限；PDF 同时只生成一份，SQLite 缓存约2MB。需要根据真实 Linux 服务器负载测量调整。

## GitHub Actions → Docker Hub

工作流：`.github/workflows/docker.yml`。

Docker Hub 用户名已固定为 **trhilp**，镜像仓库固定为 **trhilp/srt-quotation**。在 Docker Hub 创建 srt-quotation 仓库，在 GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret 设置：

|Secret 名称|值|
|---|---|
|DOCKERHUB_TOKEN|trhilp 账号生成的 Docker Hub Access Token，具有目标仓库写入权限|

不需要用户名变量。令牌只保存到 GitHub Secret，工作流从中读取，不放进源码、镜像或前端。

工作流在 main/master 推送、v* 标签、手动触发及 PR 时运行：

1. Linux 执行冻结依赖安装、报价回归、网页渲染、正式构建和隔离发布目录测试。
2. 构建 Linux amd64 镜像，真实启动容器，在384MB限制下验证非 root、网页/公章、管理员、发布、文字 PDF、挂载数据、数据库备份和重启持久化。
3. 只有验证通过才登录 Docker Hub，构建并推送 linux/amd64 与 linux/arm64 镜像。
4. 默认分支生成 latest 和 SHA 标签，v2.0.0 等标签生成版本镜像。PR 只构建测试，不使用 Docker Hub 令牌。
5. 服务器更新执行 docker compose pull 和 docker compose up -d --no-build。

本机没有 Docker，真实镜像构建及容器测试由 GitHub Actions 执行。手动测试已有本地镜像可运行 `DOCKER_TEST_IMAGE=trhilp/srt-quotation:latest bun run test:docker`。

## 数据备份与恢复

发布目录：`DATA_DIR=/opt/srt-quotation-data bun scripts/backup.mjs /opt/quotation-backup`。

Docker：

```sh
docker compose exec quotation bun scripts/backup.mjs
```

备份位于数据目录 backups/时间戳。通过 SQLite VACUUM INTO 创建一致快照，只备份数据库，不复制或保存 PDF。备份包含管理员密码哈希、会话、客户数据及访问令牌，应保存在私有位置。

恢复时停止服务，把备份中的 quotation.sqlite 放回 DATA_PATH，移走旧库对应的 WAL/SHM 文件，确认 UID10001 可读写，再启动。

后台导出 JSON 用于离线报价留档，不包含管理员账号；完整恢复使用数据库备份。恢复后 PDF 可根据保存的版本数据重新生成。

## 验证与限制

- 15项报价、客户缓存和金额回归测试。
- 网页表格渲染和转义测试，确认不含 PDF 查看器。
- Bun 服务与隔离发布目录测试：权限、单账号、来源校验、1MB上限、版本发布、撤销、字体/公章、文字 PDF、下载校验码及数据库备份恢复；验证发布和下载均不写入 PDF 文件。
- 隔离测试把发布包复制到系统临时目录运行，不依赖项目源码或开发 node_modules。
- Docker 容器回归在 CI 中运行，镜像发布必须通过该检查。
- PDF 中文文字、30行单页、小二维码解码和跨页已验证。
- 浏览器自动化受当前 Windows 沙箱故障影响，手机与桌面尚未完成实际浏览器视觉回归；网页组件、构建与接口有自动验证。
- 单管理员、单实例；不支持多个实例共享 SQLite 写入。内存上限不是实际占用承诺。
