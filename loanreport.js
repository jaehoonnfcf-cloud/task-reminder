// 대출취급 > 📋 대출 현황표 — 현재 대출 집계를 본점·지점 표(진행상태·금액·담보물·합계)로 만들어 한글/워드/엑셀에 붙여넣을 수 있게 복사한다
// index.html 이 openLoanReport(loans) 로 부른다. loans = [{ name, scope, stage: '협의'|'진행'|'실행', amount(백만원|null), coll }]
// 의존: index.html ($, esc, toast)
const LR_STAGE = { '실행': { bg: '#ff6a13', fg: '#fff' }, '진행': { bg: '#3fb6f2', fg: '#000' }, '협의': { bg: '#a6ff1a', fg: '#000' } };   // 캡처 표와 같은 색
const LR_ORDER = { '실행': 0, '진행': 1, '협의': 2 };
let lrData = [], lrStages = { '실행': true, '진행': true, '협의': true };

const lrColl = (s) => { const c = String(s || '').trim(); return !c ? '' : /^\[.*\]$/.test(c) ? c : `[${c}]`; };
const lrN = (n) => Number(n || 0).toLocaleString('ko-KR');

// 붙여넣기 후에도 모양이 남도록 모든 스타일을 inline 으로 쓴다
function lrTable(scopes){
  const TD = 'border:1px solid #000;padding:3px 6px;font-size:14px;', HD = 'border:1px solid #000;padding:5px 6px;font-size:15px;font-weight:700;background:#f3efe6;text-align:center;';
  const pick = (k) => lrData.filter(r => lrStages[r.stage] && (k === '통합' ? r.scope !== '본점' && r.scope !== '지점' : r.scope === k)).sort((a, b) => LR_ORDER[a.stage] - LR_ORDER[b.stage]);
  const groups = scopes.map(k => ({ k, rows: pick(k) })), n = Math.max(1, ...groups.map(g => g.rows.length));
  const head = groups.map(g => `<td style="${HD}">${g.k} 채무자</td><td style="${HD}">진행</td><td style="${HD}">금액</td><td style="${HD}">담보물</td>`).join('');
  let body = '';
  for (let i = 0; i < n; i++){
    body += '<tr>' + groups.map(g => {
      const r = g.rows[i]; if (!r) return `<td style="${TD}background:#f3efe6">&nbsp;</td><td style="${TD}text-align:center">&nbsp;</td><td style="${TD}">&nbsp;</td><td style="${TD}">&nbsp;</td>`;
      const c = LR_STAGE[r.stage];
      return `<td style="${TD}white-space:nowrap">${esc(r.name)}</td><td style="${TD}text-align:center"><span style="background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;padding:1px 5px">${r.stage}</span></td><td style="${TD}text-align:right;white-space:nowrap">${r.amount == null ? '-' : lrN(r.amount) + '백만원'}</td><td style="${TD}">${esc(lrColl(r.coll))}</td>`;
    }).join('') + '</tr>';
  }
  const foot = groups.map(g => `<td colspan="2" style="${HD}background:#fff">${g.k}(${g.rows.length}건)</td><td colspan="2" style="${HD}background:#fff;text-align:left">${lrN(g.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}백만원</td>`).join('');
  return `<table style="border-collapse:collapse;border:1px solid #000;font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#000"><tr>${head}</tr>${body}<tr>${foot}</tr></table>`;
}
const lrVisible = () => lrData.filter(r => lrStages[r.stage]);
function lrSummary(){   // 본점+지점(통합 포함) 합산, 진행상태별 건수·금액
  const TD = 'border:1px solid #000;padding:3px 10px;font-size:14px;', HD = 'border:1px solid #000;padding:5px 10px;font-size:15px;font-weight:700;background:#f3efe6;text-align:center;';
  const v = lrVisible(), sum = (a) => a.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rows = ['실행', '진행', '협의'].filter(k => lrStages[k]).map(k => { const a = v.filter(r => r.stage === k), c = LR_STAGE[k]; return `<tr><td style="${TD}text-align:center"><span style="background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;padding:1px 5px">${k}</span></td><td style="${TD}text-align:right">${a.length}건</td><td style="${TD}text-align:right">${lrN(sum(a))}백만원</td></tr>`; }).join('');
  return `<table style="border-collapse:collapse;border:1px solid #000;font-family:'맑은 고딕','Malgun Gothic',sans-serif;color:#000;margin-top:12px"><tr><td colspan="3" style="${HD}">전체 합계 (본점+지점)</td></tr><tr><td style="${HD}">진행</td><td style="${HD}">건수</td><td style="${HD}">금액</td></tr>${rows}<tr><td style="${HD}background:#fff">합계</td><td style="${HD}background:#fff;text-align:right">${v.length}건</td><td style="${HD}background:#fff;text-align:right">${lrN(sum(v))}백만원</td></tr></table>`;
}
function lrHtml(){
  const extra = lrData.some(r => lrStages[r.stage] && r.scope !== '본점' && r.scope !== '지점');
  return lrTable(['본점', '지점']) + (extra ? '<p style="margin:10px 0 4px;font-size:13px">※ 통합·기타 구분</p>' + lrTable(['통합']) : '') + lrSummary();
}
function lrPlain(){   // 표를 못 붙이는 곳(메모장 등)용 탭 구분 텍스트
  const out = [];
  ['본점', '지점', '통합'].forEach(k => {
    const rows = lrData.filter(r => lrStages[r.stage] && (k === '통합' ? r.scope !== '본점' && r.scope !== '지점' : r.scope === k)).sort((a, b) => LR_ORDER[a.stage] - LR_ORDER[b.stage]);
    if (k === '통합' && !rows.length) return;
    out.push(`[${k}]`, ...rows.map(r => [r.name, r.stage, r.amount == null ? '-' : lrN(r.amount) + '백만원', lrColl(r.coll)].join('\t')), `${k}(${rows.length}건)\t${lrN(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}백만원`, '');
  });
  const v = lrVisible(), sm = (a) => lrN(a.reduce((s, r) => s + (Number(r.amount) || 0), 0)) + '백만원';
  out.push('[전체 합계 (본점+지점)]', ...['실행', '진행', '협의'].filter(k => lrStages[k]).map(k => { const a = v.filter(r => r.stage === k); return `${k}\t${a.length}건\t${sm(a)}`; }), `합계\t${v.length}건\t${sm(v)}`);
  return out.join('\n');
}
function lrRender(){
  const cnt = (s) => lrData.filter(r => r.stage === s).length;
  $('lrBody').innerHTML = `<div class="lrbar">
      ${['실행', '진행', '협의'].map(s => `<label><input type="checkbox" data-lrs="${s}" ${lrStages[s] ? 'checked' : ''} /> ${s} ${cnt(s)}건</label>`).join('')}</div>
    <div class="lrwrap" id="lrTbl">${lrHtml()}</div>
    <div class="lrnote">※ 협의 = 1단계 · 진행 = 2~4단계 · 실행 = 5단계 진행 중 · 완료된 건과 미진행 처리된 건은 제외 · 금액은 백만원 단위(미입력은 합계에서 제외)</div>`;
  document.querySelectorAll('[data-lrs]').forEach(c => { c.onchange = () => { lrStages[c.dataset.lrs] = c.checked; lrRender(); }; });
}
function openLoanReport(loans){
  lrData = loans || [];
  if (!$('lrOv')){
    const st = document.createElement('style'); st.textContent = `
    .lrbar{ display:flex; gap:6px 16px; flex-wrap:wrap; margin:12px 0; font-size:13.5px; font-weight:600; } .lrbar label{ display:flex; align-items:center; gap:5px; margin:0; font-size:13.5px; cursor:pointer; }
    .lrwrap{ overflow-x:auto; padding:2px; border:1px dashed #d9d2c2; border-radius:10px; background:#fff; } .lrnote{ margin-top:10px; font-size:12px; color:var(--muted); line-height:1.5; }`;
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.innerHTML = `<div class="ov" id="lrOv"><div class="panel" style="max-width:1100px"><div class="ph"><h2>📋 대출 현황표</h2><button class="x" id="lrX">✕</button></div>
      <div class="pfsub" style="font-size:13px">현재 대출 집계를 본점·지점으로 나눈 표예요. “표 복사” 후 한글·워드·엑셀·메일에 붙여넣으세요.</div>
      <div id="lrBody"></div><div class="acts" style="margin-top:14px"><button class="btn primary" id="lrCopy" style="min-height:44px;padding:8px 26px">📋 표 복사</button><button class="btn" id="lrClose" style="min-height:44px">닫기</button></div></div></div>`;
    document.body.appendChild(d);
    const close = () => { $('lrOv').style.display = 'none'; document.body.style.overflow = ''; };
    $('lrX').onclick = $('lrClose').onclick = close; $('lrOv').addEventListener('click', (e) => { if (e.target === $('lrOv')) close(); });
    $('lrCopy').onclick = lrCopy;
  }
  lrRender(); $('lrOv').style.display = 'block'; document.body.style.overflow = 'hidden';
}
async function lrCopy(){
  const html = lrHtml();
  try {
    if (navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([lrPlain()], { type: 'text/plain' }) })]);
      return toast('📋 표를 복사했어요. 붙여넣기(Ctrl+V) 하세요');
    }
  } catch (e) { /* 아래 선택 복사로 */ }
  const box = $('lrTbl'), sel = window.getSelection(), rg = document.createRange();   // 대체: 화면의 표를 선택해 복사
  rg.selectNodeContents(box); sel.removeAllRanges(); sel.addRange(rg);
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  toast(ok ? '📋 표를 복사했어요. 붙여넣기(Ctrl+V) 하세요' : '표를 선택했어요. Ctrl+C 로 복사해주세요');
}
