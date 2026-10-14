/**
 * POST /api/upload-zip  (需管理员 Bearer Token) —— 兜底方案
 * 浏览器本地解压失败时，把整个 .zip 传上来，由服务端解压并自动识别 年级/科目/学期。
 * 表单字段：file(单个 zip)、grade(可选，统一覆盖)、semester(可选，统一覆盖)
 * 注意：Workers 免费层每请求 CPU 约 10ms，所以限制 300 个条目 / 解压后 60MB。
 */
import { parseZip, classify, semesters } from "../_zip.js";

const MAX_SIZE = 25 * 1024 * 1024; // 单份写入 KV 的上限

function authorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return auth === "Bearer " + (env.ADMIN_TOKEN || "");
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) {
    return new Response("未授权：请检查管理员口令", { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return new Response("表单解析失败", { status: 400 });
  }

  const file = form.get("file");
  const bulkGrade = (form.get("grade") || "").toString().trim();
  const bulkSemester = (form.get("semester") || "").toString().trim();
  if (!file) return new Response("没有收到压缩包", { status: 400 });

  let entries;
  try {
    entries = await parseZip(await file.arrayBuffer());
  } catch (e) {
    return new Response("解压失败：" + e.message, { status: 400 });
  }
  if (!entries.length) return new Response("压缩包里没有可用文件", { status: 400 });

  const list = semesters(2024);
  const results = [];
  const failed = [];
  for (const e of entries) {
    const g = classify(e.name, null, bulkSemester, list);
    const subject = g.subject || "未分类";
    const semester = g.semester;
    const grade = bulkGrade || g.grade;
    const key = `papers/${subject}/${semester}/${e.base}`;
    if (e.data.byteLength > MAX_SIZE) {
      failed.push({ name: e.base, reason: "超过 25MB" });
      continue;
    }
    try {
      await env.PAPERS.put(key, e.data, {
        metadata: {
          size: e.data.byteLength,
          type: guessType(e.base),
          grade: grade,
          subject: subject,
          semester: semester,
          uploaded: new Date().toISOString(),
        },
      });
      results.push({ key, name: e.base, grade, subject, semester });
    } catch (err) {
      failed.push({ name: e.base, reason: err.message });
    }
  }

  return Response.json({ ok: true, count: results.length, results, failed });
}

function guessType(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    zip: "application/zip", rar: "application/x-rar-compressed",
  };
  return map[ext] || "application/octet-stream";
}
