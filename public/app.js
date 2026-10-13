/* ===========================================================
   试卷库 前端逻辑
   - 浏览：科目 → 学期 → 试卷（点击下载），年级作为筛选器
   - 上传：支持 .zip 压缩包，自动解压并识别 年级 / 科目 / 学期，可逐条修改
   - 未识别的文件归入「未分类」，管理员可在网页上补填信息并归类
   - 同一来源（Cloudflare Pages）调用 /api/* ，无需跨域配置
   - 在网址后加 ?demo=1 可离线预览 UI（不依赖后端）
   =========================================================== */

const DEMO = new URLSearchParams(location.search).has("demo");

// 预设科目：按你们学校实际科目，顺序即主页展示顺序
const SUBJECTS = [
  { name: "语文", emoji: "📖" },
  { name: "数学", emoji: "🔢" },
  { name: "英语", emoji: "🔤" },
  { name: "道德与法治", emoji: "⚖️" },
  { name: "历史", emoji: "📜" },
  { name: "生物", emoji: "🧬" },
  { name: "地理", emoji: "🌏" },
  { name: "物理", emoji: "🔭" },
  { name: "化学", emoji: "🧪" },
];
const UNCLASSIFIED = "未分类";
const GRADES = ["七年级", "八年级", "九年级"];
const SUBJECT_EMOJI = Object.fromEntries(SUBJECTS.map((s) => [s.name, s.emoji]));
SUBJECT_EMOJI[UNCLASSIFIED] = "📥";
const FALLBACK_EMOJI = "📘";

/* ---------- demo 数据 ---------- */
const DEMO_DATA = {
  "语文": { "2025-2026 上学期": [["第一次月考.pdf", "七年级"], ["期中考试.pdf", "八年级"], ["期末考试.pdf", "九年级"]] },
  "数学": { "2025-2026 上学期": [["第一次月考.pdf", "七年级"], ["期中考试.pdf", ""]] },
  "英语": { "2025-2026 上学期": [["听力测试.pdf", "八年级"], ["期末考试.pdf", "九年级"]] },
  "道德与法治": { "2025-2026 上学期": [["期中考试.pdf", "七年级"]] },
  "历史": { "2025-2026 上学期": [["期末考试.pdf", "八年级"]] },
  "生物": { "2025-2026 上学期": [["期中考试.pdf", "七年级"]] },
  "地理": { "2025-2026 上学期": [["第一次月考.pdf", "八年级"]] },
  "物理": { "2025-2026 上学期": [["期中考试.pdf", "九年级"]] },
  "化学": { "2025-2026 上学期": [["期末考试.pdf", "九年级"]] },
  "未分类": { "2025-2026 上学期": [["扫描件001.pdf", ""]] },
};

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const apiBase = ""; // 同源
function token() { return localStorage.getItem("exam_admin_token") || ""; }
function isAdmin() { return token().length > 0; }

function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- 后端调用 ---------- */
async function apiList(prefix) {
  if (DEMO) return demoList(prefix);
  const url = apiBase + "/api/list?prefix=" + encodeURIComponent(prefix);
  const res = await fetch(url);
  if (!res.ok) throw new Error("列表加载失败 " + res.status);
  return res.json();
}

async function apiDelete(key) {
  const res = await fetch(apiBase + "/api/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error("删除失败 " + res.status);
  return res.json();
}

async function apiMove(from, subject, semester, grade) {
  const to = `papers/${subject}/${semester}/${from.split("/").pop()}`;
  const res = await fetch(apiBase + "/api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
    body: JSON.stringify({ from, to, grade }),
  });
  if (!res.ok) throw new Error("归类失败 " + res.status);
  return res.json();
}

async function demoList(prefix) {
  await new Promise((r) => setTimeout(r, 200));
  if (prefix === "papers/") {
    return { prefixes: Object.keys(DEMO_DATA).map((s) => "papers/" + s + "/"), objects: [] };
  }
  const m = prefix.match(/^papers\/(.+?)\/$/);
  if (m) {
    const sems = Object.keys(DEMO_DATA[m[1]] || {});
    return { prefixes: sems.map((s) => "papers/" + m[1] + "/" + s + "/"), objects: [] };
  }
  const m2 = prefix.match(/^papers\/(.+?)\/(.+?)\/$/);
  if (m2) {
    const files = (DEMO_DATA[m2[1]] && DEMO_DATA[m2[1]][m2[2]]) || [];
    return {
      prefixes: [],
      objects: files.map(([f, g], i) => ({
        key: "papers/" + m2[1] + "/" + m2[2] + "/" + f,
        size: 120000 + i * 30000,
        uploaded: new Date().toISOString(),
        grade: g,
      })),
    };
  }
  return { prefixes: [], objects: [] };
}

/* ---------- 年级筛选 ---------- */
let gradeFilter = ""; // "" 全部；"__none__" 未标年级

function matchGrade(g) {
  if (!gradeFilter) return true;
  if (gradeFilter === "__none__") return !g;
  return g === gradeFilter;
}

function renderFilterTip() {
  const tip = $("#filterTip");
  tip.textContent = gradeFilter
    ? "仅显示" + (gradeFilter === "__none__" ? "未标年级" : gradeFilter) + "的试卷"
    : "";
}

/* ---------- 渲染：科目首页 ---------- */
async function effectiveSubjects() {
  // 预设科目始终展示；再合并 KV 中已存在、但不在预设里的科目；末尾固定放「未分类」
  let discovered = [];
  try {
    const data = await apiList("papers/");
    discovered = data.prefixes.map((p) => p.replace(/^papers\//, "").replace(/\/$/, ""));
  } catch (e) { /* demo 或后端不可用时忽略 */ }
  const seen = new Set();
  const out = [];
  SUBJECTS.forEach((s) => { if (!seen.has(s.name)) { seen.add(s.name); out.push(s.name); } });
  discovered.forEach((s) => { if (!seen.has(s) && s !== UNCLASSIFIED) { seen.add(s); out.push(s); } });
  if (!seen.has(UNCLASSIFIED)) out.push(UNCLASSIFIED);
  return out;
}

let SUBJECT_LIST = SUBJECTS.map((s) => s.name).concat([UNCLASSIFIED]);

async function renderSubjects() {
  const box = $("#subjects");
  box.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  const subjects = await effectiveSubjects();
  SUBJECT_LIST = subjects;
  $("#countHint").textContent = `共 ${subjects.length} 个科目`;
  box.innerHTML = "";
  subjects.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card" + (s === UNCLASSIFIED ? " card-unclassified" : "");
    card.innerHTML = `<span class="emoji">${SUBJECT_EMOJI[s] || FALLBACK_EMOJI}</span>
      <div class="name">${escapeHtml(s)}</div>`;
    card.onclick = () => openSubject(s);
    box.appendChild(card);
  });
}

/* ---------- 弹窗：学期 / 试卷 ---------- */
let state = { subject: null, semester: null };

function openModal() {
  $("#modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modal").classList.add("hidden");
  document.body.style.overflow = "";
  state = { subject: null, semester: null };
}

function renderCrumb() {
  const c = $("#crumb");
  const gTag = gradeFilter
    ? `<span class="crumb-tag">${escapeHtml(gradeFilter === "__none__" ? "未标年级" : gradeFilter)}</span>` : "";
  if (!state.subject) { c.innerHTML = "全部科目" + gTag; return; }
  if (!state.semester) {
    c.innerHTML = `<a data-go="root">全部科目</a><span class="sep">/</span><b>${escapeHtml(state.subject)}</b>` + gTag;
  } else {
    c.innerHTML = `<a data-go="root">全部科目</a><span class="sep">/</span>` +
      `<a data-go="subject">${escapeHtml(state.subject)}</a><span class="sep">/</span><b>${escapeHtml(state.semester)}</b>` + gTag;
  }
  c.querySelectorAll("a").forEach((a) => {
    a.onclick = () => {
      const go = a.getAttribute("data-go");
      if (go === "root") { state = { subject: null, semester: null }; renderSubjects(); openSubject(null); }
      if (go === "subject") { state.semester = null; openSubject(state.subject); }
    };
  });
}

async function openSubject(subject) {
  if (subject) state.subject = subject;
  openModal();
  renderCrumb();
  const body = $("#modalBody");
  body.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  try {
    const data = await apiList("papers/" + state.subject + "/");
    const sems = data.prefixes.map((p) => p.split("/").filter(Boolean).pop());
    if (!sems.length) {
      body.innerHTML = state.subject === UNCLASSIFIED
        ? '<div class="empty">没有待归类的试卷，压缩包里识别不出科目的文件会出现在这里。</div>'
        : '<div class="empty">该科目下还没有学期文件夹。</div>';
      return;
    }
    body.innerHTML = "";
    sems.forEach((sem) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div class="left"><span class="ico">📁</span><span class="title">${escapeHtml(sem)}</span></div>
        <span class="btn ghost small">打开 ›</span>`;
      row.onclick = () => openSemester(sem);
      body.appendChild(row);
    });
  } catch (e) {
    body.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function gradeBadge(g) {
  return g
    ? `<span class="badge">${escapeHtml(g)}</span>`
    : `<span class="badge badge-none">未标年级</span>`;
}

async function openSemester(semester) {
  state.semester = semester;
  renderCrumb();
  const body = $("#modalBody");
  body.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  try {
    const data = await apiList("papers/" + state.subject + "/" + semester + "/");
    const all = data.objects || [];
    const papers = all.filter((o) => matchGrade(o.grade));
    if (!papers.length) {
      body.innerHTML = gradeFilter
        ? '<div class="empty">当前年级筛选下没有试卷，切换上方「年级」试试。</div>'
        : '<div class="empty">这个学期还没有试卷。</div>';
      return;
    }
    body.innerHTML = "";
    papers.forEach((obj) => {
      const name = obj.key.split("/").pop();
      const row = document.createElement("div");
      row.className = "row";
      const del = isAdmin() ? `<button class="btn danger small act-del">删除</button>` : "";
      const fix = isAdmin() ? `<button class="btn ghost small act-fix">归类</button>` : "";
      row.innerHTML = `<div class="left"><span class="ico">📄</span>
          <span class="title">${escapeHtml(name)}</span>
          ${gradeBadge(obj.grade)}
          <span class="size">${fmtSize(obj.size)}</span></div>
        <div class="row-actions">
          <a class="btn small act-dl" href="${apiBase}/api/download?key=${encodeURIComponent(obj.key)}">下载</a>
          ${fix}${del}
        </div>`;
      row.querySelector(".act-dl").onclick = (ev) => {
        ev.preventDefault();
        window.location.href = apiBase + "/api/download?key=" + encodeURIComponent(obj.key);
      };
      const delBtn = row.querySelector(".act-del");
      if (delBtn) delBtn.onclick = () => deletePaper(obj.key);
      const fixBtn = row.querySelector(".act-fix");
      if (fixBtn) fixBtn.onclick = () => startReclassify(row, obj);
      body.appendChild(row);
    });
  } catch (e) {
    body.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- 归类（把文件移到正确的 科目/学期，并补填年级） ---------- */
function startReclassify(row, obj) {
  const name = obj.key.split("/").pop();
  const editor = document.createElement("div");
  editor.className = "row row-edit";
  editor.innerHTML = `
    <div class="edit-grid">
      <span class="edit-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <select class="text-input small edit-grade">
        <option value="">年级…</option>
        ${GRADES.map((g) => `<option value="${g}"${obj.grade === g ? " selected" : ""}>${g}</option>`).join("")}
      </select>
      <select class="text-input small edit-subject">
        ${SUBJECT_LIST.map((s) => `<option value="${escapeHtml(s)}"${state.subject === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>
      <input class="text-input small edit-semester" type="text" value="${escapeHtml(state.semester || "")}" placeholder="学期" />
      <button class="btn small primary edit-save">保存</button>
      <button class="btn ghost small edit-cancel">取消</button>
    </div>`;
  row.replaceWith(editor);
  editor.querySelector(".edit-cancel").onclick = () => openSemester(state.semester);
  editor.querySelector(".edit-save").onclick = async () => {
    const grade = editor.querySelector(".edit-grade").value;
    const subject = editor.querySelector(".edit-subject").value;
    const semester = editor.querySelector(".edit-semester").value.trim();
    if (!subject || !semester) { toast("请填写科目和学期", true); return; }
    try {
      await apiMove(obj.key, subject, semester, grade);
      toast("已归类到 " + subject + " / " + semester);
      openSemester(state.semester);
    } catch (e) { toast(e.message, true); }
  };
}

async function deletePaper(key) {
  if (!confirm("确定删除这份试卷？此操作不可恢复。")) return;
  try {
    await apiDelete(key);
    toast("已删除");
    openSemester(state.semester);
  } catch (e) {
    toast("删除失败：" + e.message, true);
  }
}

/* ---------- 管理员面板 ---------- */
function openAdmin() { $("#adminPanel").classList.remove("hidden"); refreshTokenUI(); }
function closeAdmin() { $("#adminPanel").classList.add("hidden"); }

function refreshTokenUI() {
  const t = token();
  const status = $("#tokenStatus");
  if (t) {
    status.textContent = "✓ 已保存管理员口令";
    status.className = "token-status ok";
    $("#uploadBtn").disabled = false;
  } else {
    status.textContent = "请先输入并保存口令";
    status.className = "token-status bad";
    $("#uploadBtn").disabled = true;
  }
}

/* ---------- 待上传清单 ---------- */
let pending = []; // [{name, blob, grade, subject, semester}]

function subjectOptions(selected) {
  return SUBJECT_LIST.map((s) =>
    `<option value="${escapeHtml(s)}"${s === selected ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")
    + `<option value="__new__">＋ 新科目…</option>`;
}

function gradeOptions(selected) {
  return `<option value=""${!selected ? " selected" : ""}>未标年级</option>` +
    GRADES.map((g) => `<option value="${g}"${g === selected ? " selected" : ""}>${g}</option>`).join("");
}

function renderReview() {
  const box = $("#reviewBox");
  const list = $("#reviewList");
  if (!pending.length) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const un = pending.filter((p) => p.subject === UNCLASSIFIED || !p.grade).length;
  $("#reviewCount").innerHTML = `共 <b>${pending.length}</b> 份` +
    (un ? `，其中 <b class="warn">${un}</b> 份未识别完整（将进入「未分类 / 未标年级」）` : "");

  list.innerHTML = "";
  pending.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "rev-row" + (p.subject === UNCLASSIFIED || !p.grade ? " rev-warn" : "");
    row.innerHTML = `
      <span class="rev-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
      <select class="text-input tiny" data-i="${i}" data-f="grade">${gradeOptions(p.grade)}</select>
      <select class="text-input tiny" data-i="${i}" data-f="subject">${subjectOptions(p.subject)}</select>
      <input class="text-input tiny" data-i="${i}" data-f="semester" value="${escapeHtml(p.semester)}" />
      <button class="icon-btn" data-del="${i}" title="移除">✕</button>`;
    list.appendChild(row);
  });

  list.querySelectorAll("select, input").forEach((el) => {
    el.onchange = () => {
      const i = +el.getAttribute("data-i");
      const f = el.getAttribute("data-f");
      if (f === "subject" && el.value === "__new__") {
        const v = prompt("输入新科目名称");
        if (!v || !v.trim()) { renderReview(); return; }
        const name = v.trim();
        if (!SUBJECT_LIST.includes(name)) SUBJECT_LIST.splice(SUBJECT_LIST.length - 1, 0, name);
        pending[i].subject = name;
        renderReview();
        return;
      }
      pending[i][f] = el.value;
      if (f === "semester") renderReview();
      else rowStateRefresh(i, el);
    };
  });
  list.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => { pending.splice(+b.getAttribute("data-del"), 1); renderReview(); };
  });
}

function rowStateRefresh(i, el) {
  const row = el.closest(".rev-row");
  const p = pending[i];
  row.classList.toggle("rev-warn", p.subject === UNCLASSIFIED || !p.grade);
}

async function buildPending(fileList) {
  const bulkGrade = $("#bulkGrade").value;
  const bulkSemester = $("#bulkSemester").value.trim();
  const files = Array.from(fileList || []);
  let added = 0, zips = 0;

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      zips++;
      try {
        const entries = await SmartZip.unzip(file);
        for (const e of entries) {
          const guess = SmartZip.classify(e.name, SUBJECT_LIST, bulkSemester);
          pending.push({
            name: e.base,
            blob: e.data,
            grade: bulkGrade || guess.grade,
            subject: guess.subject || UNCLASSIFIED,
            semester: guess.semester,
          });
          added++;
        }
      } catch (err) {
        toast(file.name + " 解压失败：" + err.message, true);
      }
    } else {
      const guess = SmartZip.classify(file.name, SUBJECT_LIST, bulkSemester);
      pending.push({
        name: file.name,
        blob: file,
        grade: bulkGrade || guess.grade,
        subject: guess.subject || UNCLASSIFIED,
        semester: guess.semester,
      });
      added++;
    }
  }
  renderReview();
  if (added) toast(zips ? `已解析 ${zips} 个压缩包，共 ${added} 份文件` : `已加入 ${added} 份文件`);
}

/* ---------- 上传 ---------- */
async function doUpload() {
  if (!isAdmin()) { toast("请先保存管理员口令", true); return; }
  if (!pending.length) { toast("请先选择文件或压缩包", true); return; }

  const log = $("#uploadLog");
  log.innerHTML = "";
  $("#uploadBtn").disabled = true;

  let okCount = 0;
  for (const p of pending) {
    const item = document.createElement("div");
    item.className = "item";
    item.textContent = "上传中：" + p.name;
    log.appendChild(item);
    try {
      const fd = new FormData();
      fd.append("subject", p.subject);
      fd.append("semester", p.semester || SmartZip.currentSemester());
      fd.append("grade", p.grade || "");
      fd.append("file", p.blob, p.name);
      const res = await fetch(apiBase + "/api/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token() },
        body: fd,
      });
      if (!res.ok) throw new Error(res.status === 401 ? "口令错误或无权限" : "上传失败 " + res.status);
      item.className = "item ok";
      item.textContent = "✓ " + p.name + "　" + (p.grade || "未标年级") + " · " + p.subject + " · " + p.semester;
      okCount++;
    } catch (e) {
      item.className = "item err";
      item.textContent = "✗ " + p.name + "（" + e.message + "）";
    }
  }

  $("#uploadBtn").disabled = false;
  toast(`上传完成：成功 ${okCount} / ${pending.length}`);
  pending = [];
  renderReview();
  $("#upFiles").value = "";
  renderSubjects();
}

/* ---------- 初始化 ---------- */
function init() {
  $("#adminBtn").onclick = openAdmin;
  $("#closeAdmin").onclick = closeAdmin;
  $("#closeModal").onclick = closeModal;
  $("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };

  $("#saveToken").onclick = () => {
    const v = $("#tokenInput").value.trim();
    if (!v) { toast("口令不能为空", true); return; }
    localStorage.setItem("exam_admin_token", v);
    refreshTokenUI();
    toast("口令已保存");
  };

  $("#upFiles").onchange = (e) => buildPending(e.target.files);
  $("#clearPending").onclick = () => { pending = []; renderReview(); $("#upFiles").value = ""; };
  $("#uploadBtn").onclick = doUpload;

  $("#gradeFilter").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    gradeFilter = chip.getAttribute("data-grade");
    $("#gradeFilter").querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderFilterTip();
    if (state.subject && state.semester) openSemester(state.semester);
    else if (state.subject) openSubject(state.subject);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeAdmin(); }
  });

  refreshTokenUI();
  renderFilterTip();
  renderSubjects();
}

document.addEventListener("DOMContentLoaded", init);
