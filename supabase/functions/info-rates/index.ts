// 시세정보 '금리' 프록시 Edge Function (verify_jwt=false, 고정된 주소만 가져오므로 임의 URL 요청 불가)
// 호출: POST {} → { rates: [...], errors: [...], updated, empty }
//  · MOR 3개월·6개월: KB국민은행 MOR 금리 공시 (주간) — https://obank.kbstar.com/quics?page=C019205
//  · COFIX 신규취급액기준: 전국은행연합회 COFIX 공시 (월간, 3개월·6개월 변동 대출에 같은 값을 적용) — https://portal.kfb.or.kr/fingoods/cofix.php
//    전월 대비 증감은 KB국민은행 COFIX 금리 페이지(적용기간 A→B)에서 가져오며, 은행연합회 값과 일치할 때만 표시한다.
// 값을 못 읽으면 추측하지 않고 그 항목만 빠진다 (errors 에 이유를 남김).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const URL_MOR = "https://obank.kbstar.com/quics?page=C019205";
const URL_KB_COFIX = "https://obank.kbstar.com/quics?page=C019206";
const URL_KFB_COFIX = "https://portal.kfb.or.kr/fingoods/cofix.php";

export type Rate = { key: string; name: string; value: number; prev: number | null; change: number | null; note: string; sub?: string };

const strip = (s: string) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const sane = (v: number) => isFinite(v) && v > 0 && v < 20;   // 금리(%)로 말이 되는 범위만 받는다

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 3000));
  const enc = (r.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ?? head.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

// KB국민은행 MOR: "구분 전주(A) (’26.11.9~11.15) 금주(B) (’26.11.16~11.22) ... 3개월 변동금리 3.34 3.37 0.03 ... 6개월 변동금리 3.84 3.85 0.01"
export function parseMor(html: string): Rate[] {
  const t = strip(html);
  const per = t.match(/전주\(A\)\s*\(([^)]*)\)\s*금주\(B\)\s*\(([^)]*)\)/);
  if (!per) throw new Error("MOR: 기간 표기를 찾지 못함");
  const out: Rate[] = [];
  for (const m of [3, 6]) {
    const x = t.match(new RegExp(`${m}개월 변동금리\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)`));
    if (!x) throw new Error(`MOR ${m}개월: 값을 찾지 못함`);
    const a = Number(x[1]), b = Number(x[2]);
    if (!sane(a) || !sane(b)) throw new Error(`MOR ${m}개월: 값이 이상함 (${a}, ${b})`);
    out.push({ key: `mor${m}`, name: `MOR ${m}개월`, value: b, prev: a, change: r2(b - a), note: `KB국민은행 · 금주 ${per[2].replace(/’/g, "'")}` });
  }
  return out;
}

// 은행연합회: "신규취급액기준 COFIX 공시일 : 2026. 10. 15. 3.43% 다음 공시일 : 2026. 11. 16."
export function parseKfbCofix(html: string) {
  const t = strip(html);
  const x = t.match(/신규취급액기준 COFIX\s*공시일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d+(?:\.\d+)?)%\s*다음 공시일\s*:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!x) throw new Error("COFIX(은행연합회): 신규취급액기준 값을 찾지 못함");
  const v = Number(x[4]); if (!sane(v)) throw new Error("COFIX(은행연합회): 값이 이상함 " + v);
  return { value: v, date: `${x[2]}.${x[3]}`, next: `${x[6]}.${x[7]}` };
}
// KB국민은행 COFIX: "2026.09.16~2026.10.15 2026.10.16~2026.11.16 신규취급액기준 COFIX 3.18 3.43 0.25"
export function parseKbCofix(html: string) {
  const t = strip(html);
  const x = t.match(/신규취급액기준 COFIX\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(-?\d+(?:\.\d+)?)/);
  if (!x) throw new Error("COFIX(KB): 신규취급액기준 값을 찾지 못함");
  return { prev: Number(x[1]), value: Number(x[2]) };
}

async function getRates() {
  const [mor, kfb, kb] = await Promise.allSettled([fetchText(URL_MOR).then(parseMor), fetchText(URL_KFB_COFIX).then(parseKfbCofix), fetchText(URL_KB_COFIX).then(parseKbCofix)]);
  const rates: Rate[] = [], errors: string[] = [];
  if (mor.status === "fulfilled") rates.push(...mor.value); else errors.push(String(mor.reason));
  if (kfb.status === "fulfilled") {
    const k = kfb.value, c = kb.status === "fulfilled" && Math.abs(kb.value.value - k.value) < 0.005 ? kb.value : null;   // KB 값이 은행연합회 값과 같을 때만 증감을 쓴다
    rates.push({ key: "cofix_new", name: "COFIX 신규취급액기준", value: k.value, prev: c ? c.prev : null, change: c ? r2(c.value - c.prev) : null, note: `은행연합회 · ${k.date} 공시`, sub: "3·6개월 변동 공통" });
  } else errors.push(String(kfb.reason));
  return { rates, errors, updated: new Date().toISOString(), empty: rates.length === 0 };
}

const cache = new Map<string, { t: number; v: unknown }>();
async function cached(key: string, ttl: number, fn: () => Promise<{ empty: boolean } & Record<string, unknown>>) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn();
  cache.set(key, { t: v.empty ? Date.now() - ttl + 60_000 : Date.now(), v });   // 비어 있으면 1분 뒤 다시 시도
  return v;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try { return json(await cached("r", 3 * 3600_000, getRates)); } catch (e) { return json({ error: String(e) }, 500); }
  });
}
