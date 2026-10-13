/**
 * POST /api/move  (需管理员 Bearer Token)
 * 把「未分类 / 识别错误」的试卷移到正确的 科目/学期，并补填年级
 * body(JSON): { "from": "papers/未分类/2025-2026 上学期/a.pdf",
 *               "to":   "papers/语文/2025-2026 上学期/a.pdf",
 *               "grade": "八年级" }
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

  const from = (body.from || "").toString();
  const to = (body.to || "").toString();
  const grade = (body.grade || "").toString();

  if (!from.startsWith("papers/") || !to.startsWith("papers/")) {
    return new Response("非法 key", { status: 400 });
  }
  if (from === to) {
    return new Response("目标位置与当前位置相同", { status: 400 });
  }

  try {
    const { value, metadata } = await env.PAPERS.getWithMetadata(from, "arrayBuffer");
    if (value === null) return new Response("源文件不存在", { status: 404 });

    // 目标路径的科目 / 学期顺带写进 metadata，便于后续检索
    const parts = to.split("/");
    const subject = parts[1] || "";
    const semester = parts[2] || "";

    await env.PAPERS.put(to, value, {
      metadata: {
        ...(metadata || {}),
        grade: grade,
        subject: subject,
        semester: semester,
        moved: new Date().toISOString(),
      },
    });
    await env.PAPERS.delete(from);
    return Response.json({ ok: true, from, to, grade });
  } catch (e) {
    return new Response("归类失败：" + e.message, { status: 500 });
  }
}
