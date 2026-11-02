// 감정평가 > 임대사업자 RTI 계산 — 임대소득(월세·전세·추정분) ÷ 연간 이자비용(기존대출 + 신규대출, Stress 금리 적용) 으로 RTI 를 계산해 저장·인쇄한다.
// 조회는 팀원 전체, 저장·수정은 감정평가 권한자(canWrite('appraisal')), 기준값(기준금리·Stress·판정 기준) 수정은 관리자.
// 전역(sb, $, esc, me, meRow, nameOf, kstToday, toast, canWrite, isAdmin)과 appraisal.js 의 apPreview / apSettings / AP_FONT 를 함께 쓴다.

let rtiCalcs = [], rtiSet = null, rtiMode = 'list', rtiDraft = null, rtiQ = '', rtiKind = 'all';
const RTI_DEF = { base_rate: 2.93, base_month: '2026년 3월', ref_loan_rate: 4.79, ref_loan_month: '2024년 12월', stress_existing: 1, stress_new: 1.5, est_ratio: 70, small_limit: 100000000, th_non_house: 1.5, th_non_house_ok: 1.2, th_house: 1.25, th_house_ok: 1.0 };
const rtiS = () => ({ ...RTI_DEF, ...(rtiSet || {}) });
const rtiCan = () => typeof canWrite === 'function' && canWrite('appraisal');
const rtiNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : 0; };
const rtiPct = (s) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const rtiW = (n) => Number(n || 0).toLocaleString('ko-KR');
const rtiComma = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; };
const rtiPctTxt = (n) => `${(Math.round(Number(n) * 100) / 100).toFixed(2)}%`;
const rtiR2 = (n) => Math.round(n * 100) / 100;

// ---------- 계산 (화면·저장·인쇄가 모두 이 함수를 쓴다) ----------
function rtiNewData(){
  const s = rtiS();
  return { monthly: 0, jeonse: 0, estMonthly: 0, estJeonse: 0, baseRate: s.base_rate, estRatio: s.est_ratio, stressEx: s.stress_existing, stressNew: s.stress_new,
    existing: [{ p: 0, r: 0, t: 'v' }, { p: 0, r: 0, t: 'v' }], news: [{ p: 0, r: 0, t: 'v' }], refRate: s.ref_loan_rate, forced: false };
}
function rtiStale(m){   // '2026년 3월' 형태의 기준 시점이 3개월 넘게 지났는지
  const x = String(m || '').match(/(\d{4})\s*년\s*(\d{1,2})\s*월/); if (!x) return false;
  const now = new Date(Date.now() + 9 * 3600e3);
  return (now.getUTCFullYear() - +x[1]) * 12 + (now.getUTCMonth() + 1 - +x[2]) > 3;
}
function rtiStaleMsg(){
  const s = rtiS(), a = [];
  if (rtiStale(s.base_month)) a.push(`수신금리(${s.base_month} 기준)`); if (rtiStale(s.ref_loan_month)) a.push(`여신금리(${s.ref_loan_month} 기준)`);
  return a.length ? `⚠ ${a.join(' · ')} 자료가 오래됐어요. 한국은행 최신 자료로 ${isAdmin() ? '⚙ 기준값에서 바꿔주세요' : '관리자가 ⚙ 기준값을 갱신해야 해요'}.` : '';
}
function rtiCompute(d, kind){
  const s = rtiS(), base = Number(d.baseRate) || 0, er = (Number(d.estRatio) || 0) / 100;
  const mInc = Math.round(Number(d.monthly || 0) * 12), jInc = Math.round(Number(d.jeonse || 0) * base / 100);
  const eM = Math.round(Number(d.estMonthly || 0) * 12 * er), eJ = Math.round(Number(d.estJeonse || 0) * base / 100 * er);
  const income = mInc + jInc + eM + eJ;
  // 금리: 입력한 금리 (기존대출은 실제 금리를 모르면 참고금리 = 예금은행 중소기업대출 가중평균금리(잔액기준) 적용). Stress: 변동금리에만 가산, 3년 이상 고정금리는 제외
  const refRate = Number(d.refRate !== undefined ? d.refRate : s.ref_loan_rate) || 0;
  const row = (x, add, isEx) => { const p = Number(x.p) || 0, has = Number(x.r) > 0, rate = has ? Number(x.r) : (isEx && p > 0 ? refRate : 0), fixed = x.t === 'f', st = rate + (fixed ? 0 : add);
    return { p, r: rate, s: st, i: Math.round(p * st / 100), refUsed: isEx && p > 0 && !has, fixed }; };
  const ex = (d.existing || []).map(x => row(x, Number(d.stressEx) || 0, true)), nw = (d.news || []).map(x => row(x, Number(d.stressNew) || 0, false));
  const interest = ex.concat(nw).reduce((a, x) => a + x.i, 0), newSum = nw.reduce((a, x) => a + x.p, 0);
  const hasI = interest > 0, rti = hasI ? rtiR2(income / interest) : null;   // 시트처럼 소수 둘째 자리 반올림 값으로 판정
  const th = kind === '주택' ? [s.th_house, s.th_house_ok] : [s.th_non_house, s.th_non_house_ok];
  const small = newSum > 0 && newSum <= s.small_limit;
  let verdict, vcls;
  if (d.forced){ verdict = '산정 예외 (불가피한 채무 인수)'; vcls = 'x'; }
  else if (small){ verdict = '산정 예외 (1억원 이하 소액 대출)'; vcls = 'x'; }
  else if (!hasI){ verdict = '이자비용을 입력하세요'; vcls = 'n'; }
  else if (rti >= th[0]){ verdict = '원칙 충족'; vcls = 'g'; }
  else if (rti >= th[1]){ verdict = '여신위원회 승인 시 충족'; vcls = 'o'; }
  else { verdict = '기준 미달'; vcls = 'r'; }
  return { mInc, jInc, eM, eJ, income, ex, nw, interest, newSum, rti, th, small, verdict, vcls };
}

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #rti{ display:none; flex-direction:column; gap:12px; min-width:0; }
  .rtirow,.rtihead{ display:grid; grid-template-columns:minmax(150px,1.3fr) 130px 130px 90px minmax(150px,1fr) 110px; gap:10px; align-items:center; padding:0 22px; }
  .rtihead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:10px; padding-bottom:8px; }
  .rtirow{ padding-top:14px; padding-bottom:14px; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; cursor:pointer; font-size:13.5px; }
  .rtirow:hover{ box-shadow:var(--sh-hover); } .rtirow .nm{ font-size:16.5px; font-weight:700; letter-spacing:-.02em; word-break:break-all; } .rtirow .sub{ font-size:12px; color:var(--muted); margin-top:2px; }
  .rtirow .mo{ font-weight:700; text-align:right; } .rtirow .rt{ font-size:20px; font-weight:800; text-align:center; }
  .rtiv{ display:inline-block; font-size:12.5px; font-weight:800; padding:4px 11px; border-radius:99px; white-space:nowrap; background:#eef1f6; color:#4b5563; }
  .rtiv.g{ background:var(--green-soft); color:var(--green); } .rtiv.o{ background:var(--warn-soft); color:var(--warn); } .rtiv.r{ background:var(--danger-soft); color:var(--danger); } .rtiv.x{ background:#ede9fe; color:#5b21b6; }
  .rtied{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:14px; align-items:start; }
  .rtibox{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:18px 20px; min-width:0; }
  .rtibox h3{ margin:0 0 10px; font-size:15.5px; letter-spacing:-.02em; }
  .rtisum{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
  .rtisum > div{ background:var(--field); border-radius:16px; padding:12px 14px; min-width:0; } .rtisum .k{ font-size:12px; color:var(--muted); font-weight:700; } .rtisum .v{ font-size:20px; font-weight:800; margin-top:3px; letter-spacing:-.02em; word-break:break-all; }
  .rtisum .inc{ background:#dcfce7; } .rtisum .int{ background:#ffedd5; }
  .rtitbl{ width:100%; border-collapse:collapse; font-size:13.5px; } .rtitbl th{ font-size:12px; color:var(--muted); font-weight:700; text-align:right; padding:4px 6px; } .rtitbl th:first-child,.rtitbl td:first-child{ text-align:left; }
  .rtitbl td{ padding:4px 6px; text-align:right; border-top:1px solid var(--line); vertical-align:middle; } .rtitbl td:first-child{ font-weight:700; white-space:nowrap; }
  .rtitbl input{ width:100%; min-width:70px; text-align:right; padding:7px 9px; font-size:14px; } .rtitbl .est td{ background:#fff8e6; } .rtitbl tfoot td{ font-weight:800; font-size:15px; }
  .rtitbl .calc{ font-weight:700; white-space:nowrap; } .rtitbl .rate{ width:78px; }
  .rtiscroll{ overflow-x:auto; } .rtibox .chk{ white-space:normal; align-items:flex-start; line-height:1.5; }
  .rtiwarn{ background:#fff3c4; color:#7a5200; border-radius:14px; padding:10px 14px; font-size:13.5px; font-weight:700; }
  .rtiinfo{ font-size:13px; line-height:1.6; color:#44546f; } .rtiinfo table{ width:100%; border-collapse:collapse; margin:6px 0 10px; } .rtiinfo th,.rtiinfo td{ border:1px solid var(--line); padding:5px 8px; text-align:center; font-size:12.5px; } .rtiinfo th{ background:var(--field); }
  .rtiinfo tr.cur td,.rtiinfo tr.cur th{ background:#fff3c4; font-weight:800; }
  .rtiinfo .ex{ color:#7c2d8e; font-weight:600; }
  @media (max-width:980px){ .rtied{ grid-template-columns:1fr; } .rtisum{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:760px){
    .rtihead{ display:none; } .rtirow{ grid-template-columns:1fr auto; gap:6px 10px; padding:14px 16px; border-radius:20px; }
    .rtirow > :nth-child(1){ grid-column:1 / 2; } .rtirow > :nth-child(4){ grid-column:2 / 3; justify-self:end; } .rtirow > :nth-child(2),.rtirow > :nth-child(3),.rtirow > :nth-child(5),.rtirow > :nth-child(6){ grid-column:1 / 3; } .rtirow .mo{ text-align:left; } .rtirow .rt{ text-align:right; }
    .rtitbl{ font-size:12.5px; min-width:480px; } .rtitbl input{ min-width:90px; padding:6px 6px; } .rtitbl td{ white-space:nowrap; } .rtibox{ padding:14px 12px; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="rtiSetOv" style="z-index:30"><div class="panel" style="max-width:520px" id="rtiSetPanel"></div></div>`;
  document.body.appendChild(d);
  $('rtiSetOv').addEventListener('click', (e) => { if (e.target === $('rtiSetOv')) $('rtiSetOv').style.display = 'none'; });
})();

// ---------- 불러오기 ----------
async function loadRti(){
  if (!meRow) return;
  const [c, s] = await Promise.all([sb.from('rti_calcs').select('*').order('updated_at', { ascending: false }), sb.from('rti_settings').select('*').eq('id', 1).maybeSingle()]);
  if (!s.error && s.data) rtiSet = s.data;
  if (c.error){ console.warn('RTI 불러오기 실패', c.error.message); return; }
  rtiCalcs = c.data || [];
  if (typeof divn !== 'undefined' && divn === 'appraisal' && typeof apTab !== 'undefined' && apTab === 'rti' && rtiMode === 'list') renderRti();
}
let rtiTimer = null; const scheduleRti = () => { clearTimeout(rtiTimer); rtiTimer = setTimeout(() => { if (me) loadRti(); }, 400); };

// ---------- 화면 진입 ----------
function renderRti(){
  const el = $('rti'); if (!el) return;
  if (rtiMode === 'edit' && rtiDraft) return;   // 편집 중에는 다시 그리지 않음
  rtiMode = 'list';
  const rows = rtiCalcs.filter(r => (rtiKind === 'all' || r.kind === rtiKind) && (!rtiQ || String(r.title).toLowerCase().includes(rtiQ)));
  const stale = rtiStaleMsg();
  el.innerHTML = `${stale ? `<div class="rtiwarn">${esc(stale)}</div>` : ''}<div class="list-panel"><div class="toolbar">
      <div class="seg" id="rtiKindSeg"><button data-k="all" class="${rtiKind === 'all' ? 'on' : ''}">전체</button><button data-k="비주택" class="${rtiKind === '비주택' ? 'on' : ''}">비주택</button><button data-k="주택" class="${rtiKind === '주택' ? 'on' : ''}">주택</button></div>
      <input id="rtiQ" class="search" type="search" placeholder="🔍 고객명 검색" value="${esc(rtiQ)}" />
      ${isAdmin() ? '<button class="btn small" data-r="set">⚙ 기준값</button>' : ''}${rtiCan() ? '<button class="btn small primary" data-r="new">＋ 새 RTI 계산</button>' : '<span class="pill ro">👀 보기 전용</span>'}
    </div>
    <div class="rtihead"><span>고객명</span><span style="text-align:right">연간 임대소득</span><span style="text-align:right">연간 이자비용</span><span style="text-align:center">RTI</span><span>판정</span><span>작성</span></div>
    <div>${rows.map(r => `<div class="rtirow" data-rid="${r.id}"><div><div class="nm">${esc(r.title)}</div><div class="sub">${esc(r.kind)} 임대업</div></div>
      <div class="mo">${rtiW(r.income)}원</div><div class="mo">${rtiW(r.interest)}원</div><div class="rt">${r.rti === null ? '-' : Number(r.rti).toFixed(2)}</div>
      <div><span class="rtiv ${esc((r.data && r.data.vcls) || 'n')}">${esc(r.verdict || '-')}</span></div><div style="font-size:12.5px;color:var(--muted)">${esc(nameOf(r.created_by))}<br>${esc(String(r.updated_at).slice(0, 10))}</div></div>`).join('') || `<div class="blk-empty">${rtiCalcs.length ? '조건에 맞는 계산이 없어요.' : '저장된 RTI 계산이 없어요. “＋ 새 RTI 계산”으로 시작해요.'}</div>`}</div></div>`;
  $('rtiKindSeg').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b){ rtiKind = b.dataset.k; renderRti(); } };
  $('rtiQ').oninput = (e) => { rtiQ = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; renderRti(); const q = $('rtiQ'); q.focus(); q.setSelectionRange(pos, pos); };
}
function rtiNew(){ if (!rtiCan()) return; rtiDraft = { id: null, title: '', kind: '비주택', memo: '', d: rtiNewData() }; rtiMode = 'edit'; renderRtiEditor(); }
function rtiOpen(id){
  const r = rtiCalcs.find(x => x.id === id); if (!r) return;
  const d = { ...rtiNewData(), ...(r.data || {}) }; d.existing = (d.existing || []).map(x => ({ ...x })); d.news = (d.news || []).map(x => ({ ...x }));
  rtiDraft = { id: r.id, title: r.title, kind: r.kind, memo: r.memo || '', d }; rtiMode = 'edit'; renderRtiEditor();
}
$('rti').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-r]');
  if (a){
    const k = a.dataset.r;
    if (k === 'new') return rtiNew();
    if (k === 'set') return rtiOpenSettings();
    if (k === 'back'){ rtiDraft = null; rtiMode = 'list'; return renderRti(); }
    if (k === 'save') return rtiSave(a);
    if (k === 'print') return rtiPrint();
    if (k === 'del') return rtiDelete();
    if (k === 'addex'){ rtiRead(); rtiDraft.d.existing.push({ p: 0, r: 0 }); return renderRtiEditor(); }
    if (k === 'addnew'){ rtiRead(); rtiDraft.d.news.push({ p: 0, r: 0 }); return renderRtiEditor(); }
    if (k === 'rmex'){ rtiRead(); rtiDraft.d.existing.splice(+a.dataset.i, 1); return renderRtiEditor(); }
    if (k === 'rmnew'){ rtiRead(); rtiDraft.d.news.splice(+a.dataset.i, 1); return renderRtiEditor(); }
  }
  const row = e.target.closest('[data-rid]'); if (row && rtiMode === 'list') rtiOpen(+row.dataset.rid);
});

// ---------- 편집 화면 ----------
const rtiIn = (f, v, money, extra = '') => `<input data-f="${f}" ${money ? 'inputmode="numeric"' : 'inputmode="decimal"'} value="${money ? (v ? rtiW(v) : '') : (v === 0 || v === '' ? '' : v)}" ${rtiCan() ? '' : 'disabled'} ${extra} />`;
function rtiLoanRows(arr, grp, ref){
  const dis = rtiCan() ? '' : 'disabled';
  return arr.map((x, i) => `<tr><td>${grp === 'ex' ? '기존대출' : '신규대출'} ${i + 1}</td>
    <td>${`<input data-g="${grp}" data-i="${i}" data-f="p" inputmode="numeric" value="${x.p ? rtiW(x.p) : ''}" ${dis} />`}</td>
    <td>${`<input class="rate" data-g="${grp}" data-i="${i}" data-f="r" inputmode="decimal" value="${x.r ? x.r : ''}" placeholder="${grp === 'ex' ? ref + ' 참고' : '%'}" title="${grp === 'ex' ? '실제 금리를 모르면 비워두세요 (참고금리 적용)' : ''}" ${dis} />`}</td>
    <td><select data-g="${grp}" data-i="${i}" data-f="t" ${dis}><option value="v" ${x.t === 'f' ? '' : 'selected'}>변동</option><option value="f" ${x.t === 'f' ? 'selected' : ''}>고정(3년↑)</option></select></td>
    <td class="calc" data-o="${grp}s${i}"></td><td class="calc" data-o="${grp}i${i}"></td>
    <td style="width:34px">${rtiCan() && arr.length > 1 ? `<button class="btn small" data-r="rm${grp === 'ex' ? 'ex' : 'new'}" data-i="${i}" title="삭제">✕</button>` : ''}</td></tr>`).join('');
}
function renderRtiEditor(){
  const el = $('rti'), D = rtiDraft, d = D.d, s = rtiS(), can = rtiCan();
  el.innerHTML = `<div class="rtibox" style="padding:14px 18px"><div class="dbline" style="gap:10px">
      <button class="btn small" data-r="back">← 목록</button>
      <input id="rtiTitle" placeholder="고객명" maxlength="100" value="${esc(D.title)}" style="flex:1;min-width:150px;font-weight:700" ${can ? '' : 'disabled'} />
      <div class="seg" id="rtiKindEd"><button data-k="비주택" class="${D.kind === '비주택' ? 'on' : ''}">비주택 임대업</button><button data-k="주택" class="${D.kind === '주택' ? 'on' : ''}">주택 임대업</button></div>
      <button class="btn small" data-r="print">🖨 인쇄</button>${can ? '<button class="btn small primary" data-r="save">💾 저장</button>' : ''}${can && D.id ? '<button class="btn small danger" data-r="del">삭제</button>' : ''}</div></div>
    ${rtiStaleMsg() ? `<div class="rtiwarn">${esc(rtiStaleMsg())}</div>` : ''}
    <div class="rtied"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div class="rtibox"><div class="rtisum"><div class="inc"><div class="k">연간 임대소득</div><div class="v" id="rtoInc"></div></div><div class="int"><div class="k">연간 이자비용</div><div class="v" id="rtoInt"></div></div><div><div class="k">RTI</div><div class="v" id="rtoRti"></div></div><div><div class="k">판정</div><div class="v" style="font-size:15px"><span class="rtiv" id="rtoV"></span></div></div></div>
        <div class="muted" style="font-size:12.5px;margin-top:8px" id="rtoNote"></div></div>
      <div class="rtibox"><h3>〈임대소득 계산〉</h3><div class="rtiscroll"><table class="rtitbl"><thead><tr><th>구분</th><th>금액</th><th>기준금리 / 비율</th><th>연간 임대소득</th></tr></thead><tbody>
        <tr><td>월세</td><td>${rtiIn('monthly', d.monthly, true)}</td><td class="muted">× 12개월</td><td class="calc" data-o="mInc"></td></tr>
        <tr><td>전세(보증금)</td><td>${rtiIn('jeonse', d.jeonse, true)}</td><td class="muted">× 기준금리</td><td class="calc" data-o="jInc"></td></tr>
        <tr class="est"><td>추정-월세</td><td>${rtiIn('estMonthly', d.estMonthly, true)}</td><td class="muted">× 12 × 추정비율</td><td class="calc" data-o="eM"></td></tr>
        <tr class="est"><td>추정-전세</td><td>${rtiIn('estJeonse', d.estJeonse, true)}</td><td class="muted">× 기준금리 × 추정비율</td><td class="calc" data-o="eJ"></td></tr></tbody>
        <tfoot><tr><td>합계</td><td></td><td></td><td data-o="income"></td></tr></tfoot></table></div>
        <div class="dbline" style="margin-top:12px"><label style="margin:0">기준금리(수신금리) <input data-f="baseRate" inputmode="decimal" value="${d.baseRate}" style="width:80px;text-align:right" ${can ? '' : 'disabled'} /> %</label>
          <label style="margin:0">추정비율 <input data-f="estRatio" inputmode="decimal" value="${d.estRatio}" style="width:70px;text-align:right" ${can ? '' : 'disabled'} /> %</label></div></div>
      <div class="rtibox"><h3>〈이자비용 계산〉</h3><div class="rtiscroll"><table class="rtitbl"><thead><tr><th>구분</th><th>원금</th><th>금리(%)</th><th>금리유형</th><th>Stress 포함 금리</th><th>연간이자비용</th><th></th></tr></thead><tbody>
        ${rtiLoanRows(d.existing, 'ex', d.refRate !== undefined ? d.refRate : s.ref_loan_rate)}${rtiLoanRows(d.news, 'nw', '')}</tbody>
        <tfoot><tr><td>합계</td><td data-o="pSum" class="calc"></td><td></td><td></td><td></td><td data-o="interest"></td><td></td></tr></tfoot></table></div>
        ${can ? '<div class="dbline" style="margin-top:10px"><button class="btn small" data-r="addex">＋ 기존대출 추가</button><button class="btn small" data-r="addnew">＋ 신규대출 추가</button></div>' : ''}
        <div class="dbline" style="margin-top:12px"><label style="margin:0">기존대출 Stress <input data-f="stressEx" inputmode="decimal" value="${d.stressEx}" style="width:64px;text-align:right" ${can ? '' : 'disabled'} /> %p</label>
          <label style="margin:0">신규대출 Stress <input data-f="stressNew" inputmode="decimal" value="${d.stressNew}" style="width:64px;text-align:right" ${can ? '' : 'disabled'} /> %p</label></div>
        <div class="muted" style="font-size:12px;margin-top:6px">연간이자비용 = 원금 × (금리 + Stress). Stress는 <b>변동금리</b>에만 가산하고 3년 이상 고정금리는 제외해요. 기존대출의 실제 금리를 모르면 금리를 비워두세요 → 참고금리(예금은행 대출금리·잔액기준 중소기업대출) ${rtiPctTxt(d.refRate !== undefined ? d.refRate : s.ref_loan_rate)} 적용</div></div>
      <div class="rtibox"><label class="chk" style="margin:0"><input type="checkbox" data-f="forced" ${d.forced ? 'checked' : ''} ${can ? '' : 'disabled'} /> 상속, 채권보전을 위한 경매참가 등 <b>불가피하게 채무를 인수</b>하게 되는 경우 (RTI 산정 예외)</label>
        <label style="margin-top:10px">메모</label><textarea id="rtiMemo" rows="2" maxlength="500" ${can ? '' : 'disabled'}>${esc(D.memo)}</textarea></div>
    </div>
    <div class="rtibox rtiinfo" id="rtiInfo"></div></div>`;
  $('rtiKindEd').onclick = (ev) => { const b = ev.target.closest('[data-k]'); if (!b || !can) return; rtiRead(); D.kind = b.dataset.k; renderRtiEditor(); };
  rtiRefresh();
}
function rtiRead(){   // 화면 입력값을 draft 에 반영
  const D = rtiDraft, d = D.d; if (!D) return;
  D.title = ($('rtiTitle') || {}).value || D.title; D.memo = ($('rtiMemo') || {}).value || '';
  document.querySelectorAll('#rti [data-f]').forEach(inp => {
    const f = inp.dataset.f, g = inp.dataset.g;
    if (g){ const row = (g === 'ex' ? d.existing : d.news)[+inp.dataset.i]; if (row) row[f] = f === 't' ? (inp.value === 'f' ? 'f' : 'v') : f === 'p' ? rtiNum(inp.value) : rtiPct(inp.value); return; }
    if (f === 'forced'){ d.forced = inp.checked; return; }
    d[f] = ['baseRate', 'estRatio', 'stressEx', 'stressNew'].includes(f) ? rtiPct(inp.value) : rtiNum(inp.value);
  });
}
function rtiRefresh(){
  rtiRead();
  const D = rtiDraft, d = D.d, c = rtiCompute(d, D.kind), s = rtiS(), set = (k, v) => document.querySelectorAll(`#rti [data-o="${k}"]`).forEach(x => { x.textContent = v; });
  set('mInc', rtiW(c.mInc)); set('jInc', rtiW(c.jInc)); set('eM', rtiW(c.eM)); set('eJ', rtiW(c.eJ)); set('income', rtiW(c.income)); set('interest', rtiW(c.interest));
  set('pSum', rtiW(c.ex.concat(c.nw).reduce((a, x) => a + x.p, 0)));
  const tag = (x) => `${rtiPctTxt(x.s)}${x.fixed ? ' (고정)' : ''}${x.refUsed ? ' (참고금리)' : ''}`;
  c.ex.forEach((x, i) => { set(`exs${i}`, tag(x)); set(`exi${i}`, rtiW(x.i)); }); c.nw.forEach((x, i) => { set(`nws${i}`, tag(x)); set(`nwi${i}`, rtiW(x.i)); });
  $('rtoInc').textContent = `${rtiW(c.income)}원`; $('rtoInt').textContent = `${rtiW(c.interest)}원`; $('rtoRti').textContent = c.rti === null ? '-' : c.rti.toFixed(2);
  $('rtoV').textContent = c.verdict; $('rtoV').className = `rtiv ${c.vcls}`;
  $('rtoNote').textContent = c.rti === null ? '' : `기준 ${D.kind} 임대업: 원칙 ${c.th[0].toFixed(2)}배 이상 · 여신위원회 승인 시 ${c.th[1].toFixed(2)}배 이상${c.small ? ' · 신규대출 합계가 소액 기준(' + rtiW(s.small_limit) + '원) 이하라 산정 예외 대상' : ''}`;
  $('rtiInfo').innerHTML = `<h3>적용 기준</h3>
    <div><b>RTI</b> = 연간 임대소득 ÷ 연간 이자비용<br><span class="muted">연간 이자비용 = 해당 부동산임대업대출 + 해당 임대물건에 대한 기존대출의 연간 이자비용(Stress 금리 적용)</span></div>
    <table><tr><th>구분</th><th>원칙</th><th>여신위원회 승인時</th></tr>
      <tr class="${D.kind === '주택' ? 'cur' : ''}"><th>주택 임대업</th><td>${s.th_house.toFixed(2)}배 이상</td><td>${s.th_house_ok.toFixed(2)}배 이상</td></tr>
      <tr class="${D.kind === '비주택' ? 'cur' : ''}"><th>비주택 임대업</th><td>${s.th_non_house.toFixed(2)}배 이상</td><td>${s.th_non_house_ok.toFixed(2)}배 이상</td></tr></table>
    <div class="muted" style="font-size:12px">※ 근린상가주택은 비주택임대업으로 계산</div>
    <div style="margin-top:10px"><b>산출근거</b><br>• 기준금리: 한국은행고시 예금은행 수신금리(신규취급액 기준) <b>${rtiPctTxt(s.base_rate)}</b> (${esc(s.base_month)} 기준)<br>• 기존대출 참고금리: 예금은행 대출금리(잔액기준, 중소기업대출) <b>${rtiPctTxt(s.ref_loan_rate)}</b> (${esc(s.ref_loan_month)} 기준)<br>• Stress(스트레스 금리): 변동금리 대출에 가산, 3년 이상 고정금리는 제외. 기존대출 +${Number(d.stressEx).toFixed(2)}%p, 신규대출 +${Number(d.stressNew).toFixed(2)}%p<br><span class="muted">최저 1%p — 최근 3년간 예금은행 중소기업대출 신규취급 월별 가중평균금리의 최고치에서 최근 월 금리를 뺀 값(1%p 미만이면 1%p)</span><br>• 기존대출 금리: 실제 금리, 모르면 참고금리(잔액기준 중소기업대출 가중평균금리) 적용</div>
    <div class="ex" style="margin-top:10px">* RTI 산정 예외 조건<br>1) 1억원 이하의 소액 대출<br>2) 상속, 채권보전을 위한 경매참가 등 불가피하게 채무를 인수하게 되는 경우</div>`;
}
$('rti').addEventListener('input', (e) => {
  if (!rtiDraft || rtiMode !== 'edit') return;
  const t = e.target; if (t.dataset.f && (t.dataset.f === 'p' || ['monthly', 'jeonse', 'estMonthly', 'estJeonse'].includes(t.dataset.f))) t.value = rtiComma(t.value);
  rtiRefresh();
});
$('rti').addEventListener('change', (e) => { if (rtiDraft && rtiMode === 'edit' && e.target.dataset.f) rtiRefresh(); });

// ---------- 저장 / 삭제 ----------
async function rtiSave(btn){
  rtiRead(); const D = rtiDraft; if (!rtiCan()) return;
  if (!D.title.trim()) return alert('고객명을 입력해주세요.');
  const c = rtiCompute(D.d, D.kind), row = { title: D.title.trim(), kind: D.kind, data: { ...D.d, vcls: c.vcls }, income: c.income, interest: c.interest, rti: c.rti, verdict: c.verdict, memo: D.memo.trim() || null, updated_at: new Date().toISOString() };
  btn.disabled = true;
  const r = D.id ? await sb.from('rti_calcs').update(row).eq('id', D.id) : await sb.from('rti_calcs').insert(row).select('id').single();
  btn.disabled = false; if (r.error) return alert(r.error.message);
  if (!D.id && r.data) D.id = r.data.id;
  toast('💾 저장했어요'); await loadRti(); renderRtiEditor();
}
async function rtiDelete(){
  const D = rtiDraft; if (!D || !D.id) return;
  if (!confirm(`"${D.title}" 계산을 삭제할까요?`)) return;
  const { error } = await sb.from('rti_calcs').delete().eq('id', D.id); if (error) return alert(error.message);
  rtiDraft = null; rtiMode = 'list'; toast('삭제했어요'); await loadRti(); renderRti();
}

// ---------- 기준값(관리자) ----------
function rtiOpenSettings(){
  if (!isAdmin()) return; const s = rtiS();
  const f = (id, label, v, w = 90) => `<div><label>${label}</label><input id="${id}" inputmode="decimal" value="${v}" style="width:${w}px" /></div>`;
  $('rtiSetPanel').innerHTML = `<div class="ph"><h2>⚙ RTI 기준값</h2><button class="x" data-s="close">✕</button></div>
    <div class="muted" style="font-size:13px;margin:4px 0 8px">수신금리·여신금리·Stress 금리는 한국은행 <b>최신 자료</b>로 기준 시점과 함께 입력해주세요. 새 계산의 기본값으로 쓰이고, 이미 저장한 계산은 저장 당시 값을 그대로 유지해요. 기준 시점이 3개월 넘게 지나면 계산 화면에 경고가 떠요.</div>
    <div class="row">${f('rsBase', '수신금리 (%) · 예금은행 수신금리', s.base_rate)}<div><label>기준 시점</label><input id="rsBaseM" value="${esc(s.base_month)}" maxlength="20" /></div></div>
    <div class="row">${f('rsRef', '여신금리 (%) · 예금은행 대출금리', s.ref_loan_rate)}<div><label>기준 시점</label><input id="rsRefM" value="${esc(s.ref_loan_month)}" maxlength="20" /></div></div>
    <div class="row" style="align-items:flex-end">${f('rsHi', '최근 3년 최고 금리 (%)', '')}${f('rsLo', '최근 월 금리 (%)', '')}<div><button class="btn small" type="button" data-s="calc">Stress 계산</button></div></div>
    <div class="muted" style="font-size:12px;margin:-2px 0 8px">예금은행 중소기업대출 신규취급 월별 가중평균금리의 3년 최고치와 최근 월 값을 넣으면 Stress = 최고치 − 최근 월 (1%p 미만이면 1%p)로 채워줘요.</div>
    <div class="row">${f('rsSEx', '기존대출 Stress (%p)', s.stress_existing)}${f('rsSNew', '신규대출 Stress (%p)', s.stress_new)}${f('rsEst', '추정비율 (%)', s.est_ratio)}</div>
    <div class="row">${f('rsNH', '비주택 원칙 (배)', s.th_non_house)}${f('rsNHo', '비주택 승인時 (배)', s.th_non_house_ok)}${f('rsH', '주택 원칙 (배)', s.th_house)}${f('rsHo', '주택 승인時 (배)', s.th_house_ok)}</div>
    <div><label>소액 대출 기준 (원 이하 산정 예외)</label><input id="rsSmall" inputmode="numeric" value="${rtiW(s.small_limit)}" /></div>
    <div class="acts" style="margin-top:14px"><button class="btn" data-s="close">취소</button><button class="btn primary" data-s="save">저장</button></div>`;
  $('rtiSetOv').style.display = 'block';
}
$('rtiSetPanel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-s]'); if (!b) return;
  if (b.dataset.s === 'close') return void ($('rtiSetOv').style.display = 'none');
  if (b.dataset.s === 'calc'){ const hi = rtiPct($('rsHi').value), lo = rtiPct($('rsLo').value); if (!hi || !lo) return alert('3년 최고 금리와 최근 월 금리를 입력해주세요.'); const st = Math.max(1, rtiR2(hi - lo)); $('rsSNew').value = st; $('rsSEx').value = st; return; }
  const g = (id) => rtiPct($(id).value);
  const row = { base_rate: g('rsBase'), base_month: $('rsBaseM').value.trim() || RTI_DEF.base_month, ref_loan_rate: g('rsRef'), ref_loan_month: $('rsRefM').value.trim() || RTI_DEF.ref_loan_month,
    stress_existing: g('rsSEx'), stress_new: g('rsSNew'), est_ratio: g('rsEst'), small_limit: rtiNum($('rsSmall').value), th_non_house: g('rsNH'), th_non_house_ok: g('rsNHo'), th_house: g('rsH'), th_house_ok: g('rsHo'), updated_by: me, updated_at: new Date().toISOString() };
  if (row.th_non_house_ok > row.th_non_house || row.th_house_ok > row.th_house) return alert('승인 시 기준은 원칙 기준보다 클 수 없어요.');
  b.disabled = true; const { error } = await sb.from('rti_settings').update(row).eq('id', 1); b.disabled = false;
  if (error) return alert(error.message);
  $('rtiSetOv').style.display = 'none'; toast('기준값을 저장했어요'); await loadRti();
});

// ---------- 인쇄 ----------
function rtiPrint(){
  rtiRead(); const D = rtiDraft, d = D.d, c = rtiCompute(d, D.kind), s = rtiS(), today = kstToday();
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const css = `@page{size:A4;margin:14mm 15mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;padding:0 1px;font-size:12px;line-height:1.45}
  .org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444}.title{margin-top:12px;border-top:5px solid #111;border-bottom:1px solid #111;padding:12px 0 9px;text-align:center}.title h1{font-size:23px;margin:0;letter-spacing:2px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  h2{font-size:13.5px;margin:14px 0 5px;padding-left:9px;border-left:5px solid #111}table.t{width:calc(100% - 1px);border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:5px 8px;vertical-align:middle}table.t th{background:#eee;font-size:11.5px}
  .r{text-align:right}.c{text-align:center}.nw{white-space:nowrap}.big td{font-size:15px;font-weight:800}.est td{background:#fff8e6}tfoot td{font-weight:800;background:#f3f3f3}tr.cur td,tr.cur th{background:#fff3c4;font-weight:800}tr{page-break-inside:avoid}
  .v{display:inline-block;border:1.5px solid #111;border-radius:99px;padding:3px 14px;font-weight:800}.foot{margin-top:10px;font-size:11px;color:#666}.ex{color:#5b2a86;font-weight:600;margin-top:8px}.note{font-size:11.5px;color:#444;margin-top:6px}`;
  const loan = (arr, name) => arr.map((x, i) => `<tr><td>${name} ${i + 1}</td><td class="r">${rtiW(x.p)}</td><td class="r">${rtiPctTxt(x.r)}${x.refUsed ? ' <small>(참고)</small>' : ''}</td><td class="c">${x.fixed ? '고정' : '변동'}</td><td class="r">${rtiPctTxt(x.s)}</td><td class="r">${rtiW(x.i)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>임대사업자 RTI 계산내역</title>${link}<style>${css}</style></head><body>
  <div class="org">${esc(org)}</div><div class="title"><h1>임대사업자 RTI 계산내역 (${esc(D.title || '')})</h1><div class="sub">작성일 ${esc(today)} · 작성자 ${esc(nameOf(me))}</div></div>
  <h2>계산 결과</h2><table class="t"><tr><th style="width:20%">구분</th><th>${esc(D.kind)} 임대업</th><th style="width:22%">판정</th></tr>
    <tr class="big"><td class="c">임대소득(연간)</td><td class="r">${rtiW(c.income)}원</td><td class="c" rowspan="3"><span class="v">${esc(c.verdict)}</span></td></tr>
    <tr class="big"><td class="c">이자비용(연간)</td><td class="r">${rtiW(c.interest)}원</td></tr><tr class="big"><td class="c">RTI</td><td class="r">${c.rti === null ? '-' : c.rti.toFixed(2)}</td></tr></table>
  <h2>임대소득 계산</h2><table class="t"><thead><tr><th style="width:20%">구분</th><th>금액</th><th style="width:22%">적용</th><th style="width:24%">연간 임대소득</th></tr></thead><tbody>
    <tr><td>월세</td><td class="r">${rtiW(d.monthly)}</td><td class="c">× 12개월</td><td class="r">${rtiW(c.mInc)}</td></tr>
    <tr><td>전세(보증금)</td><td class="r">${rtiW(d.jeonse)}</td><td class="c">× ${rtiPctTxt(d.baseRate)}</td><td class="r">${rtiW(c.jInc)}</td></tr>
    <tr class="est"><td>추정-월세</td><td class="r">${rtiW(d.estMonthly)}</td><td class="c">× 12 × ${rtiPctTxt(d.estRatio)}</td><td class="r">${rtiW(c.eM)}</td></tr>
    <tr class="est"><td>추정-전세</td><td class="r">${rtiW(d.estJeonse)}</td><td class="c">× ${rtiPctTxt(d.baseRate)} × ${rtiPctTxt(d.estRatio)}</td><td class="r">${rtiW(c.eJ)}</td></tr></tbody>
    <tfoot><tr><td>합계</td><td></td><td></td><td class="r">${rtiW(c.income)}</td></tr></tfoot></table>
  <h2>이자비용 계산</h2><table class="t"><thead><tr><th style="width:20%">구분</th><th>원금</th><th style="width:14%">금리</th><th style="width:10%">유형</th><th style="width:15%">Stress 포함</th><th style="width:20%">연간이자비용</th></tr></thead><tbody>${loan(c.ex, '기존대출')}${loan(c.nw, '신규대출')}</tbody>
    <tfoot><tr><td>합계</td><td class="r">${rtiW(c.ex.concat(c.nw).reduce((a, x) => a + x.p, 0))}</td><td></td><td></td><td></td><td class="r">${rtiW(c.interest)}</td></tr></tfoot></table>
  <div class="note">Stress: 변동금리에만 가산(3년 이상 고정금리 제외) — 기존대출 +${Number(d.stressEx).toFixed(2)}%p, 신규대출 +${Number(d.stressNew).toFixed(2)}%p · 연간이자비용 = 원금 × (금리 + Stress) · (참고) = 실제 금리 미입력으로 참고금리 ${rtiPctTxt(d.refRate !== undefined ? d.refRate : s.ref_loan_rate)} 적용</div>
  <h2>판정 기준</h2><table class="t"><tr><th>구분</th><th>원칙</th><th>여신위원회 승인時</th></tr>
    <tr class="${D.kind === '주택' ? 'cur' : ''}"><td class="c">주택 임대업</td><td class="c">${s.th_house.toFixed(2)}배 이상</td><td class="c">${s.th_house_ok.toFixed(2)}배 이상</td></tr>
    <tr class="${D.kind === '비주택' ? 'cur' : ''}"><td class="c">비주택 임대업</td><td class="c">${s.th_non_house.toFixed(2)}배 이상</td><td class="c">${s.th_non_house_ok.toFixed(2)}배 이상</td></tr></table>
  <div class="note">※ 근린상가주택은 비주택임대업으로 계산 · RTI = 연간 임대소득 ÷ 연간 이자비용(해당 부동산임대업대출 + 해당 임대물건에 대한 기존대출)</div>
  <h2>산출근거</h2><div class="note">• 기준금리: 한국은행고시 예금은행 수신금리(신규취급액 기준) ${rtiPctTxt(d.baseRate)} (${esc(s.base_month)} 기준)<br>• 기존대출 참고금리: 예금은행 대출금리(잔액기준, 중소기업대출) ${rtiPctTxt(s.ref_loan_rate)} (${esc(s.ref_loan_month)} 기준)</div>
  <div class="ex">* RTI 산정 예외 조건: 1) 1억원 이하의 소액 대출 &nbsp; 2) 상속, 채권보전을 위한 경매참가 등 불가피하게 채무를 인수하게 되는 경우${d.forced ? ' (※ 이 건은 불가피한 채무 인수로 표시됨)' : ''}</div>
  ${D.memo ? `<h2>메모</h2><div class="note" style="white-space:pre-wrap">${esc(D.memo)}</div>` : ''}</body></html>`;
  apPreview(html, '임대사업자 RTI 계산내역', `RTI계산_${D.title || ''}`);
}
