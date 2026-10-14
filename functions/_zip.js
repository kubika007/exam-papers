/**
 * 服务端 ZIP 解析 + 自动识别（供 /api/upload-zip 兜底使用）
 * 文件名以 _ 开头，Pages Functions 不会把它当成路由暴露出去。
 * 正常情况前端已在浏览器本地解压，这里只在本地解压失败时兜底。
 */

const GRADE_RULES = [
  ["七年级", /七年级|七年|初一|7年级|七上|七下/],
  ["八年级", /八年级|八年|初二|8年级|八上|八下/],
  ["九年级", /九年级|九年|初三|9年级|九上|九下/],
];

const SUBJECT_ALIASES = {
  "语文": ["语文"],
  "数学": ["数学"],
  "英语": ["英语", "外语"],
  "道德与法治": ["道德与法治", "道法", "政治", "思想品德", "思品"],
  "历史": ["历史"],
  "生物": ["生物"],
  "地理": ["地理"],
  "物理": ["物理"],
  "化学": ["化学"],
};

const DEFAULT_SUBJECTS = Object.keys(SUBJECT_ALIASES);

function decodeName(bytes, flags) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (flags & 0x800) return utf8;
  try {
    const gbk = new TextDecoder("gbk").decode(bytes);
    if (gbk.indexOf("\uFFFD") === -1) return gbk;
  } catch (e) { /* Workers 不支持 gbk 时回退 */ }
  return utf8;
}

async function inflateRaw(comp) {
  const ds = new DecompressionStream("deflate-raw");
  const res = new Response(new Blob([comp]).stream().pipeThrough(ds));
  return new Uint8Array(await res.arrayBuffer());
}

/** 解析 ZIP，返回 [{ name, base, data(Uint8Array) }] */
export async function parseZip(arrayBuffer, maxEntries = 300, maxTotal = 60 * 1024 * 1024) {
  const dv = new DataView(arrayBuffer);
  const u8 = new Uint8Array(arrayBuffer);

  let eocd = -1;
  const min = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP 压缩包");

  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < total && i < maxEntries; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decodeName(u8.subarray(p + 46, p + 46 + nameLen), flags);
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const out = [];
  let totalSize = 0;
  for (const e of entries) {
    if (e.name.endsWith("/") || e.name.indexOf("__MACOSX") >= 0) continue;
    const base = e.name.split("/").pop();
    if (!base || base.startsWith(".") || base.startsWith("~$")) continue;
    if (e.method !== 0 && e.method !== 8) continue;

    const lNameLen = dv.getUint16(e.localOffset + 26, true);
    const lExtraLen = dv.getUint16(e.localOffset + 28, true);
    const start = e.localOffset + 30 + lNameLen + lExtraLen;
    const comp = u8.subarray(start, start + e.compSize);
    const data = e.method === 0 ? new Uint8Array(comp) : await inflateRaw(comp);

    totalSize += data.byteLength;
    if (totalSize > maxTotal) throw new Error("压缩包解压后超过 60MB，请分批上传");
    out.push({ name: e.name, base, data });
  }
  return out;
}

export function semesters(startYear) {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const from = startYear || 2024;
  const out = [];
  for (let yy = from; yy <= y; yy++) {
    out.push(yy + "年上半年");
    if (yy < y || m >= 7) out.push(yy + "年下半年");
  }
  return out;
}

export function currentSemester(list) {
  const l = list && list.length ? list : semesters();
  return l[l.length - 1];
}

export function detectGrade(text) {
  for (const [g, re] of GRADE_RULES) if (re.test(text)) return g;
  return "";
}

export function detectSubject(text, subjects) {
  const list = subjects && subjects.length ? subjects : DEFAULT_SUBJECTS;
  for (const s of list) {
    for (const a of (SUBJECT_ALIASES[s] || [s])) if (text.indexOf(a) >= 0) return s;
  }
  return "";
}

export function detectSemester(text, list) {
  const l = list && list.length ? list : semesters();
  const t = String(text || "").replace(/\s+/g, " ");
  let year = null;
  const my = t.match(/(20\d{2})\s*年/) || t.match(/(20\d{2})/);
  if (my) year = +my[1];
  let half = "";
  if (/下半年|下学期|春季/.test(t)) half = "下半年";
  else if (/上半年|上学期|秋季/.test(t)) half = "上半年";

  const cur = currentSemester(l);
  const inList = (s) => (l.indexOf(s) >= 0 ? s : null);
  if (year !== null && half) {
    const s = year + "年" + half;
    return inList(s) || (year < parseInt(l[0], 10) ? l[0] : cur);
  }
  if (year !== null) {
    const s = year + "年" + cur.slice(5);
    return inList(s) || (year < parseInt(l[0], 10) ? l[0] : cur);
  }
  if (half) {
    const s = cur.slice(0, 4) + "年" + half;
    return inList(s) || cur;
  }
  return cur;
}

export function classify(path, subjects, fallbackSemester, semesterList) {
  const list = semesterList && semesterList.length ? semesterList : semesters();
  return {
    grade: detectGrade(path),
    subject: detectSubject(path, subjects),
    semester: fallbackSemester && String(fallbackSemester).trim()
      ? String(fallbackSemester).trim()
      : detectSemester(path, list),
  };
}
