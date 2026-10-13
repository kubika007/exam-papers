/**
 * GET /api/list?prefix=papers/
 * 列出 KV 中某前缀下的「文件夹」(prefixes) 与「文件」(objects)
 * KV 没有 delimiter 概念，这里按 key 的层级自行归纳，保证前端用法不变。
 */
async function collectKeys(kv, prefix, maxKeys = 5000) {
  let cursor = null;
  const keys = [];
  do {
    const res = await kv.list({ prefix, limit: 1000, cursor: cursor || undefined });
    for (const k of res.keys) keys.push(k);
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor && keys.length < maxKeys);
  return keys;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "papers/";

  try {
    const keys = await collectKeys(env.PAPERS, prefix);
    const prefixes = new Set();
    const objects = [];

    for (const k of keys) {
      const rel = k.name.slice(prefix.length);
      if (rel.includes("/")) {
        // 属于下一层文件夹
        const folder = rel.split("/")[0];
        prefixes.add(prefix + folder + "/");
      } else {
        const meta = k.metadata || {};
        objects.push({
          key: k.name,
          size: meta.size,
          uploaded: meta.uploaded,
        });
      }
    }

    return Response.json({
      prefixes: [...prefixes].sort(),
      objects,
    });
  } catch (e) {
    return Response.json({ error: String(e.message) }, { status: 500 });
  }
}
