// 업무 텔레그램 알림 Edge Function (verify_jwt=false 로 배포, 내부에서 직접 인증)
// 필요한 시크릿: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const won = (n?: number) => {
  if (n === undefined || n === null) return "-";
  if (!n) return "0원";
  const e = Math.floor(n / 1e8), m = Math.floor((n % 1e8) / 1e4), r = n % 1e4;
  return [e && `${e}억`, m && `${m.toLocaleString("ko-KR")}만`, r && `${r.toLocaleString("ko-KR")}`].filter(Boolean).join(" ") + "원";
};
const rangeText = (nos: number[]) => {
  const out: string[] = []; let i = 0;
  while (i < nos.length) { let j = i; while (j + 1 < nos.length && nos[j + 1] === nos[j] + 1) j++; out.push(j > i ? `${nos[i]}~${nos[j]}` : `${nos[i]}`); i = j + 1; }
  return out.join("·");
};
const sc = (v?: string | null) => (v ? `[${v}]` : "");
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
    const SECTIONS = ["여신", "수신/기타", "개인"];
    const byUser = new Map<string, Record<string, string[]>>();
    const add = (email: string, sec: string, line: string) => {
      const u = byUser.get(email) ?? {};
      (u[sec] ??= []).push(line);
      byUser.set(email, u);
    };
    // 일반업무: 담당자별 미완료
    const { data } = await db.from("work_task_assignees")
      .select("email, work_tasks!inner(title, due_date, task_type, division, scope)").is("done_at", null).eq("work_tasks.task_type", "general");
    for (const r of data ?? []) {
      const t = (r as any).work_tasks;
      add(r.email, t.division === "deposit" ? "수신/기타" : "여신", `• ${sc(t.scope)} ${t.title}${dueTag(t.due_date)}`);
    }
    // 대출진행: 현재 단계 안내 (담당자 전원에게)
    const { data: loans } = await db.from("work_tasks")
      .select("title, due_date, scope, work_task_assignees(email), work_task_steps(seq, name, done_at)").eq("task_type", "loan").is("dropped_at", null);   // 미진행 업무는 알림 제외
    for (const t of loans ?? []) {
      const steps = [...(t as any).work_task_steps].sort((a: any, b: any) => a.seq - b.seq);
      const cur = steps.find((x: any) => !x.done_at);
      if (!cur) continue;
      for (const a of (t as any).work_task_assignees) add(a.email, "여신", `• [대출]${sc(t.scope)} ${t.title} — ${cur.name} 진행중 (${cur.seq}/${steps.length})${dueTag(t.due_date)}`);
    }
    // 개인업무 (본인에게만): 고정업무 다음 회차를 먼저 만들고, 알림 시작일(기한 - 알림 일수)이 된 미완료 건을 안내
    await db.rpc("gen_personal_occurrences");
    const dayMs = 864e5, t0 = Date.parse(today);
    const { data: pers } = await db.from("personal_tasks")
      .select("owner_email, title, due_date, lead_days, recurring_id").is("done_at", null).not("due_date", "is", null);
    for (const t of pers ?? []) {
      const diff = Math.round((Date.parse(t.due_date) - t0) / dayMs);   // 음수 = 기한 지남
      if (diff > t.lead_days) continue;
      const tag = diff < 0 ? ` 🔴기한초과(${t.due_date})` : diff === 0 ? " 🟠오늘마감" : ` (D-${diff})`;
      add(t.owner_email, "개인", `• ${t.recurring_id ? "[고정] " : ""}${t.title}${tag}`);
    }
    for (const [email, secs] of byUser) {
      const total = SECTIONS.reduce((n, k) => n + (secs[k]?.length ?? 0), 0);
      const blocks = SECTIONS.filter((k) => secs[k]?.length).map((k) => `■ ${k} (${secs[k].length})\n${secs[k].join("\n")}`);
      await notify([email], `⏰ 아직 남은 업무가 ${total}건 있어요\n\n${blocks.join("\n\n")}`);
    }
    return ok({ users: byUser.size });
  }

  // 3) 페이지에서 호출: 신규 등록 / 완료 이벤트 (로그인 JWT 로 본인 확인)
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: au } = await db.auth.getUser(jwt);
  const me = au?.user?.email;
  if (!me) return new Response("unauthorized", { status: 401 });
  const body = await req.json();
  const { event, task_id, seq } = body;

  // 감정평가 알림: 의뢰 등록 / 가격 입력 / 채택 → 해당 건에서 체크한 사람에게만
  if (typeof event === "string" && event.startsWith("appraisal_")) {
    const { data: pm } = await db.from("team_members").select("perm_appraisal, is_admin").eq("email", me).maybeSingle();
    if (!pm || !(pm.is_admin || pm.perm_appraisal)) return new Response("forbidden", { status: 403 });
    const { data: c } = await db.from("appraisal_cases")
      .select("*, appraisal_properties(*), appraisal_requests(*, appraisal_prices(*))").eq("id", body.case_id).single();
    if (!c) return new Response("not found", { status: 404 });
    const { data: firms } = await db.from("appraisal_firms").select("id, name");
    const fname = (id: number) => (firms ?? []).find((f) => f.id === id)?.name ?? "?";
    const names = await nameMap();
    const who = (e: string) => names.get(e) ?? e;
    const props = [...c.appraisal_properties].sort((a: any, b: any) => a.seq - b.seq);
    const tag = `[감정평가]${sc(c.scope)}`;
    const to: string[] = c.notify_emails ?? [];
    if (event === "appraisal_created") {
      const first = props[0];
      await notify(to, `📌 ${tag} 새 감정평가 의뢰가 등록됐어요\n채무자: ${c.debtor_name}${c.handling_type ? `\n취급구분: ${c.handling_type === "기타" && c.handling_note ? `기타 (${c.handling_note})` : c.handling_type}` : ""}${c.loan_amount !== null && c.loan_amount !== undefined ? `\n대출신청금액: ${won(Number(c.loan_amount))}` : ""}\n물건 ${props.length}건${first ? ` (${first.address}${props.length > 1 ? ` 외 ${props.length - 1}` : ""})` : ""}\n의뢰기관: ${c.appraisal_requests.map((r: any) => fname(r.firm_id)).join(", ") || "-"}\n의뢰자: ${who(c.requester_email)}님`);
    } else if (event === "appraisal_priced" || event === "appraisal_chosen") {
      const req2 = c.appraisal_requests.find((r: any) => r.firm_id === body.firm_id);
      if (!req2) return new Response("bad request", { status: 400 });
      const amt = new Map<number, number>(req2.appraisal_prices.map((p: any) => [p.property_id, Number(p.amount)] as [number, number]));
      // 이 평가기관이 가격을 한 번에 불러준 물건 묶음(requests.bundles = [[물건id, …], …])은 하나의 단위로 본다 (가격은 묶음의 첫 물건에 저장)
      const ids = new Set(props.map((p: any) => p.id));
      const inB = new Map<number, number>();
      ((req2.bundles ?? []) as number[][]).forEach((bd, bi) => { const m = bd.filter((id) => ids.has(id)); if (m.length >= 2) m.forEach((id) => inB.set(id, bi)); });
      const units: { key: number; nos: number[] }[] = [];
      const seen = new Map<number, { key: number; nos: number[] }>();
      props.forEach((p: any, i: number) => {
        if (!inB.has(p.id)) { units.push({ key: p.id, nos: [i + 1] }); return; }
        const bi = inB.get(p.id)!; let u = seen.get(bi);
        if (!u) { u = { key: p.id, nos: [] }; seen.set(bi, u); units.push(u); }
        u.nos.push(i + 1);
      });
      const byItem = amt.size > 0;   // 물건별 입력이 없고 총액만 받은 경우는 total_amount 사용
      const total = byItem ? units.reduce((s: number, u) => s + (amt.get(u.key) ?? 0), 0) : Number(req2.total_amount ?? 0);
      const lines = byItem ? units.map((u) => `  ${rangeText(u.nos)}${u.nos.length > 1 ? "(일괄)" : ""}. ${won(amt.get(u.key))}`).join("\n") + "\n" : "";
      const noteTxt = req2.note ? `\n특이사항: ${req2.note}` : "";
      if (event === "appraisal_priced") await notify(to, `💰 ${tag} ${c.debtor_name}\n${fname(body.firm_id)} ${byItem || req2.total_amount !== null ? "평가가격이 입력됐어요" : "특이사항이 입력됐어요"}\n${lines}${byItem || req2.total_amount !== null ? `합계 ${won(total)}${byItem ? "" : " (총액만 입력)"}` : ""}${noteTxt}\n입력: ${who(me)}님`);
      else await notify(to, `✅ ${tag} ${c.debtor_name}\n${fname(body.firm_id)}을(를) 채택했어요 (합계 ${won(total)})\n처리: ${who(me)}님`);
    } else return new Response("bad request", { status: 400 });
    return ok();
  }
  const { data: task } = await db.from("work_tasks").select("*").eq("id", task_id).single();
  const { data: asg } = await db.from("work_task_assignees").select("email, done_at").eq("task_id", task_id);
  const { data: stepRows } = await db.from("work_task_steps").select("seq, name, done_at").eq("task_id", task_id).order("seq");
  const steps = stepRows ?? [];
  if (!task || !asg) return new Response("not found", { status: 404 });
  const names = await nameMap();
  const who = (e: string) => names.get(e) ?? e;
  const division = task.division === "deposit" ? "deposit" : "credit";
  const dv = division === "deposit" ? "수신/기타" : "여신";
  const sg = sc(task.scope);
  const { data: perm } = await db.from("team_members").select("perm_credit, perm_deposit, is_admin").eq("email", me).maybeSingle();
  const okDiv = !!perm && (perm.is_admin || (division === "credit" ? perm.perm_credit : perm.perm_deposit));
  const involved = task.created_by === me || asg.some((a) => a.email === me) || okDiv;

  const due = task.due_date ? `\n기한: ${task.due_date}` : "";
  const by = task.directed_by ? `\n요청: ${task.directed_by}` : "";
  const cur = steps.find((x) => !x.done_at);
  const everyone = [task.created_by, ...asg.map((a) => a.email)];   // 누른 사람 본인 포함
  const newHead = task.task_type === "loan" ? `📌 [여신]${sg} 새 대출 업무가 도착했어요\n${task.title}${cur ? `\n현재 단계: ${cur.name}` : ""}` : `📌 [${dv}]${sg} 새 할 일이 도착했어요\n${task.title}`;

  if (event === "created" && task.created_by === me) {
    await notify(everyone, `${newHead}${by}${due}`);
  } else if (event === "updated" && involved) {
    // 새로 추가된 담당자에게는 신규 안내, 기존 담당자에게는 수정 안내
    const added: string[] = (body.added ?? []).filter((e: string) => asg.some((a) => a.email === e));
    if (added.length) await notify(added, `${newHead}${by}${due}`);
    if (body.changed) {
      const rest = everyone.filter((e) => !added.includes(e));
      await notify(rest, `✏️ [${dv}]${sg} 업무 내용이 바뀌었어요\n${task.title}${by}${due}\n수정: ${who(me)}님`);
    }
  } else if (event === "step_done" && task.task_type === "loan" && involved) {
    const step = steps.find((x) => x.seq === seq);
    if (!step?.done_at) return new Response("bad request", { status: 400 });
    const next = steps.find((x) => !x.done_at);
    await notify(everyone, next
      ? `✅ [대출]${sg} ${task.title}\n${who(me)}님이 ${step.name}을(를) 완료했어요 → 다음 단계: ${next.name} (${next.seq}/${steps.length})`
      : `🎉 [대출]${sg} ${task.title}\n모든 단계를 마쳤어요 (${step.name} 완료)`);
  } else if (event === "step_undo" && task.task_type === "loan" && involved) {
    const step = steps.find((x) => x.seq === seq);
    if (!step || step.done_at) return new Response("bad request", { status: 400 });
    await notify(everyone, `↩ [대출]${sg} ${task.title}\n${who(me)}님이 ${step.name} 완료를 취소했어요 → 현재 단계: ${cur ? cur.name : step.name}`);
  } else if (event === "dropped" && task.task_type === "loan" && involved && task.dropped_at) {
    const stepName = steps.find((x) => x.seq === task.dropped_step)?.name ?? "";
    await notify(everyone, `⛔ [대출]${sg} ${task.title}\n${who(me)}님이 ${stepName} 단계에서 미진행 처리했어요${task.drop_reason ? `\n사유: ${task.drop_reason}` : ""}`);
  } else if (event === "resumed" && task.task_type === "loan" && involved && !task.dropped_at) {
    await notify(everyone, `↩ [대출]${sg} ${task.title}\n${who(me)}님이 진행을 재개했어요 → 현재 단계: ${cur ? cur.name : "-"}`);
  } else if (event === "done" && (asg.some((a) => a.email === me) || okDiv)) {
    const all = asg.every((a) => a.done_at);
    await notify(everyone, all ? `🎉 [${dv}]${sg} 모두 완료했어요\n${task.title}` : `✅ [${dv}]${sg} ${who(me)}님이 완료했어요\n${task.title}`);
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
