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

## 部署步骤（新 Cloudflare 账号）

> 全程在命令行完成，约 5 分钟。需要本机已装 Node.js（建议 18+）。

### 1. 安装并登录 Wrangler

```bash
npm install -g wrangler
wrangler login          # 浏览器打开，登录你的新 Cloudflare 账号
```

### 2. 创建 R2 存储桶

```bash
wrangler r2 bucket create exam-papers
```

### 3. 部署前端 + 后端函数

在 `exam-papers/` 目录内执行：

```bash
wrangler pages deploy public --project-name exam-papers
```

首次会询问「关联已有项目 / 新建项目」，选新建即可。部署完成后会得到一个 `*.pages.dev` 网址。

### 4. 给 Pages 项目绑定 R2 存储桶（必须）

登录 Cloudflare 控制台 → **Workers 和 Pages** → 选 `exam-papers` →
**设置 → 函数 → R2 存储桶绑定** → 添加：

- 变量名称填：`PAPERS`
- 关联存储桶选：`exam-papers`

（Pages 的 R2 绑定目前只能在控制台设置，无法用命令行。）

### 5. 设置管理员口令

```bash
wrangler pages secret put ADMIN_TOKEN --project-name exam-papers
```

> 输入一串只有你自己知道的密码（例如 `wodeMima2026`）。这就是网页「管理 / 上传」里要填的口令。

### 6. 完工 🎉

打开第 3 步得到的 `https://exam-papers.pages.dev` 即可使用。
（设置完绑定 / 密钥后，函数即时生效，无需重新部署。）

---

## 可选：用 GitHub 自动部署

如果你更习惯「推代码就自动上线」：

1. 在 GitHub 新建仓库，把本文件夹内容推上去
2. Cloudflare 控制台 → Workers 和 Pages → 创建 → 连接 Git 仓库 → 选该仓库
3. 构建设置：框架预设选「无」，构建输出目录填 `public`
4. 仍须在控制台给项目绑定 R2（`PAPERS`）并设置 `ADMIN_TOKEN` 密钥
5. 之后每次 `git push` 都会自动重新部署

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
- 预览 UI（无需后端）：本地用任意静态服务器打开 `public/index.html` 并在网址后加 `?demo=1`。
```
