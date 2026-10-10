# 正经报价 2.0

Modern.js 3.9.3 + React 19 + BFF + SQLite。pnpm 11.23.0 管理依赖，开发、构建与生产服务统一使用 Node.js 24。数据库、原始 PDF 都保存在持久目录，服务无需 Chromium、Redis 或外部数据库。

## 开发与运行

环境：Node.js 24、pnpm 11.23.0。

```sh
npm install --global pnpm@11.23.0
```

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

开发地址：http://localhost:4174/。第一次访问按页面提示设置唯一管理员，密码至少12位。旧版浏览器中的 quotationData 和客户历史缓存仍可读取；更换访问域名后浏览器缓存不共享，可使用原有 JSON 备份导入。

```sh
pnpm run typecheck
pnpm run test
pnpm build
pnpm run test:integration
PORT=8080 pnpm start
```

PowerShell 设置环境变量示例：

```powershell
$env:PORT = '8080'
$env:DATA_DIR = 'data'
pnpm start
```

现代框架构建由 Modern.js/Rsbuild 完成。packageManager 固定 pnpm 版本，pnpm-lock.yaml 锁定依赖；本地、Docker 与 GitHub Actions 均使用冻结锁文件安装。SQLite 使用 Node.js 24 自带的 node:sqlite，无需另外编译数据库驱动。生产入口为 .output/index.js，先执行 pnpm build 再执行 pnpm start。pnpm build 同时生成独立的面板运行目录；pnpm run deploy 保留为仅生成 Modern.js 产物的命令。

## Node.js 运行环境面板部署

可以本地构建后上传运行，无需在服务器安装构建依赖：

```sh
pnpm install --frozen-lockfile
pnpm build
```

构建输出 `output/srt-quotation-panel-时间戳/`，包含 `.output/`（含后端依赖）、`assets/`（中文字体）、`public/stamps/`、备份脚本、`start.mjs` 和供面板识别的 `package.json`。最新输出位置记录在 `output/panel-build.json`。每次生成新目录，不覆盖旧目录或真实数据。

上传完整目录（包括点开头的文件夹），源码目录选择解压后直接含有 `package.json` 的目录。配置如下：

|面板字段|值|
|---|---|
|名称 / 容器名称|例如 `srt-quotation`|
|应用|Node.js|
|Node 版本|24 LTS（项目已验证）|
|源码目录|上传的完整运行目录|
|启动命令|选择 `start`；自定义命令可填 `node start.mjs`|
|应用端口|`3000`|
|外部映射端口|`3000`，或改成服务器空闲端口|
|包管理器|pnpm|
|端口外部访问|直接用 IP:端口访问时开启；使用本机反向代理时按代理网络配置|

上传包无需额外安装依赖，面板若自动执行 pnpm install，根目录依赖列表为空，不会安装构建工具。`start.mjs` 默认监听3000；可用环境变量或 `.env` 修改 `PORT`。环境变量优先于 `.env`。

复制运行包中的 `.env.example` 为 `.env`，将 `PUBLIC_ORIGIN` 改为真实域名或 IP:外部端口；HTTPS 访问设 `COOKIE_SECURE=true`。将 `DATA_DIR` 配置到**持久且可写的数据目录**（例如容器内 `/app/data`），并在面板做对应宿主目录挂载。更新版本继续挂载同一个目录，保留账户、历史及原件。第一次启动后设置管理员。

不要只上传 dist：本项目包含 BFF、SQLite 和 PDF 服务。也不要仅上传 .output，运行时还需要字体及公章资源。

## 工作台与报价版本

- 桌面编辑与真实 PDF 预览并排；手机分为客户信息、报价明细、核对发布三个步骤。
- 明细每次编辑20行，支持插入、复制、手动编号、删除及撤销。编号复制规则保留历史要求。
- 浏览器自动保存本机草稿；“保存草稿”将当前内容存入服务器，在历史报价中搜索、继续编辑、复制、归档或恢复。
- 保存与发布分开。发布创建不可变的版本快照、随机访客链接和永久保存的原始PDF。修改草稿不改变旧版本。
- 重新发布创建新版本和新链接；旧链接会提示历史版本。撤销某版本后，访客页面及PDF下载返回410。归档本身不会撤销链接。
- 访客只能读取拥有链接的报价版本，无法访问后台接口、历史列表或设置。链接适合私下发送给相关客户。
- 在“系统设置”填写在线访问地址，例如 https://quote.example.com。本机测试可填写当前 localhost 地址。已发布的二维码固定使用发布时的地址。
- 联系人/电话、询价单位保留独立下拉缓存，并从最近100份服务器报价补充建议；新输入仍然允许。
- HH 默认1%，FT 默认13%，可分别修改。录入单价为含税价，不重复加税。每行金额按分舍入，合计等于各行小计之和。

## PDF 与核验

PDFKit 直接绘制中文文字、矢量表格和水印；只有原始公章与二维码是图像。中文字体使用 Noto Sans SC，字体授权保存在 assets/fonts/LICENSE.txt，导出时嵌入字体子集。

- 以实际 A4 纸宽计算内容居中，表格、标题和页脚共用左右等宽边距（约15.2毫米）。
- 已验证30行短产品可放进一张 A4；文字换行和客户信息长度影响实际容量。
- 明细续页填满可用区域，“（有续表）”水平居中；公章在明细页右侧垂直居中，末页覆盖日期。
- 公章稳定随机旋转±60°，同一版本保持同一角度。
- 预览直接渲染服务器生成的文字 PDF，与导出使用同一排版。PDF.js 按需加载，只渲染当前一页；编辑停止1.2秒后更新预览。
- 正式PDF每页左上角放置小尺寸在线版本二维码（约14毫米）和细圆角边框，同时包含报价编号、版本和内容校验码。原始文件的 SHA-256 保存在数据库。
- 访客页面可以选择收到的PDF，在本机计算SHA-256并比对，不上传文件。该功能需要 HTTPS 或 localhost 安全环境。
- 水印可自定义或留空关闭。核验可以发现文件与服务器原件不一致；重新保存、压缩也可能改变文件哈希。图像公章和水印不属于证书数字签名。

## Docker 部署

Dockerfile 使用多阶段构建，只复制 Modern.js 独立产物、中文字体和公章。运行容器使用 Node.js 24，非 root 用户。Compose 默认一个进程、384MB内存上限，PDF同时只生成一份，SQLite缓存约2MB。内存上限不是占用承诺，需要在实际 Linux 服务器根据报价长度和并发测量调整。

```sh
cp .env.example .env
# 修改 PUBLIC_ORIGIN 为真实 HTTPS 域名
docker compose up -d --build
```

Compose 把8080端口绑定到本机127.0.0.1，适合在服务器前面加 Nginx/Caddy HTTPS反向代理。通过SSH端口转发完成第一次管理员设置，再让公网访问反向代理地址。应用中间件在BFF解析前限制请求体到1MB；反向代理也设置同样限制。

Nginx 反向代理示例（TLS证书与域名按实际部署配置）：

```nginx
location / {
  client_max_body_size 1m;
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

将 COOKIE_SECURE=true 用于HTTPS生产访问。TRUST_PROXY=true 只用于可信代理，登录限流才按代理传入的IP区分；默认所有来源共用每10分钟12次尝试的限制。

PUBLIC_ORIGIN 为固定外部域名。反向代理后保持 Host 正确；后台“在线访问地址”决定新版本二维码，PUBLIC_ORIGIN 决定会话与来源检查的部署默认值。

### 从 Docker Hub 更新

```sh
docker compose pull
docker compose up -d --no-build
```

保留 quotation-data 命名卷即可保留账户、历史报价、版本与PDF。不要使用 docker compose down -v 进行正常更新。

## GitHub Actions 发布 Docker Hub

工作流：.github/workflows/docker.yml。

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

|类型|名称|内容|
|---|---|---|
|Repository variable|DOCKERHUB_USERNAME|Docker Hub 用户名|
|Repository secret|DOCKERHUB_TOKEN|有目标仓库写入权限的Docker Hub访问令牌|
|Repository variable（可选）|DOCKERHUB_REPOSITORY|镜像仓库名，默认 srt-quotation|

在Docker Hub先创建对应镜像仓库。工作流会：

1. 锁定pnpm依赖，执行类型检查、单元测试、Modern.js部署构建以及Node.js集成测试。
2. 构建 linux/amd64 与 linux/arm64 两种镜像。
3. 默认分支推送 latest 和提交SHA标签；v2.0.0 等版本标签产生对应版本镜像。
4. pull request 仅构建和测试，不登录或推送；也可手动运行 workflow_dispatch。

在服务器 .env 将 DOCKER_IMAGE 设置为 用户名/srt-quotation:latest。令牌只放 GitHub Secrets，不写到源码、镜像或前端。此流程发布镜像；服务器更新执行上述拉取命令。

本机当前没有Docker命令，因此镜像构建与Docker Hub推送需要由该CI或安装Docker的服务器验证。

## 数据备份与恢复

默认 DATA_DIR=data。目录内容：

- quotation.sqlite：管理员密码哈希、会话、草稿、版本、设置和操作记录。
- quotation.sqlite-wal / quotation.sqlite-shm：SQLite运行时WAL文件。
- pdf/：已发布的不可变原始PDF，文件名为随机访问令牌。
- backups/：执行备份脚本时创建的快照目录。

运行时一致备份（使用 SQLite VACUUM INTO 创建完整快照，再复制原始PDF）：

```sh
node scripts/backup.mjs
# Docker 中
docker compose exec quotation node scripts/backup.mjs
```

Docker备份位于持久卷 /app/data/backups/时间戳。备份包含密码哈希、私有客户信息和版本访问令牌，应妥善保存。恢复时停掉服务，把备份中的 quotation.sqlite 和 pdf/ 放回 DATA_DIR，移走旧库对应的WAL/SHM文件后再启动。不要对正在运行的数据库直接替换文件。

后台“导出全部报价数据”是用于离线留档的JSON，不包含原始PDF文件或账户，完整恢复请使用目录备份。

## 验证记录与限制

- 15项报价/客户缓存/金额回归测试。
- Node.js 的生产BFF集成测试：单账户初始化、登录与退出、未登录访问隔离、来源校验、输入校验、并发草稿版本检查、发布不可变版本、撤销、文件哈希、请求体上限、独立部署产物、面板运行包和完整备份恢复。
- PDF经过文字提取和PNG渲染检查，包含中文可选中文字、30行单页与多页示例。
- Windows本机空闲生产服务约85MB工作集，Node.js 运行；不是Linux容器内存基准。服务端不启动浏览器。
- 当前Windows环境的浏览器自动化沙箱初始化失败，手机与桌面页面尚未通过实际浏览器视觉回归；构建、服务接口和PDF已验证。
- 应用按内部单管理员、单实例设计；SQLite持久卷不用于多个服务实例共享写入。
