/**
 * POST /api/delete  (需管理员 Bearer Token)
 * body(JSON): { "key": "papers/语文/2025-2026 上学期/期中考试.pdf" }
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
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("JSON 解析失败", { status: 400 });
  }
  const key = (body.key || "").toString();
  if (!key.startsWith("papers/")) {
    return new Response("非法 key", { status: 400 });
  }
  try {
    await env.PAPERS.delete(key);
    return Response.json({ ok: true, key });
  } catch (e) {
    return new Response("删除失败：" + e.message, { status: 500 });
  }
}
