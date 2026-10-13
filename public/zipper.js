/* ===========================================================
   压缩包解析 + 年级 / 科目 / 学期 自动识别
   - 解压在浏览器本地完成（不占用 Cloudflare 的 CPU 时间，避免超时被杀）
   - 识别规则同时看「压缩包内的文件夹路径」和「文件名」
   =========================================================== */
(function () {
  "use strict";

  /* ---------- ZIP 解析 ---------- */
  function decodeName(bytes, flags) {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    if (flags & 0x800) return utf8;              // ZIP 明确标记 UTF-8
    try {                                        // Windows 压缩的中文名常是 GBK
      const gbk = new TextDecoder("gbk").decode(bytes);
      if (gbk.indexOf("\uFFFD") === -1) return gbk;
    } catch (e) { /* 浏览器不支持 GBK 时回退 */ }
    return utf8;
  }

  async function inflateRaw(comp) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("当前浏览器不支持解压，请用新版 Chrome / Edge");
    }
    const ds = new DecompressionStream("deflate-raw");
    const res = new Response(new Blob([comp]).stream().pipeThrough(ds));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** 解压 ZIP，返回 [{ name(包内完整路径), base(文件名), data(Uint8Array) }] */
  async function unzip(file, maxEntries = 500) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);

    // 定位 End Of Central Directory
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
    for (const e of entries) {
      if (e.name.endsWith("/")) continue;                 // 目录
      if (e.name.indexOf("__MACOSX") >= 0) continue;      // macOS 垃圾文件
      const base = e.name.split("/").pop();
      if (!base || base.startsWith(".") || base.startsWith("~$")) continue;
      if (e.method !== 0 && e.method !== 8) continue;     // 只处理 存储 / deflate

      const lNameLen = dv.getUint16(e.localOffset + 26, true);
      const lExtraLen = dv.getUint16(e.localOffset + 28, true);
      const start = e.localOffset + 30 + lNameLen + lExtraLen;
      const comp = u8.subarray(start, start + e.compSize);
      const data = e.method === 0 ? new Uint8Array(comp) : await inflateRaw(comp);

      out.push({ name: e.name, base, data: new Blob([data]) });
    }
    return out;
  }

  /* ---------- 自动识别 ---------- */
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

  function detectGrade(text) {
    for (const [grade, re] of GRADE_RULES) if (re.test(text)) return grade;
    return "";
  }

  function detectSubject(text, subjects) {
    const list = subjects && subjects.length ? subjects : Object.keys(SUBJECT_ALIASES);
    for (const s of list) {
      const aliases = SUBJECT_ALIASES[s] || [s];
      for (const a of aliases) if (text.indexOf(a) >= 0) return s;
    }
    return "";
  }

  /** 按当前日期推算默认学年，如 2026-02 → "2025-2026 下学期" */
  function currentSemester() {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (m >= 9) return (y) + "-" + (y + 1) + " 上学期";
    if (m <= 1) return (y - 1) + "-" + y + " 上学期";
    return (y - 1) + "-" + y + " 下学期";
  }

  function detectSemester(text) {
    const t = String(text || "").replace(/\s+/g, " ");
    let range = null;
    const m1 = t.match(/(20\d{2})\s*[-–—~]\s*(20\d{2})/);
    if (m1) range = m1[1] + "-" + m1[2];
    if (!range) {
      const m2 = t.match(/(20\d{2})\s*[-–—~]\s*(\d{2})\b/);
      if (m2) range = m2[1] + "-" + m2[1].slice(0, 2) + m2[2];
    }
    let half = "";
    if (/下学期|春季/.test(t)) half = "下学期";
    else if (/上学期|秋季/.test(t)) half = "上学期";
    if (range && half) return range + " " + half;
    if (range) return range + " 上学期";
    if (half) return currentSemester().replace(/ (上|下)学期$/, " " + half);
    return currentSemester();
  }

  /** 综合识别：返回 {grade, subject, semester}，识别不到则为空串 / 未分类 */
  function classify(path, subjects, fallbackSemester) {
    const text = String(path || "");
    return {
      grade: detectGrade(text),
      subject: detectSubject(text, subjects),
      semester: fallbackSemester && fallbackSemester.trim()
        ? fallbackSemester.trim()
        : detectSemester(text),
    };
  }

  window.SmartZip = { unzip, classify, detectGrade, detectSubject, detectSemester, currentSemester };
})();
