# 试卷库（Exam Papers）

一个跑在 **Cloudflare Pages + Workers KV** 上的静态网站，用来按 **科目 → 学期 → 试卷** 归档并下载每次考试的各科试卷。老师打开网页点几下就能下载；管理员登录口令后可直接在网页上传 / 删除试卷，无需懂代码。

- 🌐 **线上地址：https://exam-papers.pages.dev**
- 📦 源码仓库：https://github.com/kubika007/exam-papers （推 `main` 即自动重新部署）
- 🔑 管理口令：`exam2026`（在控制台「设置 → 环境变量」里改）

> 💳 **全程免费、不需要绑定银行卡**。试卷存在 Workers KV（免费层 1GB），而不是 R2——R2 虽免费但必须绑信用卡/PayPal 才能开通。

## 功能

- 🏠 主页：以卡片形式列出所有科目，点一下进入
- 📁 学期：进入科目后弹出以「学期」为单位的文件夹，例如 `2025-2026 上学期`
- 📄 试卷：进入学期后列出该学期所有试卷，点「下载」即可保存
- 🔐 管理后台：右上角「管理 / 上传」，输入口令后可网页上传（支持多文件）、新建科目、删除试卷
- 💾 文件存于 Workers KV，下载走 Cloudflare 全球边缘节点

## 目录结构

```
exam-papers/
├── public/                 # 前端静态文件（Cloudflare Pages 托管）
│   ├── index.html          # 页面结构
│   ├── styles.css          # 样式
│   └── app.js              # 前端逻辑（浏览 + 上传）
├── functions/api/          # 后端（Cloudflare Pages Functions，无需自建服务器）
│   ├── list.js             # 列出某科目 / 学期下的内容
│   ├── download.js         # 下载试卷
│   ├── upload.js           # 上传试卷（需口令）
│   ├── delete.js           # 删除试卷（需口令）
│   └── check.js            # 校验口令
├── wrangler.toml           # Cloudflare 配置
└── README.md
```

KV 中的 key 按此结构存放：
```
papers/{科目}/{学期}/{文件名}
例：papers/语文/2025-2026 上学期/期中考试.pdf
```

## 容量说明（KV 免费层）

| 项 | 上限 |
|---|---|
| 总存储 | **1 GB**（约可放 200~500 份试卷PDF） |
| 单份文件 | **25 MB** |
| 读操作 | 每天约 100 万次（远超学校使用量） |
| 写操作 | 每天 1000 次（够用） |

超过 1GB 后需清理旧试卷，或升级付费方案（付费才需要绑卡）。

---

## 部署步骤（Cloudflare Pages + GitHub，无需银行卡）

本项目已推送到 https://github.com/kubika007/exam-papers ，直接连接部署即可。

### 1. 创建 KV 命名空间

Cloudflare 控制台 → **存储和数据库 → Workers KV** → 创建命名空间，名字填 `exam-papers`。

> KV 属于 Workers 免费层，开通过程**不会要求绑卡**（如果页面要你绑卡，说明点到的是 R2 或其他付费服务，请确认路径是 Workers KV）。

### 2. 创建 Pages 项目并连接 GitHub

Cloudflare 控制台 → **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**
选择仓库 `kubika007/exam-papers`，生产分支选 `main`。

### 3. 构建设置（⚠️ 关键，配错会构建失败）

| 项目 | 填什么 |
|---|---|
| 框架预设 | **无 / None** |
| 构建命令 | **留空** |
| 部署命令 | **留空**（若有该字段） |
| 构建输出目录 | **public** |
| 根路径 / Root directory | 留空 |

> **常见坑**：不要把部署命令填成 `npx wrangler deploy`。那是给 **Workers** 用的，在 Pages 项目上会报
> `Missing entry-point to Worker script or to assets directory`。
> 本仓库是「静态文件 + `functions/` 目录」，Pages 会自动托管 `public/` 并自动识别 `functions/` 作为后端，**不需要任何构建或 wrangler 命令**。

### 4. 给 Pages 项目绑定 KV 命名空间（必须）

**推荐做法（持久）**：直接写在仓库根目录的 `wrangler.toml` 里——

```toml
[[kv_namespaces]]
binding = "PAPERS"
id = "你的 KV 命名空间 ID"
```

或者在控制台：**Workers 和 Pages** → 选 `exam-papers` →
**设置 → 函数 → KV 命名空间绑定** → 添加：变量名称 `PAPERS`、命名空间 `exam-papers`。

> ⚠️ **最大的坑**：Pages 每次构建都会读取仓库里的 `wrangler.toml`，**并用它覆盖通过控制台/API 设置的绑定**。
> 也就是说：只在控制台点绑定，下一次 push 触发构建后就会被清掉，表现为
> `/api/list` 返回 `Cannot read properties of undefined (reading 'list')`。
> 所以 KV 绑定请写在 `wrangler.toml` 里；而口令 `ADMIN_TOKEN` 是密钥、不能进仓库，只能在控制台/API 设（密钥不会被覆盖）。

### 5. 设置管理员口令

控制台路径：**Workers 和 Pages** → `exam-papers` → **设置 → 环境变量**
添加变量 `ADMIN_TOKEN`，值为你要设置的口令（如 `wodeMima2026`）。

### 6. 重新部署

回到 **部署** 页签点「重试部署」，或直接在 GitHub 上推一个空 commit 触发。
成功后会得到 `https://exam-papers.pages.dev`。

> 修改 KV 绑定和环境变量后即时生效，无需重新构建（前提是第 3 步配置正确，能正常部署）。

---

## 日常使用

### 老师（浏览 / 下载）
打开网站 → 点科目 → 点学期 → 点试卷旁的「下载」。

### 管理员（上传试卷）
1. 点右上角「管理 / 上传」
2. 输入第 5 步设置的口令，点「保存」
3. 选科目（或勾选「新建科目」填新科目名）、填学期（如 `2025-2026 上学期`）
4. 选择试卷文件（可一次选多个）→ 点「上传」
5. 回到主页刷新即可看到新试卷

> 提示：KV 写入是全球异步生效的，极端情况下上传后最多几十秒才能在列表里看到，刷新即可。

### 删除试卷
以管理员身份打开某学期，每份试卷右侧会出现「删除」按钮（二次确认后删除）。

---

## 安全提示

- `ADMIN_TOKEN` 是上传 / 删除的唯一门槛，请设置足够复杂的口令，且不要外泄。
- 任何拿到口令的人都能上传 / 删除试卷；如需多管理员或审计，可在此基础上扩展。
- Workers KV 免费层不需要绑卡；只有当超出免费额度、主动升级付费方案时才需要提供支付方式。
- 预览 UI（无需后端）：本地用任意静态服务器打开 `public/index.html`，并在网址后加 `?demo=1`。
