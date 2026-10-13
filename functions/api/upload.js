/**
 * POST /api/upload  (需管理员 Bearer Token)
 * 表单字段：subject, semester, file(可多个)
 * 存入 KV 键：papers/{subject}/{semester}/{filename}
 * 注意 Workers KV 单条上限 25MB，超大文件会被拒绝
 */
const MAX_SIZE = 25 * 1024 * 1024; // 25MB（KV 上限）

function authorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const expected = "Bearer " + (env.ADMIN_TOKEN || "");
  return auth === expected;
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

  const subject = (form.get("subject") || "").toString().trim();
  const semester = (form.get("semester") || "").toString().trim();
  const files = form.getAll("file");

  if (!subject || !semester) {
    return new Response("缺少 subject 或 semester", { status: 400 });
  }
  if (!files.length || !files[0]) {
    return new Response("没有收到文件", { status: 400 });
  }

  const results = [];
  for (const file of files) {
    const rawName = (file.name || "file").split(/[\\/]/).pop();
    if (file.size > MAX_SIZE) {
      return new Response(
        `${rawName} 超过 25MB（Workers KV 单条上限），请压缩后重试`,
        { status: 413 }
      );
    }
    const key = `papers/${subject}/${semester}/${rawName}`;
    const buf = await file.arrayBuffer();
    await env.PAPERS.put(key, buf, {
      metadata: {
        size: file.size,
        type: file.type || "application/octet-stream",
        uploaded: new Date().toISOString(),
      },
    });
    results.push({ key, name: rawName });
  }

  return Response.json({ ok: true, count: results.length, results });
}
