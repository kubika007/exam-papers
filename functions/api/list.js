/**
 * GET /api/list?prefix=papers/&delimiter=/
 * 列出 R2 中某前缀下的「文件夹」(prefixes) 与「文件」(objects)
 * 用于逐级浏览：科目 → 学期 → 试卷
 */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "papers/";
  const delimiter = url.searchParams.get("delimiter") || "/";
  const limit = Number(url.searchParams.get("limit") || 1000);

  try {
    const listed = await env.PAPERS.list({ prefix, delimiter, limit });
    const objects = listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
    }));
    return Response.json({
      prefixes: listed.prefixes || [],
      objects,
      truncated: listed.truncated || false,
    });
  } catch (e) {
    return Response.json({ error: String(e.message) }, { status: 500 });
  }
}
