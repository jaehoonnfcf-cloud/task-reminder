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
// ---- 주요일정 안내 (정기 알림): 아침 = 오늘, 오후 = 내일 (금요일 오후는 토·일·월) ----
type CalEv = { title: string; start_date: string; end_date: string | null; event_time: string | null };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function calRange(today: string, hour: number): { from: string; to: string; label: string; multi: boolean } {
  if (hour < 12) return { from: today, to: today, label: "오늘", multi: false };
  const dow = new Date(today + "T12:00:00Z").getUTCDay();   // 0=일
  if (dow === 5) return { from: addDays(today, 1), to: addDays(today, 3), label: "주말·월요일", multi: true };   // 금요일 오후: 토·일·월
  return { from: addDays(today, 1), to: addDays(today, 1), label: "내일", multi: false };
}
function calText(events: CalEv[], today: string, hour: number, title: string, icon: string): string {
  const rg = calRange(today, hour);
  const rows: { day: string; ev: CalEv }[] = [];
  for (const ev of events) {
    const end = ev.end_date ?? ev.start_date;
    if (ev.start_date > rg.to || end < rg.from) continue;
    rows.push({ day: ev.start_date < rg.from ? rg.from : ev.start_date, ev });   // 이미 시작된 여러 날 일정은 범위 첫날로
  }
  if (!rows.length) return "";
  rows.sort((a, b) => a.day.localeCompare(b.day) || String(a.ev.event_time ?? "").localeCompare(String(b.ev.event_time ?? "")));
  const lines = rows.map(({ day, ev }) => {
    const d = new Date(day + "T12:00:00Z");
    const pre = rg.multi ? `${DOW[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()} ` : "";
    const tm = ev.event_time ? `${ev.event_time.slice(0, 5)} ` : "";
    let sfx = "";
    if (ev.end_date && ev.end_date > day) { const [, em, ed] = ev.end_date.split("-"), [, dm] = day.split("-"); sfx = ` (~${em === dm ? +ed : `${+em}/${+ed}`})`; }
    return `• ${pre}${tm}${ev.title}${sfx}`;
  });
  return `${icon} ${rg.label} ${title}\n${lines.join("\n")}`;
}
// 조합일정(공휴일 제외, 전체 공통) + 개인일정(본인에게만). 개인일정은 owner_email 별로 따로 모은다.
async function calendarBlocks(today: string, hour: number): Promise<{ org: string; personal: Map<string, string> }> {
  const rg = calRange(today, hour), from = addDays(rg.from, -60);
  const { data } = await db.from("calendar_events").select("title, start_date, end_date, event_time")
    .neq("kind", "공휴일")   // 공휴일은 달력에만 표시하고 알림에는 넣지 않는다
    .gte("start_date", from).lte("start_date", rg.to).order("start_date").order("event_time", { nullsFirst: true });
  const { data: pe } = await db.from("personal_events").select("owner_email, title, start_date, end_date, event_time")
    .gte("start_date", from).lte("start_date", rg.to).order("start_date").order("event_time", { nullsFirst: true });
  const mine = new Map<string, CalEv[]>();
  for (const e of pe ?? []) { const l = mine.get(e.owner_email) ?? []; l.push(e as CalEv); mine.set(e.owner_email, l); }
  const personal = new Map<string, string>();
  for (const [email, evs] of mine) { const t = calText(evs, today, hour, "내 일정", "🗓"); if (t) personal.set(email, t); }
  return { org: calText((data ?? []) as CalEv[], today, hour, "조합일정", "📅"), personal };
}
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

// 여수신 실적: 전 영업일 값이 입력되지 않았을 때만 관리자에게 알림 (실적 기능을 쓰기 시작한 뒤부터). 오전 9시 전용 크론(mode:"perf")에서만 호출
async function perfCheck(today: string): Promise<boolean> {
  let perfMissing = false;
    {
      const { data: hol } = await db.from("calendar_events").select("start_date, end_date").eq("kind", "공휴일").gte("start_date", addDays(today, -40)).lte("start_date", today);
      const isOff = (d: string) => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w === 0 || w === 6 || (hol ?? []).some((h: any) => h.start_date <= d && (h.end_date ?? h.start_date) >= d); };
      if (!isOff(today)) {
        let prev = addDays(today, -1);
        for (let i = 0; i < 15 && isOff(prev); i++) prev = addDays(prev, -1);
        const { data: row } = await db.from("perf_daily").select("base_date").eq("base_date", prev).maybeSingle();
        const { count: n1 } = await db.from("perf_daily").select("base_date", { count: "exact", head: true });
        const { count: n2 } = await db.from("perf_year").select("year", { count: "exact", head: true });
        if (!row && ((n1 ?? 0) + (n2 ?? 0)) > 0) {
          perfMissing = true;
          const { data: adm } = await db.from("team_members").select("email").eq("is_admin", true);
          const d = new Date(prev + "T12:00:00Z");
          await notify((adm ?? []).map((r: any) => r.email), `📊 [실적] 전 영업일(${d.getUTCMonth() + 1}/${d.getUTCDate()} ${DOW[d.getUTCDay()]}) 여수신 실적이 아직 입력되지 않았어요\n현황판에서 “＋ 실적 입력”으로 입력해주세요.`);
        }
      }
    }
  return perfMissing;
}

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
    const mode = (await req.json().catch(() => ({})))?.mode;
    if (mode === "perf") return ok({ perfMissing: await perfCheck(today) });
    const dueTag = (d: string | null) => !d ? "" : d < today ? ` 🔴기한초과(${d})` : d === today ? " 🟠오늘마감" : ` (~${d})`;
    const SECTIONS = ["수신/기타", "여신", "개인"];   // 메뉴 순서(수신/기타 → 여신 → 감정평가 → 채권관리 → 개인업무)와 같게. 일정은 맨 위
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
    // 개인업무 (본인에게만): 고정업무 다음 회차를 먼저 만들고, 미완료 개인 할 일은 매일(고정업무 회차는 알림 시작일부터) 안내
    await db.rpc("gen_personal_occurrences");
    const dayMs = 864e5, t0 = Date.parse(today);
    const { data: pers } = await db.from("personal_tasks")
      .select("owner_email, title, due_date, lead_days, recurring_id").is("done_at", null);
    for (const t of pers ?? []) {
      if (!t.due_date) { add(t.owner_email, "개인", `• ${t.title}`); continue; }   // 기한 없는 미완료 할 일도 완료할 때까지 매번 안내
      const diff = Math.round((Date.parse(t.due_date) - t0) / dayMs);   // 음수 = 기한 지남
      if (t.recurring_id && diff > t.lead_days) continue;   // 고정업무 회차는 미리 만들어 두므로 알림 시작일부터만. 일반 개인 할 일은 등록한 날부터 매일
      const tag = diff < 0 ? ` 🔴기한초과(${t.due_date})` : diff === 0 ? " 🟠오늘마감" : ` (D-${diff})`;
      add(t.owner_email, "개인", `• ${t.recurring_id ? "[고정] " : ""}${t.title}${tag}`);
    }
    // 일정: 조합일정은 연결된 팀원 전체에게, 개인일정은 그 본인에게만. 업무가 있으면 알림 맨 위에 붙이고, 업무가 없으면 일정만 따로 보낸다 (일정도 없으면 보내지 않음)
    const hour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
    const cal = await calendarBlocks(today, hour), calBlk = cal.org;
    const everyone = new Set<string>(byUser.keys());
    if (calBlk) { const { data: lk } = await db.from("telegram_links").select("email").not("chat_id", "is", null); for (const r of lk ?? []) everyone.add(r.email); }
    for (const email of cal.personal.keys()) everyone.add(email);
    for (const email of everyone) {
      const secs = byUser.get(email);
      const parts: string[] = [];
      if (secs) {
        const total = SECTIONS.reduce((n, k) => n + (secs[k]?.length ?? 0), 0);
        parts.push(`⏰ 아직 남은 업무가 ${total}건 있어요`);
        if (calBlk) parts.push(calBlk);
        if (cal.personal.has(email)) parts.push(cal.personal.get(email)!);
        parts.push(...SECTIONS.filter((k) => secs[k]?.length).map((k) => `■ ${k} (${secs[k].length})\n${secs[k].join("\n")}`));
      } else { if (calBlk) parts.push(calBlk); if (cal.personal.has(email)) parts.push(cal.personal.get(email)!); }
      if (parts.length) await notify([email], parts.join("\n\n"));
    }
    // 화재보험: 보험 종료일 1개월 전 · 1주 전 · 당일, 갱신이 없으면 만기 후에도 매일 담당자(없으면 등록자)에게
    let fireSent = 0;
    {
      const { data: fi } = await db.from("fire_insurance").select("*").eq("status", "유효");
      const { data: lk } = await db.from("telegram_links").select("email").not("chat_id", "is", null);
      const linked = new Set((lk ?? []).map((r: any) => r.email));
      const byTo = new Map<string, string[]>(), patches: { id: number; patch: Record<string, unknown> }[] = [];
      const money = (n: unknown) => n === null || n === undefined ? "-" : `${Number(n).toLocaleString("ko-KR")}원`;
      for (const r of fi ?? []) {
        const left = Math.round((Date.parse(r.ins_end) - Date.parse(today)) / dayMs), stage = r.alert_stage ?? 0, to = r.assignee_email ?? r.created_by;
        if (left > 30 || !to || !linked.has(to)) continue;
        let label = "", patch: Record<string, unknown> | null = null;
        if (left <= 0) {
          if (stage < 3) { label = left === 0 ? "🔴 오늘 만기예요" : `🔴 만기가 지났어요 (D+${-left})`; patch = { alert_stage: 3, overdue_alert_on: today }; }
          else if (left < 0 && r.overdue_alert_on !== today) { label = `🚨 갱신이 필요해요 — 만기 D+${-left}`; patch = { overdue_alert_on: today }; }
        } else {
          const target = left <= 7 ? 2 : 1;
          if (target > stage) { label = target === 2 ? `⚠️ 만기 1주 전 (D-${left})` : `⏳ 만기 1개월 전 (D-${left})`; patch = { alert_stage: target }; }
        }
        if (!label || !patch) continue;
        const lines = [label, `채무자: ${r.debtor_name} (${r.scope})`, `보험기간: ${r.ins_start} ~ ${r.ins_end}`, `대출계좌: ${r.loan_account} · 질권설정액 ${money(r.pledge_amount)}`];
        if (r.address) lines.push(`소재지: ${r.address}`);
        (byTo.get(to) ?? byTo.set(to, []).get(to)!).push(lines.join("\n"));
        patches.push({ id: r.id, patch });
      }
      for (const [to, blocks] of byTo) await notify([to], `🔥 [사후관리] 화재보험 만기 알림 (${blocks.length}건)\n\n${blocks.join("\n\n")}\n\n갱신했다면 사후관리 > 화재보험관리에서 “갱신”을 눌러주세요.`);
      for (const p of patches) await db.from("fire_insurance").update(p.patch).eq("id", p.id);
      fireSent = patches.length;
    }
    return ok({ users: everyone.size, calendar: !!calBlk, personal: cal.personal.size, fireSent });
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
    } else if (event === "appraisal_comment") {
      const { data: cm } = await db.from("appraisal_comments").select("author_email, body").eq("id", body.comment_id).eq("case_id", c.id).maybeSingle();
      if (!cm || cm.author_email !== me) return new Response("bad request", { status: 400 });
      const txt = String(cm.body).replace(/\s+/g, " ").trim();
      await notify(to.filter((e) => e !== me), `💬 ${tag} ${c.debtor_name}\n${who(me)}님: ${txt.length > 200 ? txt.slice(0, 200) + "…" : txt}`);
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
  } else if (event === "comment") {
    const { data: cm } = await db.from("work_task_comments").select("author_email, body").eq("id", body.comment_id).eq("task_id", task_id).maybeSingle();
    if (!cm || cm.author_email !== me) return new Response("bad request", { status: 400 });
    const txt = String(cm.body).replace(/\s+/g, " ").trim();
    await notify(everyone.filter((e) => e && e !== me), `💬 [${task.task_type === "loan" ? "여신" : dv}]${sg} ${task.title}\n${who(me)}님: ${txt.length > 200 ? txt.slice(0, 200) + "…" : txt}`);
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
