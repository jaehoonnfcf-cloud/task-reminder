// 현황판 — 여수신 실적 대시보드. 관리자가 전 영업일 기준 실적(본점·지점 수신/여신 잔액, 합산 연체율)을 입력하고, 모든 팀원이 본다.
// 목표(A)와 전년말 기준값은 연 1회 관리자가 설정한다. 달성률·차액·합산은 화면에서 자동 계산한다.
// index.html 의 전역(sb, $, esc, me, isAdmin, kstToday, toast, divn, calMain)을 함께 쓴다.

let perfRows = [], perfYears = {}, perfSel = null, perfTab = 'dep', perfTable = false, perfTimer = null;
let perfFormDate = null;

const pfNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const pfDec = (s) => { const t = String(s ?? '').replace(/[^0-9.]/g, ''); const n = parseFloat(t); return isNaN(n) ? null : n; };
const pfN = (n) => (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toLocaleString('ko-KR');
const pfP = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(d);
const pfDow = (iso) => ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T12:00:00Z').getUTCDay()];
const pfMd = (iso) => `${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}`;
const pfSigned = (n, unit = '') => n === 0 ? `±0${unit}` : `${n > 0 ? '▲' : '▼'}${Math.abs(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}`;
const pfCls = (n) => n > 0 ? 'up' : n < 0 ? 'dn' : 'fl';
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
  .pfkpis{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:16px; }
  .pfk{ border-radius:22px; padding:16px 18px; min-width:0; } .pfk.b{ background:#eef3ff; } .pfk.p{ background:#f3efff; } .pfk.r{ background:#fff1f0; }
  .pfk .t{ font-size:13px; font-weight:800; display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .pfk.b .t > span:first-child{ color:#2f55c8; } .pfk.p .t > span:first-child{ color:#5b3fc4; } .pfk.r .t > span:first-child{ color:#b42318; }
  .pfk .pill{ font-size:12px; font-weight:800; padding:3px 9px; border-radius:99px; background:#fff; white-space:nowrap; }
  .pfk.b .pill{ color:#2f55c8; } .pfk.p .pill{ color:#5b3fc4; } .pfk.r .pill{ color:#b42318; } .pfk .pill.ok{ color:var(--green) !important; }
  .pfk .big{ font-size:34px; font-weight:800; letter-spacing:-.04em; margin-top:6px; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .pfk .big small{ font-size:13px; font-weight:700; color:var(--muted); margin-left:6px; letter-spacing:0; }
  .pfbar{ height:10px; background:#fff; border-radius:99px; margin-top:10px; overflow:hidden; } .pfbar i{ display:block; height:100%; border-radius:99px; }
  .pfrow{ display:flex; justify-content:space-between; gap:8px; font-size:12.5px; color:#5a6172; margin-top:6px; font-weight:600; } .pfrow b{ color:var(--ink); }
  .pfrow .up,.up{ color:#e5484d; font-weight:800; } .pfrow .dn,.dn{ color:#2f55c8; font-weight:800; } .pfrow .fl{ color:var(--muted); font-weight:700; }
  .pfsplit{ display:flex; height:8px; border-radius:99px; overflow:hidden; margin-top:12px; background:#fff; } .pfsplit i{ display:block; }
  .pfsl{ display:flex; justify-content:space-between; font-size:11.5px; color:#5a6172; margin-top:4px; font-weight:600; }
  .pftwo{ display:grid; grid-template-columns:1.7fr 1fr; gap:14px; margin-top:14px; }
  .pfmini{ background:#f7f8fb; border-radius:20px; padding:14px 16px; min-width:0; }
  .pfmini .tt{ font-size:13px; font-weight:800; }
  .pftabs{ display:inline-flex; background:#eef0f6; border-radius:99px; padding:3px; gap:2px; }
  .pftabs button{ border:0; background:transparent; padding:5px 13px; border-radius:99px; font-size:12.5px; font-weight:800; color:#6a7185; cursor:pointer; } .pftabs button.on{ background:#fff; color:var(--accent); box-shadow:0 1px 3px rgba(20,24,40,.12); }
  .pfgoal{ font-size:12.5px; font-weight:700; margin-top:10px; display:flex; justify-content:space-between; } .pfgoal:first-of-type{ margin-top:8px; }
  .pfgb{ height:8px; background:#e4e8f3; border-radius:99px; overflow:hidden; margin-top:4px; } .pfgb i{ display:block; height:100%; border-radius:99px; }
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
    .pftwo{ grid-template-columns:1fr; }
    .pfh .m{ display:none; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="pfOvIn"><div class="panel" style="max-width:520px" id="pfInPanel"></div></div>
    <div class="ov" id="pfOvTg"><div class="panel" style="max-width:560px" id="pfTgPanel"></div></div>`;
  document.body.appendChild(d);
  $('pfOvIn').addEventListener('click', (e) => { if (e.target === $('pfOvIn')) pfCloseIn(); });
  $('pfOvTg').addEventListener('click', (e) => { if (e.target === $('pfOvTg')) pfCloseTg(); });
})();

async function loadPerf(){
  const [d, y] = await Promise.all([
    sb.from('perf_daily').select('*').order('base_date', { ascending: false }).limit(400),
    sb.from('perf_year').select('*'),
  ]);
  if (d.error || y.error){ console.warn('실적 불러오기 실패', (d.error || y.error).message); return; }
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

function pfKpi(cls, title, val, tgt, dPrev, dYear, hq, br, hqT, brT){
  const rate = tgt ? val / tgt * 100 : null, left = tgt ? tgt - val : null;
  const col = cls === 'b' ? ['#6f93ff', '#3563e9', '#9db8ff'] : ['#a78bfa', '#6d4df2', '#c4b5fd'];
  return `<div class="pfk ${cls}"><div class="t"><span>${title} (합산)</span>${rate !== null ? `<span class="pill ${rate >= 100 ? 'ok' : ''}">달성률 ${pfP(rate, 1)}%</span>` : '<span class="pill">목표 미설정</span>'}</div>
    <div class="big">${pfN(val)}${tgt ? `<small>/ 목표 ${pfN(tgt)}</small>` : ''}</div>
    ${rate !== null ? `<div class="pfbar"><i style="width:${Math.min(100, rate)}%;background:linear-gradient(90deg,${col[0]},${col[1]})"></i></div>` : ''}
    <div class="pfrow"><span>${left !== null ? (left > 0 ? `목표까지 <b class="up">${pfN(left)}</b>` : `목표 초과 <b class="dn">${pfN(-left)}</b>`) : '&nbsp;'}</span><span>${dPrev === null ? '' : `전 영업일 대비 <span class="${pfCls(dPrev)}">${pfSigned(dPrev)}</span>`}</span></div>
    <div class="pfrow"><span>${dYear === null ? '&nbsp;' : `${dYear.label} 대비`}</span>${dYear === null ? '' : `<b class="${pfCls(dYear.v)}">${pfSigned(dYear.v)} (${dYear.pct >= 0 ? '+' : ''}${pfP(dYear.pct, 1)}%)</b>`}</div>
    <div class="pfsplit"><i style="width:${(hq + br) ? hq / (hq + br) * 100 : 50}%;background:${col[1]}"></i><i style="width:${(hq + br) ? br / (hq + br) * 100 : 50}%;background:${col[2]}"></i></div>
    <div class="pfsl"><span>본점 ${pfN(hq)}</span><span>지점 ${pfN(br)}</span></div></div>`;
}

function pfChart(){
  const c = pfCalc(); if (!c) return '';
  const rows = perfRows.slice(Math.max(0, c.i - 19), c.i + 1);
  const val = (r) => perfTab === 'dep' ? Number(r.dep_hq) + Number(r.dep_br) : perfTab === 'loan' ? Number(r.loan_hq) + Number(r.loan_br) : Number(r.delinq);
  const v = rows.map(val), tgt = perfTab === 'dep' ? c.depT : perfTab === 'loan' ? c.loanT : (c.Y.delinq_t ?? null);
  const color = perfTab === 'dep' ? '#3563e9' : perfTab === 'loan' ? '#6d4df2' : '#e5484d';
  let lo = Math.min(...v, tgt ?? Infinity), hi = Math.max(...v, tgt ?? -Infinity);
  if (lo === hi){ lo -= 1; hi += 1; }
  const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;
  const W = window.innerWidth <= 760 ? 340 : 640, H = 170, l = 46, r = 10, t = 10, b = 22, x = (k) => rows.length === 1 ? (l + W - r) / 2 : l + (W - l - r) * k / (rows.length - 1), y = (a) => t + (H - t - b) * (1 - (a - lo) / (hi - lo));
  const fmt = (a) => perfTab === 'delinq' ? a.toFixed(2) : Math.round(a).toLocaleString('ko-KR');
  let s = '';
  for (let g = 0; g <= 3; g++){ const a = lo + (hi - lo) * g / 3; s += `<line x1="${l}" x2="${W - r}" y1="${y(a)}" y2="${y(a)}" stroke="#e8ebf3"/><text x="0" y="${y(a) + 4}" font-size="10" fill="#8a90a0">${fmt(a)}</text>`; }
  if (tgt !== null && tgt !== undefined) s += `<line x1="${l}" x2="${W - r}" y1="${y(tgt)}" y2="${y(tgt)}" stroke="#e5484d" stroke-dasharray="5 4" opacity=".6"/><text x="${W - r}" y="${y(tgt) - 4}" font-size="10" fill="#e5484d" text-anchor="end">목표 ${fmt(tgt)}</text>`;
  const pts = v.map((a, k) => `${x(k)},${y(a)}`).join(' ');
  s += `<polygon points="${x(0)},${H - b} ${pts} ${x(v.length - 1)},${H - b}" fill="${color}" opacity=".08"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${x(v.length - 1)}" cy="${y(v[v.length - 1])}" r="4.5" fill="${color}"/>`;
  s += `<text x="${l}" y="${H - 6}" font-size="10" fill="#8a90a0">${pfMd(rows[0].base_date).replace(' ', '')}</text><text x="${W - r}" y="${H - 6}" font-size="10" fill="#8a90a0" text-anchor="end">${pfMd(rows[rows.length - 1].base_date).replace(' ', '')}</text>`;
  return `<svg width="100%" height="170" viewBox="0 0 ${W} ${H}">${s}</svg>`;
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
      else if (a === 'input') pfOpenIn();
      else if (a === 'goal') pfOpenTg();
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
  const goals = [['수신 본점', r.dep_hq, Y.dep_hq_t, '#3563e9'], ['수신 지점', r.dep_br, Y.dep_br_t, '#3563e9'], ['여신 본점', r.loan_hq, Y.loan_hq_t, '#6d4df2'], ['여신 지점', r.loan_br, Y.loan_br_t, '#6d4df2']];
  const has = (v) => v !== null && v !== undefined;
  const dif = (t, b) => !has(t) ? '' : (Number(t) - Number(b));
  const cell = (d) => d === '' ? '<td></td>' : `<td class="${d > 0 ? 'd' : 'g'}">${pfN(d)}</td>`;
  const sumT = (a, b) => has(a) && has(b) ? Number(a) + Number(b) : null;
  const dTot = sumT(Y.dep_hq_t, Y.dep_br_t), lTot = sumT(Y.loan_hq_t, Y.loan_br_t);
  const tbl = `<div class="pfm"><table class="pft"><thead><tr><th rowspan="2" style="width:9%">구분</th><th class="g1" colspan="3">수 신</th><th class="g2" colspan="3">여 신</th><th class="g3" colspan="2">연체율</th></tr>
    <tr><th>목표(A)</th><th>잔액(B)</th><th>차액(C=A−B)</th><th>목표</th><th>잔액</th><th>차액(C=A−B)</th><th>목표</th><th>현황</th></tr></thead><tbody>
    <tr><td class="l">본 점</td><td>${pfN(Y.dep_hq_t)}</td><td>${pfN(r.dep_hq)}</td>${cell(dif(Y.dep_hq_t, r.dep_hq))}<td>${pfN(Y.loan_hq_t)}</td><td>${pfN(r.loan_hq)}</td>${cell(dif(Y.loan_hq_t, r.loan_hq))}<td></td><td></td></tr>
    <tr><td class="l">지 점</td><td>${pfN(Y.dep_br_t)}</td><td>${pfN(r.dep_br)}</td>${cell(dif(Y.dep_br_t, r.dep_br))}<td>${pfN(Y.loan_br_t)}</td><td>${pfN(r.loan_br)}</td>${cell(dif(Y.loan_br_t, r.loan_br))}<td></td><td></td></tr>
    <tr class="sum"><td class="l" style="background:#fff6d6">합 산</td><td>${pfN(dTot)}</td><td>${pfN(c.dep)}</td>${cell(dTot === null ? '' : dTot - c.dep)}<td>${pfN(lTot)}</td><td>${pfN(c.loan)}</td>${cell(lTot === null ? '' : lTot - c.loan)}<td>${dT === null ? '-' : pfP(dT) + '%'}</td><td class="${ok ? 'g' : 'd'}">${pfP(dd)}%</td></tr></tbody></table></div>`;
  const note = (has(Y.prev_dep) || has(Y.prev_loan) || has(Y.prev_delinq))
    ? `※ ${yr - 1}년말 수신 ${pfN(Y.prev_dep)}백만원, 여신 ${pfN(Y.prev_loan)}백만원, 연체율 ${has(Y.prev_delinq) ? pfP(Y.prev_delinq) + '%' : '-'}` : (adm ? `※ ${yr - 1}년말 기준값은 “⚙ 목표·전년말”에서 입력해주세요.` : '');
  const noGoal = !perfYears[yr] ? `<div class="pfnote" style="margin-top:12px">${adm ? `${yr}년 목표가 아직 없어요. “⚙ 목표·전년말”에서 연 1회 설정하면 달성률이 표시돼요.` : `${yr}년 목표가 아직 설정되지 않았어요.`}</div>` : '';
  el.innerHTML = `<div class="pfcard">
    <div class="pfh"><b>📊 여수신 현황</b><span class="pftag">${pfMd(r.base_date)}(${pfDow(r.base_date)}) 기준</span><span class="m" style="color:var(--muted);font-size:13px">단위: 백만원, %</span><span class="sp"></span>
      <span class="pfnav"><button data-pf="prev" title="이전 영업일" ${c.i > 0 ? '' : 'disabled'}>◀</button><button data-pf="next" title="다음 영업일" ${c.i < perfRows.length - 1 ? '' : 'disabled'}>▶</button></span>${btns}</div>
    <div class="pfkpis">
      ${pfKpi('b', '수신', c.dep, c.depT, c.pDep === null ? null : c.dep - c.pDep, yearVs(c.dep, Y.prev_dep, `전년말(${pfN(Y.prev_dep)})`), Number(r.dep_hq), Number(r.dep_br))}
      ${pfKpi('p', '여신', c.loan, c.loanT, c.pLoan === null ? null : c.loan - c.pLoan, yearVs(c.loan, Y.prev_loan, `전년말(${pfN(Y.prev_loan)})`), Number(r.loan_hq), Number(r.loan_br))}
      <div class="pfk r"><div class="t"><span>연체율</span>${dT !== null ? `<span class="pill ${ok ? 'ok' : ''}">${ok ? `목표 달성 −${pfP(dT - dd)}%p` : `목표 초과 +${pfP(dd - dT)}%p`}</span>` : '<span class="pill">목표 미설정</span>'}</div>
        <div class="big">${pfP(dd)}%${dT !== null ? `<small>/ 목표 ${pfP(dT)}%</small>` : ''}</div>
        ${dT !== null ? `<div class="pfbar"><i style="width:${ok ? 100 : Math.min(100, dT / dd * 100)}%;background:${ok ? 'linear-gradient(90deg,#86efac,#12a150)' : 'linear-gradient(90deg,#fca5a5,#e5484d)'}"></i></div>` : ''}
        <div class="pfrow"><span>${dT !== null ? (ok ? '목표 이내' : `목표(낮을수록 좋음)까지 <b class="up">${pfP(dd - dT)}%p</b>`) : '&nbsp;'}</span><span>${dPrevDq === null ? '' : `전 영업일 <span class="${pfCls(dPrevDq)}">${pfSigned(dPrevDq, '%p')}</span>`}</span></div>
        <div class="pfrow"><span>${dYearDq === null ? '&nbsp;' : `전년말(${pfP(Y.prev_delinq)}%) 대비`}</span>${dYearDq === null ? '' : `<b class="${pfCls(dYearDq)}">${pfSigned(dYearDq, '%p')} ${dYearDq < 0 ? '개선' : dYearDq > 0 ? '악화' : ''}</b>`}</div></div>
    </div>
    <div class="pftwo">
      <div class="pfmini"><div class="pfh"><div class="tt">추이 (최근 ${Math.min(20, c.i + 1)}영업일)</div><span class="sp"></span><span class="pftabs">${[['dep', '수신'], ['loan', '여신'], ['delinq', '연체율']].map(([k, n]) => `<button data-pf="tab" data-t="${k}" class="${perfTab === k ? 'on' : ''}">${n}</button>`).join('')}</span></div>${pfChart()}</div>
      <div class="pfmini"><div class="tt">본점 · 지점 달성률</div>${goals.map(([n, v, t, col]) => has(t) && Number(t) ? `<div class="pfgoal"><span>${n}</span><span>${pfP(Number(v) / Number(t) * 100, 1)}%</span></div><div class="pfgb"><i style="width:${Math.min(100, Number(v) / Number(t) * 100)}%;background:${col}"></i></div>` : `<div class="pfgoal"><span>${n}</span><span class="m" style="color:var(--muted)">목표 미설정</span></div>`).join('')}</div>
    </div>
    <div class="pfh" style="margin-top:18px"><b style="font-size:15px">상세표</b><span class="m" style="color:var(--muted);font-size:13px">보고용 양식</span><span class="sp"></span><button class="btn small" data-pf="table">${perfTable ? '접기 ▴' : '펼치기 ▾'}</button></div>
    ${perfTable ? tbl : ''}${note ? `<div class="pfnote">${esc(note)}</div>` : ''}${noGoal}</div>`;
}

// ---------- 실적 입력 (관리자) ----------
function pfOpenIn(date){
  if (!isAdmin()) return;
  const d = date || pfPrevBizDay();
  $('pfInPanel').innerHTML = `<div class="ph"><h2>여수신 실적 입력</h2><button class="x" data-f="close">✕</button></div>
    <div class="pfsub">단위: 백만원 · 같은 날짜를 다시 저장하면 덮어써요</div>
    <label>기준일 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">(기본값: 전 영업일)</span></label><input id="pfDate" type="date" />
    <div class="pfform"><div><label>수신 · 본점</label><input id="pfDepHq" inputmode="numeric" /></div><div><label>수신 · 지점</label><input id="pfDepBr" inputmode="numeric" /></div>
      <div><label>여신 · 본점</label><input id="pfLoanHq" inputmode="numeric" /></div><div><label>여신 · 지점</label><input id="pfLoanBr" inputmode="numeric" /></div></div>
    <label>연체율 현황 (%) — 본점·지점 합산</label><input id="pfDq" inputmode="decimal" placeholder="예: 2.88" style="max-width:200px;text-align:right;font-weight:700" />
    <div id="pfInfo" class="pfsub" style="margin-top:8px"></div>
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px"><button class="btn primary" data-f="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-f="close" style="min-height:44px">취소</button></div><button class="btn danger" data-f="del" id="pfDel" style="display:none">이 날짜 삭제</button></div>`;
  $('pfDate').value = d;
  const fill = () => {
    const row = perfRows.find(r => r.base_date === $('pfDate').value);
    $('pfDepHq').value = row ? Number(row.dep_hq).toLocaleString('ko-KR') : ''; $('pfDepBr').value = row ? Number(row.dep_br).toLocaleString('ko-KR') : '';
    $('pfLoanHq').value = row ? Number(row.loan_hq).toLocaleString('ko-KR') : ''; $('pfLoanBr').value = row ? Number(row.loan_br).toLocaleString('ko-KR') : '';
    $('pfDq').value = row ? Number(row.delinq).toFixed(2) : '';
    $('pfDel').style.display = row ? '' : 'none';
    const v = $('pfDate').value; $('pfInfo').textContent = row ? `✏️ ${v}(${pfDow(v)}) 실적이 이미 있어요. 고쳐서 저장하면 덮어써요.` : (v ? `${v}(${pfDow(v)})${pfIsHoliday(v) ? ' · 휴일' : ''}` : '');
  };
  fill(); $('pfDate').onchange = fill;
  ['pfDepHq', 'pfDepBr', 'pfLoanHq', 'pfLoanBr'].forEach(id => { $(id).oninput = () => { $(id).value = pfComma($(id).value); }; });
  $('pfOvIn').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('pfDepHq').focus(); } catch (x) {} }, 50);
}
const pfComma = (s) => { const n = pfNum(s); return n === null ? '' : n.toLocaleString('ko-KR'); };
function pfCloseIn(){ $('pfOvIn').style.display = 'none'; document.body.style.overflow = ''; }
$('pfInPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'close') return pfCloseIn();
  const date = $('pfDate').value;
  if (b.dataset.f === 'del'){
    if (!confirm(`${date} 실적을 삭제할까요?`)) return;
    const { error } = await sb.from('perf_daily').delete().eq('base_date', date);
    if (error) return alert(error.message);
    pfCloseIn(); toast('삭제했어요'); return loadPerf();
  }
  const v = { dep_hq: pfNum($('pfDepHq').value), dep_br: pfNum($('pfDepBr').value), loan_hq: pfNum($('pfLoanHq').value), loan_br: pfNum($('pfLoanBr').value), delinq: pfDec($('pfDq').value) };
  if (!date) return alert('기준일을 선택해주세요.');
  if (Object.values(v).some(x => x === null)) return alert('수신·여신 잔액(본점/지점)과 연체율을 모두 입력해주세요.');
  if (date > kstToday()) return alert('오늘 이후 날짜는 입력할 수 없어요.');
  b.disabled = true;
  const { error } = await sb.from('perf_daily').upsert({ base_date: date, ...v, entered_by: me, updated_at: new Date().toISOString() }, { onConflict: 'base_date' });
  b.disabled = false;
  if (error) return alert(error.message);
  perfSel = date; pfCloseIn(); toast('📊 실적을 저장했어요'); await loadPerf();
});

// ---------- 연 목표 · 전년말 기준값 (관리자, 연 1회) ----------
function pfOpenTg(year){
  if (!isAdmin()) return;
  const y = year || (perfSel ? +perfSel.slice(0, 4) : +kstToday().slice(0, 4));
  $('pfTgPanel').innerHTML = `<div class="ph"><h2>연 목표 · 전년말 기준값</h2><button class="x" data-g="close">✕</button></div>
    <div class="pfsub">단위: 백만원 · 연 1회 설정해요</div>
    <label>연도</label><input id="pgYear" type="number" min="2000" max="2100" style="max-width:140px" />
    <div class="pfsub" style="margin-top:14px;font-weight:800;color:#44546f">연 목표 (A)</div>
    <div class="pfform"><div><label>수신 · 본점</label><input id="pgDepHq" inputmode="numeric" /></div><div><label>수신 · 지점</label><input id="pgDepBr" inputmode="numeric" /></div>
      <div><label>여신 · 본점</label><input id="pgLoanHq" inputmode="numeric" /></div><div><label>여신 · 지점</label><input id="pgLoanBr" inputmode="numeric" /></div></div>
    <label>연체율 목표 (%)</label><input id="pgDq" inputmode="decimal" placeholder="예: 1.50" style="max-width:200px;text-align:right;font-weight:700" />
    <div class="pfsub" style="margin-top:16px;font-weight:800;color:#44546f">전년말 기준값 (각주·전년말 대비에 사용)</div>
    <div class="pfform"><div><label>전년말 수신 (합계)</label><input id="pgPDep" inputmode="numeric" /></div><div><label>전년말 여신 (합계)</label><input id="pgPLoan" inputmode="numeric" /></div></div>
    <label>전년말 연체율 (%)</label><input id="pgPDq" inputmode="decimal" placeholder="예: 3.56" style="max-width:200px;text-align:right;font-weight:700" />
    <div class="acts" style="margin-top:20px"><button class="btn primary" data-g="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-g="close" style="min-height:44px">취소</button></div>`;
  $('pgYear').value = y;
  const fill = () => {
    const Y = perfYears[+$('pgYear').value] || {}, c = (n) => n === null || n === undefined ? '' : Number(n).toLocaleString('ko-KR');
    $('pgDepHq').value = c(Y.dep_hq_t); $('pgDepBr').value = c(Y.dep_br_t); $('pgLoanHq').value = c(Y.loan_hq_t); $('pgLoanBr').value = c(Y.loan_br_t);
    $('pgDq').value = Y.delinq_t === null || Y.delinq_t === undefined ? '' : Number(Y.delinq_t).toFixed(2);
    $('pgPDep').value = c(Y.prev_dep); $('pgPLoan').value = c(Y.prev_loan); $('pgPDq').value = Y.prev_delinq === null || Y.prev_delinq === undefined ? '' : Number(Y.prev_delinq).toFixed(2);
  };
  fill(); $('pgYear').onchange = fill;
  ['pgDepHq', 'pgDepBr', 'pgLoanHq', 'pgLoanBr', 'pgPDep', 'pgPLoan'].forEach(id => { $(id).oninput = () => { $(id).value = pfComma($(id).value); }; });
  $('pfOvTg').style.display = 'block'; document.body.style.overflow = 'hidden';
}
function pfCloseTg(){ $('pfOvTg').style.display = 'none'; document.body.style.overflow = ''; }
$('pfTgPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-g]'); if (!b) return;
  if (b.dataset.g === 'close') return pfCloseTg();
  const year = +$('pgYear').value;
  if (!year || year < 2000 || year > 2100) return alert('연도를 확인해주세요.');
  const row = { year, dep_hq_t: pfNum($('pgDepHq').value), dep_br_t: pfNum($('pgDepBr').value), loan_hq_t: pfNum($('pgLoanHq').value), loan_br_t: pfNum($('pgLoanBr').value), delinq_t: pfDec($('pgDq').value),
    prev_dep: pfNum($('pgPDep').value), prev_loan: pfNum($('pgPLoan').value), prev_delinq: pfDec($('pgPDq').value), updated_by: me, updated_at: new Date().toISOString() };
  b.disabled = true;
  const { error } = await sb.from('perf_year').upsert(row, { onConflict: 'year' });
  b.disabled = false;
  if (error) return alert(error.message);
  pfCloseTg(); toast(`⚙ ${year}년 목표·전년말 기준값을 저장했어요`); await loadPerf();
});
