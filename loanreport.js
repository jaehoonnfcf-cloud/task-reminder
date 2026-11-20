// 대출취급 > 📋 대출 현황표 — 현재 진행 중인 대출을 본점·지점 표와 전체 합계(한 줄)로 보여준다. (복사 기능 없음 — 보기 전용)
// index.html 이 openLoanReport(loans) 로 부른다. loans = [{ name, scope, stage: '협의'|'진행'|'실행', amount(백만원|null), coll }]
// 의존: index.html ($, esc)
const LR_STAGE = { '실행': { bg: '#f26a1b', fg: '#fff' }, '진행': { bg: '#3aa7e8', fg: '#fff' }, '협의': { bg: '#8fd13f', fg: '#1d3300' } };
const LR_ORDER = { '실행': 0, '진행': 1, '협의': 2 };
let lrData = [], lrWeekly = null;

const lrColl = (s) => { const c = String(s || '').trim(); return !c ? '' : /^\[.*\]$/.test(c) ? c : `[${c}]`; };
const lrN = (n) => Number(n || 0).toLocaleString('ko-KR');
const lrSum = (a) => a.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const lrVisible = () => lrData;
const lrBadge = (k) => `<span class="lrb" style="background:${LR_STAGE[k].bg};color:${LR_STAGE[k].fg}">${k}</span>`;
const lrInScope = (r, k) => k === '통합' ? r.scope !== '본점' && r.scope !== '지점' : r.scope === k;

// 1) 맨 위 한 줄: 실행 · 진행 · 협의 · 전체 합계
function lrSummary(){
  const chips = ['실행', '진행', '협의'].map(k => { const a = lrData.filter(r => r.stage === k); return `<div class="lrs">${lrBadge(k)}<b>${a.length}건</b><span>${lrN(lrSum(a))}백만원</span></div>`; }).join('');
  return `<div class="lrsum">${chips}<div class="lrs tot"><em>전체 합계</em><b>${lrData.length}건</b><span>${lrN(lrSum(lrData))}백만원</span></div></div>`;
}
// 2) 본점·지점 × 단계 매트릭스
function lrMatrix(){
  const cell = (a) => a.length ? `<b>${a.length}건</b><small>${lrN(lrSum(a))}</small>` : '<i>-</i>';
  const scopes = ['본점', '지점'].concat(lrData.some(r => r.scope !== '본점' && r.scope !== '지점') ? ['통합'] : []);
  const rows = scopes.concat(['합계']).map(k => { const base = k === '합계' ? lrData : lrData.filter(r => lrInScope(r, k)); return `<tr class="${k === '합계' ? 'tt' : ''}"><th>${k}</th>${['실행', '진행', '협의'].map(st => `<td>${cell(base.filter(r => r.stage === st))}</td>`).join('')}<td class="sm">${cell(base)}</td></tr>`; }).join('');
  return `<div class="lrh">본점·지점 현황 <small>금액: 백만원</small></div><div class="lrwrap"><table class="lrm"><thead><tr><th></th><th>${lrBadge('실행')}</th><th>${lrBadge('진행')}</th><th>${lrBadge('협의')}</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
// 3) 이번 주 변동 (지난주 대비)
function lrWeek(){
  if (!lrWeekly) return '';
  const d = (n, p) => n === p ? '<span class="eq">지난주와 같음</span>' : `<span class="${n > p ? 'up' : 'dn'}">${n > p ? '▲' : '▼'} ${Math.abs(n - p)}건</span> <span class="pv">지난주 ${p}건</span>`;
  return `<div class="lrh">이번 주 변동 <small>${lrWeekly.range} (월~일)</small></div><div class="lrwk">${lrWeekly.items.map(x => `<div class="lrw"><div class="t">${x.l}</div><div class="v"><b>${x.n}</b>건${x.n ? `<small>${lrN(x.amt)}백만원</small>` : ''}</div><div class="d">${d(x.n, x.prev.n)}</div></div>`).join('')}</div>`;
}
function lrTable(scopes){
  const groups = scopes.map(k => ({ k, rows: lrVisible().filter(r => lrInScope(r, k)).sort((a, b) => LR_ORDER[a.stage] - LR_ORDER[b.stage]) })), n = Math.max(1, ...groups.map(g => g.rows.length)), f = 2 / groups.length;
  const W = (v) => `width:${(v * f).toFixed(1)}%`;
  const head = groups.map(g => `<th style="${W(21)}">${g.k} 채무자</th><th style="${W(7)}">진행</th><th style="${W(9)}">금액</th><th style="${W(13)}">담보물</th>`).join('');
  let body = '';
  for (let i = 0; i < n; i++) body += '<tr>' + groups.map(g => {
    const r = g.rows[i]; if (!r) return '<td class="e"></td><td></td><td></td><td></td>';
    return `<td class="nm">${esc(r.name)}</td><td class="c">${lrBadge(r.stage)}</td><td class="r">${r.amount == null ? '<i>-</i>' : lrN(r.amount) + '<small>백만원</small>'}</td><td class="cl">${esc(lrColl(r.coll))}</td>`;
  }).join('') + '</tr>';
  const foot = groups.map(g => `<td colspan="2" class="ft">${g.k}<small>${g.rows.length}건</small></td><td colspan="2" class="ft r">${lrN(lrSum(g.rows))}<small>백만원</small></td>`).join('');
  return `<table class="lrt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table>`;
}
function lrRender(){
  const extra = lrVisible().some(r => r.scope !== '본점' && r.scope !== '지점');
  const noAmt = lrData.filter(r => r.amount == null).length;
  $('lrBody').innerHTML = lrSummary() + lrMatrix() + lrWeek()
    + `<div class="lrh">진행 건 명세 <small>${lrData.length}건</small></div><div class="lrwrap">${lrTable(['본점', '지점'])}</div>`
    + (extra ? `<div class="lrx">통합·기타 구분</div><div class="lrwrap">${lrTable(['통합'])}</div>` : '')
    + `<div class="lrnote">협의 = 1단계 · 진행 = 2~4단계 · 실행 = 5단계 진행 중 · 완료된 건과 미진행 처리된 건은 제외 · 금액은 백만원 단위${noAmt ? ` · <b>금액 미입력 ${noAmt}건</b>은 금액 합계에서 빠져 있어요` : ''}</div>`;
}
function openLoanReport(loans, weekly){
  lrData = loans || []; lrWeekly = weekly || null;
  if (!$('lrOv')){
    const st = document.createElement('style'); st.textContent = `
    #lrOv .panel{ max-width:1100px; } #lrOv .pfsub{ font-size:13px; }
    .lrsum{ display:flex; gap:8px; margin:14px 0 16px; overflow-x:auto; padding-bottom:2px; -webkit-overflow-scrolling:touch; }
    .lrs{ flex:none; display:flex; align-items:center; gap:9px; padding:9px 16px; border:1px solid #e3e6ee; border-radius:14px; background:#fff; font:inherit; white-space:nowrap; min-height:44px; }
    .lrs b{ font-size:16px; font-weight:800; letter-spacing:-.02em; } .lrs span:not(.lrb){ font-size:14px; font-weight:600; color:#5a6172; font-variant-numeric:tabular-nums; }
    .lrs.tot{ margin-left:auto; background:#172b4d; border-color:#172b4d; color:#fff; } .lrs.tot em{ font-style:normal; font-size:13px; font-weight:700; opacity:.8; } .lrs.tot span{ color:#fff !important; font-size:16px !important; font-weight:800 !important; }
    .lrb{ display:inline-block; white-space:nowrap; font-size:12px; font-weight:800; padding:2px 9px; border-radius:999px; letter-spacing:0; }
    .lrwrap{ overflow-x:auto; border:1px solid #e3e6ee; border-radius:14px; background:#fff; }
    .lrt{ width:100%; min-width:940px; table-layout:fixed; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums; }
    .lrt th{ background:#f3efe6; color:#44546f; font-size:13px; font-weight:800; padding:10px 8px; border-bottom:1px solid #e3e6ee; text-align:center; }
    .lrt td{ padding:9px 10px; border-top:1px solid #eef0f5; vertical-align:middle; line-height:1.4; }
    .lrt th+th,.lrt td+td{ border-left:1px solid #f0f2f6; } .lrt tbody tr:first-child td{ border-top:0; }
    .lrt th:nth-child(5),.lrt td:nth-child(5){ border-left:2px solid #d9d2c2; }
    .lrt td.nm{ font-weight:700; word-break:keep-all; } .lrt td.c{ text-align:center; } .lrt td.r{ text-align:right; white-space:nowrap; font-weight:700; } .lrt td.r i{ font-style:normal; color:#b4bac6; font-weight:500; }
    .lrt small{ font-size:11.5px; font-weight:500; color:#8a90a0; margin-left:2px; } .lrt td.cl{ color:#5a6172; font-size:13px; word-break:keep-all; } .lrt td.e{ background:#faf8f3; }
    .lrt tfoot td{ background:#f3efe6; border-top:1px solid #d9d2c2; font-size:15px; font-weight:800; padding:11px 12px; } .lrt tfoot td.ft{ text-align:center; } .lrt tfoot td.ft small{ margin-left:6px; font-size:12.5px; } .lrt tfoot td.r{ text-align:left; }
    .lrh{ margin:20px 2px 8px; font-size:14.5px; font-weight:800; } .lrh small{ font-size:12px; font-weight:500; color:#8a90a0; margin-left:6px; }
    .lrm{ width:100%; border-collapse:collapse; font-size:14px; font-variant-numeric:tabular-nums; } .lrm th{ background:#f3efe6; color:#44546f; font-size:13px; font-weight:800; padding:9px 8px; text-align:center; width:20%; } .lrm tbody th{ background:#faf8f3; font-size:14px; }
    .lrm td{ padding:10px 8px; text-align:center; border-top:1px solid #eef0f5; border-left:1px solid #f0f2f6; } .lrm td b{ font-weight:800; margin-right:6px; } .lrm td small{ color:#6b7385; font-size:12.5px; } .lrm td i{ font-style:normal; color:#c3c8d2; }
    .lrm td.sm{ background:#faf8f3; } .lrm tr.tt th,.lrm tr.tt td{ background:#f3efe6; font-weight:800; border-top:1px solid #d9d2c2; }
    .lrwk{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; } .lrw{ border:1px solid #e3e6ee; border-radius:14px; background:#fff; padding:12px 14px; min-width:0; }
    .lrw .t{ font-size:12.5px; font-weight:700; color:#5a6172; } .lrw .v{ margin-top:4px; font-size:13px; font-weight:600; } .lrw .v b{ font-size:24px; font-weight:800; letter-spacing:-.02em; } .lrw .v small{ margin-left:8px; font-size:12.5px; color:#6b7385; }
    .lrw .d{ margin-top:2px; font-size:12px; } .lrw .up{ color:#d4380d; font-weight:800; } .lrw .dn{ color:#1d6fd6; font-weight:800; } .lrw .pv,.lrw .eq{ color:#8a90a0; }
    .lrx{ margin:14px 2px 6px; font-size:13px; font-weight:800; color:#44546f; } .lrnote{ margin-top:12px; font-size:12px; color:var(--muted); line-height:1.55; }
    @media (max-width:640px){ .lrs{ padding:8px 12px; gap:7px; } .lrwk{ grid-template-columns:repeat(2,1fr); } }`;
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.innerHTML = `<div class="ov" id="lrOv"><div class="panel"><div class="ph"><h2>📋 대출 현황표</h2><button class="x" id="lrX">✕</button></div>
      <div class="pfsub">현재 진행 중인 대출을 본점·지점으로 나눈 표예요. 합계 → 본점·지점 현황 → 이번 주 변동 → 진행 건 명세 순서예요.</div>
      <div id="lrBody"></div><div class="acts" style="margin-top:14px"><button class="btn" id="lrClose" style="min-height:44px;padding:8px 26px">닫기</button></div></div></div>`;
    document.body.appendChild(d);
    const close = () => { $('lrOv').style.display = 'none'; document.body.style.overflow = ''; };
    $('lrX').onclick = $('lrClose').onclick = close; $('lrOv').addEventListener('click', (e) => { if (e.target === $('lrOv')) close(); });
  }
  lrRender(); $('lrOv').style.display = 'block'; document.body.style.overflow = 'hidden';
}
