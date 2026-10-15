// 업무 텔레그램 알림 Edge Function (verify_jwt=false 로 배포, 내부에서 직접 인증)
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

// 브라우저(페이지)에서 호출하므로 CORS 허용이 필요하다 (없으면 preflight 에서 막혀 알림이 가지 않음)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function handle(req: Request): Promise<Response> {
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
    const today = kstToday();
    const dueTag = (d: string | null) => !d ? "" : d < today ? ` 🔴기한초과(${d})` : d === today ? " 🟠오늘마감" : ` (~${d})`;
    const byUser = new Map<string, string[]>();
    const add = (email: string, line: string) => byUser.set(email, [...(byUser.get(email) ?? []), line]);
    // 일반업무: 담당자별 미완료
    const { data } = await db.from("work_task_assignees")
      .select("email, work_tasks!inner(title, due_date, task_type)").is("done_at", null).eq("work_tasks.task_type", "general");
    for (const r of data ?? []) {
      const t = (r as any).work_tasks;
      add(r.email, `• ${t.title}${dueTag(t.due_date)}`);
    }
    // 대출진행: 현재 단계 안내 (담당자 전원에게)
    const { data: loans } = await db.from("work_tasks")
      .select("title, due_date, work_task_assignees(email), work_task_steps(seq, name, done_at)").eq("task_type", "loan");
    for (const t of loans ?? []) {
      const steps = [...(t as any).work_task_steps].sort((a: any, b: any) => a.seq - b.seq);
      const cur = steps.find((x: any) => !x.done_at);
      if (!cur) continue;
      for (const a of (t as any).work_task_assignees) add(a.email, `• [대출] ${t.title} — ${cur.name} 진행중 (${cur.seq}/${steps.length})${dueTag(t.due_date)}`);
    }
    for (const [email, lines] of byUser) await notify([email], `⏰ 아직 남은 업무가 ${lines.length}건 있어요\n${lines.join("\n")}`);
    return ok({ users: byUser.size });
  }

  // 3) 페이지에서 호출: 신규 등록 / 완료 이벤트 (로그인 JWT 로 본인 확인)
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: au } = await db.auth.getUser(jwt);
  const me = au?.user?.email;
  if (!me) return new Response("unauthorized", { status: 401 });
  const body = await req.json();
  const { event, task_id, seq } = body;
  const { data: task } = await db.from("work_tasks").select("*").eq("id", task_id).single();
  const { data: asg } = await db.from("work_task_assignees").select("email, done_at").eq("task_id", task_id);
  const { data: stepRows } = await db.from("work_task_steps").select("seq, name, done_at").eq("task_id", task_id).order("seq");
  const steps = stepRows ?? [];
  if (!task || !asg) return new Response("not found", { status: 404 });
  const names = await nameMap();
  const who = (e: string) => names.get(e) ?? e;

  const due = task.due_date ? `\n기한: ${task.due_date}` : "";
  const by = task.directed_by ? `\n요청: ${task.directed_by}` : "";
  const cur = steps.find((x) => !x.done_at);
  const everyone = [task.created_by, ...asg.map((a) => a.email)];   // 누른 사람 본인 포함
  const newHead = task.task_type === "loan" ? `📌 새 대출 업무가 도착했어요\n${task.title}${cur ? `\n현재 단계: ${cur.name}` : ""}` : `📌 새 할 일이 도착했어요\n${task.title}`;

  if (event === "created" && task.created_by === me) {
    await notify(everyone, `${newHead}${by}${due}`);
  } else if (event === "updated" && (task.created_by === me || asg.some((a) => a.email === me))) {
    // 새로 추가된 담당자에게는 신규 안내, 기존 담당자에게는 수정 안내
    const added: string[] = (body.added ?? []).filter((e: string) => asg.some((a) => a.email === e));
    if (added.length) await notify(added, `${newHead}${by}${due}`);
    if (body.changed) {
      const rest = everyone.filter((e) => !added.includes(e));
      await notify(rest, `✏️ 업무 내용이 바뀌었어요\n${task.title}${by}${due}\n수정: ${who(me)}님`);
    }
  } else if (event === "step_done" && task.task_type === "loan" && (task.created_by === me || asg.some((a) => a.email === me))) {
    const step = steps.find((x) => x.seq === seq);
    if (!step?.done_at) return new Response("bad request", { status: 400 });
    const next = steps.find((x) => !x.done_at);
    await notify(everyone, next
      ? `✅ [대출] ${task.title}\n${who(me)}님이 ${step.name}을(를) 완료했어요 → 다음 단계: ${next.name} (${next.seq}/${steps.length})`
      : `🎉 [대출] ${task.title}\n모든 단계를 마쳤어요 (${step.name} 완료)`);
  } else if (event === "step_undo" && task.task_type === "loan" && (task.created_by === me || asg.some((a) => a.email === me))) {
    const step = steps.find((x) => x.seq === seq);
    if (!step || step.done_at) return new Response("bad request", { status: 400 });
    await notify(everyone, `↩ [대출] ${task.title}\n${who(me)}님이 ${step.name} 완료를 취소했어요 → 현재 단계: ${cur ? cur.name : step.name}`);
  } else if (event === "done" && asg.some((a) => a.email === me)) {
    const all = asg.every((a) => a.done_at);
    await notify(everyone, all ? `🎉 모두 완료했어요\n${task.title}` : `✅ ${who(me)}님이 완료했어요\n${task.title}`);
  } else return new Response("bad request", { status: 400 });
  return ok();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const res = await handle(req);
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
});
