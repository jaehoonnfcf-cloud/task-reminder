// 업무지시 텔레그램 알림 Edge Function (verify_jwt=false 로 배포, 내부에서 직접 인증)
// 필요한 시크릿: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function tg(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
async function notify(emails: string[], text: string) {
  const uniq = [...new Set(emails)];
  if (!uniq.length) return;
  const { data } = await db.from("telegram_links").select("chat_id").in("email", uniq).not("chat_id", "is", null);
  await Promise.all((data ?? []).map((r) => tg(r.chat_id, text)));
}
async function nameMap() {
  const { data } = await db.from("team_members").select("email, name");
  return new Map((data ?? []).map((r) => [r.email, r.name || r.email]));
}
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  // 1) 텔레그램 웹훅: 사용자가 봇에 /start <코드> 를 보내면 chat_id 연결
  if (req.headers.get("x-telegram-bot-api-secret-token")) {
    if (req.headers.get("x-telegram-bot-api-secret-token") !== Deno.env.get("TELEGRAM_WEBHOOK_SECRET")) return new Response("forbidden", { status: 403 });
    const u = await req.json();
    const msg = u.message;
    const m = msg?.text?.match(/^\/start\s+(\S+)/);
    if (m) {
      const { data } = await db.from("telegram_links").update({ chat_id: msg.chat.id, link_code: null }).eq("link_code", m[1]).select("email");
      await tg(msg.chat.id, data?.length ? "✅ 업무 알림이 연결되었습니다." : "연결 코드가 올바르지 않습니다. 페이지에서 다시 시도해주세요.");
    }
    return ok();
  }

  // 2) 정기 독촉 (pg_cron): 미완료 건을 담당자별로 모아 1통씩 발송
  if (req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
    const { data } = await db.from("work_task_assignees")
      .select("email, work_tasks!inner(title, due_date, directed_by)").is("done_at", null);
    const today = kstToday();
    const byUser = new Map<string, string[]>();
    for (const r of data ?? []) {
      const t = (r as any).work_tasks;
      const tag = !t.due_date ? "" : t.due_date < today ? ` 🔴기한초과(${t.due_date})` : t.due_date === today ? " 🟠오늘마감" : ` (~${t.due_date})`;
      byUser.set(r.email, [...(byUser.get(r.email) ?? []), `• ${t.title}${tag}`]);
    }
    for (const [email, lines] of byUser) await notify([email], `⏰ 미처리 업무 ${lines.length}건\n${lines.join("\n")}`);
    return ok({ users: byUser.size });
  }

  // 3) 페이지에서 호출: 신규 등록 / 완료 이벤트 (로그인 JWT 로 본인 확인)
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: au } = await db.auth.getUser(jwt);
  const me = au?.user?.email;
  if (!me) return new Response("unauthorized", { status: 401 });
  const { event, task_id } = await req.json();
  const { data: task } = await db.from("work_tasks").select("*").eq("id", task_id).single();
  const { data: asg } = await db.from("work_task_assignees").select("email, done_at").eq("task_id", task_id);
  if (!task || !asg) return new Response("not found", { status: 404 });
  const names = await nameMap();
  const who = (e: string) => names.get(e) ?? e;

  if (event === "created" && task.created_by === me) {
    const due = task.due_date ? `\n기한: ${task.due_date}` : "";
    const by = task.directed_by ? `\n지시: ${task.directed_by}` : "";
    await notify(asg.map((a) => a.email).filter((e) => e !== me), `📌 새 업무지시\n${task.title}${by}${due}`);
  } else if (event === "done" && asg.some((a) => a.email === me)) {
    const all = asg.every((a) => a.done_at);
    const others = [task.created_by, ...asg.map((a) => a.email)].filter((e) => e !== me);
    await notify(others, all ? `🎉 전원 완료: ${task.title}` : `✅ ${who(me)} 완료: ${task.title}`);
  } else return new Response("bad request", { status: 400 });
  return ok();
});
