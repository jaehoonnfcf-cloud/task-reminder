// 현황판 — 여수신 실적 대시보드. 관리자가 전 영업일 기준 실적(본점·지점 수신/여신 잔액, 합산 연체율)을 입력하고, 모든 팀원이 본다.
// 목표(A)와 전년말 기준값은 연 1회 관리자가 설정한다. 달성률·차액·합산은 화면에서 자동 계산한다.
// index.html 의 전역(sb, $, esc, me, isAdmin, kstToday, toast, divn, calMain)을 함께 쓴다.

let perfLiq = [], perfRows = [], perfYears = {}, perfSel = null, perfTab = 'dep', perfTable = false, perfTimer = null;
let perfFormDate = null;

const pfNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const pfDec = (s) => { const t = String(s ?? '').replace(/[^0-9.]/g, ''); const n = parseFloat(t); return isNaN(n) ? null : n; };
// 저장은 백만원 정수, 화면·입력은 억원 (1억원 = 100백만원, 소수 둘째 자리까지 = 백만원 단위 정확)
const pfE = (n) => (n === null || n === undefined || isNaN(n)) ? '-' : Math.round(Number(n) / 100).toLocaleString('ko-KR') + '억원';
const pfEn = (n) => (n === null || n === undefined || isNaN(n)) ? '' : Math.round(Number(n) / 100).toLocaleString('ko-KR');   // 입력칸용(단위 없음)
const pfEin = (s) => { const t = String(s ?? '').replace(/,/g, '').trim(); return /^\d+$/.test(t) ? Number(t) * 100 : null; };   // 억원 정수 문자열 → 백만원 정수
const pfEfmt = (s) => { const t = String(s ?? '').replace(/[^0-9.]/g, '').split('.')[0].replace(/^0+(?=\d)/, ''); return t ? Number(t).toLocaleString('ko-KR') : ''; };   // 입력 중 콤마만 (소수점 입력 불가)
const pfP = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(d);
const pfDow = (iso) => ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T12:00:00Z').getUTCDay()];
const pfMd = (iso) => `${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}`;
// 표기 관례: 감소는 ▲(우리 보고서 방식), 증가는 +
const pfSigned = (n, unit = '') => n === 0 ? `±0${unit}` : `${n > 0 ? '+' : '▲'}${Math.abs(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}`;
const pfSignedE = (n) => n === 0 ? '±0억원' : `${n > 0 ? '+' : '▲'}${pfE(Math.abs(n))}`;
// 좋아진 방향은 초록, 나빠진 방향은 빨강 (잔액은 증가가 좋음, 연체율은 감소가 좋음). 화살표는 실제 증감 방향 그대로
const pfCls = (n, inv = false) => n === 0 ? 'fl' : (n > 0) !== inv ? 'gd' : 'bd';
const pfAdd = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// 휴일(주말 + 조합 달력의 공휴일)을 건너뛴 직전 영업일
function pfIsHoliday(iso){
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay();
  if (dow === 0 || dow === 6) return true;
  const evs = (typeof calMain !== 'undefined' && calMain.state.events) || [];
  return evs.some(e => e.kind === '공휴일' && e.start_date <= iso && (e.end_date || e.start_date) >= iso);
}
function pfPrevBizDay(from = kstToday()){
  let d = pfAdd(from, -1);
  for (let i = 0; i < 15 && pfIsHoliday(d); i++) d = pfAdd(d, -1);
  return d;
}

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #perf{ min-width:0; }
  .pfcard{ background:#fff; border-radius:26px; box-shadow:var(--sh); padding:20px 22px 22px; }
  .pfh{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; } .pfh b{ font-size:18px; letter-spacing:-.03em; } .pfh .sp{ flex:1; }
  .pftag{ background:var(--accent-soft); color:var(--accent); border-radius:99px; padding:3px 11px; font-size:12.5px; font-weight:700; }
  .pfnav{ display:inline-flex; align-items:center; background:#f1f3f7; border-radius:99px; padding:3px; }
  .pfnav button{ border:0; background:transparent; width:32px; height:30px; border-radius:99px; font-size:13px; font-weight:800; color:#44546f; cursor:pointer; } .pfnav button:hover:not(:disabled){ background:#fff; } .pfnav button:disabled{ opacity:.3; cursor:default; }
  .pfkpis{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:16px; }
  .pfkpis .pfk{ padding:15px 15px 16px; } .pfkpis .pfk .big{ font-size:27px; } .pfkpis .pfk .big small{ display:block; margin:2px 0 0; font-size:12px; } .pfkpis .pfrow{ flex-wrap:wrap; gap:2px 8px; } .pfkpis .pfk .t{ flex-wrap:wrap; }
  .pfkpis .pflqg{ grid-template-columns:1fr; gap:6px; } .pfkpis .pflqg .col + .col{ margin-top:6px; }
  @media (max-width:1100px){ .pfkpis{ grid-template-columns:repeat(2,minmax(0,1fr)); } .pfkpis .pfk{ padding:16px 18px; } .pfkpis .pfk .big{ font-size:30px; } .pfkpis .pfk .big small{ display:inline-block; margin-left:6px; font-size:13px; } }
  .pfcht{ margin-top:auto; padding-top:12px; } .pfcht .ct{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:12.5px; font-weight:800; margin:12px 0 2px; padding-top:10px; border-top:1px dashed rgba(60,70,110,.22); } .pfcht .ct em{ font-style:normal; font-weight:600; color:var(--muted); font-size:12px; }
  .pfk{ border-radius:22px; padding:16px 18px; min-width:0; } .pfk.b{ background:#eef3ff; } .pfk.p{ background:#f3efff; } .pfk.r{ background:#fff1f0; }
  .pfk .t{ font-size:13px; font-weight:800; display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .pfk.b .t > span:first-child{ color:#2f55c8; } .pfk.p .t > span:first-child{ color:#5b3fc4; } .pfk.r .t > span:first-child{ color:#b42318; }
  .pfk .pill{ font-size:12px; font-weight:800; padding:3px 9px; border-radius:99px; background:#fff; white-space:nowrap; }
  .pfk.b .pill{ color:#2f55c8; } .pfk.p .pill{ color:#5b3fc4; } .pfk.r .pill{ color:#b42318; } .pfk .pill.ok{ color:var(--green) !important; }
  .pfk .big{ font-size:32px; font-weight:800; letter-spacing:-.04em; margin-top:6px; font-variant-numeric:tabular-nums; line-height:1.15; }
  .pfk .big small{ font-size:13px; font-weight:700; color:var(--muted); margin-left:6px; letter-spacing:0; white-space:nowrap; display:inline-block; }
  .pfk.l{ background:#e9f8f1; } .pfk.l .t > span:first-child{ color:#0e7a4f; } .pfk.l .pill{ color:#0e7a4f; background:#fff; } .pfk.l .pill.bad{ color:#b42318 !important; }
  .pfkpis > .pfk{ display:flex; flex-direction:column; justify-content:space-between; gap:12px; }
  .pfplus{ border:0; cursor:pointer; width:26px; height:26px; border-radius:50%; background:#fff; color:#0e7a4f; font-weight:800; font-size:16px; line-height:1; box-shadow:0 1px 3px rgba(20,24,40,.15); flex:none; }
  .pfliq{ margin:0; } .pflqg{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:6px 26px; align-items:start; margin-top:4px; } @media (max-width:760px){ .pflqg{ grid-template-columns:1fr; } } .pflqg .col{ min-width:0; }
  .pftk{ position:relative; } .pftk i.tick{ position:absolute; top:-3px; bottom:-3px; width:2px; background:#16181d; opacity:.7; border-radius:2px; } .pftkl{ font-size:11.5px; color:var(--muted); font-weight:700; display:flex; justify-content:space-between; margin-top:4px; }
  .pfd-tiles{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:16px; }
  .pft{ appearance:none; -webkit-appearance:none; border:2px solid transparent; background:#f6f7fb; border-radius:22px; padding:16px 18px 12px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:8px; font:inherit; color:var(--ink); position:relative; min-width:0; transition:box-shadow .15s, background .15s, border-color .15s; }
  .pft.warn{ background:#fff0ee; border-color:#f4b9b0; } .pft.warn:hover{ background:#ffe8e5; } .pft.warn.on{ background:#fff0ee; border-color:#d93b2b; box-shadow:0 12px 26px -14px #d93b2b; } .pft.warn .pft-s.bad{ background:#d93b2b; color:#fff; } .pft.warn .pft-b{ border-top-color:#f4c9c3; } .pft.warn .pft-m{ background:#f9d3cd; }
  .pft:hover{ background:#f0f2f8; } .pft.on{ background:#fff; border-color:var(--c); box-shadow:0 12px 26px -14px var(--c); }
  .pft-h{ display:flex; align-items:center; gap:8px; min-width:0; } .pft-dot{ width:10px; height:10px; border-radius:50%; background:var(--c); flex:none; } .pft-n{ font-size:14px; font-weight:800; letter-spacing:-.02em; white-space:nowrap; }
  .pft-s{ margin-left:auto; font-size:11.5px; font-weight:800; border-radius:99px; padding:3px 9px; white-space:nowrap; } .pft-s.ok{ color:#0a7a2a; background:#e4f6ea; } .pft-s.bad{ color:#b42318; background:#fdecec; } .pft-s.neu{ color:#5a6172; background:#eceff5; }
  .pft-v{ font-size:32px; font-weight:800; letter-spacing:-.04em; line-height:1.1; margin-top:2px; } .pft-v small{ font-size:15px; font-weight:700; color:var(--muted); margin-left:3px; letter-spacing:0; }
  .pft-m{ position:relative; height:6px; border-radius:99px; background:var(--ct); } .pft-m i{ display:block; height:100%; border-radius:99px; background:var(--c); } .pft-m u{ position:absolute; top:-3px; bottom:-3px; width:2px; background:#16181d; opacity:.65; border-radius:2px; text-decoration:none; }
  .pft-t{ font-size:12.5px; color:var(--muted); font-weight:600; min-height:17px; } .pft-d{ display:flex; flex-wrap:wrap; gap:2px 14px; font-size:12.5px; color:#5a6172; min-height:18px; } .pft-d b{ font-weight:800; }
  .pft .gd{ color:#0a7a2a; } .pft .bd{ color:#c23030; } .pft .fl{ color:var(--muted); }
  .pft-b{ display:flex; flex-direction:column; gap:7px; margin-top:4px; padding-top:10px; border-top:1px solid #e6e9f0; font-size:12.5px; }
  .pft-r{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; color:#5a6172; } .pft-r b{ color:var(--ink); font-weight:800; } .pft-r .pfbn{ font-weight:800; color:var(--ink); } .pft-r .pfem{ font-style:normal; color:var(--muted); font-size:11.5px; }
  .pft-r>span:first-child{ white-space:nowrap; }
  @media (max-width:760px){ .pft-b{ font-size:12px; } .pft-b>.pft-r{ flex-direction:column; align-items:flex-start; gap:1px; } .pft-br .pfem{ display:none; } .pft-r b{ white-space:nowrap; } }
  .pft-br{ display:flex; flex-direction:column; gap:4px; } .pft-bar{ display:block; height:5px; border-radius:99px; overflow:hidden; } .pft-bar i{ display:block; height:100%; border-radius:99px; }
  .pft .gd{ color:#0a7a2a; font-weight:800; } .pft .bd{ color:#c23030; font-weight:800; }
  .pft-sp{ position:relative; height:34px; margin-top:2px; } .pfspk{ width:100%; height:34px; display:block; } .pfspd{ position:absolute; width:10px; height:10px; border-radius:50%; border:2px solid #fff; box-sizing:border-box; transform:translateY(-50%); }
  .pfd-focus{ display:block; margin-top:16px; }
  .pfchips{ display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; } .pfchip{ background:#fff; border-radius:14px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:104px; box-shadow:0 1px 2px rgba(20,24,40,.06); } .pfchip > span{ font-size:12px; color:#5a6172; font-weight:600; } .pfchip b{ font-size:15px; font-weight:800; letter-spacing:-.02em; } .pfchip .gd{ color:#0a7a2a; } .pfchip .bd{ color:#c23030; } .pfchip .tg{ color:var(--accent); } .pfchip .fl{ color:var(--muted); font-weight:700; }
  .pfd-main{ background:#f9fafc; border-radius:22px; padding:16px 18px 14px; min-width:0; } .pfd-side{ background:#f6f7fb; border-radius:22px; padding:18px 18px 16px; min-width:0; }
  .pfd-h{ display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; } .pfd-h b{ font-size:16px; letter-spacing:-.02em; }
  .pfd-chart{ position:relative; margin-top:10px; min-height:230px; } .pftip{ position:absolute; pointer-events:none; background:#16181d; color:#fff; border-radius:10px; padding:7px 11px; font-size:12px; white-space:nowrap; box-shadow:0 8px 20px rgba(0,0,0,.25); z-index:2; }
  .pftd{ opacity:.7; } .pftv{ font-size:15px; font-weight:800; display:flex; align-items:center; gap:7px; margin-top:1px; } .pftv i{ width:12px; height:3px; border-radius:2px; display:inline-block; } .pftd2{ font-size:11.5px; margin-top:2px; } .pftd2.gd{ color:#7be0a0; } .pftd2.bd{ color:#ff9a9a; } .pftd2.fl{ color:#bbb; }
  .pfs-t{ font-size:14.5px; font-weight:800; display:flex; align-items:center; gap:8px; margin-bottom:6px; } .pfs-t i{ width:10px; height:10px; border-radius:50%; display:inline-block; }
  .pfkv{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding:9px 0; border-bottom:1px solid #e6e9f0; font-size:13.5px; } .pfkv > span{ color:#5a6172; } .pfkv b{ font-weight:800; text-align:right; } .pfkv .gd{ color:#0a7a2a; font-weight:800; } .pfkv .bd{ color:#c23030; font-weight:800; } .pfkv .tg{ color:var(--accent); font-weight:800; } .pfkv .fl{ color:var(--muted); }
  .pfs-sep{ height:10px; } .pfem{ font-style:normal; color:var(--muted); font-size:12px; margin-left:4px; font-weight:600; }
  .pfbr2{ margin-top:12px; } .pfbt2{ display:flex; justify-content:space-between; gap:8px; font-size:13px; } .pfbt2 em{ font-style:normal; color:var(--muted); font-size:12px; } .pfbar2{ height:6px; border-radius:99px; margin-top:6px; overflow:hidden; } .pfbar2 i{ display:block; height:100%; border-radius:99px; }
  @media (max-width:1100px){ .pfd-tiles{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:760px){ .pft-h{ display:grid; grid-template-columns:auto 1fr; align-items:center; gap:6px 8px; } .pft-s{ margin-left:0; grid-column:1 / -1; justify-self:start; } .pft-d{ flex-direction:column; gap:2px; } .pft-d > span{ white-space:nowrap; } .pft{ padding:14px 14px 10px; } .pft-v{ font-size:27px; } .pft-s{ font-size:11px; padding:2px 7px; } .pfd-main{ padding:14px 12px 12px; } }
  .pfbar{ height:10px; background:#fff; border-radius:99px; margin-top:10px; overflow:hidden; } .pfbar i{ display:block; height:100%; border-radius:99px; }
  .pfrow{ display:flex; justify-content:space-between; gap:8px; font-size:12.5px; color:#5a6172; margin-top:6px; font-weight:600; } .pfrow b{ color:var(--ink); }
  .pfrow .gd{ color:var(--green); font-weight:800; } .pfrow .bd{ color:#e5484d; font-weight:800; } .pfrow .tg{ color:var(--accent); font-weight:800; } .pfrow .fl{ color:var(--muted); font-weight:700; }
  .pftrend3{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:14px; } @media (max-width:1100px){ .pftrend3{ grid-template-columns:repeat(2,minmax(0,1fr)); } } .pftrend1{ display:none; margin-top:14px; }
  .pfbrs{ margin-top:12px; padding-top:10px; border-top:1px dashed rgba(60,70,110,.22); display:flex; flex-direction:column; gap:10px; }
  .pfbt{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:13px; } .pfbt b{ font-weight:800; } .pfbt em{ font-style:normal; color:var(--muted); font-weight:600; font-size:12px; } .pfbp{ font-weight:800; font-size:13.5px; white-space:nowrap; }
  .pfbar.sm{ height:8px; margin-top:5px; }
  .pfmini{ background:#f7f8fb; border-radius:20px; padding:14px 16px; min-width:0; }
  .pfmini .tt{ font-size:13px; font-weight:800; }
  .pftabs{ display:inline-flex; background:#eef0f6; border-radius:99px; padding:3px; gap:2px; }
  .pftabs button{ border:0; background:transparent; padding:5px 13px; border-radius:99px; font-size:12.5px; font-weight:800; color:#6a7185; cursor:pointer; } .pftabs button.on{ background:#fff; color:var(--accent); box-shadow:0 1px 3px rgba(20,24,40,.12); }
  .pfm{ overflow-x:auto; margin-top:10px; } table.pft{ width:100%; min-width:640px; border-collapse:separate; border-spacing:0; font-size:14px; font-variant-numeric:tabular-nums; }
  table.pft th{ background:#f3f5fa; padding:8px 10px; font-size:12px; color:#5a6172; font-weight:800; text-align:center; border-bottom:1px solid #e8ebf3; }
  table.pft th.g1{ background:#e9efff; color:#2f55c8; } table.pft th.g2{ background:#efeaff; color:#5b3fc4; } table.pft th.g3{ background:#fff1e0; color:#a54800; }
  table.pft td{ padding:9px 10px; text-align:right; border-bottom:1px solid #eef0f5; } table.pft td.l{ text-align:center; font-weight:800; background:#fafbfd; }
  table.pft tr.sum td{ background:#fff6d6; font-weight:800; } table.pft td.d{ color:#e5484d; font-weight:700; } table.pft td.g{ color:var(--green); font-weight:700; }
  .pfnote{ margin-top:10px; color:var(--muted); font-size:12.5px; line-height:1.5; }
  .pfempty{ text-align:center; padding:26px 10px 10px; color:var(--muted); font-size:14px; line-height:1.6; }
  .pfform{ display:grid; grid-template-columns:1fr 1fr; gap:4px 14px; } .pfform input{ text-align:right; font-weight:700; } .pfform input[type=date]{ text-align:left; }
  .pfsub{ font-size:12px; color:var(--muted); font-weight:600; margin-top:2px; }
  @media (max-width:760px){
    .pfcard{ padding:16px 14px 18px; border-radius:22px; }
    .pfkpis{ grid-template-columns:1fr; gap:10px; } .pfk .big{ font-size:30px; }
    .pftrend3{ display:none; } .pftrend1{ display:block; }
    .pfh .m{ display:none; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="pfOvIn"><div class="panel" style="max-width:520px" id="pfInPanel"></div></div>
    <div class="ov" id="pfOvTg"><div class="panel" style="max-width:560px" id="pfTgPanel"></div></div>
    <div class="ov" id="pfOvLq"><div class="panel" style="max-width:520px" id="pfLqPanel"></div></div>`;
  document.body.appendChild(d);
  $('pfOvIn').addEventListener('click', (e) => { if (e.target === $('pfOvIn')) pfCloseIn(); });
  $('pfOvTg').addEventListener('click', (e) => { if (e.target === $('pfOvTg')) pfCloseTg(); });
  $('pfOvLq').addEventListener('click', (e) => { if (e.target === $('pfOvLq')) pfCloseLq(); });
})();

async function loadPerf(){
  const [d, y, lq] = await Promise.all([
    sb.from('perf_daily').select('*').order('base_date', { ascending: false }).limit(400),
    sb.from('perf_year').select('*'),
    sb.from('perf_liq').select('*').order('base_date', { ascending: true }),
  ]);
  if (d.error || y.error){ console.warn('실적 불러오기 실패', (d.error || y.error).message); return; }
  if (!lq.error) perfLiq = lq.data || [];
  perfRows = (d.data || []).sort((a, b) => a.base_date.localeCompare(b.base_date));
  perfYears = Object.fromEntries((y.data || []).map(r => [r.year, r]));
  if (!perfSel || !perfRows.some(r => r.base_date === perfSel)) perfSel = perfRows.length ? perfRows[perfRows.length - 1].base_date : null;
  if (divn === 'home') renderPerf();
}
function schedulePerf(){ clearTimeout(perfTimer); perfTimer = setTimeout(() => { if (me) loadPerf(); }, 400); }

function pfCalc(){
  const i = perfRows.findIndex(r => r.base_date === perfSel); if (i < 0) return null;
  const r = perfRows[i], prev = i > 0 ? perfRows[i - 1] : null, Y = perfYears[+r.base_date.slice(0, 4)] || {};
  const s = (a, b) => (a === null || a === undefined || b === null || b === undefined) ? null : Number(a) + Number(b);
  const o = { i, r, prev, Y,
    dep: Number(r.dep_hq) + Number(r.dep_br), loan: Number(r.loan_hq) + Number(r.loan_br),
    depT: s(Y.dep_hq_t, Y.dep_br_t), loanT: s(Y.loan_hq_t, Y.loan_br_t) };
  o.pDep = prev ? Number(prev.dep_hq) + Number(prev.dep_br) : null; o.pLoan = prev ? Number(prev.loan_hq) + Number(prev.loan_br) : null;
  return o;
}

// 본점·지점 각각의 목표 대비 진행 (합산과 같은 '채워지는 막대')


// ---------- 규제유동성비율 (유동자산합계 ÷ 유동부채합계, 100% 이상 유지) — 전 영업일 기준, 전월말·전분기말과 비교 ----------
const LQ_MIN = 100;
const lqRatio = (r) => r ? Number(r.asset) / Number(r.debt) * 100 : null;
const lqAt = (d) => { let x = null; for (const r of perfLiq){ if (r.base_date <= d) x = r; else break; } return x; };   // 그 날짜 이하의 가장 최근 입력
const lqMonthEnd = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 0)).toISOString().slice(0, 10);   // 전월 말일
const lqQuarterEnd = (iso) => new Date(Date.UTC(+iso.slice(0, 4), Math.floor((+iso.slice(5, 7) - 1) / 3) * 3, 0)).toISOString().slice(0, 10);   // 직전 분기 말일
const lqM = (n) => Number(n).toLocaleString('ko-KR') + '백만원';
// 규제유동성비율 추이: 입력된 값(최근 20건) + 기준 100% 선
// ================= 새 대시보드 (타일 4개 + 선택한 지표의 큰 추이 + 상세) =================
// 색은 지표(개체)에 고정: 수신 파랑 · 여신 청록 · 연체율 주황 · 규제유동성비율 보라 (validate_palette 통과 순서). 상태색(초록/빨강)은 ✓·⚠ 아이콘+글자와 함께만 쓴다.
const PF_COL = { dep: '#2a78d6', loan: '#1baf7a', delinq: '#eb6834', liq: '#6250d6' };
const PF_NAME = { dep: '수신', loan: '여신', delinq: '연체율', liq: '규제유동성비율' };
let perfRaw = false;
const pfAlpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const pfSg = (v, unit, dec = 0) => v === null || v === undefined ? '' : (Math.abs(v) < Math.pow(10, -dec) / 2 ? `±0${unit}` : `${v > 0 ? '+' : '▲'}${Math.abs(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${unit}`);
const pfNm = (v, dec = 0) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// 지표별로 화면에 필요한 값을 한 번에 계산 (수신·여신은 억원, 연체율·유동성비율은 %)
function pfMetric(k, c){
  const Y = c.Y, r = c.r, has = (v) => v !== null && v !== undefined && !isNaN(v), yr = (cur, p) => has(p) && Number(p) ? { v: cur - Number(p), pct: (cur - Number(p)) / Number(p) * 100 } : null;
  const m = { k, name: PF_NAME[k], color: PF_COL[k], dec: 0, unit: '억원', better: 'up', tgtLabel: '목표', rows: [], cur: 0, tgt: null, dPrev: null, dYear: null, yLabel: '전년말', pLabel: '전일' };
  if (k === 'dep' || k === 'loan'){
    const a = k === 'dep' ? ['dep_hq', 'dep_br'] : ['loan_hq', 'loan_br'], tot = (x) => (Number(x[a[0]]) + Number(x[a[1]])) / 100;
    m.rows = perfRows.slice(Math.max(0, c.i - 19), c.i + 1).map(x => ({ d: x.base_date, v: tot(x) }));
    m.cur = tot(r); const t = k === 'dep' ? c.depT : c.loanT; m.tgt = has(t) ? Number(t) / 100 : null;
    const pv = c.prev ? tot(c.prev) : null; m.dPrev = pv === null ? null : m.cur - pv;
    const py = yr(m.cur, k === 'dep' ? (has(Y.prev_dep) ? Number(Y.prev_dep) / 100 : null) : (has(Y.prev_loan) ? Number(Y.prev_loan) / 100 : null)); m.dYear = py;
    m.hq = { v: Number(r[a[0]]) / 100, t: has(Y[k === 'dep' ? 'dep_hq_t' : 'loan_hq_t']) ? Number(Y[k === 'dep' ? 'dep_hq_t' : 'loan_hq_t']) / 100 : null };
    m.br = { v: Number(r[a[1]]) / 100, t: has(Y[k === 'dep' ? 'dep_br_t' : 'loan_br_t']) ? Number(Y[k === 'dep' ? 'dep_br_t' : 'loan_br_t']) / 100 : null };
  } else if (k === 'delinq'){
    m.unit = '%'; m.dec = 2; m.better = 'down';
    m.rows = perfRows.slice(Math.max(0, c.i - 19), c.i + 1).map(x => ({ d: x.base_date, v: Number(x.delinq) }));
    m.cur = Number(r.delinq); m.tgt = has(Y.delinq_t) ? Number(Y.delinq_t) : null; m.dPrev = c.prev ? m.cur - Number(c.prev.delinq) : null;
    m.dYear = has(Y.prev_delinq) ? { v: m.cur - Number(Y.prev_delinq), pct: null, base: Number(Y.prev_delinq) } : null;
  } else {
    m.unit = '%'; m.dec = 2; m.tgtLabel = '기준'; m.tgt = LQ_MIN; m.pLabel = '전월말'; m.yLabel = '전분기말';
    const cur = lqAt(perfSel); m.curRow = cur; if (!cur){ m.empty = true; return m; }
    m.rows = perfLiq.filter(x => x.base_date <= cur.base_date).slice(-20).map(x => ({ d: x.base_date, v: lqRatio(x) }));
    m.cur = lqRatio(cur); const pm = lqAt(lqMonthEnd(perfSel)), pq = lqAt(lqQuarterEnd(perfSel));
    m.pmRow = pm; m.pqRow = pq; m.dPrev = pm ? m.cur - lqRatio(pm) : null; m.dYear = pq ? { v: m.cur - lqRatio(pq), pct: null, base: lqRatio(pq) } : null;
  }
  return m;
}
// 상태 문구(아이콘+글자): 상태색은 색만으로 뜻을 전하지 않는다
function pfStatus(m){
  if (m.empty) return { cls: 'neu', txt: '입력 전' };
  if (m.k === 'dep' || m.k === 'loan') return m.tgt ? { cls: m.cur >= m.tgt ? 'ok' : 'neu', txt: `${m.cur >= m.tgt ? '✓ ' : ''}달성률 ${pfNm(m.cur / m.tgt * 100, 1)}%` } : { cls: 'neu', txt: '목표 미설정' };
  if (m.k === 'delinq') return m.tgt === null ? { cls: 'neu', txt: '목표 미설정' } : (m.cur <= m.tgt ? { cls: 'ok', txt: `✓ 목표 이내 −${pfNm(m.tgt - m.cur, 2)}%p` } : { cls: 'bad', txt: `⚠ 목표 초과 +${pfNm(m.cur - m.tgt, 2)}%p` });
  return m.cur >= LQ_MIN ? { cls: 'ok', txt: `✓ 기준 충족 +${pfNm(m.cur - LQ_MIN, 2)}%p` } : { cls: 'bad', txt: `⚠ 기준 미달 −${pfNm(LQ_MIN - m.cur, 2)}%p` };
}
const pfDeltaCls = (m, v) => { const p = Math.pow(10, m.dec), rv = Math.round(v * p) / p; return rv === 0 ? 'fl' : ((rv > 0) === (m.better === 'up') ? 'gd' : 'bd'); };
function pfSpark(m, W = 150, H = 34){
  const v = m.rows.slice(-12).map(x => x.v); if (v.length < 2) return `<div class="pfspk0"></div>`;
  const lo = Math.min(...v), hi = Math.max(...v), sp = (hi - lo) || Math.abs(hi) * .02 || 1, x = (i) => 4 + (W - 8) * i / (v.length - 1), y = (a) => 5 + (H - 10) * (1 - (a - lo) / sp);
  return `<svg class="pfspk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${v.map((a, i) => `${x(i).toFixed(1)},${y(a).toFixed(1)}`).join(' ')}" fill="none" stroke="#c3c8d4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg><span class="pfspd" style="left:calc(${(x(v.length - 1) / W * 100).toFixed(2)}% - 5px);top:${(y(v[v.length - 1]) / H * 100).toFixed(2)}%;background:${m.color}"></span>`;
}
// 타일 아래 칸: 수신·여신은 본점/지점 잔액과 목표 대비, 연체율·유동성비율은 판단에 필요한 숫자 두 줄
function pfTileBottom(m){
  const row = (l, v, sub) => `<span class="pft-r"><span>${l}</span><b>${v}</b>${sub || ''}</span>`;
  if (m.k === 'dep' || m.k === 'loan'){
    const br = (n, o) => `<span class="pft-br"><span class="pft-r"><span><b class="pfbn">${n}</b> ${pfNm(o.v)}억원${o.t ? `<em class="pfem"> / 목표 ${pfNm(o.t)}</em>` : ''}</span>${o.t ? `<b>${pfNm(o.v / o.t * 100, 1)}%</b>` : '<em class="pfem">목표 미설정</em>'}</span>${o.t ? `<span class="pft-bar" style="background:${pfAlpha(m.color, .14)}"><i style="width:${Math.min(100, o.v / o.t * 100)}%;background:${m.color}"></i></span>` : ''}</span>`;
    return br('본점', m.hq) + br('지점', m.br);
  }
  if (m.k === 'delinq'){
    const left = m.tgt === null ? null : m.cur - m.tgt;
    return row('목표까지', left === null ? '-' : left > 0 ? `<span class="bd">${pfNm(left, 2)}%p 초과</span>` : `<span class="gd">${pfNm(-left, 2)}%p 이내</span>`) + row('전년말', m.dYear ? `${pfNm(m.dYear.base, 2)}%` : '-');
  }
  return row('유동자산', lqM(m.curRow.asset)) + row('유동부채', lqM(m.curRow.debt));
}
function pfTile(m, sel, adm){
  const st = pfStatus(m), c = m.color;
  const frac = m.empty ? 0 : m.k === 'liq' ? Math.min(1, m.cur / 120) : m.k === 'delinq' ? (m.tgt === null ? 0 : m.cur <= m.tgt ? 1 : m.tgt / m.cur) : (m.tgt ? Math.min(1, m.cur / m.tgt) : 0);
  const big = m.empty ? '-' : `${pfNm(m.cur, m.dec)}<small>${m.unit}</small>`;
  const d1 = m.dPrev === null ? '' : `<span>${m.pLabel} <b class="${pfDeltaCls(m, m.dPrev)}">${pfSg(m.dPrev, m.k === 'dep' || m.k === 'loan' ? '억' : '%p', m.k === 'dep' || m.k === 'loan' ? 0 : 2)}</b></span>`;
  const d2 = !m.dYear ? '' : `<span>${m.yLabel} <b class="${pfDeltaCls(m, m.dYear.v)}">${pfSg(m.dYear.v, m.k === 'dep' || m.k === 'loan' ? '억' : '%p', m.k === 'dep' || m.k === 'loan' ? 0 : 2)}</b></span>`;
  return `<button type="button" class="pft ${sel ? 'on' : ''} ${st.cls === 'bad' ? 'warn' : ''}" data-pf="tab" data-t="${m.k}" style="--c:${c};--ct:${pfAlpha(c, .14)}" aria-pressed="${sel}">
    <span class="pft-h"><i class="pft-dot"></i><span class="pft-n">${m.name}</span><span class="pft-s ${st.cls}">${esc(st.txt)}</span></span>
    <span class="pft-v">${big}</span>
    <span class="pft-m"><i style="width:${(frac * 100).toFixed(1)}%"></i>${m.k === 'liq' && !m.empty ? `<u style="left:${LQ_MIN / 120 * 100}%"></u>` : ''}</span>
    <span class="pft-t">${m.empty ? (adm ? '규제유동성비율 값을 입력해주세요' : '입력 전') : m.tgt !== null ? `${m.tgtLabel} ${pfNm(m.tgt, m.dec)}${m.unit}${m.k === 'liq' ? ' 이상' : ''}` : '&nbsp;'}</span>
    <span class="pft-d">${d1}${d2}</span><span class="pft-b">${m.empty ? '' : pfTileBottom(m)}</span></button>`;
}
// 오른쪽 상세: 선택한 지표만 (수신·여신은 본점/지점, 유동성비율은 자산·부채와 전월말/전분기말)
function pfSide(m, adm){   // 차트 위의 값 칩: 선택한 지표의 현재·목표·비교 숫자를 한 줄로
  const chip = (l, v) => `<div class="pfchip"><span>${l}</span><b>${v}</b></div>`, u = m.unit, d = m.dec, sgn = (v, dd) => pfSg(v, u === '억원' ? '억원' : '%p', dd);
  if (m.empty) return `<div class="pfsub" style="font-size:13px;line-height:1.6">${adm ? '아직 입력된 값이 없어요. “＋ 실적 입력”에서 유동자산합계·유동부채합계를 함께 입력하세요. 전월말·전분기말 값은 아래 버튼으로 과거 날짜를 입력하면 비교에 쓰여요.' : '관리자가 입력하면 표시돼요.'}</div>${adm ? '<button class="btn small" data-pf="liq" style="margin-top:10px">＋ 과거 날짜 입력</button>' : ''}`;
  let h = chip('현재', `${pfNm(m.cur, d)}${u}`);
  if (m.tgt !== null){
    const left = m.better === 'up' ? m.tgt - m.cur : m.cur - m.tgt;
    h += chip(`${m.tgtLabel}${m.k === 'liq' ? '(이상)' : ''}`, `${pfNm(m.tgt, d)}${u}`);
    if (m.k === 'liq') h += chip('기준 대비', m.cur >= m.tgt ? `<span class="gd">+${pfNm(m.cur - m.tgt, 2)}%p 충족</span>` : `<span class="bd">−${pfNm(m.tgt - m.cur, 2)}%p 미달</span>`);
    else if (m.better === 'up') h += chip(left > 0 ? '목표까지' : '목표 초과', `<span class="${left > 0 ? 'tg' : 'gd'}">${pfNm(Math.abs(left), d)}억원</span>`);
    else h += chip(left > 0 ? '목표 초과' : '목표 이내', `<span class="${left > 0 ? 'bd' : 'gd'}">${pfNm(Math.abs(left), d)}%p</span>`);
  }
  if (m.dPrev !== null) h += chip(`${m.pLabel} 대비`, `<span class="${pfDeltaCls(m, m.dPrev)}">${sgn(m.dPrev, d)}</span>`);
  if (m.dYear) h += chip(`${m.yLabel} 대비`, `<span class="${pfDeltaCls(m, m.dYear.v)}">${sgn(m.dYear.v, d)}${m.dYear.pct !== null ? ` (${m.dYear.pct >= 0 ? '+' : ''}${pfNm(m.dYear.pct, 1)}%)` : ''}</span>`);
  if (m.k === 'liq'){
    const cmp = (l, row, end) => !row ? chip(l, `<span class="fl">${adm ? `입력 필요 (${pfMd(end).replace(' ', '')})` : '-'}</span>`) : chip(`${l} <em class="pfem">${pfMd(row.base_date).replace(' ', '')}</em>`, `${pfNm(lqRatio(row), 2)}%`);
    h += cmp('전월말', m.pmRow, lqMonthEnd(perfSel)) + cmp('전분기말', m.pqRow, lqQuarterEnd(perfSel));
    if (m.curRow.base_date !== perfSel) h += chip('기준일', `${pfMd(m.curRow.base_date).replace(' ', '')} <span class="bd">(선택일 입력 없음)</span>`);
    if (adm) h += `<button class="btn small" data-pf="liq" style="align-self:center">＋ 과거 날짜 입력·수정</button>`;
  }
  return h;
}
const pfNice = (lo, hi, n = 4) => { const span = (hi - lo) || Math.abs(hi) * .02 || 1, raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, t = []; for (let v = a; v <= b + st / 2; v += st) t.push(Math.round(v / st) * st); return { t, st, a, b }; };
// 큰 추이 차트: 2px 선 · 10% 면 · 끝점(2px 표면 링) · 직접 라벨(끝값·목표) · 십자선+툴팁(키보드 ←→)
function pfFocusDraw(){
  const box = $('pfFocus'); if (!box) return; const c = pfCalc(); if (!c) return;
  const m = pfMetric(perfTab, c), rows = m.rows;
  if (!rows.length){ box.innerHTML = `<div class="pfempty" style="padding:70px 10px">${m.k === 'liq' ? '규제유동성비율 입력값이 아직 없어요' : '표시할 추이가 없어요'}</div>`; return; }
  const W = Math.max(280, box.clientWidth || 640), H = W < 520 ? 230 : 290, l = m.k === 'dep' || m.k === 'loan' ? 56 : 50, r = 22, t = 26, b = 30, col = m.color;
  const vals = rows.map(x => x.v); let lo = Math.min(...vals), hi = Math.max(...vals); const span = (hi - lo) || Math.abs(hi) * .02 || 1;
  const near = m.tgt !== null && (m.k === 'liq' || (m.tgt >= lo - span * 2 && m.tgt <= hi + span * 2)); if (near){ lo = Math.min(lo, m.tgt); hi = Math.max(hi, m.tgt); }
  lo -= span * .15; hi += span * .15; const nt = pfNice(lo, hi, 4); lo = Math.min(lo, nt.a); hi = Math.max(hi, nt.b);
  const x = (i) => rows.length === 1 ? (l + W - r) / 2 : l + (W - l - r) * i / (rows.length - 1), y = (a) => t + (H - t - b) * (1 - (a - lo) / (hi - lo));
  const tdec = m.k === 'dep' || m.k === 'loan' ? (nt.st < 1 ? 1 : 0) : (nt.st < .1 ? 2 : 1), fmtT = (a) => pfNm(a, tdec) + (m.unit === '%' ? '%' : '');
  let g = '';
  nt.t.forEach(a => { g += `<line x1="${l}" x2="${W - r}" y1="${y(a).toFixed(1)}" y2="${y(a).toFixed(1)}" stroke="#edeff4" stroke-width="1"/><text x="${l - 8}" y="${(y(a) + 4).toFixed(1)}" font-size="11.5" fill="#8a90a0" text-anchor="end">${fmtT(a)}</text>`; });
  const xi = rows.length > 2 ? [0, Math.floor((rows.length - 1) / 2), rows.length - 1] : rows.map((_, i) => i);
  xi.forEach((i, k) => { g += `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="11.5" fill="#8a90a0" text-anchor="${i === 0 && rows.length > 1 ? 'start' : i === rows.length - 1 && rows.length > 1 ? 'end' : 'middle'}">${pfMd(rows[i].d).replace(' ', '')}</text>`; });
  if (near){ const ty = y(m.tgt); g += `<line x1="${l}" x2="${W - r}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#16181d" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - r}" y="${(ty - 6).toFixed(1)}" font-size="12" font-weight="700" fill="#44546f" text-anchor="end">${m.tgtLabel} ${pfNm(m.tgt, m.dec)}${m.unit === '%' ? '%' : '억원'}${m.k === 'liq' ? ' 이상' : ''}</text>`; }
  const pts = rows.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  if (rows.length > 1) g += `<polygon points="${x(0).toFixed(1)},${y(lo).toFixed(1)} ${pts} ${x(rows.length - 1).toFixed(1)},${y(lo).toFixed(1)}" fill="${col}" fill-opacity=".1"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const ex = x(rows.length - 1), ey = y(vals[vals.length - 1]);
  g += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="6.5" fill="#fff"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4.5" fill="${col}"/>`;
  const lab = `${pfNm(vals[vals.length - 1], m.dec)}${m.unit === '%' ? '%' : '억원'}`, anchor = ex > W - 90 ? 'end' : 'middle';
  g += `<text x="${(anchor === 'end' ? ex + 4 : ex).toFixed(1)}" y="${(ey - 13).toFixed(1)}" font-size="13" font-weight="800" fill="#16181d" text-anchor="${anchor}">${lab}</text>`;
  g += `<g id="pfXh" style="display:none"><line id="pfXhL" y1="${t}" y2="${H - b}" stroke="#16181d" stroke-opacity=".25"/><circle id="pfXhD" r="4.5" fill="${col}" stroke="#fff" stroke-width="2"/></g><rect id="pfHit" x="${l}" y="0" width="${W - l - r + 10}" height="${H - b + 6}" fill="transparent" tabindex="0" role="img" aria-label="${m.name} 추이 차트 — 좌우 방향키로 값을 확인해요" style="outline:none;cursor:crosshair"/>`;
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${g}</svg><div id="pfTip" class="pftip" style="display:none"></div>`;
  const hit = $('pfHit'), tip = $('pfTip'), show = (i) => {
    i = Math.max(0, Math.min(rows.length - 1, i)); const p = rows[i], px = x(i), py = y(p.v), pv = i > 0 ? p.v - rows[i - 1].v : null;
    $('pfXh').style.display = ''; $('pfXhL').setAttribute('x1', px); $('pfXhL').setAttribute('x2', px); $('pfXhD').setAttribute('cx', px); $('pfXhD').setAttribute('cy', py);
    tip.innerHTML = ''; const a = document.createElement('div'); a.className = 'pftd'; a.textContent = `${pfMd(p.d).replace(' ', '')}(${pfDow(p.d)})`;
    const v = document.createElement('div'); v.className = 'pftv'; const k = document.createElement('i'); k.style.background = col; v.appendChild(k); v.appendChild(document.createTextNode(`${pfNm(p.v, m.dec)}${m.unit === '%' ? '%' : '억원'}`));
    tip.appendChild(a); tip.appendChild(v);
    if (pv !== null){ const d = document.createElement('div'); d.className = 'pftd2 ' + pfDeltaCls(m, pv); d.textContent = `직전 대비 ${pfSg(pv, m.unit === '%' ? '%p' : '억원', m.dec)}`; tip.appendChild(d); }
    tip.style.display = 'block'; const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(W - tw - 4, px - tw / 2)) + 'px'; tip.style.top = Math.max(0, py - tip.offsetHeight - 14) + 'px'; hit._i = i;
  };
  const hide = () => { $('pfXh').style.display = 'none'; tip.style.display = 'none'; };
  hit.addEventListener('pointermove', (e) => { const bx = box.getBoundingClientRect(); const px = e.clientX - bx.left; show(rows.length === 1 ? 0 : Math.round((px - l) / (W - l - r) * (rows.length - 1))); });
  hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
  hit.addEventListener('focus', () => show(rows.length - 1));
  hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight'){ e.preventDefault(); show((hit._i ?? rows.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)); } });
}
function pfRawTable(m){
  if (!m.rows.length) return '';
  return `<div class="pfm" style="margin-top:12px"><table class="pft" style="min-width:0"><thead><tr><th>기준일</th><th>${m.name}${m.unit === '%' ? ' (%)' : ' (억원)'}</th><th>직전 대비</th></tr></thead><tbody>${[...m.rows].reverse().map((p, i, a) => { const pv = a[i + 1]; const d = pv ? p.v - pv.v : null; return `<tr><td class="l">${p.d}(${pfDow(p.d)})</td><td>${pfNm(p.v, m.dec)}</td><td class="${d === null ? '' : pfDeltaCls(m, d) === 'bd' ? 'd' : pfDeltaCls(m, d) === 'gd' ? 'g' : ''}">${d === null ? '-' : pfSg(d, m.unit === '%' ? '%p' : '억원', m.dec)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function pfDashHtml(c, adm){
  const ms = ['dep', 'loan', 'delinq', 'liq'].map(k => pfMetric(k, c)), cur = ms.find(m => m.k === perfTab) || ms[0];
  return `<div class="pfd-tiles">${ms.map(m => pfTile(m, m.k === cur.k, adm)).join('')}</div>
    <div class="pfd-focus"><div class="pfd-main"><div class="pfd-h"><div><b>${cur.name} 추이</b><span class="pfsub" style="margin-left:8px">${cur.rows.length ? `최근 ${cur.rows.length}${cur.k === 'liq' ? '건' : '영업일'}` : ''}${cur.tgt !== null ? ` · ${cur.tgtLabel} ${pfNm(cur.tgt, cur.dec)}${cur.unit === '%' ? '%' : '억원'}${cur.k === 'liq' ? ' 이상' : ''}` : ''}</span></div>
        <span class="pftabs">${['dep', 'loan', 'delinq', 'liq'].map(k => `<button data-pf="tab" data-t="${k}" class="${perfTab === k ? 'on' : ''}">${k === 'liq' ? '유동성' : PF_NAME[k]}</button>`).join('')}</span></div>
      <div class="pfchips">${pfSide(cur, adm)}</div>
      <div id="pfFocus" class="pfd-chart"></div>
      <div style="margin-top:6px"><button class="btn small" data-pf="raw" style="min-height:30px;padding:3px 12px;font-size:12.5px">${perfRaw ? '표 닫기' : '표로 보기'}</button></div>${perfRaw ? pfRawTable(cur) : ''}</div></div>`;
}

function renderPerf(){
  const el = $('perf'); if (!el) return;
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pf]'); if (!b) return;
      const a = b.dataset.pf, i = perfRows.findIndex(r => r.base_date === perfSel);
      if (a === 'prev' && i > 0){ perfSel = perfRows[i - 1].base_date; renderPerf(); }
      else if (a === 'next' && i >= 0 && i < perfRows.length - 1){ perfSel = perfRows[i + 1].base_date; renderPerf(); }
      else if (a === 'tab'){ perfTab = b.dataset.t; renderPerf(); }
      else if (a === 'table'){ perfTable = !perfTable; renderPerf(); }
      else if (a === 'raw'){ perfRaw = !perfRaw; renderPerf(); }
      else if (a === 'input') pfOpenIn();
      else if (a === 'goal') pfOpenTg();
      else if (a === 'liq') pfOpenLq();
    });
  }
  const adm = isAdmin(), c = pfCalc();
  const btns = `${adm ? '<button class="btn small primary" data-pf="input">＋ 실적 입력</button><button class="btn small" data-pf="goal">⚙ 목표·전년말</button>' : ''}`;
  if (!c){
    el.innerHTML = `<div class="pfcard"><div class="pfh"><b>📊 여수신 현황</b><span class="sp"></span>${btns}</div>
      <div class="pfempty">아직 입력된 실적이 없어요.${adm ? '<br>오른쪽 위 “＋ 실적 입력”으로 전 영업일 실적부터 입력해주세요.' : '<br>관리자가 입력하면 여기에 표시돼요.'}</div></div>`;
    return;
  }
  const { r, Y, prev } = c, yr = +r.base_date.slice(0, 4);
  const yearVs = (cur, prevYear, label) => prevYear === null || prevYear === undefined || !Number(prevYear) ? null : { label, v: cur - Number(prevYear), pct: (cur - Number(prevYear)) / Number(prevYear) * 100 };
  const dd = Number(r.delinq), dT = Y.delinq_t === null || Y.delinq_t === undefined ? null : Number(Y.delinq_t);
  const dPrevDq = prev ? dd - Number(prev.delinq) : null, dYearDq = Y.prev_delinq === null || Y.prev_delinq === undefined ? null : dd - Number(Y.prev_delinq);
  const ok = dT !== null && dd <= dT;
  const has = (v) => v !== null && v !== undefined;
  const dif = (t, b) => !has(t) ? '' : (Number(t) - Number(b));
  const cell = (d) => d === '' ? '<td></td>' : `<td class="${d > 0 ? 'd' : 'g'}">${pfE(d)}</td>`;
  const sumT = (a, b) => has(a) && has(b) ? Number(a) + Number(b) : null;
  const dTot = sumT(Y.dep_hq_t, Y.dep_br_t), lTot = sumT(Y.loan_hq_t, Y.loan_br_t);
  const tbl = `<div class="pfm"><table class="pft"><thead><tr><th rowspan="2" style="width:9%">구분</th><th class="g1" colspan="3">수 신</th><th class="g2" colspan="3">여 신</th><th class="g3" colspan="2">연체율</th></tr>
    <tr><th>목표(A)</th><th>잔액(B)</th><th>차액(C=A−B)</th><th>목표</th><th>잔액</th><th>차액(C=A−B)</th><th>목표</th><th>현황</th></tr></thead><tbody>
    <tr><td class="l">본 점</td><td>${pfE(Y.dep_hq_t)}</td><td>${pfE(r.dep_hq)}</td>${cell(dif(Y.dep_hq_t, r.dep_hq))}<td>${pfE(Y.loan_hq_t)}</td><td>${pfE(r.loan_hq)}</td>${cell(dif(Y.loan_hq_t, r.loan_hq))}<td></td><td></td></tr>
    <tr><td class="l">지 점</td><td>${pfE(Y.dep_br_t)}</td><td>${pfE(r.dep_br)}</td>${cell(dif(Y.dep_br_t, r.dep_br))}<td>${pfE(Y.loan_br_t)}</td><td>${pfE(r.loan_br)}</td>${cell(dif(Y.loan_br_t, r.loan_br))}<td></td><td></td></tr>
    <tr class="sum"><td class="l" style="background:#fff6d6">합 산</td><td>${pfE(dTot)}</td><td>${pfE(c.dep)}</td>${cell(dTot === null ? '' : dTot - c.dep)}<td>${pfE(lTot)}</td><td>${pfE(c.loan)}</td>${cell(lTot === null ? '' : lTot - c.loan)}<td>${dT === null ? '-' : pfP(dT) + '%'}</td><td class="${ok ? 'g' : 'd'}">${pfP(dd)}%</td></tr></tbody></table></div>`;
  const note = (has(Y.prev_dep) || has(Y.prev_loan) || has(Y.prev_delinq))
    ? `※ ${yr - 1}년말 수신 ${pfE(Y.prev_dep)}, 여신 ${pfE(Y.prev_loan)}, 연체율 ${has(Y.prev_delinq) ? pfP(Y.prev_delinq) + '%' : '-'}` : (adm ? `※ ${yr - 1}년말 기준값은 “⚙ 목표·전년말”에서 입력해주세요.` : '');
  const noGoal = !perfYears[yr] ? `<div class="pfnote" style="margin-top:12px">${adm ? `${yr}년 목표가 아직 없어요. “⚙ 목표·전년말”에서 연 1회 설정하면 달성률이 표시돼요.` : `${yr}년 목표가 아직 설정되지 않았어요.`}</div>` : '';
  el.innerHTML = `<div class="pfcard">
    <div class="pfh"><b>📊 여수신 현황</b><span class="pftag">${pfMd(r.base_date)}(${pfDow(r.base_date)}) 기준</span><span class="m" style="color:var(--muted);font-size:13px">단위: 억원, %</span><span class="sp"></span>
      <span class="pfnav"><button data-pf="prev" title="이전 영업일" ${c.i > 0 ? '' : 'disabled'}>◀</button><button data-pf="next" title="다음 영업일" ${c.i < perfRows.length - 1 ? '' : 'disabled'}>▶</button></span>${btns}</div>
    ${pfDashHtml(c, adm)}
    <div class="pfh" style="margin-top:18px"><b style="font-size:15px">상세표</b><span class="m" style="color:var(--muted);font-size:13px">보고용 양식</span><span class="sp"></span><button class="btn small" data-pf="table">${perfTable ? '접기 ▴' : '펼치기 ▾'}</button></div>
    ${perfTable ? tbl : ''}${note ? `<div class="pfnote">${esc(note)}</div>` : ''}${noGoal}</div>`;
  pfFocusDraw();
}

// ---------- 실적 입력 (관리자) ----------
function pfOpenIn(date){
  if (!isAdmin()) return;
  const d = date || pfPrevBizDay();
  $('pfInPanel').innerHTML = `<div class="ph"><h2>여수신 실적 입력</h2><button class="x" data-f="close">✕</button></div>
    <div class="pfsub">단위: 억원 (소수점 없이 정수로, 예: 991) · 같은 날짜를 다시 저장하면 덮어써요</div>
    <label>기준일 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">(기본값: 전 영업일)</span></label><input id="pfDate" type="date" />
    <div class="pfform"><div><label>수신 · 본점 (억원)</label><input id="pfDepHq" inputmode="numeric" placeholder="0" /></div><div><label>수신 · 지점 (억원)</label><input id="pfDepBr" inputmode="numeric" placeholder="0" /></div>
      <div><label>여신 · 본점 (억원)</label><input id="pfLoanHq" inputmode="numeric" placeholder="0" /></div><div><label>여신 · 지점 (억원)</label><input id="pfLoanBr" inputmode="numeric" placeholder="0" /></div></div>
    <label>연체율 현황 (%) — 본점·지점 합산</label><input id="pfDq" inputmode="decimal" placeholder="예: 2.88" style="max-width:200px;text-align:right;font-weight:700" />
    <div class="pfsub" style="margin-top:14px;font-weight:800;color:#44546f">규제유동성비율 <span style="font-weight:500">(단위: 백만원 · 둘 다 입력하면 함께 저장돼요)</span></div>
    <div class="pfform"><div><label>유동자산합계 (백만원)</label><input id="pfLqA" inputmode="numeric" placeholder="예: 53,435" /></div><div><label>유동부채합계 (백만원)</label><input id="pfLqD" inputmode="numeric" placeholder="예: 56,233" /></div></div>
    <div id="pfLqR" style="margin-top:6px;font-size:14px;font-weight:800"></div>
    <div id="pfInfo" class="pfsub" style="margin-top:8px"></div>
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px"><button class="btn primary" data-f="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-f="close" style="min-height:44px">취소</button></div><button class="btn danger" data-f="del" id="pfDel" style="display:none">이 날짜 삭제</button></div>`;
  $('pfDate').value = d;
  const fill = () => {
    const row = perfRows.find(r => r.base_date === $('pfDate').value);
    $('pfDepHq').value = row ? pfEn(row.dep_hq) : ''; $('pfDepBr').value = row ? pfEn(row.dep_br) : '';
    $('pfLoanHq').value = row ? pfEn(row.loan_hq) : ''; $('pfLoanBr').value = row ? pfEn(row.loan_br) : '';
    $('pfDq').value = row ? Number(row.delinq).toFixed(2) : '';
    const lq = perfLiq.find(r => r.base_date === $('pfDate').value); $('pfLqA').value = lq ? Number(lq.asset).toLocaleString('ko-KR') : ''; $('pfLqD').value = lq ? Number(lq.debt).toLocaleString('ko-KR') : ''; lqPrev();
    $('pfDel').style.display = row ? '' : 'none';
    const v = $('pfDate').value; $('pfInfo').textContent = row ? `✏️ ${v}(${pfDow(v)}) 실적이 이미 있어요. 고쳐서 저장하면 덮어써요.` : (v ? `${v}(${pfDow(v)})${pfIsHoliday(v) ? ' · 휴일' : ''}` : '');
  };
  const lqPrev = () => { const a = pfNum($('pfLqA').value), b = pfNum($('pfLqD').value); $('pfLqR').innerHTML = a !== null && b ? `비율 <span style="color:${a / b * 100 >= LQ_MIN ? '#12a150' : '#e5484d'}">${pfP(a / b * 100)}%</span> <span class="muted" style="font-weight:500">(기준 ${LQ_MIN}% 이상)</span>` : ''; };
  fill(); $('pfDate').onchange = fill;
  ['pfLqA', 'pfLqD'].forEach(id => { $(id).oninput = () => { const n = pfNum($(id).value); $(id).value = n === null ? '' : n.toLocaleString('ko-KR'); lqPrev(); }; });
  ['pfDepHq', 'pfDepBr', 'pfLoanHq', 'pfLoanBr'].forEach(id => { $(id).oninput = () => { $(id).value = pfEfmt($(id).value); }; });
  $('pfOvIn').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('pfDepHq').focus(); } catch (x) {} }, 50);
}
function pfCloseIn(){ $('pfOvIn').style.display = 'none'; document.body.style.overflow = ''; }
$('pfInPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'close') return pfCloseIn();
  const date = $('pfDate').value;
  if (b.dataset.f === 'del'){
    if (!confirm(`${date} 실적을 삭제할까요?${perfLiq.some(r => r.base_date === date) ? '\n(같은 날짜의 규제유동성비율 값도 함께 삭제돼요)' : ''}`)) return;
    const { error } = await sb.from('perf_daily').delete().eq('base_date', date);
    if (error) return alert(error.message);
    await sb.from('perf_liq').delete().eq('base_date', date);
    pfCloseIn(); toast('삭제했어요'); return loadPerf();
  }
  const v = { dep_hq: pfEin($('pfDepHq').value), dep_br: pfEin($('pfDepBr').value), loan_hq: pfEin($('pfLoanHq').value), loan_br: pfEin($('pfLoanBr').value), delinq: pfDec($('pfDq').value) };
  if (!date) return alert('기준일을 선택해주세요.');
  if (Object.values(v).some(x => x === null)) return alert('수신·여신 잔액(본점/지점)과 연체율을 모두 입력해주세요.');
  if (date > kstToday()) return alert('오늘 이후 날짜는 입력할 수 없어요.');
  const lqA = pfNum($('pfLqA').value), lqD = pfNum($('pfLqD').value), lqAny = lqA !== null || lqD !== null;
  if (lqAny && (lqA === null || !lqD)) return alert('규제유동성비율은 유동자산합계와 유동부채합계(0보다 큰 값)를 둘 다 입력해주세요. (입력하지 않으려면 둘 다 비워두세요)');
  b.disabled = true;
  const { error } = await sb.from('perf_daily').upsert({ base_date: date, ...v, entered_by: me, updated_at: new Date().toISOString() }, { onConflict: 'base_date' });
  b.disabled = false;
  if (error) return alert(error.message);
  if (lqAny){ const e2 = await sb.from('perf_liq').upsert({ base_date: date, asset: lqA, debt: lqD, entered_by: me, updated_at: new Date().toISOString() }, { onConflict: 'base_date' }); if (e2.error) alert('실적은 저장했지만 규제유동성비율 저장에 실패했어요: ' + e2.error.message); }
  perfSel = date; pfCloseIn(); toast('📊 실적을 저장했어요'); await loadPerf();
});

// ---------- 연 목표 · 전년말 기준값 (관리자, 연 1회) ----------
function pfOpenTg(year){
  if (!isAdmin()) return;
  const y = year || (perfSel ? +perfSel.slice(0, 4) : +kstToday().slice(0, 4));
  $('pfTgPanel').innerHTML = `<div class="ph"><h2>연 목표 · 전년말 기준값</h2><button class="x" data-g="close">✕</button></div>
    <div class="pfsub">단위: 억원 (소수점 없이 정수로, 예: 1,040) · 연 1회 설정해요</div>
    <label>연도</label><input id="pgYear" type="number" min="2000" max="2100" style="max-width:140px" />
    <div class="pfsub" style="margin-top:14px;font-weight:800;color:#44546f">연 목표 (A)</div>
    <div class="pfform"><div><label>수신 · 본점 (억원)</label><input id="pgDepHq" inputmode="numeric" placeholder="0" /></div><div><label>수신 · 지점 (억원)</label><input id="pgDepBr" inputmode="numeric" placeholder="0" /></div>
      <div><label>여신 · 본점 (억원)</label><input id="pgLoanHq" inputmode="numeric" placeholder="0" /></div><div><label>여신 · 지점 (억원)</label><input id="pgLoanBr" inputmode="numeric" placeholder="0" /></div></div>
    <label>연체율 목표 (%)</label><input id="pgDq" inputmode="decimal" placeholder="예: 1.50" style="max-width:200px;text-align:right;font-weight:700" />
    <div class="pfsub" style="margin-top:16px;font-weight:800;color:#44546f">전년말 기준값 (각주·전년말 대비에 사용)</div>
    <div class="pfform"><div><label>전년말 수신 합계 (억원)</label><input id="pgPDep" inputmode="numeric" placeholder="0" /></div><div><label>전년말 여신 합계 (억원)</label><input id="pgPLoan" inputmode="numeric" placeholder="0" /></div></div>
    <label>전년말 연체율 (%)</label><input id="pgPDq" inputmode="decimal" placeholder="예: 3.56" style="max-width:200px;text-align:right;font-weight:700" />
    <div class="acts" style="margin-top:20px"><button class="btn primary" data-g="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-g="close" style="min-height:44px">취소</button></div>`;
  $('pgYear').value = y;
  const fill = () => {
    const Y = perfYears[+$('pgYear').value] || {}, c = (n) => pfEn(n);
    $('pgDepHq').value = c(Y.dep_hq_t); $('pgDepBr').value = c(Y.dep_br_t); $('pgLoanHq').value = c(Y.loan_hq_t); $('pgLoanBr').value = c(Y.loan_br_t);
    $('pgDq').value = Y.delinq_t === null || Y.delinq_t === undefined ? '' : Number(Y.delinq_t).toFixed(2);
    $('pgPDep').value = c(Y.prev_dep); $('pgPLoan').value = c(Y.prev_loan); $('pgPDq').value = Y.prev_delinq === null || Y.prev_delinq === undefined ? '' : Number(Y.prev_delinq).toFixed(2);
  };
  fill(); $('pgYear').onchange = fill;
  ['pgDepHq', 'pgDepBr', 'pgLoanHq', 'pgLoanBr', 'pgPDep', 'pgPLoan'].forEach(id => { $(id).oninput = () => { $(id).value = pfEfmt($(id).value); }; });
  $('pfOvTg').style.display = 'block'; document.body.style.overflow = 'hidden';
}
function pfCloseTg(){ $('pfOvTg').style.display = 'none'; document.body.style.overflow = ''; }
$('pfTgPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-g]'); if (!b) return;
  if (b.dataset.g === 'close') return pfCloseTg();
  const year = +$('pgYear').value;
  if (!year || year < 2000 || year > 2100) return alert('연도를 확인해주세요.');
  const row = { year, dep_hq_t: pfEin($('pgDepHq').value), dep_br_t: pfEin($('pgDepBr').value), loan_hq_t: pfEin($('pgLoanHq').value), loan_br_t: pfEin($('pgLoanBr').value), delinq_t: pfDec($('pgDq').value),
    prev_dep: pfEin($('pgPDep').value), prev_loan: pfEin($('pgPLoan').value), prev_delinq: pfDec($('pgPDq').value), updated_by: me, updated_at: new Date().toISOString() };
  b.disabled = true;
  const { error } = await sb.from('perf_year').upsert(row, { onConflict: 'year' });
  b.disabled = false;
  if (error) return alert(error.message);
  pfCloseTg(); toast(`⚙ ${year}년 목표·전년말 기준값을 저장했어요`); await loadPerf();
});

// ---------- 규제유동성비율 입력 (관리자) ----------
function pfOpenLq(date){
  if (!isAdmin()) return;
  const d = date || pfPrevBizDay(), recent = [...perfLiq].reverse().slice(0, 8);
  $('pfLqPanel').innerHTML = `<div class="ph"><h2>규제유동성비율 입력</h2><button class="x" data-q="close">✕</button></div>
    <div class="pfsub">단위: 백만원 · 같은 날짜를 다시 저장하면 덮어써요 · 전월말·전분기말 값도 그 날짜로 입력해두면 비교에 쓰여요</div>
    <label>기준일 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">(기본값: 전 영업일)</span></label><input id="pqDate" type="date" />
    <div class="pfform"><div><label>유동자산합계 (백만원)</label><input id="pqAsset" inputmode="numeric" placeholder="예: 53,435" /></div><div><label>유동부채합계 (백만원)</label><input id="pqDebt" inputmode="numeric" placeholder="예: 56,233" /></div></div>
    <div id="pqRatio" style="margin-top:10px;font-size:15px;font-weight:800"></div><div id="pqInfo" class="pfsub" style="margin-top:4px"></div>
    ${recent.length ? `<div class="pfsub" style="margin-top:14px;font-weight:800;color:#44546f">최근 입력 (눌러서 고치기)</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${recent.map(r => `<button class="btn small" data-q="pick" data-d="${r.base_date}">${pfMd(r.base_date).replace(' ', '')} · ${pfP(lqRatio(r))}%</button>`).join('')}</div>` : ''}
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px"><button class="btn primary" data-q="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-q="close" style="min-height:44px">취소</button></div><button class="btn danger" data-q="del" id="pqDel" style="display:none">이 날짜 삭제</button></div>`;
  $('pqDate').value = d;
  const upd = () => {
    const a = pfNum($('pqAsset').value), b = pfNum($('pqDebt').value), v = $('pqDate').value, row = perfLiq.find(r => r.base_date === v);
    $('pqRatio').innerHTML = a !== null && b ? `비율 <span style="color:${a / b * 100 >= LQ_MIN ? '#12a150' : '#e5484d'}">${pfP(a / b * 100)}%</span> <span class="muted" style="font-weight:500">(기준 ${LQ_MIN}% 이상)</span>` : '';
    $('pqInfo').textContent = row ? `✏️ ${v}(${pfDow(v)}) 값이 이미 있어요. 고쳐서 저장하면 덮어써요.` : (v ? `${v}(${pfDow(v)})${pfIsHoliday(v) ? ' · 휴일' : ''}` : '');
    $('pqDel').style.display = row ? '' : 'none';
  };
  const fill = () => { const row = perfLiq.find(r => r.base_date === $('pqDate').value); $('pqAsset').value = row ? Number(row.asset).toLocaleString('ko-KR') : ''; $('pqDebt').value = row ? Number(row.debt).toLocaleString('ko-KR') : ''; upd(); };
  fill(); $('pqDate').onchange = fill;
  ['pqAsset', 'pqDebt'].forEach(id => { $(id).oninput = () => { const n = pfNum($(id).value); $(id).value = n === null ? '' : n.toLocaleString('ko-KR'); upd(); }; });
  $('pfOvLq').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('pqAsset').focus(); } catch (x) {} }, 50);
}
function pfCloseLq(){ $('pfOvLq').style.display = 'none'; document.body.style.overflow = ''; }
$('pfLqPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-q]'); if (!b) return;
  if (b.dataset.q === 'close') return pfCloseLq();
  if (b.dataset.q === 'pick') return pfOpenLq(b.dataset.d);
  const date = $('pqDate').value;
  if (b.dataset.q === 'del'){
    if (!confirm(`${date} 값을 삭제할까요?`)) return;
    const { error } = await sb.from('perf_liq').delete().eq('base_date', date);
    if (error) return alert(error.message);
    pfCloseLq(); toast('삭제했어요'); return loadPerf();
  }
  const asset = pfNum($('pqAsset').value), debt = pfNum($('pqDebt').value);
  if (!date) return alert('기준일을 선택해주세요.');
  if (asset === null || !debt) return alert('유동자산합계와 유동부채합계(0보다 큰 값)를 입력해주세요.');
  if (date > kstToday()) return alert('오늘 이후 날짜는 입력할 수 없어요.');
  b.disabled = true;
  const { error } = await sb.from('perf_liq').upsert({ base_date: date, asset, debt, entered_by: me, updated_at: new Date().toISOString() }, { onConflict: 'base_date' });
  b.disabled = false;
  if (error) return alert(error.message);
  pfCloseLq(); toast('📊 규제유동성비율을 저장했어요'); await loadPerf();
});

let pfRsT = null;
window.addEventListener('resize', () => { clearTimeout(pfRsT); pfRsT = setTimeout(() => { if (typeof divn !== 'undefined' && divn === 'home' && document.getElementById('pfFocus')) pfFocusDraw(); }, 150); });
