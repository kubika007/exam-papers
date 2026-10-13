/* ===========================================================
   试卷库 前端逻辑
   - 浏览：科目 → 学期 → 试卷（点击下载）
   - 管理：登录口令后可在网页直接上传 / 删除试卷
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
const SUBJECT_EMOJI = Object.fromEntries(SUBJECTS.map((s) => [s.name, s.emoji]));
const FALLBACK_EMOJI = "📘";

/* ---------- demo 数据 ---------- */
const DEMO_DATA = {
  "语文": { "2025-2026 上学期": ["第一次月考.pdf", "期中考试.pdf", "期末考试.pdf"],
            "2025-2026 下学期": ["第一次月考.pdf"] },
  "数学": { "2025-2026 上学期": ["第一次月考.pdf", "期中考试.pdf"] },
  "英语": { "2025-2026 上学期": ["听力测试.pdf", "期中考试.pdf", "期末考试.pdf"] },
  "道德与法治": { "2025-2026 上学期": ["期中考试.pdf"] },
  "历史": { "2025-2026 上学期": ["期末考试.pdf"] },
  "生物": { "2025-2026 上学期": ["期中考试.pdf"] },
  "地理": { "2025-2026 上学期": ["第一次月考.pdf"] },
  "物理": { "2025-2026 上学期": ["期中考试.pdf"] },
  "化学": { "2025-2026 上学期": ["期末考试.pdf"] },
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
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

/* ---------- 后端调用 ---------- */
async function apiList(prefix) {
  if (DEMO) return demoList(prefix);
  const url = apiBase + "/api/list?prefix=" + encodeURIComponent(prefix) + "&delimiter=/";
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

async function demoList(prefix) {
  // 仅用于 ?demo=1 预览
  await new Promise((r) => setTimeout(r, 200));
  if (prefix === "papers/") {
    return {
      prefixes: Object.keys(DEMO_DATA).map((s) => "papers/" + s + "/"),
      objects: [],
    };
  }
  const m = prefix.match(/^papers\/(.+?)\/$/);
  if (m) {
    const sub = m[1];
    const sems = Object.keys(DEMO_DATA[sub] || {});
    return {
      prefixes: sems.map((s) => "papers/" + sub + "/" + s + "/"),
      objects: [],
    };
  }
  const m2 = prefix.match(/^papers\/(.+?)\/(.+?)\/$/);
  if (m2) {
    const sub = m2[1], sem = m2[2];
    const files = (DEMO_DATA[sub] && DEMO_DATA[sub][sem]) || [];
    return {
      prefixes: [],
      objects: files.map((f, i) => ({
        key: "papers/" + sub + "/" + sem + "/" + f,
        size: 120000 + i * 30000,
        uploaded: new Date().toISOString(),
      })),
    };
  }
  return { prefixes: [], objects: [] };
}

/* ---------- 渲染：科目首页 ---------- */
async function effectiveSubjects() {
  // 预设科目始终展示；再合并 R2 中已存在、但不在预设里的科目
  let discovered = [];
  try {
    const data = await apiList("papers/");
    discovered = data.prefixes.map((p) => p.replace(/^papers\//, "").replace(/\/$/, ""));
  } catch (e) { /* 预览/demo 或后端不可用时忽略 */ }
  const seen = new Set();
  const out = [];
  SUBJECTS.forEach((s) => { if (!seen.has(s.name)) { seen.add(s.name); out.push(s.name); } });
  discovered.forEach((s) => { if (!seen.has(s)) { seen.add(s); out.push(s); } });
  return out;
}

async function renderSubjects() {
  const box = $("#subjects");
  box.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  const subjects = await effectiveSubjects();
  $("#countHint").textContent = `共 ${subjects.length} 个科目`;
  box.innerHTML = "";
  subjects.forEach((s) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<span class="emoji">${SUBJECT_EMOJI[s] || FALLBACK_EMOJI}</span>
      <div class="name">${escapeHtml(s)}</div>`;
    card.onclick = () => openSubject(s);
    box.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  if (!state.subject) { c.innerHTML = "全部科目"; return; }
  if (!state.semester) {
    c.innerHTML = `<a data-go="root">全部科目</a><span class="sep">/</span><b>${escapeHtml(state.subject)}</b>`;
  } else {
    c.innerHTML = `<a data-go="root">全部科目</a><span class="sep">/</span>` +
      `<a data-go="subject">${escapeHtml(state.subject)}</a><span class="sep">/</span><b>${escapeHtml(state.semester)}</b>`;
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
      body.innerHTML = '<div class="empty">该科目下还没有学期文件夹。</div>';
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

async function openSemester(semester) {
  state.semester = semester;
  renderCrumb();
  const body = $("#modalBody");
  body.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  try {
    const data = await apiList("papers/" + state.subject + "/" + semester + "/");
    const papers = data.objects;
    if (!papers.length) {
      body.innerHTML = '<div class="empty">这个学期还没有试卷。</div>';
      return;
    }
    body.innerHTML = "";
    papers.forEach((obj) => {
      const name = obj.key.split("/").pop();
      const row = document.createElement("div");
      row.className = "row";
      const del = isAdmin()
        ? `<button class="btn danger small act-del">删除</button>` : "";
      row.innerHTML = `<div class="left"><span class="ico">📄</span>
          <span class="title">${escapeHtml(name)}</span><span class="size">${fmtSize(obj.size)}</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <a class="btn small act-dl" href="${apiBase}/api/download?key=${encodeURIComponent(obj.key)}">下载</a>
          ${del}
        </div>`;
      row.querySelector(".act-dl").onclick = (ev) => {
        // 用 location 触发浏览器下载（保留后端 Content-Disposition）
        ev.preventDefault();
        window.location.href = apiBase + "/api/download?key=" + encodeURIComponent(obj.key);
      };
      const delBtn = row.querySelector(".act-del");
      if (delBtn) delBtn.onclick = () => deletePaper(obj.key);
      body.appendChild(row);
    });
  } catch (e) {
    body.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

async function deletePaper(key) {
  if (!confirm("确定删除这份试卷？此操作不可恢复。")) return;
  try {
    await apiDelete(key);
    toast("已删除");
    openSemester(state.semester); // 刷新
  } catch (e) {
    toast("删除失败：" + e.message, true);
  }
}

/* ---------- 管理员面板 ---------- */
function openAdmin() {
  $("#adminPanel").classList.remove("hidden");
  refreshTokenUI();
  loadSubjectsIntoSelect();
}
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

async function loadSubjectsIntoSelect() {
  const sel = $("#upSubject");
  const subjects = await effectiveSubjects();
  sel.innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
}

/* ---------- 上传 ---------- */
async function doUpload() {
  if (!isAdmin()) { toast("请先保存管理员口令", true); return; }
  const newToggle = $("#upSubjectNewToggle").checked;
  let subject = newToggle ? $("#upSubjectNew").value.trim() : $("#upSubject").value;
  const semester = $("#upSemester").value.trim();
  const files = $("#upFiles").files;

  if (!subject) { toast("请填写科目", true); return; }
  if (!semester) { toast("请填写学期", true); return; }
  if (!files.length) { toast("请选择试卷文件", true); return; }

  const log = $("#uploadLog");
  log.innerHTML = "";
  $("#uploadBtn").disabled = true;

  for (const file of files) {
    const item = document.createElement("div");
    item.className = "item";
    item.textContent = "上传中：" + file.name;
    log.appendChild(item);
    try {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("semester", semester);
      fd.append("file", file);
      const res = await fetch(apiBase + "/api/upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + token() },
        body: fd,
      });
      if (!res.ok) {
        const msg = res.status === 401 ? "口令错误或无权限" : "上传失败 " + res.status;
        throw new Error(msg);
      }
      item.className = "item ok";
      item.textContent = "✓ " + file.name;
    } catch (e) {
      item.className = "item err";
      item.textContent = "✗ " + file.name + "（" + e.message + "）";
    }
  }
  $("#uploadBtn").disabled = false;
  toast("上传完成");
  loadSubjectsIntoSelect();
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

  $("#upSubjectNewToggle").onchange = (e) => {
    $("#upSubjectNew").classList.toggle("hidden", !e.target.checked);
  };

  $("#uploadBtn").onclick = doUpload;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeAdmin(); }
  });

  refreshTokenUI();
  renderSubjects();
}

document.addEventListener("DOMContentLoaded", init);
