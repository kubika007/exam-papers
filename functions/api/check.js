/**
 * POST /api/check  (需管理员 Bearer Token)
 * 用于前端验证口令是否正确
 */
export async function onRequestPost({ request, env }) {
  const auth = request.headers.get("Authorization") || "";
  const expected = "Bearer " + (env.ADMIN_TOKEN || "");
  if (auth === expected) {
    return Response.json({ ok: true });
  }
  return new Response("口令错误", { status: 401 });
}
