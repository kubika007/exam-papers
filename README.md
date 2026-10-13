# 试卷库（Exam Papers）

一个跑在 **Cloudflare Pages + R2** 上的静态网站，用来按 **科目 → 学期 → 试卷** 归档并下载每次考试的各科试卷。老师打开网页点几下就能下载；管理员登录口令后可直接在网页上传 / 删除试卷，无需懂代码。

## 功能

- 🏠 主页：以卡片形式列出所有科目，点一下进入
- 📁 学期：进入科目后弹出以「学期」为单位的文件夹，例如 `2025-2026 上学期`
- 📄 试卷：进入学期后列出该学期所有试卷，点「下载」即可保存
- 🔐 管理后台：右上角「管理 / 上传」，输入口令后可网页上传（支持多文件）、新建科目、删除试卷
- 💾 文件存于 Cloudflare R2，下载走 Cloudflare 边缘节点，速度快、无流量费

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

R2 中的文件按此结构存放：
```
papers/{科目}/{学期}/{文件名}
例：papers/语文/2025-2026 上学期/期中考试.pdf
```

---

## 部署步骤（Cloudflare Pages + GitHub）

本项目已推送到 https://github.com/kubika007/exam-papers ，直接连接部署即可。

### 1. 创建 R2 存储桶

Cloudflare 控制台 → **存储和数据库 → R2** → 创建存储桶，名字填 `exam-papers`。
（或直接命令行：`npx wrangler r2 bucket create exam-papers`）

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

### 4. 给 Pages 项目绑定 R2 存储桶（必须）

Cloudflare 控制台 → **Workers 和 Pages** → 选 `exam-papers` →
**设置 → 函数 → R2 存储桶绑定** → 添加：

- 变量名称：`PAPERS`
- 关联存储桶：`exam-papers`

### 5. 设置管理员口令

控制台路径：**Workers 和 Pages** → `exam-papers` → **设置 → 环境变量**
添加变量 `ADMIN_TOKEN`，值为你要设置的口令（如 `wodeMima2026`）。

命令行方式替代：`npx wrangler pages secret put ADMIN_TOKEN --project-name exam-papers`

### 6. 重新部署

回到 **部署** 页签点「重试部署」，或直接在 GitHub 上推一个空 commit 触发。
成功后会得到 `https://exam-papers.pages.dev`（以及每次 PR/分支的预览地址）。

> 修改 R2 绑定和环境变量后即时生效，无需重新构建。

---

## 可选：不从 GitHub 部署（命令行直传）

```bash
npx wrangler login
npx wrangler pages deploy public --project-name exam-papers
```

之后仍需按第 4、5 步在控制台绑定 R2 和设置 `ADMIN_TOKEN`。

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

### 删除试卷
以管理员身份打开某学期，每份试卷右侧会出现「删除」按钮（二次确认后删除）。

---

## 安全提示

- `ADMIN_TOKEN` 是上传 / 删除的唯一门槛，请设置足够复杂的口令，且不要外泄。
- 任何拿到口令的人都能上传 / 删除试卷；如需多管理员或审计，可在此基础上扩展。
- R2 标准版对下载（出网）免费，仅按存储量计费，试卷量级下几乎为零成本。
- 预览 UI（无需后端）：本地用任意静态服务器打开 `public/index.html`，并在网址后加 `?demo=1`。
