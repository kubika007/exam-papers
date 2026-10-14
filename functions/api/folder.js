/**
 * POST /api/folder  (需管理员 Bearer Token)
 * 新建文件夹。KV 里没有真正的空文件夹，用占位符 `.keep` 实现，
 * 有文件放进来自动就是正式文件夹，删空后文件夹自动消失。
 * body(JSON): { "prefix": "papers/语文/2026年下半年/10月/" }
 */
function authorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return auth === "Bearer " + (env.ADMIN_TOKEN || "");
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) {
    return new Response("未授权：请检查管理员口令", { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("JSON 解析失败", { status: 400 });
  }

  const prefix = (body.prefix || "").toString();
  const parts = prefix.split("/").filter(Boolean);
  // papers / 科目 / 学期 / 文件夹名 → 至少 4 段
  if (parts.length < 4 || parts[0] !== "papers") {
    return new Response("非法文件夹路径", { status: 400 });
  }
  const name = parts[parts.length - 1];
  if (/[\\/:*?"<>|]/.test(name) || name === ".keep") {
    return new Response("文件夹名含非法字符", { status: 400 });
  }

  try {
    await env.PAPERS.put(prefix + ".keep", "", { metadata: { created: new Date().toISOString() } });
    return Response.json({ ok: true, prefix });
  } catch (e) {
    return new Response("创建失败：" + e.message, { status: 500 });
  }
}
