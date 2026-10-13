/**
 * GET /api/download?key=papers/语文/2025-2026 上学期/期中考试.pdf
 * 从 KV 取回文件并以「附件」方式触发浏览器下载（保留中文文件名）
 */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return new Response("缺少 key", { status: 400 });

  try {
    const { value, metadata } = await env.PAPERS.getWithMetadata(key, "arrayBuffer");
    if (!value) return new Response("文件不存在", { status: 404 });

    const filename = key.split("/").pop();
    const meta = metadata || {};
    const contentType = meta.type || "application/octet-stream";

    return new Response(value, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition":
          `attachment; filename="${encodeURIComponent(filename)}"; ` +
          `filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response("下载失败：" + e.message, { status: 500 });
  }
}
