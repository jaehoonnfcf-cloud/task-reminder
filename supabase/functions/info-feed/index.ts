// 시세 / 경제뉴스 프록시 Edge Function (verify_jwt=false, 고정된 주소만 가져오므로 임의 URL 요청 불가)
// 호출: POST { type: "news" | "quotes" }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UA = "Mozilla/5.0 (compatible; Halilyojung/1.0)";

const NEWS = [
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/economy.xml" },
  { name: "한국경제", url: "https://www.hankyung.com/feed/economy" },
  { name: "매일경제", url: "https://www.mk.co.kr/rss/30100041/" },
];
const QUOTES = [
  { sym: "KRW=X", name: "달러/원", dec: 2 },
  { sym: "JPYKRW=X", name: "엔/원 (100엔)", dec: 2, mult: 100 },
  { sym: "EURKRW=X", name: "유로/원", dec: 2 },
  { sym: "^KS11", name: "코스피", dec: 2 },
  { sym: "^KQ11", name: "코스닥", dec: 2 },
  { sym: "^GSPC", name: "S&P 500", dec: 2 },
  { sym: "^IXIC", name: "나스닥", dec: 2 },
  { sym: "^TNX", name: "미국채 10년", dec: 3, suffix: "%" },
  { sym: "CL=F", name: "WTI 유가", dec: 2, prefix: "$" },
  { sym: "GC=F", name: "금", dec: 1, prefix: "$" },
];

const cache = new Map<string, { t: number; v: unknown }>();
async function cached(key: string, ttl: number, fn: () => Promise<{ empty: boolean } & Record<string, unknown>>) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn();
  // 비어 있으면 20초 뒤 다시 시도
  cache.set(key, { t: v.empty ? Date.now() - ttl + 20_000 : Date.now(), v });
  return v;
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 200));
  const enc = (r.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? "utf-8";
  let dec: TextDecoder;
  try { dec = new TextDecoder(enc); } catch { dec = new TextDecoder("utf-8"); }
  return dec.decode(buf);
}

const clean = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function parseRss(xml: string, source: string) {
  const out: { title: string; link: string; date: string | null; source: string }[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const it = m[0];
    const g = (tag: string) => { const x = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")); return x ? clean(x[1]) : ""; };
    const title = g("title"), link = g("link") || g("guid");
    if (!title || !/^https?:\/\//.test(link)) continue;
    const d = new Date(g("pubDate") || g("dc:date"));
    out.push({ title, link, date: isNaN(+d) ? null : d.toISOString(), source });
  }
  return out;
}

async function getNews() {
  const res = await Promise.allSettled(NEWS.map(async (s) => parseRss(await fetchText(s.url), s.name)));
  const items = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = res.map((r, i) => (r.status === "rejected" ? `${NEWS[i].name}: ${r.reason}` : null)).filter(Boolean);
  const seen = new Set<string>();
  const uniq = items.filter((x) => (seen.has(x.title) ? false : (seen.add(x.title), true)));
  uniq.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { items: uniq.slice(0, 40), errors, updated: new Date().toISOString(), empty: uniq.length === 0 };
}

async function getQuotes() {
  const res = await Promise.allSettled(QUOTES.map(async (q) => {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.sym)}?range=1d&interval=1d`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const meta = (await r.json())?.chart?.result?.[0]?.meta;
    const k = q.mult ?? 1;
    const price = meta?.regularMarketPrice * k, prev = (meta?.chartPreviousClose ?? meta?.previousClose) * k;
    if (!isFinite(price)) throw new Error("no price");
    return { sym: q.sym, name: q.name, dec: q.dec, prefix: q.prefix ?? "", suffix: q.suffix ?? "", price, change: isFinite(prev) ? price - prev : 0, pct: isFinite(prev) && prev ? ((price - prev) / prev) * 100 : 0 };
  }));
  const quotes = res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return { quotes, updated: new Date().toISOString(), empty: quotes.length === 0 };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let type = "news";
  try { type = (await req.json()).type; } catch { /* 기본값 */ }
  try {
    return json(type === "quotes" ? await cached("q", 60_000, getQuotes) : await cached("n", 300_000, getNews));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
