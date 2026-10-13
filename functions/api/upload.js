/**
 * POST /api/upload  (需管理员 Bearer Token)
 * 表单字段：subject, semester, file(可多个)
 * 存入 R2 键：papers/{subject}/{semester}/{filename}
 */
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
    // 仅取文件名，去掉可能带有的路径
    const rawName = (file.name || "file").split(/[\\/]/).pop();
    const key = `papers/${subject}/${semester}/${rawName}`;
    await env.PAPERS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    results.push({ key, name: rawName });
  }

  return Response.json({ ok: true, count: results.length, results });
}
