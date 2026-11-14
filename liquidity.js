// 유동성관리 — 규제유동성비율 상황판. 관리자가 ALM 엑셀(일별 규제유동성비율 보고서 · 일별 현금흐름분석 · 월 현금흐름분석 · 월 규제유동성비율 보고서)을
// 올리면 숫자만 DB에 저장하고, 화면에서 현재 비율 · 분기말 전망 · 재예치 기간 가이드 · 할 일을 계산해 보여준다. 조회는 팀원 전체, 올리기·가정 저장은 관리자.
// 내부 수치는 코드에 두지 않는다(DB: liq_reports, liq_settings, perf_liq). 금액 단위는 ALM 과 같은 백만원.
// index.html 의 전역(sb, $, esc, me, isAdmin, kstToday, toast, divn)을 함께 쓴다.

let lmReports = [], lmLiqRows = [], lmP = null, lmSavedP = null, lmTimer = null, lmLoaded = false, lmMsg = '';
const LM_DEF = { target: 100, depNet: 0, loanNet: 0, overdue: 0, t3: 0, t6: 20, t10: 30, t12: 40, t13: 10, ext1: 50 };
const LM_KIND = { daily_ratio: '일별 규제유동성비율 보고서', daily_cf: '일별 현금흐름분석(규제유동성)', monthly_cf: '현금흐름분석(규제유동성) · 월', monthly_ratio: '규제유동성비율 보고서 · 월', book_dep: '수신 계좌 목록(저축성예수금 전체)', book_loan: '대출 계좌 목록(대출잔액장)' };
const LM_TERMS = [[3, '3개월 이하', 't3'], [6, '6개월', 't6'], [10, '10개월', 't10'], [12, '12개월', 't12'], [13, '13개월 이상', 't13']];
const LM_C = { dep: '#3b82c4', loan: '#e8856f', proj: '#8a8478', bad: '#d9503f' };   // 예금 파랑 · 대출 주황 (validate_palette 통과 조합)

const lmYM = (y, m) => y * 12 + m - 1, lmY = (k) => Math.floor(k / 12), lmM = (k) => k % 12 + 1;
const lmLab = (k) => `'${String(lmY(k)).slice(2)}.${lmM(k)}`;
const lmD = (s) => new Date(s + 'T00:00:00'), lmYmOf = (s) => lmYM(+s.slice(0, 4), +s.slice(5, 7)), lmDim = (k) => new Date(lmY(k), lmM(k), 0).getDate();
const lmF = (n) => (n < 0 ? '△' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const lmU = (n) => lmF(n) + '백만원';
const lmPct = (r, d = 1) => (isFinite(r) ? (r * 100).toFixed(d) + '%' : '-');
const lmIsQ = (k) => [3, 6, 9, 12].includes(lmM(k));
const lmNum = (v) => typeof v === 'number' ? v : (parseFloat(String(v ?? '').replace(/[,%]/g, '')) || 0);
const lmLast = (a) => a.slice().sort((x, y) => x.d < y.d ? -1 : 1).pop() || null;

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #liq{ display:none; flex-direction:column; gap:16px; min-width:0; }
  .lmc{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:18px 20px; min-width:0; }
  .lmc h3{ margin:0 0 10px; font-size:16.5px; letter-spacing:-.03em; } .lmc h3 small{ font-weight:600; color:var(--muted); font-size:12.5px; }
  .lmsub{ color:var(--muted); font-size:12.5px; font-weight:600; }
  .lmtiles{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; }
  .lmt{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:16px 16px 14px; min-width:0; }
  .lmt .l{ font-size:12.5px; font-weight:700; color:var(--muted); } .lmt .v{ font-size:28px; font-weight:800; letter-spacing:-.04em; margin:2px 0 6px; font-variant-numeric:tabular-nums; }
  .lmt .n{ font-size:12.5px; font-weight:700; color:var(--muted); display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; }
  .lmchip{ display:inline-block; border-radius:99px; padding:2px 10px; font-size:12px; font-weight:800; white-space:nowrap; }
  .lmchip.good{ background:var(--green-soft); color:var(--green); } .lmchip.warn{ background:var(--warn-soft); color:var(--warn); } .lmchip.bad{ background:var(--danger-soft); color:var(--danger); } .lmchip.plain{ background:var(--chipbg); color:var(--muted); }
  .lmtwo{ display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:16px; align-items:start; }
  .lmtodo{ margin:0; padding:0; list-style:none; } .lmtodo li{ display:flex; gap:10px; padding:10px 0; border-top:1px solid var(--line); font-size:14.5px; line-height:1.5; } .lmtodo li:first-child{ border-top:0; padding-top:2px; }
  .lmtodo .k{ flex:0 0 26px; height:26px; border-radius:9px; background:var(--accent-soft); color:var(--accent); font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; }
  .lmtw{ overflow-x:auto; } .lmtb{ width:100%; border-collapse:collapse; font-size:13.5px; } .lmtb th,.lmtb td{ padding:8px 8px; border-top:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .lmtb th{ border-top:0; color:var(--muted); font-size:12px; font-weight:700; } .lmtb th:first-child,.lmtb td:first-child{ text-align:left; } .lmtb tr.q td{ font-weight:800; background:var(--field); }
  .lmleg{ display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12.5px; font-weight:600; color:var(--muted); margin-bottom:4px; } .lmleg i{ display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  .lmc svg{ display:block; width:100%; height:auto; } .lmc svg text{ font-family:inherit; fill:#8a8478; font-size:11px; }
  .lmctrl{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 22px; }
  .lmctrl label{ margin:0 0 2px; font-size:12.5px; } .lmctrl .r{ display:flex; align-items:center; gap:10px; }
  .lmctrl input[type=range]{ flex:1; min-height:0; padding:0; border:0; background:transparent; accent-color:var(--accent); -webkit-appearance:auto; appearance:auto; }
  .lmdef{ color:var(--muted); font-weight:600; font-size:11.5px; margin-left:4px; }
  .lmctrl output{ min-width:70px; text-align:right; font-weight:800; font-size:14px; font-variant-numeric:tabular-nums; }
  .lmnote{ background:var(--warn-soft); color:#7a4a00; border-radius:14px; padding:10px 14px; font-size:13px; line-height:1.5; margin-top:12px; }
  .lmdrop{ border:2px dashed #d5d9e4; border-radius:16px; padding:18px 14px; text-align:center; color:var(--muted); background:var(--field); font-size:14px; font-weight:600; cursor:pointer; }
  .lmdrop.on{ border-color:var(--accent); background:var(--accent-soft); } .lmdrop b{ color:var(--accent); }
  .lmempty{ text-align:center; padding:46px 16px; color:var(--muted); font-weight:600; line-height:1.7; }
  .lmtip{ position:fixed; pointer-events:none; background:#2b2118; color:#fff; border-radius:10px; padding:7px 11px; font-size:12.5px; line-height:1.45; z-index:30; display:none; white-space:nowrap; }
  .lmx{ border:0; background:var(--chipbg); border-radius:8px; width:26px; height:26px; cursor:pointer; color:var(--muted); font-weight:800; }
  @media (max-width:1100px){ .lmtiles{ grid-template-columns:repeat(3,minmax(0,1fr)); } .lmtwo{ grid-template-columns:minmax(0,1fr); } }
  @media (max-width:760px){ .lmtiles{ grid-template-columns:repeat(2,minmax(0,1fr)); } .lmt .v{ font-size:23px; } .lmctrl{ grid-template-columns:minmax(0,1fr); } .lmc{ padding:16px 14px; border-radius:20px; } .lmc svg{ min-width:640px; } }
  `;
  document.head.appendChild(st);
  const tip = document.createElement('div'); tip.className = 'lmtip'; tip.id = 'lmTip'; document.body.appendChild(tip);
})();

// ---------- 불러오기 ----------
async function loadLiq(){
  if (!me) return;
  const [r, s, l] = await Promise.all([
    sb.from('liq_reports').select('*').order('base_date', { ascending: true }),
    sb.from('liq_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('perf_liq').select('base_date,asset,debt').order('base_date', { ascending: true }),
  ]);
  lmMsg = r.error ? '유동성관리용 DB 테이블이 아직 준비되지 않았어요. (liq_reports · liq_settings)' : '';
  lmReports = r.error ? [] : (r.data || []);
  lmLiqRows = l.error ? [] : (l.data || []);
  lmSavedP = (!s.error && s.data && s.data.params) ? { ...LM_DEF, ...s.data.params } : { ...LM_DEF };
  if (!lmP) lmP = { ...lmSavedP };
  lmLoaded = true;
  if (typeof divn !== 'undefined' && divn === 'liq') renderLiq();
}
const scheduleLiq = () => { clearTimeout(lmTimer); lmTimer = setTimeout(() => { if (me) loadLiq(); }, 400); };

// ---------- 자료 정리 ----------
function lmState(){
  const of = (k) => lmReports.filter(r => r.kind === k);
  const pts = new Map();
  lmLiqRows.forEach(r => pts.set(r.base_date, { d: r.base_date, A: Number(r.asset), B: Number(r.debt) }));
  of('monthly_ratio').concat(of('daily_ratio')).forEach(r => pts.set(r.base_date, { d: r.base_date, ...r.data }));
  const points = [...pts.values()].filter(p => p.B > 0).sort((a, b) => a.d < b.d ? -1 : 1);
  const cf = of('daily_cf').map(r => ({ d: r.base_date, ...r.data }));
  const mb = lmLast(of('monthly_cf').map(r => ({ d: r.base_date, ...r.data })));
  const base = mb ? { ...mb, ym: lmYmOf(mb.d) } : null;
  const bd = lmLast(of('book_dep').map(r => ({ d: r.base_date, ...r.data }))), bl = lmLast(of('book_loan').map(r => ({ d: r.base_date, ...r.data })));
  const book = bd ? { dep: bd, loan: bl } : null;   // 계좌 목록이 있으면 월별 만기표를 이것으로 쓴다(ALM 월 보고서는 보조)
  return { points, cf, base, book };
}

// ---------- 계산: 월별 만기표를 굴려 월말 비율을 전망 ----------
function lmSim(st, p){
  const bk = st.book, H = 28;
  let b = st.base;
  if (bk){   // 계좌 목록 기준: 0번 칸 = 기준일이 속한 달(그 달의 남은 만기), 1번 칸 = 다음 달 …
    const a = bk.dep, lo = bk.loan;
    b = { ym: lmYmOf(a.asof) - 1, liquid: st.base ? st.base.liquid : 0, demand: st.base ? st.base.demand : 0, savTotal: a.total, dep: a.m || [], loanL: lo ? lo.lump : [], loanA: lo ? lo.amort : [] };
  }
  if (!b) return null;
  const dep = new Array(H + 40).fill(0), loan = new Array(H + 40).fill(0), amo = new Array(H + 40).fill(0);
  (b.dep || []).forEach((v, i) => dep[i + 1] = v);
  if (bk){ (b.loanL || []).forEach((v, i) => loan[i + 1] = v); (b.loanA || []).forEach((v, i) => amo[i + 1] = v); }
  else {
    (b.loan || []).forEach((v, i) => loan[i + 1] = v);
    for (let i = 13; i <= 18; i++){ dep[i] += (b.dep18 || 0) / 6; loan[i] += (b.loan18 || 0) / 6; }
    for (let i = 19; i <= 24; i++){ dep[i] += (b.dep24 || 0) / 6; loan[i] += (b.loan24 || 0) / 6; }
    for (let i = 25; i <= 36; i++){ dep[i] += (b.dep36 || 0) / 12; loan[i] += (b.loan36 || 0) / 12; }
  }
  const ov = bk ? (bk.dep.overdue || 0) : p.overdue;   // 만기경과 미해지: 계좌 목록이 있으면 그 값
  const tsum = (p.t3 + p.t6 + p.t10 + p.t12 + p.t13) || 1;
  const lp = lmLast(st.points.filter(x => x.liquid != null)), lcf = lmLast(st.cf), lpYm = lp ? lmYmOf(lp.d) : -1;
  const savEnd = (k) => { const c = st.cf.filter(x => lmYmOf(x.d) === k && lmD(x.d).getDate() >= lmDim(k) - 3).sort((x, y) => x.d < y.d ? -1 : 1).pop(); return c ? c.sav : null; };
  let L = b.liquid, sav = b.savTotal; const demand = (lp && lp.demand) || b.demand || 0, rows = [];
  for (let i = 1; i <= H; i++){
    const k = b.ym + i; let net = p.depNet, actual = false;
    if (bk){ if (i === 1){ const rem = (lmDim(k) - lmD(bk.dep.asof).getDate()) / lmDim(k); net = p.depNet * rem; } }
    else {
      const se = savEnd(k);
      if (se != null){ net = se - sav; actual = true; }
      else if (lcf && lmYmOf(lcf.d) === k){ const rem = (lmDim(k) - lmD(lcf.d).getDate()) / lmDim(k); net = (lcf.sav - sav) + p.depNet * rem; actual = true; }
    }
    const mat = dep[i], renew = Math.max(0, mat + net);
    LM_TERMS.forEach(([t, , key]) => dep[i + t] += renew * p[key] / tsum);
    loan[i + 12] += loan[i] * p.ext1 / 100;   // 만기 도래 대출 중 일부는 1년 연장(분할상환 회수분은 제외)
    sav += net;
    if (k < lpYm) L = null;
    else if (k === lpYm){ const rem = (lmDim(k) - lmD(lp.d).getDate()) / lmDim(k); L = lp.liquid + (p.depNet - p.loanNet) * rem; }
    else L = (L == null ? b.liquid : L) + net - p.loanNet;
    const wl = loan[i + 1] + loan[i + 2] + loan[i + 3] + amo[i + 1] + amo[i + 2] + amo[i + 3], wd = dep[i + 1] + dep[i + 2] + dep[i + 3];
    const A = L == null ? NaN : L + wl, B = demand + ov + wd;
    rows.push({ k, mat, loanMat: loan[i] + amo[i], A, B, r: A / B, room: A - B, wd, wl, past: k < lpYm, actualNet: actual ? net : null });
  }
  return { rows, lp, lcf, lpYm, demand, ov };
}
const lmStat = (r, p) => !isFinite(r) ? 'plain' : r >= p.target / 100 ? 'good' : r >= 1 ? 'warn' : 'bad';
const LM_SL = { good: '✓ 안전', warn: '▲ 주의', bad: '⚠ 미달', plain: '자료 없음' };

// ---------- 화면 ----------
function renderLiq(live){
  const el = $('liq'); if (!el) return;
  if (!el.dataset.ready){ el.dataset.ready = '1'; lmBind(el); }
  if (!lmLoaded){ el.innerHTML = `<div class="lmc"><div class="lmempty">불러오는 중이에요…</div></div>`; return; }
  const st = lmState(), p = lmP || { ...LM_DEF }, adm = isAdmin(), sim = lmSim(st, p);
  const cur = lmLast(st.points), rows = sim ? sim.rows.filter(r => !r.past) : [];
  const upload = `<div class="lmc"><h3>자료 올리기 <small>${adm ? 'ALM 엑셀을 올리면 숫자만 저장돼요 · 일별 규제유동성비율 보고서는 현황판에도 자동 반영' : '관리자가 올린 자료 기준'}</small></h3>
    ${adm ? `<div class="lmdrop" id="lmDrop">ALM 엑셀 또는 계좌 목록(엑셀·CSV)을 끌어다 놓거나 <b>여기를 눌러 선택</b><br><span class="lmsub">일별 규제유동성비율 보고서 · 일별 현금흐름분석(규제유동성) · 현금흐름분석(규제유동성) 월 · 규제유동성비율 보고서 월 · <b>수신 계좌 목록 · 대출 계좌 목록</b></span></div><input type="file" id="lmFile" multiple accept=".xlsx,.csv" hidden />` : ''}
    <div class="lmtw" style="margin-top:10px">${lmStatusTable(st, sim, adm)}</div>
    ${lmMsg ? `<div class="lmnote">${esc(lmMsg)}</div>` : ''}</div>`;
  if (!cur && !st.base && !st.book){
    el.innerHTML = `<div class="lmc"><div class="lmempty">아직 올린 자료가 없어요 💧<br>${adm ? '아래에 ALM 보고서 엑셀을 올리면 현재 비율과 분기말 전망이 계산돼요.' : '관리자가 ALM 보고서를 올리면 여기에 상황판이 나타나요.'}</div></div>${upload}`;
    return;
  }
  // 타일
  const qs = rows.filter(r => lmIsQ(r.k)).slice(0, 4), curR = cur ? cur.A / cur.B : NaN, cs = lmStat(curR, p);
  let tiles = cur ? `<div class="lmt"><div class="l">현재 (${+cur.d.slice(5, 7)}/${+cur.d.slice(8, 10)} 기준)</div><div class="v">${lmPct(curR, 2)}</div><div class="n"><span class="lmchip ${cs}">${LM_SL[cs]}</span>GAP ${lmU(cur.A - cur.B)}</div></div>` : '';
  qs.forEach(q => { const s = lmStat(q.r, p); tiles += `<div class="lmt"><div class="l">${lmLab(q.k)}월말 전망</div><div class="v">${lmPct(q.r)}</div><div class="n"><span class="lmchip ${s}">${LM_SL[s]}</span>${q.room >= 0 ? '여유' : '부족'} ${lmU(Math.abs(q.room))}</div></div>`; });
  if (!sim) tiles += `<div class="lmt" style="grid-column:span 2"><div class="l">분기말 전망</div><div class="n" style="margin-top:8px;line-height:1.6">월별 만기표(현금흐름분석(규제유동성) 월 보고서)를 올리면 분기말 전망과 재예치 가이드가 계산돼요.</div></div>`;
  let body = `<div class="lmsub" style="margin:-6px 2px 0">단위: 백만원 · 목표 ${p.target <= 100 ? '100% 초과 유지' : '내부 목표 ' + p.target + '% 이상'}${cur ? ` · 최근 일별 자료 ${cur.d}` : ''}${st.book ? ` · 계좌 목록 ${st.book.dep.asof} 기준` : st.base ? ` · 월별 만기표 ${lmY(st.base.ym)}년 ${lmM(st.base.ym)}월말 기준` : ''}</div><div class="lmtiles">${tiles}</div>`;
  if (sim){
    const srcYm = st.book ? lmYmOf(st.book.dep.asof) - 1 : st.base.ym, nowYm = sim.lpYm > 0 ? sim.lpYm : srcYm + 1, curRow = rows.find(r => r.k === nowYm) || rows[0];
    const qeOf = (land) => { let q = land - 1; while (!lmIsQ(q)) q--; return q; };
    const advice = []; let g = '<tr><th>상품 기간</th><th>만기 도래월</th><th>영향 분기말</th><th>그 분기말 전망</th><th>여유액(백만원)</th><th>판단</th></tr>';
    LM_TERMS.forEach(([t, lab]) => {
      const land = curRow.k + t, q = qeOf(land), qr = sim.rows.find(r => r.k === q);
      let s = !qr || !isFinite(qr.r) ? 'plain' : qr.room < 0 ? 'bad' : (qr.room < 5000 || qr.r < p.target / 100) ? 'warn' : 'good'; if (t === 3 && s === 'good') s = 'warn';
      if (s === 'good') advice.push(lab);
      g += `<tr><td>${lab}</td><td>${lmLab(land)}</td><td>${lmLab(q)}월말</td><td>${qr ? lmPct(qr.r) : '-'}</td><td>${qr && isFinite(qr.room) ? lmF(qr.room) : '-'}</td><td><span class="lmchip ${s}">${{ good: '권장', warn: '소량만', bad: '피하기', plain: '자료 없음' }[s]}</span></td></tr>`;
    });
    const bkNow = st.book && lmYmOf(st.book.dep.asof) === nowYm; const remDays = bkNow ? (st.book.dep.overdue || 0) + ((st.book.dep.m || [])[0] || 0) : sim.lcf && sim.lcf.dep && lmYmOf(sim.lcf.d) === nowYm ? sim.lcf.dep.slice(0, Math.max(0, lmDim(nowYm) - lmD(sim.lcf.d).getDate())).reduce((a, c) => a + c, 0) : curRow.mat;
    // 할 일
    const t = [], worst = qs.slice().sort((a, c) => a.r - c.r)[0];
    if (cur) t.push(curR >= 1 ? `현재 비율은 <b>${lmPct(curR, 2)}</b>로 기준을 넘고 여유는 ${lmU(cur.A - cur.B)}입니다. ${curR < p.target / 100 ? `내부 목표 ${p.target}%까지 유동부채를 약 <b>${lmU(cur.B - cur.A / (p.target / 100))}</b> 줄여야 해요.` : (p.target > 100 ? '내부 목표도 충족해요.' : (cur.A - cur.B < 1000 ? '여유가 작으니 만기 도래분을 3개월 초과로 재예치해 두세요.' : ''))}`
      : `현재 비율이 <b>${lmPct(curR, 2)}</b>로 기준 미달입니다. 유동부채를 <b>${lmU(cur.B - cur.A)}</b> 줄이거나 유동자산을 그만큼 늘려야 해요.`);
    if (worst) t.push(worst.r < 1 ? `가장 위험한 분기말은 <b>${lmLab(worst.k)}월말(${lmPct(worst.r)})</b>입니다. 그 창(${lmLab(worst.k + 1)}~${lmLab(worst.k + 3)}월 만기)에 예금 만기가 <b>${lmU(-worst.room)}</b> 초과해요. 그 달에 만기가 떨어지는 상품을 줄이세요.`
      : `분기말 전망은 모두 100% 이상입니다. 가장 낮은 분기말은 <b>${lmLab(worst.k)}월말(${lmPct(worst.r)})</b>이고 여유는 ${lmU(worst.room)}입니다.`);
    const wm = rows.slice(0, 14).filter(r => !lmIsQ(r.k)).sort((a, c) => a.r - c.r)[0];
    if (wm && wm.r < 1) t.push(`분기말이 아닌 달 중에는 <b>${lmLab(wm.k)}월말(${lmPct(wm.r)})</b>이 100% 아래로 내려가요. 조기경보 지표에 반영되므로 ${lmLab(wm.k + 1)}~${lmLab(wm.k + 3)}월 만기를 줄여 두세요.`);
    t.push(advice.length ? `이번 달 만기분 약 <b>${lmU(remDays)}</b>은 <b>${advice.join(', ')}</b> 상품으로 재예치하도록 권유하세요. "피하기" 기간은 줄이고, 3개월 이하는 곧 다시 만기가 오므로 소량만 받으세요.`
      : `이번 달 만기분 약 <b>${lmU(remDays)}</b>을 받을 여유 있는 기간이 없어요. 기간을 고르게 나누고 신규 장기 예탁으로 자산을 늘려야 해요.`);
    if (sim.ov > 0 && cur) t.push(`만기경과 미해지 예탁금(${st.book ? '계좌 목록 기준 ' : '약 '}<b>${lmU(sim.ov)}</b>${st.book ? `, 본점 ${lmF(st.book.dep.overdueHq)} / 지점 ${lmF(st.book.dep.overdueBr)}` : ''})은 유동부채에 계속 남아요. 3개월 초과 상품으로 재예치하면 비율이 약 <b>${((cur.A / (cur.B - sim.ov) - curR) * 100).toFixed(1)}%p</b> 올라요.`);
    else if (!sim.ov && !st.book) t.push(`만기경과 미해지 예탁금 잔액이 0으로 돼 있어요. 아래 "가정 조절"에 실제 잔액을 넣으면 전망이 정확해져요.`);
    if (st.book && st.book.dep.days){   // 분기말 직전 3일 만기(기준일에 만기경과로 남는 금액)와 31일 안 최대 만기일
      const a = st.book.dep, a0 = lmD(a.asof); let qk = lmYmOf(a.asof); while (!lmIsQ(qk)) qk++;
      const qe = new Date(lmY(qk), lmM(qk), 0), off = Math.round((qe - a0) / 864e5);
      if (off >= 3 && off <= a.days.length){
        const s3 = a.days.slice(off - 3, off).reduce((x, y) => x + y, 0), d0 = new Date(qe); d0.setDate(d0.getDate() - 2);
        const bg = (a.big || []).filter(x => x.d >= `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}` && x.d <= `${qe.getFullYear()}-${String(qe.getMonth() + 1).padStart(2, '0')}-${String(qe.getDate()).padStart(2, '0')}`);
        if (s3 > 0) t.push(`분기말(${qe.getMonth() + 1}/${qe.getDate()}) 직전 3일(${d0.getMonth() + 1}/${d0.getDate()}~${qe.getDate()})에 만기가 <b>${lmU(s3)}</b> 돌아와요${bg.length ? ` (5억원 이상 거액 ${bg.length}건 ${lmU(bg.reduce((x, y) => x + y.b, 0))})` : ''}. 기준일에 만기경과로 남지 않게 <b>갱신 의사를 미리 확인</b>하세요.`);
      }
      const f31 = a.days.slice(0, 31).map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v)[0];
      if (f31 && f31.v > 0){ const dd = new Date(a0); dd.setDate(dd.getDate() + f31.i + 1); t.push(`앞으로 31일 안에 만기가 가장 큰 날은 <b>${dd.getMonth() + 1}/${dd.getDate()}(${lmU(f31.v)})</b>입니다. 그 전에 갱신 의사를 확인하세요.`); }
    } else if (sim.lcf && sim.lcf.dep){ const mx = sim.lcf.dep.map((v, i) => ({ v, i })).slice(1).sort((a, c) => c.v - a.v)[0], dd = lmD(sim.lcf.d); dd.setDate(dd.getDate() + mx.i + 1);
      t.push(`앞으로 31일 안에 만기가 가장 큰 날은 <b>${dd.getMonth() + 1}/${dd.getDate()}(${lmU(mx.v)})</b>입니다. 그 전에 갱신 의사를 확인하세요.`); }
    const age = nowYm - srcYm; if (st.book){ const ageD = Math.round((Date.parse(kstToday()) - Date.parse(st.book.dep.asof)) / 864e5); if (ageD > 35) t.push(`수신 계좌 목록이 <b>${ageD}일</b> 지났어요. 새 목록을 올려 주세요.`); } else if (age >= 2) t.push(`월별 만기표가 ${lmM(st.base.ym)}월말 기준이라 <b>${age}개월 지났어요.</b> 그 뒤 재예치분의 만기는 가정으로 채워져 있으니 새 월간 보고서를 올려 주세요.`);
    // 전망표 · 큰 만기일
    let pt = '<tr><th>월말</th><th>유동자산(백만원)</th><th>유동부채(백만원)</th><th>비율</th><th>여유(△부족, 백만원)</th><th>창의 예금 만기(백만원)</th><th>창의 대출 회수(백만원)</th><th>상태</th></tr>';
    rows.slice(0, 14).forEach(r => { const s = lmStat(r.r, p); pt += `<tr class="${lmIsQ(r.k) ? 'q' : ''}"><td>${lmLab(r.k)}월말${lmIsQ(r.k) ? ' (분기말)' : ''}</td><td>${lmF(r.A)}</td><td>${lmF(r.B)}</td><td>${lmPct(r.r)}</td><td>${lmF(r.room)}</td><td>${lmF(r.wd)}</td><td>${lmF(r.wl)}</td><td><span class="lmchip ${s}">${LM_SL[s]}</span></td></tr>`; });
    let dt = '<tr><th>날짜</th><th>예금 만기(백만원)</th><th>대출 만기(백만원)</th><th style="text-align:left">비고</th></tr>';
    if (st.book && st.book.dep.days){ const b0 = lmD(st.book.dep.asof), ld = (st.book.loan && st.book.loan.days) || [];
      st.book.dep.days.slice(0, 31).map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v).slice(0, 7).sort((x, y) => x.i - y.i).forEach(o => { const dd = new Date(b0); dd.setDate(dd.getDate() + o.i + 1);
        dt += `<tr><td>${dd.getMonth() + 1}/${dd.getDate()}</td><td>${lmF(o.v)}</td><td>${lmF(ld[o.i] || 0)}</td><td style="text-align:left"></td></tr>`; }); }
    else if (sim.lcf && sim.lcf.dep){ const b0 = lmD(sim.lcf.d); sim.lcf.dep.map((v, i) => ({ v, i })).sort((a, c) => c.v - a.v).slice(0, 7).sort((a, c) => a.i - c.i).forEach(o => { const dd = new Date(b0); dd.setDate(dd.getDate() + o.i + 1);
      dt += `<tr><td>${dd.getMonth() + 1}/${dd.getDate()}</td><td>${lmF(o.v)}</td><td>${lmF((sim.lcf.loan || [])[o.i] || 0)}</td><td style="text-align:left">${o.i === 0 ? '만기경과 미해지분 포함' : ''}</td></tr>`; }); }
    else dt += '<tr><td colspan="4" style="text-align:left">일별 현금흐름분석 파일을 올리면 표시돼요.</td></tr>';
    const past = sim.rows.filter(r => r.actualNet != null).map(r => `${lmLab(r.k)}월 ${lmU(r.mat + r.actualNet)}`);
    const dirty = JSON.stringify(lmP) !== JSON.stringify(lmSavedP);
    body += `<div class="lmtwo">
      <div class="lmc"><h3>지금 할 일</h3><ul class="lmtodo">${t.map((x, i) => `<li><span class="k">${i + 1}</span><span>${x}</span></li>`).join('')}</ul></div>
      <div class="lmc"><h3>이번 달 재예치 기간 가이드</h3><div class="lmsub" style="margin-bottom:6px">${lmLab(nowYm)}월에 재예치하는 예금이 어느 분기말 비율에 잡히는지 보여줘요. 이번 달 남은 만기 약 ${lmU(remDays)}.</div>
        <div class="lmtw"><table class="lmtb">${g}</table></div><div class="lmsub" style="margin-top:8px">여유액 = 그 분기말에 100%를 지키면서 해당 3개월 창에 더 받을 수 있는 만기 금액 (아래 가정 기준)</div></div>
    </div>
    <div class="lmc"><h3>비율 추이와 전망</h3><div class="lmleg"><span><i style="background:${LM_C.dep}"></i>실적</span><span><i style="background:${LM_C.proj}"></i>전망(월말, 아래 가정 기준)</span><span><i style="background:${LM_C.bad}"></i>기준 100%</span></div><div class="lmtw">${lmChartRatio(st, rows)}</div></div>
    <div class="lmc"><h3>월별 만기 구조 <small>가정 반영 후 · 예금 만기가 대출 회수보다 크게 몰린 달이 위험</small></h3><div class="lmleg"><span><i style="background:${LM_C.dep}"></i>저축성예수금 만기</span><span><i style="background:${LM_C.loan}"></i>대출 회수(3개월 창 산입분)</span></div><div class="lmtw">${lmChartMat(rows)}</div></div>
    <div class="lmc"><h3>분기말 · 월말 전망표</h3><div class="lmtw"><table class="lmtb">${pt}</table></div></div>
    ${lmBookCards(st)}
    <div class="lmc" id="lmCtrlCard"><h3>가정 조절 <small>바꾸면 맨 위 전망 타일과 표·차트가 바로 다시 계산돼요${adm ? '' : ' · 저장은 관리자만'}</small></h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px"><button class="btn small primary" data-lm="opt">권장 재예치 배분 적용</button><button class="btn small" data-lm="reset">기본값으로</button>${adm ? `<button class="btn small" data-lm="save" ${dirty ? '' : 'disabled'}>가정 저장</button>` : ''}${dirty ? `<button class="btn small" data-lm="revert">저장된 가정으로</button>` : ''}<span class="lmsub" id="lmOptMsg">'권장 배분'은 월말 비율의 최저값이 가장 높아지는 재예치 기간 배분이에요(3개월 이하는 10% 이내). 각 항목 옆에 기본값과 권장값을 적어 두었어요.</span></div>
      <div class="lmctrl">${lmCtrlHtml(p, lmRec(st, p, live), !!st.book)}</div>
      <div class="lmnote"><b>가정으로 채운 부분</b> · 재예치 기간 비율은 합계 100%로 환산해요. · ${st.book ? `계좌 목록(기준일 ${st.book.dep.asof}) 이후에 새로 가입·재예치되는 금액의 만기는 위 기간 비율로 나눠요.` : `월별 만기표 이후 재예치·신규된 금액(${past.join(', ') || '없음'})의 만기는 실제 값을 몰라 위 기간 비율로 나눴어요.`} · 요구불예수금 유동부채(${lmU(sim.demand)})는 그대로 둬요. · 신규 대출과 2년 이상 연장분은 전망 기간 안에 만기가 오지 않는 것으로 봐요.</div></div>
    <div class="lmtwo"><div class="lmc"><h3>31일 이내 큰 만기일</h3><div class="lmtw"><table class="lmtb">${dt}</table></div></div>${upload}</div>`;
  } else {
    body += `<div class="lmc"><h3>비율 추이</h3><div class="lmtw">${lmChartRatio(st, [])}</div></div>${upload}`;
  }
  // 가정을 끄는 동안(live)에는 손잡이가 끊기지 않게 '가정 조절' 카드만 그대로 두고 나머지(타일·할 일·차트·표)를 바꿔 끼운다
  if (live && el.querySelector('#lmCtrlCard')){
    const tmp = document.createElement('div'); tmp.innerHTML = body; const olds = [...el.children], news = [...tmp.children];
    if (olds.length === news.length){
      olds.forEach((o, i) => {
        if (o.id !== 'lmCtrlCard') return o.replaceWith(news[i]);
        const no = news[i].querySelectorAll('output'); o.querySelectorAll('output').forEach((x, k) => { if (no[k]) x.textContent = no[k].textContent; });
        const nn = news[i].querySelector('.lmnote'), on = o.querySelector('.lmnote'); if (nn && on) on.innerHTML = nn.innerHTML;
      });
      return lmTips(el);
    }
  }
  el.innerHTML = body; lmTips(el);
}

// ---------- 계좌 목록으로 본 창별 만기 · 거액 만기 ----------
function lmBookCards(st){
  const bk = st.book; if (!bk) return '';
  const a = bk.dep, lo = bk.loan, ym0 = lmYmOf(a.asof), sum = (arr, i1, n) => { let t = 0; for (let i = i1; i < i1 + n; i++) t += (arr && arr[i]) || 0; return t; };
  let w = '<tr><th>분기말</th><th>창(만기월)</th><th>예금 만기(백만원)</th><th>본점 / 지점</th><th>대출 회수(백만원)</th></tr>';
  for (let k = ym0; k <= ym0 + 12; k++){
    if (!lmIsQ(k)) continue; const i1 = k + 1 - ym0; if (i1 + 2 > 35) break;
    const d = sum(a.m, i1, 3), hq = sum(a.mHq, i1, 3), br = sum(a.mBr, i1, 3), l = lo ? sum(lo.lump, i1, 3) + sum(lo.amort, i1, 3) : 0;
    w += `<tr><td>${lmLab(k)}월말</td><td>${lmLab(k + 1)}~${lmLab(k + 3)}</td><td>${lmF(d)}</td><td>${lmF(hq)} / ${lmF(br)}</td><td>${lo ? lmF(l) : '-'}</td></tr>`;
  }
  const big = (a.big || []).slice(0, 24); let bt = '<tr><th>만기일</th><th>구분</th><th>금액(백만원)</th></tr>';
  big.forEach(x => { bt += `<tr><td>${+x.d.slice(5, 7)}/${+x.d.slice(8, 10)} <span class="lmsub">(${x.d.slice(2, 4)}년)</span></td><td>${esc(x.br)}</td><td>${lmF(x.b)}</td></tr>`; });
  if (!big.length) bt += '<tr><td colspan="3" style="text-align:left">5억원 이상 거액 만기가 없어요.</td></tr>';
  const npl = lo ? `<div class="lmsub" style="margin-top:8px">대출 계좌 목록(${esc(lo.asof)}): 정상 ${lmF(lo.normal)} · 요주의 ${lmF(lo.caution)} · <b>고정이하 ${lmF(lo.npl)}</b>(본점 ${lmF(lo.nplHq)} / 지점 ${lmF(lo.nplBr)}) · 만기경과 대출 ${lmF((lo.overdueOk || 0) + (lo.overdueNpl || 0))}(고정이하 ${lmF(lo.overdueNpl || 0)}) · 일시상환 ${Math.round((lo.lumpShare || 0) * 100)}%</div>` : '';
  return `<div class="lmtwo">
    <div class="lmc"><h3>계좌 목록으로 본 분기말 창 <small>${esc(a.asof)} 기준 · 기존 계좌만(이후 가입·재예치 제외)</small></h3><div class="lmtw"><table class="lmtb">${w}</table></div>
      <div class="lmsub" style="margin-top:8px">수신 합계 ${lmU(a.total)} (본점 ${lmF(a.hq)} / 지점 ${lmF(a.br)}) · 만기경과 미해지 <b>${lmU(a.overdue)}</b>(본점 ${lmF(a.overdueHq)} / 지점 ${lmF(a.overdueBr)}) · 적금류 ${Math.round((a.jeok || 0) / (a.total || 1) * 1000) / 10}%</div>${npl}</div>
    <div class="lmc"><h3>거액(5억원 이상) 예금 만기 <small>총 ${(a.big || []).length}건</small></h3><div class="lmtw"><table class="lmtb">${bt}</table></div><div class="lmsub" style="margin-top:8px">계좌 번호·성명은 저장하지 않아요. 큰 만기는 미리 갱신 의사를 확인해 두세요.</div></div>
  </div>`;
}

function lmTips(el){
  el.querySelectorAll('[data-tip]').forEach(n => { if (n.dataset.tb) return; n.dataset.tb = '1';
    n.addEventListener('mousemove', (e) => { const tp = $('lmTip'); tp.innerHTML = n.dataset.tip; tp.style.display = 'block'; tp.style.left = Math.min(window.innerWidth - tp.offsetWidth - 8, e.clientX + 14) + 'px'; tp.style.top = (e.clientY + 14) + 'px'; });
    n.addEventListener('mouseleave', () => { $('lmTip').style.display = 'none'; }); });
}
function lmStatusTable(st, sim, adm){
  const latest = (k) => lmReports.filter(r => r.kind === k).map(r => r.base_date).sort().pop();
  const today = kstToday(), dAgo = (d) => d ? Math.round((Date.parse(today) - Date.parse(d)) / 864e5) : null;
  const need = { daily_ratio: ['매 영업일', 4], daily_cf: ['주 1회 이상', 10], monthly_cf: ['월 1회', 62], monthly_ratio: ['월 1회', 62], book_dep: ['월 1회 이상 (분기말 전)', 35], book_loan: ['월 1회 이상 (분기말 전)', 35] };
  let h = '<table class="lmtb"><tr><th>자료</th><th style="text-align:left">최신 기준일</th><th>올리는 주기</th><th>상태</th>' + (adm ? '<th></th>' : '') + '</tr>';
  Object.keys(LM_KIND).forEach(k => { const d = latest(k), ago = dAgo(d), s = !d ? 'plain' : ago > need[k][1] ? 'warn' : 'good';
    h += `<tr><td>${LM_KIND[k]}</td><td style="text-align:left">${d || '없음'}${d && k.startsWith('book_') ? ` · 합계 ${lmF((lmReports.find(r => r.kind === k && r.base_date === d) || { data: {} }).data.total || 0)}` : ''}</td><td>${need[k][0]}</td><td><span class="lmchip ${s}">${!d ? '없음' : s === 'warn' ? '갱신 필요' : '최신'}</span></td>${adm ? `<td>${d ? `<button class="lmx" title="이 자료 삭제" data-lmdel="${k}|${d}">✕</button>` : ''}</td>` : ''}</tr>`; });
  return h + '</table>';
}
let lmRecKey = '', lmRecVal = null;
function lmBest(st, p){   // 월말 최저 비율이 가장 높아지는 재예치 기간 배분(3개월 이하는 10% 이내)
  let best = null;
  for (let a = 0; a <= 10; a += 5) for (let c = 0; c <= 100 - a; c += 5) for (let d = 0; d <= 100 - a - c; d += 5) for (let f = 0; f <= 100 - a - c - d; f += 5){
    const tp = { ...p, t3: a, t6: c, t10: d, t12: f, t13: 100 - a - c - d - f }, sm = lmSim(st, tp); if (!sm) return null;
    const mn = Math.min(...sm.rows.filter(r => !r.past).slice(0, 14).map(r => r.r)); if (!best || mn > best.mn) best = { mn, p: tp };
  }
  return best;
}
function lmRec(st, p, live){   // 권장 배분은 순증·만기경과·연장 비율·자료가 바뀔 때만 다시 찾는다(끄는 중에는 이전 값을 그대로 씀)
  const key = JSON.stringify([lmReports.map(r => r.kind + r.base_date + r.updated_at), lmLiqRows.length, p.depNet, p.loanNet, p.overdue, p.ext1]);
  if (key !== lmRecKey && !live){ lmRecKey = key; lmRecVal = lmBest(st, p); }
  return lmRecVal;
}
function lmCtrlHtml(p, rec, hasBook){
  const tsum = (p.t3 + p.t6 + p.t10 + p.t12 + p.t13) || 1;
  const C = [['depNet', '저축성예수금 순증 (월)', -5000, 5000, 100], ['loanNet', '대출 순증 (월)', -2000, 4000, 50], ['overdue', '만기경과 미해지 잔액', 0, 8000, 100], ['ext1', '만기 대출 중 1년 연장 비율 (나머지는 2년 이상)', 0, 100, 5], ['target', '내부 관리 목표 (기준은 100% 초과)', 100, 120, 1]]
    .concat(LM_TERMS.map(([, lab, key]) => [key, '재예치 기간: ' + lab, 0, 100, 1]));
  if (hasBook) C.splice(C.findIndex(c => c[0] === 'overdue'), 1);   // 만기경과 미해지는 계좌 목록 값을 자동으로 쓴다
  const isT = (k) => k[0] === 't' && k !== 'target', fmtV = (k, v) => isT(k) ? Math.round(v / tsum * 100) + '%' : (k === 'ext1' || k === 'target') ? v + '%' : lmU(v);
  const hint = (k) => `기본 ${isT(k) ? LM_DEF[k] + '%' : fmtV(k, LM_DEF[k])}` + (isT(k) && rec ? ` · 권장 ${rec.p[k]}%` : '');
  return C.map(([k, lab, mn, mx, stp]) => `<div><label>${lab} <span class="lmdef">${hint(k)}</span></label><div class="r"><input type="range" data-lmp="${k}" min="${mn}" max="${mx}" step="${stp}" value="${p[k]}" /><output>${fmtV(k, p[k])}</output></div></div>`).join('');
}

// ---------- 차트 ----------
function lmChartRatio(st, rows){
  const W = 1100, Hh = 300, m = { l: 44, r: 22, t: 18, b: 30 };
  const act = st.points.slice(-40).map(p => ({ t: +lmD(p.d), r: p.A / p.B, lab: p.d, A: p.A, B: p.B }));
  const pr = rows.slice(0, 14).map(r => ({ t: +new Date(lmY(r.k), lmM(r.k), 0), r: r.r, lab: lmLab(r.k) + '월말 전망', A: r.A, B: r.B, q: lmIsQ(r.k) })).filter(x => isFinite(x.r));
  const all = act.concat(pr); if (all.length < 2) return `<div class="lmempty" style="padding:30px 10px">추이를 그릴 자료가 아직 부족해요</div>`;
  const t0 = Math.min(...all.map(p => p.t)), t1 = Math.max(...all.map(p => p.t));
  const lo = Math.min(0.85, ...all.map(p => p.r)) - 0.05, hi = Math.max(1.15, ...all.map(p => p.r)) + 0.05;
  const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r), y = (r) => m.t + (hi - r) / (hi - lo) * (Hh - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="규제유동성비율 추이와 전망"><defs><linearGradient id="lmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LM_C.dep}" stop-opacity=".26"/><stop offset="1" stop-color="${LM_C.dep}" stop-opacity="0"/></linearGradient></defs>`;
  const stp = hi - lo > 0.8 ? 0.2 : 0.1; for (let v = Math.ceil(lo / stp) * stp; v <= hi; v += stp) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#eee8dc"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(1)}" y2="${y(1)}" stroke="${LM_C.bad}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const d0 = new Date(t0), span = (t1 - t0) / 864e5, every = span > 500 ? 3 : span > 200 ? 2 : 1;
  for (let k = lmYM(d0.getFullYear(), d0.getMonth() + 1); ; k++){ const tt = +new Date(lmY(k), lmM(k) - 1, 1); if (tt > t1) break; if (tt < t0) continue; if (lmM(k) % every === 0 || every === 1) s += `<text x="${x(tt)}" y="${Hh - 8}" text-anchor="middle">${lmLab(k)}</text>`; }
  const path = (a) => a.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.r).toFixed(1)).join(' ');
  if (act.length > 1) s += `<path d="${path(act)} L${x(act[act.length - 1].t).toFixed(1)} ${y(lo).toFixed(1)} L${x(act[0].t).toFixed(1)} ${y(lo).toFixed(1)} Z" fill="url(#lmg)"/>`;
  if (act.length) s += `<path d="${path(act)}" fill="none" stroke="${LM_C.dep}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (pr.length) s += `<path d="${path((act.length ? [act[act.length - 1]] : []).concat(pr))}" fill="none" stroke="${LM_C.proj}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="6 5"/>`;
  act.forEach(p => s += `<circle cx="${x(p.t)}" cy="${y(p.r)}" r="4" fill="${LM_C.dep}" stroke="#fff" stroke-width="2" data-tip="${p.lab}<br>비율 ${lmPct(p.r, 2)}<br>자산 ${lmU(p.A)} / 부채 ${lmU(p.B)}"/>`);
  pr.forEach(p => { const c = p.r < 1 ? LM_C.bad : LM_C.proj; s += `<circle cx="${x(p.t)}" cy="${y(p.r)}" r="${p.q ? 5 : 3.5}" fill="${p.q ? c : '#fff'}" stroke="${c}" stroke-width="2" data-tip="${p.lab}<br>비율 ${lmPct(p.r)}<br>자산 ${lmU(p.A)} / 부채 ${lmU(p.B)}"/>`;
    if (p.q) s += `<text x="${x(p.t)}" y="${y(p.r) - 10}" text-anchor="middle" style="fill:#2b2118;font-weight:700">${lmPct(p.r)}</text>`; });
  if (act.length){ const la = act[act.length - 1]; s += `<text x="${x(la.t)}" y="${y(la.r) + 18}" text-anchor="middle" style="fill:#2b2118;font-weight:700">${lmPct(la.r)}</text>`; }
  return s + '</svg>';
}
function lmChartMat(rows){
  const W = 1100, Hh = 280, m = { l: 52, r: 12, t: 16, b: 30 }, rs = rows.slice(0, 14); if (!rs.length) return '';
  const mx = Math.max(1, ...rs.map(r => Math.max(r.mat, r.loanMat))) * 1.1, bw = (W - m.l - m.r) / rs.length, y = (v) => m.t + (1 - v / mx) * (Hh - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="월별 만기 구조">`;
  const stp = mx > 40000 ? 10000 : mx > 15000 ? 5000 : 2000; for (let v = 0; v <= mx; v += stp) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#eee8dc"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${(v / 100).toLocaleString('ko-KR')}억</text>`;
  const bar = (xx, w, v, c) => { const yy = y(v), hh = Hh - m.b - yy, rr = Math.max(0, Math.min(4, hh)); return hh <= 0 ? '' : `<path d="M${xx} ${Hh - m.b}V${yy + rr}q0 -${rr} ${rr} -${rr}H${xx + w - rr}q${rr} 0 ${rr} ${rr}V${Hh - m.b}Z" fill="${c}"/>`; };
  rs.forEach((r, i) => { const x0 = m.l + i * bw, w = Math.min(26, bw * 0.34), cx = x0 + bw / 2;
    s += bar(cx - w - 1, w, r.mat, LM_C.dep) + bar(cx + 1, w, r.loanMat, LM_C.loan);
    s += `<text x="${cx}" y="${Hh - 10}" text-anchor="middle" style="${lmIsQ(r.k) ? 'fill:#16181d;font-weight:800' : ''}">${lmLab(r.k)}</text>`;
    s += `<rect x="${x0}" y="${m.t}" width="${bw}" height="${Hh - m.t - m.b}" fill="transparent" data-tip="${lmLab(r.k)}월 만기<br>예금 ${lmU(r.mat)}<br>대출 ${lmU(r.loanMat)}<br>차이 ${lmU(r.mat - r.loanMat)}"/>`; });
  const top = rs.slice().sort((a, c) => c.mat - a.mat)[0], ti = rs.indexOf(top);
  s += `<text x="${m.l + ti * bw + bw / 2}" y="${Math.max(11, y(top.mat) - 5)}" text-anchor="middle" style="fill:#2b2118;font-weight:700">${lmU(top.mat)}</text>`;
  return s + '</svg>';
}

// ---------- 조작 ----------
function lmBind(el){
  // 끄는 동안에도 위쪽 전망이 바로 따라 바뀐다(가정 카드는 그대로 둠). 손을 떼면 버튼 상태까지 전체를 다시 그린다
  el.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.lmp; if (!k) return; lmP[k] = +e.target.value; renderLiq(true); });
  el.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.lmp; if (!k) return; const sy = window.scrollY; renderLiq(); window.scrollTo(0, sy); const n = el.querySelector(`[data-lmp="${k}"]`); if (n) n.focus({ preventScroll: true }); });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lm]'), del = e.target.closest('[data-lmdel]');
    if (e.target.closest('#lmDrop')) return $('lmFile').click();
    if (del){ if (!isAdmin()) return; const [kind, d] = del.dataset.lmdel.split('|'); const ratio = kind === 'daily_ratio' || kind === 'monthly_ratio';
      if (!confirm(`${LM_KIND[kind]} ${d} 자료를 삭제할까요?${ratio ? '\n(현황판의 같은 날짜 규제유동성비율 값도 함께 지워져요)' : ''}`)) return;
      const { error } = await sb.from('liq_reports').delete().eq('kind', kind).eq('base_date', d); if (error) return alert('삭제하지 못했어요: ' + error.message);
      if (ratio && !lmReports.some(r => r.base_date === d && r.kind !== kind && (r.kind === 'daily_ratio' || r.kind === 'monthly_ratio'))) await sb.from('perf_liq').delete().eq('base_date', d);   // 현황판 값의 원본이 이 보고서
      toast('삭제했어요'); return loadLiq(); }
    if (!b) return;
    if (b.dataset.lm === 'revert'){ lmP = { ...lmSavedP }; return renderLiq(); }
    if (b.dataset.lm === 'save'){ if (!isAdmin()) return; const { error } = await sb.from('liq_settings').upsert({ id: 1, params: lmP, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) return alert('가정을 저장하지 못했어요: ' + error.message); lmSavedP = { ...lmP }; toast('가정을 저장했어요'); return renderLiq(); }
    if (b.dataset.lm === 'reset'){ lmP = { ...LM_DEF }; return renderLiq(); }
    if (b.dataset.lm === 'opt'){
      const best = lmBest(lmState(), lmP); if (!best) return;
      lmP = best.p; lmRecKey = ''; renderLiq();
      $('lmOptMsg').innerHTML = `적용했어요: 3개월 이하 ${best.p.t3}% · 6개월 ${best.p.t6}% · 10개월 ${best.p.t10}% · 12개월 ${best.p.t12}% · 13개월 이상 ${best.p.t13}%. 이때 월말 최저 비율은 <b>${lmPct(best.mn)}</b>입니다.`;
    }
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'lmFile'){ lmUpload([...e.target.files]); e.target.value = ''; } });
  ['dragover', 'dragenter'].forEach(ev => el.addEventListener(ev, (e) => { const d = e.target.closest && e.target.closest('#lmDrop'); if (d){ e.preventDefault(); d.classList.add('on'); } }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, (e) => { const d = e.target.closest && e.target.closest('#lmDrop'); if (d){ e.preventDefault(); d.classList.remove('on'); if (ev === 'drop') lmUpload([...e.dataTransfer.files]); } }));
}

// ---------- ALM 엑셀 읽기 (파일은 브라우저에서만 읽고 숫자만 저장) ----------
function lmLoadXlsx(){
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('엑셀 읽기 모듈을 불러오지 못했어요')); document.head.appendChild(s); });
}
function lmParseBook(wb){
  if (wb.SheetNames.length < 2) throw new Error('ALM 보고서 형식이 아니에요');
  const s1 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }), s2 = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: null });
  const title = String((s1[0] || [])[0] || '').replace(/\s/g, ''), head = s2[0] || [], iTot = head.indexOf('합계');
  const find = (n) => s2.find(r => r && (r[4] === n || r[3] === n || r[2] === n));
  const dm = String((s1[2] || [])[0] || '').match(/(\d{4})-(\d{2})(?:-(\d{2}))?/); if (!dm) throw new Error('기준일을 찾지 못했어요');
  const eom = `${dm[1]}-${dm[2]}-${String(new Date(+dm[1], +dm[2], 0).getDate()).padStart(2, '0')}`, day = dm[3] ? `${dm[1]}-${dm[2]}-${dm[3]}` : null;
  if (title === '일별규제유동성비율보고서' || title === '규제유동성비율보고서'){
    const ci = head.findIndex((h, i) => i >= 9 && (h === '기준일' || h === '기준월')), v = (n) => { const r = find(n); return r ? lmNum(r[ci]) : 0; };
    const data = { A: v('자산 합계(A)'), B: v('부채 합계(B)'), liquid: v('현금및예치금 소계'), demand: v('요구불예수금'), sav: v('저축성예수금'), loan: v('상호금융대출금') };
    if (!(data.B > 0)) throw new Error('부채 합계를 읽지 못했어요');
    return { kind: day ? 'daily_ratio' : 'monthly_ratio', base_date: day || eom, data };
  }
  if (title.startsWith('일별현금흐름분석')){
    const i1 = head.indexOf('1일이내'), row = (n) => { const r = find(n); return r ? r.slice(i1, i1 + 31).map(lmNum) : []; };
    return { kind: 'daily_cf', base_date: day, data: { sav: lmNum((find('저축성예수금') || [])[iTot]), dep: row('저축성예수금'), loan: row('상호금융대출금') } };
  }
  if (title.startsWith('현금흐름분석')){
    const i1 = head.indexOf('1개월이내'), g = (n, c) => { const r = find(n), i = head.indexOf(c); return r && i >= 0 ? lmNum(r[i]) : 0; }, mrow = (n) => { const r = find(n); return r ? r.slice(i1, i1 + 12).map(lmNum) : []; };
    if (i1 < 0) throw new Error('월별 구간(1개월이내~)을 찾지 못했어요');
    return { kind: 'monthly_cf', base_date: eom, data: { liquid: g('현금및예치금 소계', '1개월이내'), demand: mrow('요구불예수금').slice(0, 3).reduce((a, c) => a + c, 0), savTotal: g('저축성예수금', '합계'),
      dep: mrow('저축성예수금'), dep18: g('저축성예수금', '18개월이내'), dep24: g('저축성예수금', '2년이내'), dep36: g('저축성예수금', '3년이내'),
      loan: mrow('상호금융대출금'), loan18: g('상호금융대출금', '18개월이내'), loan24: g('상호금융대출금', '2년이내'), loan36: g('상호금융대출금', '3년이내') } };
  }
  return { skip: title || '알 수 없는 파일' };
}
// ---------- 계좌 목록(수신 · 대출) 집계: 파일은 브라우저에서만 읽고 월별 합계만 저장 ----------
function lmDateOf(v){   // 'YYYY-MM-DD' · 20261112 · 엑셀 날짜 → 'YYYY-MM-DD'
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const t = String(v).trim(); let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const n = Number(t); if (n > 30000 && n < 80000){ const d = new Date(Date.UTC(1899, 11, 30) + n * 864e5); return d.toISOString().slice(0, 10); }
  return null;
}
const lmAddDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lmDayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const lmR = (arr) => arr.map(x => Math.round(x));
function lmAggDep(rows, H){
  const ix = (n) => H.indexOf(n), iB = ix('본지점'), iP = ix('상품명'), iS = ix('신규일'), iM = ix('만기일'), iA = ix('계좌잔액');
  const acc = []; rows.forEach(r => { if (!r) return; const s = lmDateOf(r[iS]), m = lmDateOf(r[iM]), b = lmNum(r[iA]) / 1e6; if (s && m && b > 0) acc.push({ br: String(r[iB] ?? '').trim() || '미구분', p: String(r[iP] ?? '').trim(), s, m, b }); });
  if (!acc.length) throw new Error('읽을 수 있는 계좌가 없어요 (열: 본지점·상품명·신규일·만기일·계좌잔액)');
  const asof = acc.reduce((x, y) => y.s > x ? y.s : x, '0000-00-00'), a0 = lmYmOf(asof), N = 36;
  const m = new Array(N).fill(0), mHq = new Array(N).fill(0), mBr = new Array(N).fill(0), days = new Array(62).fill(0);
  let total = 0, jeok = 0, hq = 0, br = 0, ov = 0, ovH = 0, ovB = 0; const big = [];
  acc.forEach(x => {
    total += x.b; if (x.br === '본점') hq += x.b; else br += x.b; if (x.p.includes('적금')) jeok += x.b;
    if (x.m <= asof){ ov += x.b; if (x.br === '본점') ovH += x.b; else ovB += x.b; return; }
    const i = lmYmOf(x.m) - a0; if (i >= 0 && i < N){ m[i] += x.b; if (x.br === '본점') mHq[i] += x.b; else mBr[i] += x.b; }
    const di = lmDayDiff(asof, x.m) - 1; if (di >= 0 && di < 62) days[di] += x.b;
    if (x.b >= 500) big.push({ d: x.m, b: Math.round(x.b), br: x.br });
  });
  big.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : y.b - x.b);
  return { asof, n: acc.length, total: Math.round(total), jeok: Math.round(jeok), hq: Math.round(hq), br: Math.round(br), overdue: Math.round(ov), overdueHq: Math.round(ovH), overdueBr: Math.round(ovB), m: lmR(m), mHq: lmR(mHq), mBr: lmR(mBr), days: lmR(days), big: big.slice(0, 60) };
}
function lmAggLoan(rows, H, asof){
  const ix = (n) => H.indexOf(n), iC = ix('조합코드'), iM = ix('만기일자'), iBal = ix('대출잔액'), iP = ix('원금상환방법'), iG = ix('건전성등급');
  const N = 36, a0 = lmYmOf(asof), lump = new Array(N).fill(0), amort = new Array(N).fill(0), days = new Array(62).fill(0);
  let total = 0, normal = 0, caution = 0, npl = 0, nplH = 0, nplB = 0, lumpAll = 0, ovOk = 0, ovNpl = 0, n = 0;
  rows.forEach(r => {
    if (!r) return; const m = lmDateOf(r[iM]), b = lmNum(r[iBal]) / 1e6; if (!m || !(b > 0)) return; n++;
    const g = String(r[iG] ?? '').trim(), pm = String(r[iP] ?? '').trim(), isHq = String(r[iC]).trim() === '201';
    const bad = g.startsWith('고정') || g.startsWith('회수') || g.startsWith('추정'), ok = g === '정상' || g.startsWith('요주의');
    total += b; if (g === '정상') normal += b; else if (g.startsWith('요주의')) caution += b; else if (bad){ npl += b; if (isHq) nplH += b; else nplB += b; }
    if (pm === '일시상환') lumpAll += b;
    if (!ok) return;   // 고정이하 등은 유동자산에서 제외
    if (m <= asof){ ovOk += b; return; }
    if (pm === '일시상환'){ const i = lmYmOf(m) - a0; if (i >= 0 && i < N) lump[i] += b; const di = lmDayDiff(asof, m) - 1; if (di >= 0 && di < 62) days[di] += b; }
    else { const M = Math.max(1, lmYmOf(m) - a0), per = b / M; for (let k = 1; k <= M && k < N; k++) amort[k] += per; }   // 분할상환은 남은 개월 수로 균등 회수한다고 근사
  });
  ovNpl = 0; rows.forEach(r => { if (!r) return; const m = lmDateOf(r[iM]), b = lmNum(r[iBal]) / 1e6, g = String(r[iG] ?? '').trim(); if (m && b > 0 && m <= asof && (g.startsWith('고정') || g.startsWith('회수') || g.startsWith('추정'))) ovNpl += b; });
  if (!n) throw new Error('읽을 수 있는 대출이 없어요 (열: 만기일자·대출잔액·원금상환방법·건전성등급)');
  return { asof, n, total: Math.round(total), normal: Math.round(normal), caution: Math.round(caution), npl: Math.round(npl), nplHq: Math.round(nplH), nplBr: Math.round(nplB), lumpShare: total ? lumpAll / total : 0, overdueOk: Math.round(ovOk), overdueNpl: Math.round(ovNpl), lump: lmR(lump), amort: lmR(amort), days: lmR(days) };
}
async function lmReadFile(f){
  if (/\.csv$/i.test(f.name)){
    const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf);
    if (txt.includes('\ufffd')){ try { txt = new TextDecoder('euc-kr').decode(buf); } catch (e) {} }
    return XLSX.read(txt, { type: 'string', raw: true });
  }
  return XLSX.read(await f.arrayBuffer());
}
function lmParseList(wb){   // 계좌 목록이면 집계해서 돌려주고, 아니면 null
  const sh = wb.Sheets[wb.SheetNames[0]], all = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, raw: true });
  const H = (all[0] || []).map(x => String(x ?? '').replace(/\s/g, '')), rows = all.slice(1);
  if (H.includes('계좌잔액') && H.includes('만기일') && H.includes('신규일')){ const d = lmAggDep(rows, H); return { kind: 'book_dep', base_date: d.asof, data: d }; }
  if (H.includes('대출잔액') && H.includes('만기일자')){
    const dep = lmLast(lmReports.filter(r => r.kind === 'book_dep').map(r => ({ d: r.base_date }))), today = kstToday();
    const asof = dep && Math.abs(lmDayDiff(dep.d, today)) <= 7 ? dep.d : today, d = lmAggLoan(rows, H, asof); return { kind: 'book_loan', base_date: asof, data: d };
  }
  return null;
}
async function lmUpload(files){
  if (!isAdmin()) return toast('자료 올리기는 관리자만 할 수 있어요');
  files = files.filter(f => /\.(xlsx|csv)$/i.test(f.name)); if (!files.length) return toast('엑셀(.xlsx) 또는 CSV 파일을 올려주세요');
  try { await lmLoadXlsx(); } catch (e) { return alert(e.message); }
  const ok = [], bad = [];
  for (const f of files){
    try {
      const wb = await lmReadFile(f), rep = lmParseList(wb) || lmParseBook(wb);
      if (rep.skip){ bad.push(`${f.name}: 쓰지 않는 보고서(${rep.skip})`); continue; }
      const { error } = await sb.from('liq_reports').upsert({ ...rep, uploaded_by: me, updated_at: new Date().toISOString() }, { onConflict: 'kind,base_date' });
      if (error) throw new Error(error.message);
      if (rep.kind === 'daily_ratio' || rep.kind === 'monthly_ratio'){   // 현황판 규제유동성비율 카드에도 같은 값이 들어가도록
        const e2 = await sb.from('perf_liq').upsert({ base_date: rep.base_date, asset: Math.round(rep.data.A), debt: Math.round(rep.data.B), entered_by: me, updated_at: new Date().toISOString() }, { onConflict: 'base_date' });
        if (e2.error) bad.push(`${f.name}: 현황판 값 저장 실패(${e2.error.message})`);
      }
      ok.push(`${LM_KIND[rep.kind]} ${rep.base_date}`);
    } catch (e) { bad.push(`${f.name}: ${e.message}`); }
  }
  await loadLiq();
  if (ok.length) toast(`올렸어요: ${ok.join(', ')}`);
  if (typeof loadPerf === 'function') loadPerf();   // 현황판 규제유동성비율 카드도 바로 새 값으로
  if (bad.length) alert('일부 파일은 반영하지 못했어요.\n\n' + bad.join('\n'));
}
