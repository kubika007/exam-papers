/**
 * POST /api/delete  (需管理员 Bearer Token)
 * 两种用法：
 *   body(JSON): { "key":    "papers/语文/2026年下半年/期中考试.pdf" }  → 删除单个文件
 *   body(JSON): { "prefix": "papers/语文/2026年下半年/" }             → 删除整个文件夹（含其中所有文件）
 */
async function collectKeys(kv, prefix, maxKeys = 5000) {
  let cursor = null;
  const keys = [];
  do {
    const res = await kv.list({ prefix, limit: 1000, cursor: cursor || undefined });
    for (const k of res.keys) keys.push(k.name);
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor && keys.length < maxKeys);
  return keys;
}

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

  const prefix = (body.prefix || "").toString();
  if (prefix) {
    if (!prefix.startsWith("papers/") || !prefix.endsWith("/")) {
      return new Response("非法 prefix", { status: 400 });
    }
    if (prefix === "papers/") {
      return new Response("拒绝：不允许删除全部科目", { status: 400 });
    }
    try {
      const keys = await collectKeys(env.PAPERS, prefix);
      for (const k of keys) await env.PAPERS.delete(k);
      return Response.json({ ok: true, prefix, deleted: keys.length });
    } catch (e) {
      return new Response("删除文件夹失败：" + e.message, { status: 500 });
    }
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
