// 감정평가 > 임차보증금 차감계산 (대출가능금액 산정)
// 규정: 대출가능금액 = 총감정평가액(토지 포함) × 담보인정비율 − 선순위 설정금액 − 임차보증금 − 소액임차보증금 − 기타 우선채권
// 의존: index.html 의 $, esc, sb, me, meRow, isAdmin, nameOf, toast, kstToday, canWrite / appraisal.js 의 apPreview, AP_FONT
let depCalcs = [], depMode = 'list', depDraft = null, depQ = '';
// 소액임차보증금(최우선변제 보증금 중 일정액) 지역별 기본값. 담보물권 취득 시점에 따라 달라지고 법령이 바뀔 수 있어 계산마다 직접 고칠 수 있다.
//  · 주택: 주택임대차보호법 시행령 제10조(2023.2.21. 개정 기준)  · 상가: 상가건물 임대차보호법 시행령 제7조 — 현행 수치는 법령 원문으로 꼭 확인할 것
const DEP_REGIONS = [
  { k: 'seoul', name: '서울특별시', amt: 55000000, com: 22000000 },
  { k: 'over', name: '과밀억제권역(서울 제외) 등', amt: 48000000, com: 19000000 },
  { k: 'metro', name: '광역시 등(과밀억제권역·군지역 제외)', amt: 28000000, com: 13000000 },
  { k: 'etc', name: '그 밖의 지역', amt: 25000000, com: 10000000 }];
const depReg = (k) => DEP_REGIONS.find(r => r.k === k) || DEP_REGIONS[3];
const depAmt = (k) => depReg(k).amt;
const DEP_MODES = { res: '주거용', com: '비주거용(상가)', mix: '주거·비주거 혼재' };
const depCan = () => typeof canWrite === 'function' && canWrite('appraisal');
const depNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : 0; };
const depPct = (s) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const depW = (n) => Math.round(Number(n || 0)).toLocaleString('ko-KR');
const depComma = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; };
function depNewPart(kind){ return { name: '', kind: kind || '주거', area: 0, bldgAmt: 0, ratio: 70, senior: 0, other: 0, resType: '공동주택', rooms: 1, rented: 0, actual: 0, multi: 1, shops: 1, shopsRented: 0, waive: 0 }; }
function depNewData(mode){
  const d = { mode: mode || 'res', type: '공동주택', metro: false, region: 'etc', small: depAmt('etc'), smallCom: depReg('etc').com, appraisal: 0, ratio: 70, senior: 0, other: 0, rooms: 1, rented: 0, actual: 0, multi: 1, shops: 1, shopsRented: 0, waive: 0,
    bldg: 0, land: 0, manual: false, parts: [] };
  d.parts = [{ ...depNewPart('상가'), name: '1층 상가', ratio: 60, shops: 1 }, { ...depNewPart('주거'), name: '2층 주거' }];
  return d;
}
// ── 주거용 (제4조 · 소액임차보증금 차감기준) ─────────────────────────────
// 단계별 근거(steps)를 함께 돌려줘 화면·인쇄에서 그대로 보여준다
function depCompute(d){
  const A = Number(d.appraisal) || 0, s = Number(d.small) || 0, N = Math.max(0, Math.floor(d.rooms) || 0), R = Math.min(N, Math.max(0, Math.floor(d.rented) || 0)), U = N - R, D = Number(d.actual) || 0;
  const cap = A / 2, th = d.metro ? 300000000 : 250000000, house = d.type === '공동주택';
  const steps = [];
  const f4 = (u, label) => {
    if (u <= 0) return { amt: 0, n: 0, txt: `${label}: 미임대 방수 0 → 차감 없음` };
    let n, rule;
    if (house){ n = Math.max(1, Math.floor(d.multi) || 1); rule = `공동주택 — 미임대 방수와 관계없이 적용대상 ${n}개`; }
    else if (A <= th){ n = u >= 4 ? 2 : 1; rule = `단독·다가구, 감정가 ${depW(th)}원 이하(${d.metro ? '수도권' : '지방'}) — 미임대 ${u}개(${u >= 4 ? '4개 이상 → 2개' : '3개 이하 → 1개'})`; }
    else { n = u; rule = `단독·다가구, 감정가 ${depW(th)}원 초과(${d.metro ? '수도권' : '지방'}) — min(미임대 ${u}개 × 소액보증금, 감정가 × 1/2)`; }
    const raw = n * s, amt = Math.min(raw, cap);
    return { amt, n, capped: raw > cap, txt: `${label}: ${rule} → ${n}개 × ${depW(s)} = ${depW(raw)}${raw > cap ? ` → 감정가 1/2(${depW(cap)}) 한도 적용 ${depW(amt)}` : ''}` };
  };
  let total, mode;
  const f4u = f4(U, '미임대 부분 소액임차보증금');
  if (D < R * s){
    const ga = D + f4u.amt, f4n = f4(N, '전체를 미임대로 본 소액임차보증금'), na = f4n.amt;
    total = Math.max(ga, na); mode = 'lt';
    steps.push(`실제 임차보증금 ${depW(D)} < 임대방수 ${R} × 소액보증금 ${depW(s)} = ${depW(R * s)} → 다음 중 큰 금액`);
    steps.push(`가. 실제 임차보증금 + 미임대 부분 소액 = ${depW(D)} + ${depW(f4u.amt)} = ${depW(ga)}`); steps.push(`   (${f4u.txt})`);
    steps.push(`나. ${f4n.txt} = ${depW(na)}`);
    steps.push(`→ ${ga >= na ? '가' : '나'} 채택: ${depW(total)}`);
  } else {
    total = D + f4u.amt; mode = 'ge';
    steps.push(`실제 임차보증금 ${depW(D)} ≥ 임대방수 ${R} × 소액보증금 ${depW(s)} = ${depW(R * s)} → 실제 임차보증금 + 미임대 부분 소액`);
    steps.push(`${depW(D)} + ${depW(f4u.amt)} = ${depW(total)}`); steps.push(`   (${f4u.txt})`);
  }
  const small = Math.max(0, total - D), value = Math.floor(A * (Number(d.ratio) || 0) / 100), senior = Number(d.senior) || 0, other = Number(d.other) || 0;
  const raw = value - senior - total - other;
  return { kind: '주거', A, s, N, R, U, D, cap, th, total, small, value, senior, other, raw, loanable: Math.max(0, raw), mode, steps, cnt: `방수 ${N}개 (임대 ${R} / 미임대 ${U})` };
}
// ── 비주거용(상가) (제5조 · 점포별배당가능소액임차보증금) ────────────────────
function depComCompute(d){
  const A = Number(d.appraisal) || 0, s = Number(d.smallCom) || 0, X = Math.max(0, Math.floor(d.shops) || 0), R = Math.min(X, Math.max(0, Math.floor(d.shopsRented) || 0)), U = X - R, D = Number(d.actual) || 0;
  const W = Math.min(U, Math.max(0, Math.floor(d.waive) || 0)), cap = A / 2, steps = [];
  const over = X * s > cap, per = X > 0 ? (over ? cap / X : s) : 0;
  steps.push(`② 점포별배당가능소액임차보증금: 예상가능총점포수 ${X} × 지역별소액 ${depW(s)} = ${depW(X * s)} ${over ? '>' : '≤'} 감정가 1/2 ${depW(cap)}`);
  steps.push(over ? `   → 감정가 × 1/2 ÷ 예상가능총점포수 = ${depW(cap)} ÷ ${X} = ${depW(per)}` : `   → 지역별소액임차보증금 ${depW(per)}`);
  let rentedPart = 0;
  if (R > 0){ const bySmall = per * R; rentedPart = Math.max(bySmall, D);
    steps.push(`③ 임대된 점포 ${R}개: 점포별소액 × 임대점포수 = ${depW(per)} × ${R} = ${depW(bySmall)} 과 실제 임차보증금 ${depW(D)} 중 큰 금액 → ${depW(rentedPart)}${D === 0 ? ' (보증금 없는 전액 월세 → 점포별소액 적용)' : ''}`); }
  else { rentedPart = D; steps.push(`③ 임대된 점포 없음${D ? ` (입력된 임차보증금 ${depW(D)} 반영)` : ''}`); }
  const unrentedPart = (U - W) * per;
  steps.push(`⑤ 미임대 점포 ${U}개${W ? ` 중 조합장 특인으로 제외 ${W}개` : ''}: ${U - W}개 × ${depW(per)} = ${depW(unrentedPart)}`);
  const value = Math.floor(A * (Number(d.ratio) || 0) / 100), senior = Number(d.senior) || 0, other = Number(d.other) || 0, total = rentedPart + unrentedPart;
  const raw = value - senior - rentedPart - unrentedPart - other;
  return { kind: '상가', A, s, X, R, U, D, W, per, cap, total, small: unrentedPart, dep: rentedPart, value, senior, other, raw, loanable: Math.max(0, raw), steps, cnt: `점포 ${X}개 (임대 ${R} / 미임대 ${U}${W ? ` · 특인 제외 ${W}` : ''})` };
}
// ── 혼재 (제6조 · 건물·토지 감정평가액을 용도별로 안분 → 용도별 대출가능금액 합산) ──────
function depMixCompute(d){
  const parts = d.parts || [], Ab = Number(d.bldg) || 0, Al = Number(d.land) || 0, areaSum = parts.reduce((a, p) => a + (Number(p.area) || 0), 0);
  const base = parts.map(p => { const sh = areaSum > 0 ? (Number(p.area) || 0) / areaSum : 0; const b = Number(p.bldgAmt) > 0 ? Number(p.bldgAmt) : Ab * sh, l = Al * sh; return { sh, b, l, A: b + l }; });
  const Asum = base.reduce((a, x) => a + x.A, 0), Sall = Number(d.senior) || 0, Oall = Number(d.other) || 0;
  const rows = parts.map((p, i) => {
    const bs = base[i], senior = d.manual ? (Number(p.senior) || 0) : (Asum > 0 ? Math.round(Sall * bs.A / Asum) : 0), other = d.manual ? (Number(p.other) || 0) : (Asum > 0 ? Math.round(Oall * bs.A / Asum) : 0);
    const common = { appraisal: bs.A, ratio: p.ratio, senior, other, actual: p.actual, metro: d.metro };
    const c = p.kind === '상가' ? depComCompute({ ...common, smallCom: d.smallCom, shops: p.shops, shopsRented: p.shopsRented, waive: p.waive }) : depCompute({ ...common, small: d.small, type: p.resType, rooms: p.rooms, rented: p.rented, multi: p.multi });
    return { ...c, name: p.name || `${p.kind} ${i + 1}`, share: bs.sh, bldg: bs.b, land: bs.l, dep: c.kind === '상가' ? c.dep : c.D };
  });
  const loanable = rows.reduce((a, r) => a + r.loanable, 0), raw = rows.reduce((a, r) => a + r.raw, 0);
  return { kind: '혼재', rows, A: Asum, Ab, Al, areaSum, loanable, raw, total: rows.reduce((a, r) => a + r.total, 0), mismatch: Math.abs((Ab + Al) - Asum) > 1 && parts.some(p => Number(p.bldgAmt) > 0) };
}
const depCalc = (d) => d.mode === 'com' ? depComCompute(d) : d.mode === 'mix' ? depMixCompute(d) : depCompute(d);

// ---------- 불러오기 ----------
async function loadDep(){
  if (!meRow) return;
  const c = await sb.from('deposit_calcs').select('*').order('updated_at', { ascending: false });
  if (c.error){ console.warn('차감계산 불러오기 실패', c.error.message); return; }
  depCalcs = c.data || [];
  if (typeof divn !== 'undefined' && divn === 'appraisal' && typeof apTab !== 'undefined' && apTab === 'dep' && depMode === 'list') renderDep();
}
let depTimer = null; const scheduleDep = () => { clearTimeout(depTimer); depTimer = setTimeout(() => { if (me) loadDep(); }, 400); };

(function(){
  const st = document.createElement('style'); st.textContent = `
  #dep{ display:none; flex-direction:column; gap:12px; min-width:0; }
  .dprow,.dphead{ display:grid; grid-template-columns:minmax(150px,1.3fr) 140px 150px 160px 110px; gap:10px; align-items:center; padding:0 22px; }
  .dphead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:10px; padding-bottom:8px; }
  .dprow{ padding-top:14px; padding-bottom:14px; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; cursor:pointer; font-size:13.5px; } .dprow:hover{ box-shadow:var(--sh-hover); }
  .dprow .nm{ font-size:16.5px; font-weight:700; letter-spacing:-.02em; word-break:break-all; } .dprow .sub{ font-size:12px; color:var(--muted); margin-top:2px; } .dprow .mo{ font-weight:700; text-align:right; } .dprow .ln{ font-size:17px; font-weight:800; text-align:right; }
  .dped{ display:grid; grid-template-columns:minmax(0,1fr) 380px; gap:14px; align-items:start; }
  .dpbox{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:18px 20px; min-width:0; } .dpbox h3{ margin:0 0 10px; font-size:15.5px; letter-spacing:-.02em; }
  .dpg{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px 14px; } .dpg label{ font-size:13px; } .dpg input,.dpg select{ width:100%; } .dpg .full{ grid-column:1 / 3; }
  .dpg input.num{ text-align:right; } .dpg input[type=radio],.dpg input[type=checkbox]{ width:auto; flex:none; } .dpg .checks{ flex-direction:column; align-items:flex-start; gap:8px; } .dpg .checks label,.dpg label.chk{ white-space:normal; line-height:1.5; }
  .dpres{ position:sticky; top:12px; } .dpres table{ width:100%; border-collapse:collapse; font-size:14px; } .dpres td{ padding:7px 4px; border-top:1px solid var(--line); } .dpres td:last-child{ text-align:right; font-weight:700; white-space:nowrap; } .dpres td.k{ color:#44546f; font-weight:600; }
  .dpres tr.sub td{ font-size:12.5px; color:var(--muted); } .dpres tr.big td{ font-size:19px; font-weight:800; border-top:2px solid #111; padding-top:11px; } .dpres tr.big.bad td:last-child{ color:var(--danger); }
  .dpwhy{ margin-top:12px; font-size:12.5px; line-height:1.65; color:#44546f; background:var(--field); border-radius:14px; padding:10px 12px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .dpnote{ font-size:12px; color:var(--muted); line-height:1.55; margin-top:6px; }
  .dppart{ border:1.5px solid var(--line); border-radius:16px; padding:12px 14px 14px; margin-bottom:10px; background:#fafbfd; } .dpphd{ display:flex; align-items:center; margin-bottom:6px; }
  .dpwarn{ margin-top:12px; font-size:12.5px; line-height:1.55; background:#fff3c4; color:#7a5200; border-radius:12px; padding:10px 12px; }
  .dpscroll{ overflow-x:auto; } .dped.mix{ grid-template-columns:1fr; } .dped.mix .dpres{ position:static; } .dped.mix .dpres table{ min-width:680px; }
  .dpres td.k{ white-space:normal; } .dpres tr.hd td{ font-size:11.5px; color:var(--muted); font-weight:700; } .dped.mix .dpres td{ font-size:13px; padding:7px 6px; } .dpres tr.bad td:last-child{ color:var(--danger); }
  @media (max-width:980px){ .dped{ grid-template-columns:1fr; } .dpres{ position:static; } }
  @media (max-width:760px){ .dphead{ display:none; } .dprow{ grid-template-columns:1fr auto; gap:6px 10px; padding:14px 16px; border-radius:20px; } .dprow > :nth-child(1){ grid-column:1 / 2; } .dprow > :nth-child(5){ grid-column:2 / 3; } .dprow > :nth-child(2),.dprow > :nth-child(3),.dprow > :nth-child(4){ grid-column:1 / 3; } .dprow .mo,.dprow .ln{ text-align:left; } .dpbox{ padding:14px 12px; } }`;
  document.head.appendChild(st);
})();

// ---------- 목록 ----------
function renderDep(){
  const el = $('dep'); if (!el) return;
  if (depMode === 'edit' && depDraft) return;
  depMode = 'list';
  const rows = depCalcs.filter(r => !depQ || String(r.title).toLowerCase().includes(depQ));
  el.innerHTML = `<div class="list-panel"><div class="toolbar"><input id="depQ" class="search" type="search" placeholder="🔍 고객·물건명 검색" value="${esc(depQ)}" />
      ${depCan() ? '<button class="btn small primary" data-p="new">＋ 새 차감계산</button>' : '<span class="pill ro">👀 보기 전용</span>'}</div>
    <div class="dphead"><span>고객 · 물건</span><span style="text-align:right">총감정평가액</span><span style="text-align:right">임차보증금 차감</span><span style="text-align:right">대출가능금액</span><span>작성</span></div>
    <div>${rows.map(r => `<div class="dprow" data-pid="${r.id}"><div><div class="nm">${esc(r.title)}</div><div class="sub">${esc(DEP_MODES[(r.data && r.data.mode) || 'res'])}</div></div>
      <div class="mo">${depW(r.appraisal)}원</div><div class="mo">${depW(r.deduct)}원</div><div class="ln">${depW(r.loanable)}원</div>
      <div style="font-size:12.5px;color:var(--muted)">${esc(nameOf(r.created_by))}<br>${esc(String(r.updated_at).slice(0, 10))}</div></div>`).join('') || `<div class="blk-empty">${depCalcs.length ? '조건에 맞는 계산이 없어요.' : '저장된 계산이 없어요. “＋ 새 차감계산”으로 시작해요.'}</div>`}</div></div>`;
  $('depQ').oninput = (e) => { depQ = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; renderDep(); const q = $('depQ'); q.focus(); q.setSelectionRange(pos, pos); };
}
function depNew(){ if (!depCan()) return; depDraft = { id: null, title: '', memo: '', d: depNewData('res') }; depMode = 'edit'; renderDepEditor(); }
function depOpen(id){
  const r = depCalcs.find(x => x.id === id); if (!r) return;
  const d = { ...depNewData((r.data && r.data.mode) || 'res'), ...(r.data || {}) }; d.parts = ((r.data && r.data.parts) || depNewData().parts).map(p => ({ ...depNewPart(p.kind), ...p }));
  depDraft = { id: r.id, title: r.title, memo: r.memo || '', d }; depMode = 'edit'; renderDepEditor();
}
$('dep').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-p]');
  if (a){
    const k = a.dataset.p;
    if (k === 'new') return depNew();
    if (k === 'back'){ depDraft = null; depMode = 'list'; return renderDep(); }
    if (k === 'save') return depSave(a);
    if (k === 'print') return depPrint();
    if (k === 'del') return depDelete();
    if (k === 'mode'){ if (!depCan()) return; depRead(); depDraft.d.mode = a.dataset.m; return renderDepEditor(); }
    if (k === 'addpart'){ depRead(); depDraft.d.parts.push(depNewPart('주거')); return renderDepEditor(); }
    if (k === 'rmpart'){ depRead(); depDraft.d.parts.splice(+a.dataset.i, 1); return renderDepEditor(); }
  }
  const row = e.target.closest('[data-pid]'); if (row && depMode === 'list') depOpen(+row.dataset.pid);
});

// ---------- 편집 ----------
const DEP_MONEY = ['small', 'smallCom', 'appraisal', 'senior', 'other', 'actual', 'bldg', 'land', 'bldgAmt'];
const DEP_INT = ['rooms', 'rented', 'multi', 'shops', 'shopsRented', 'waive'];
function depRegionSel(d, dis){ return `<select data-f="region" ${dis}>${DEP_REGIONS.map(r => `<option value="${r.k}" ${d.region === r.k ? 'selected' : ''}>${esc(r.name)} — 주택 ${depW(r.amt / 1e4)}만 · 상가 ${depW(r.com / 1e4)}만원</option>`).join('')}</select>`; }
function depPartCard(p, i, d, dis){
  const g = (f, v, cls = 'num', extra = '') => `<input class="${cls}" data-g="p" data-i="${i}" data-f="${f}" inputmode="${DEP_MONEY.includes(f) || DEP_INT.includes(f) ? 'numeric' : 'decimal'}" value="${DEP_MONEY.includes(f) ? (v ? depW(v) : '') : (v === 0 || v === '' ? '' : v)}" ${dis} ${extra} />`;
  const com = p.kind === '상가';
  return `<div class="dppart"><div class="dpphd"><b>용도 ${i + 1}</b><span style="flex:1"></span>${d.parts.length > 1 && !dis ? `<button class="btn small" data-p="rmpart" data-i="${i}">✕ 삭제</button>` : ''}</div>
    <div class="dpg">
      <div><label>층·용도명</label><input data-g="p" data-i="${i}" data-f="name" maxlength="30" placeholder="예: 1층 상가" value="${esc(p.name)}" ${dis} /></div>
      <div><label>구분</label><select data-g="p" data-i="${i}" data-f="kind" ${dis}><option ${p.kind === '주거' ? 'selected' : ''}>주거</option><option ${com ? 'selected' : ''}>상가</option></select></div>
      <div><label>면적 (㎡, 안분 기준)</label>${g('area', p.area)}</div>
      <div><label>담보인정비율 (%)</label>${g('ratio', p.ratio)}</div>
      <div class="full"><label>건물 감정평가액 직접 입력 (원) <span class="muted">층별 신축단가가 다르면 입력 · 비우면 면적비로 안분</span></label>${g('bldgAmt', p.bldgAmt)}</div>
      ${d.manual ? `<div><label>선순위 설정금액 (원)</label>${g('senior', p.senior)}</div><div><label>기타 우선채권 (원)</label>${g('other', p.other)}</div>` : ''}
      ${com ? `<div><label>예상가능 총점포수</label>${g('shops', p.shops)}</div><div><label>임대된 점포수</label>${g('shopsRented', p.shopsRented)}</div>
        <div><label>실제 임차보증금 합계 (원)</label>${g('actual', p.actual)}</div><div><label>특인 제외 미임대 점포수</label>${g('waive', p.waive)}</div>`
      : `<div class="full"><label>주거 유형</label><select data-g="p" data-i="${i}" data-f="resType" ${dis}><option value="공동주택" ${p.resType === '공동주택' ? 'selected' : ''}>공동주택(아파트·연립·다세대·주거용 오피스텔)</option><option value="단독다가구" ${p.resType === '단독다가구' ? 'selected' : ''}>단독·다가구주택</option></select></div>
        <div><label>총 방수</label>${g('rooms', p.rooms)}</div><div><label>임대된 방수</label>${g('rented', p.rented)}</div>
        <div><label>실제 임차보증금 합계 (원)</label>${g('actual', p.actual)}</div>${p.resType === '공동주택' ? `<div><label>소액 적용대상 방수</label>${g('multi', p.multi)}</div>` : ''}`}
    </div></div>`;
}
function renderDepEditor(){
  const el = $('dep'), D = depDraft, d = D.d, can = depCan(), dis = can ? '' : 'disabled', mode = d.mode || 'res';
  const num = (f, v, extra = '') => `<input class="num" data-f="${f}" inputmode="numeric" value="${v ? depW(v) : ''}" ${dis} ${extra} />`;
  const modeSeg = `<div class="seg" id="depModeSeg" style="align-self:flex-start">${Object.entries(DEP_MODES).map(([k, v]) => `<button data-p="mode" data-m="${k}" class="${mode === k ? 'on' : ''}">${k === 'res' ? '🏠' : k === 'com' ? '🏪' : '🏢'} ${v}</button>`).join('')}</div>`;
  const money = (id, label, hint) => `<div><label>${label}</label>${num(id, d[id])}${hint ? `<div class="dpnote">${hint}</div>` : ''}</div>`;
  let body = '';
  if (mode === 'res') body = `
      <div class="dpbox"><h3>① 담보물 <span class="muted" style="font-weight:500;font-size:12.5px">(제4조 주거용)</span></h3><div class="dpg">
        <div class="full"><label>담보물 유형</label><div class="checks"><label><input type="radio" name="depType" value="공동주택" ${d.type === '공동주택' ? 'checked' : ''} ${dis}/> 공동주택 <span class="muted">(아파트·연립·다세대·주거용 오피스텔)</span></label><label><input type="radio" name="depType" value="단독다가구" ${d.type === '단독다가구' ? 'checked' : ''} ${dis}/> 단독·다가구주택</label></div></div>
        <div class="full"><label>소재지 (소액임차보증금 지역 구분)</label>${depRegionSel(d, dis)}</div>
        <div><label>지역별 소액임차보증금 — 주택 (원) <span class="muted">직접 수정 가능</span></label>${num('small', d.small)}</div>
        <div><label>수도권 소재 여부 <span class="muted">(서울·인천·경기)</span></label><label class="chk" style="margin-top:8px"><input type="checkbox" data-f="metro" ${d.metro ? 'checked' : ''} ${dis}/> 수도권 (감정가 기준 3억원 · 해제 시 지방 2.5억원)</label></div>
        ${money('appraisal', '총감정평가액 (토지 포함, 원)')}<div><label>담보인정비율 (%)</label><input class="num" data-f="ratio" inputmode="decimal" value="${d.ratio}" ${dis} /></div>
        ${money('senior', '선순위 설정금액 (원)', '본조합 설정은 대출잔액, 한도대출은 한도금액')}${money('other', '기타 우선채권 (원)', '임금채권, 조세채권 등')}</div></div>
      <div class="dpbox"><h3>② 임대차 현황</h3><div class="dpg">
        <div><label>총 방수 (임대 가능한 방)</label><input class="num" data-f="rooms" inputmode="numeric" value="${d.rooms || ''}" ${dis} /></div>
        <div><label>임대된 방수</label><input class="num" data-f="rented" inputmode="numeric" value="${d.rented || ''}" ${dis} /></div>
        <div class="full"><label>실제 임차보증금 합계 (임대된 부분, 원)</label>${num('actual', d.actual)}</div>
        ${d.type === '공동주택' ? `<div class="full"><label>소액임차보증금 적용대상 방수 <span class="muted">(공동주택 기본 1개 · 복수 임차 가능성이 있다고 판단되면 2개 이상)</span></label><input class="num" data-f="multi" inputmode="numeric" value="${d.multi || 1}" ${dis} style="max-width:120px" /></div>` : ''}</div></div>`;
  else if (mode === 'com') body = `
      <div class="dpbox"><h3>① 담보물 <span class="muted" style="font-weight:500;font-size:12.5px">(제5조 비주거용 — 상가 등)</span></h3><div class="dpg">
        <div class="full"><label>소재지 (소액임차보증금 지역 구분)</label>${depRegionSel(d, dis)}</div>
        <div class="full"><label>지역별 소액임차보증금 — 상가 (원) <span class="muted">직접 수정 가능 · 상가건물 임대차보호법 시행령 기준</span></label>${num('smallCom', d.smallCom)}</div>
        ${money('appraisal', '총감정평가액 (토지 포함, 원)')}<div><label>담보인정비율 (%)</label><input class="num" data-f="ratio" inputmode="decimal" value="${d.ratio}" ${dis} /></div>
        ${money('senior', '선순위 설정금액 (원)', '본조합 설정은 대출잔액, 한도대출은 한도금액')}${money('other', '기타 우선채권 (원)', '임금채권, 조세채권 등')}</div></div>
      <div class="dpbox"><h3>② 점포 · 임대차 현황</h3><div class="dpg">
        <div><label>예상가능 총점포수</label><input class="num" data-f="shops" inputmode="numeric" value="${d.shops || ''}" ${dis} /><div class="dpnote">건물 구조를 감안해 통상 예상되는 점포수 — 감정 당시 점포를 작게 나눠 임대할 수도 있으므로 보수적으로 산정</div></div>
        <div><label>임대된 점포수</label><input class="num" data-f="shopsRented" inputmode="numeric" value="${d.shopsRented || ''}" ${dis} /></div>
        <div class="full"><label>실제 임차보증금 합계 (임대된 점포, 원)</label>${num('actual', d.actual)}<div class="dpnote">보증금 없이 전액 월세인 점포는 점포별 소액임차보증금이 자동 적용돼요</div></div>
        <div class="full"><label>조합장 특인으로 소액 차감에서 제외할 미임대 점포수 <span class="muted">(제5조 제6항 · 구조·넓이상 채권보전에 지장이 없다고 인정되는 때)</span></label><input class="num" data-f="waive" inputmode="numeric" value="${d.waive || ''}" ${dis} style="max-width:120px" />
          <div class="dpnote">공장·교회·유아원·숙박시설 등 임대가능성이 적은 건물로, 설정 현재 임대 없이 담보제공자가 직접 사용하고 선순위 임차인이 없으면 조합장 특인으로 일부 또는 전부를 차감하지 않을 수 있어요.</div></div></div>
        <div class="dpwarn">⚠ 임차보증금이 지역별 보호 범위(환산보증금 기준)를 넘더라도 「상가건물 임대차보호법」 시행(2015.5.13.) 이후의 임대차계약(갱신 포함)으로 대항요건(인도 + 사업자등록 신청)을 갖췄다면 <b>대항력</b>이 인정돼요(우선변제권은 불인정). 이 경우 실제 임차보증금 전액이 선순위로 적용되니 금액을 그대로 입력하세요. (2018.12.17. 개정)</div></div>`;
  else body = `
      <div class="dpbox"><h3>① 건물 전체 <span class="muted" style="font-weight:500;font-size:12.5px">(제6조 주거·비주거 혼재)</span></h3><div class="dpg">
        <div class="full"><label>소재지 (소액임차보증금 지역 구분)</label>${depRegionSel(d, dis)}</div>
        <div><label>소액임차보증금 — 주택 (원)</label>${num('small', d.small)}</div><div><label>소액임차보증금 — 상가 (원)</label>${num('smallCom', d.smallCom)}</div>
        <div class="full"><label class="chk"><input type="checkbox" data-f="metro" ${d.metro ? 'checked' : ''} ${dis}/> 수도권 소재 (단독·다가구 소액 기준 감정가 3억원 · 해제 시 지방 2.5억원)</label></div>
        ${money('bldg', '건물 감정평가액 합계 (원)')}${money('land', '토지 감정평가액 합계 (원)')}
        ${money('senior', d.manual ? '선순위 설정금액 (참고용 합계)' : '선순위 설정금액 합계 (원)', d.manual ? '아래 용도별로 직접 입력' : '감정평가액 비율로 용도별 안분')}${money('other', d.manual ? '기타 우선채권 (참고용 합계)' : '기타 우선채권 합계 (원)', d.manual ? '아래 용도별로 직접 입력' : '감정평가액 비율로 용도별 안분')}
        <div class="full"><label class="chk"><input type="checkbox" data-f="manual" ${d.manual ? 'checked' : ''} ${dis}/> 선순위 설정금액·기타 우선채권을 <b>용도별로 직접 입력</b>하기 <span class="muted">(체크 해제 시 감정평가액 비율로 자동 안분)</span></label></div></div></div>
      <div class="dpbox"><h3>② 용도별 구분 <span class="muted" style="font-weight:500;font-size:12.5px">건물·토지 감정평가액을 면적비로 안분 → 용도별로 계산 후 합산</span></h3>
        <div class="dpparts">${d.parts.map((p, i) => depPartCard(p, i, d, dis)).join('')}</div>${can ? '<div style="margin-top:10px"><button class="btn small" data-p="addpart">＋ 용도(층) 추가</button></div>' : ''}</div>`;
  el.innerHTML = `<div class="dpbox" style="padding:14px 18px"><div class="dbline" style="gap:10px">
      <button class="btn small" data-p="back">← 목록</button>
      <input id="depTitle" placeholder="고객·물건명" maxlength="100" value="${esc(D.title)}" style="flex:1;min-width:150px;font-weight:700" ${dis} />
      <button class="btn small" data-p="print">🖨 인쇄</button>${can ? '<button class="btn small primary" data-p="save">💾 저장</button>' : ''}${can && D.id ? '<button class="btn small danger" data-p="del">삭제</button>' : ''}</div></div>
    ${modeSeg}
    <div class="dped ${mode === 'mix' ? 'mix' : ''}"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${body}
      <div class="dpbox"><label style="margin-top:0">메모</label><textarea id="depMemo" rows="2" maxlength="500" ${dis}>${esc(D.memo)}</textarea></div></div>
    <div class="dpbox dpres"><h3>〈대출가능금액〉</h3><div class="dpscroll"><table id="depRes"></table></div><div class="dpwhy" id="depWhy"></div>
      <div class="dpnote">임차보증금·소액임차보증금은 근저당권 등 담보물권 취득 시점 기준으로 산정해요. 소액보증금 금액은 시점에 맞게 직접 고쳐 쓰세요.</div></div></div>`;
  depRefresh();
}
function depRead(){
  const D = depDraft; if (!D) return; const d = D.d;
  D.title = ($('depTitle') || {}).value || D.title; D.memo = ($('depMemo') || {}).value || '';
  const t = document.querySelector('#dep input[name=depType]:checked'); if (t) d.type = t.value;
  document.querySelectorAll('#dep [data-f]').forEach(inp => {
    const f = inp.dataset.f, tgt = inp.dataset.g === 'p' ? d.parts[+inp.dataset.i] : d; if (!tgt) return;
    if (f === 'metro' || f === 'manual') tgt[f] = inp.checked;
    else if (f === 'region' || f === 'kind' || f === 'resType' || f === 'name') tgt[f] = inp.value;
    else if (f === 'ratio' || f === 'area') tgt[f] = depPct(inp.value);
    else tgt[f] = depNum(inp.value);
  });
}
// 결과 표 (주거·상가 공통): 항목 행들
function depRowsOf(c, d){
  const w = (n) => `${depW(n)}원`, row = (k, v, cls = '') => ({ k, v, cls });
  const out = [row(`총감정평가액 × 담보인정비율 (${c.kind === '상가' ? d.ratio : d.ratio}%)`, w(c.value)), row('(−) 선순위 설정금액', w(c.senior))];
  if (c.kind === '상가'){ out.push(row('(−) 임대된 점포 임차보증금', w(c.dep))); out.push(row(`(−) 미임대 점포 소액 (${c.U - c.W}개 × ${depW(c.per)})`, w(c.small))); }
  else { out.push(row('(−) 임차보증금 (실제)', w(c.D))); out.push(row('(−) 소액임차보증금', w(c.small))); }
  out.push(row('(−) 기타 우선채권', w(c.other)));
  out.push(row('대출가능금액', c.raw < 0 ? w(0) : w(c.loanable), `big ${c.raw < 0 ? 'bad' : ''}`));
  if (c.raw < 0) out.push(row(`산정액이 음수(${w(c.raw)}) — 대출 불가`, '', 'sub'));
  out.push(row(c.cnt, '', 'sub'));
  return out;
}
function depRefresh(){
  depRead(); const D = depDraft, d = D.d, c = depCalc(d), w = (n) => `${depW(n)}원`;
  if (d.mode === 'mix'){
    const th = '<tr class="hd"><td class="k">용도</td><td>감정평가액</td><td>담보가치</td><td>선순위</td><td>임차보증금</td><td>소액(미임대)</td><td>기타</td><td>대출가능</td></tr>';
    $('depRes').innerHTML = th + c.rows.map(r => `<tr class="${r.raw < 0 ? 'bad' : ''}"><td class="k">${esc(r.name)}<div class="dpnote">${r.kind} · ${depW(r.share * 100)}%</div></td><td>${depW(r.A)}</td><td>${depW(r.value)}</td><td>${depW(r.senior)}</td><td>${depW(r.kind === '상가' ? r.dep : r.D)}</td><td>${depW(r.small)}</td><td>${depW(r.other)}</td><td>${r.raw < 0 ? '0 (불가)' : depW(r.loanable)}</td></tr>`).join('')
      + `<tr class="big"><td class="k">합계</td><td>${depW(c.A)}</td><td>${depW(c.rows.reduce((a, r) => a + r.value, 0))}</td><td>${depW(c.rows.reduce((a, r) => a + r.senior, 0))}</td><td>${depW(c.rows.reduce((a, r) => a + (r.kind === '상가' ? r.dep : r.D), 0))}</td><td>${depW(c.rows.reduce((a, r) => a + r.small, 0))}</td><td>${depW(c.rows.reduce((a, r) => a + r.other, 0))}</td><td>${depW(c.loanable)}원</td></tr>`;
    $('depWhy').textContent = (c.mismatch ? `※ 건물 직접 입력 금액을 반영한 감정평가액 합계(${depW(c.A)})가 입력한 건물+토지 합계(${depW(c.Ab + c.Al)})와 달라요.\n\n` : '') + (c.areaSum <= 0 ? '※ 용도별 면적을 입력해야 안분돼요.\n\n' : '') + c.rows.map(r => `■ ${r.name} (${r.kind}) — 감정평가액 ${depW(r.A)} (건물 ${depW(r.bldg)} + 토지 ${depW(r.land)})\n${r.steps.join('\n')}\n   → 대출가능 ${depW(r.value)} − ${depW(r.senior)} − ${depW(r.total)} − ${depW(r.other)} = ${depW(r.raw)}`).join('\n\n') + '\n\n※ 용도별 대출가능금액(음수는 0)을 합산해요.';
    return;
  }
  $('depRes').innerHTML = depRowsOf(c, d).map(r => `<tr class="${r.cls}"><td class="k">${r.k}</td><td>${r.v}</td></tr>`).join('');
  $('depWhy').textContent = `〈임차보증금·소액임차보증금 산출 근거〉\n${c.steps.join('\n')}`;
}
$('dep').addEventListener('input', (e) => {
  if (!depDraft || depMode !== 'edit') return; const t = e.target;
  if (t.dataset.f && DEP_MONEY.includes(t.dataset.f)) t.value = depComma(t.value);
  if (t.dataset.f === 'region') return;
  depRefresh();
});
$('dep').addEventListener('change', (e) => {
  if (!depDraft || depMode !== 'edit') return; const t = e.target, f = t.dataset.f;
  if (f === 'region'){ depRead(); const r = depReg(t.value); depDraft.d.small = r.amt; depDraft.d.smallCom = r.com; return renderDepEditor(); }
  if (t.name === 'depType' || f === 'kind' || f === 'resType' || f === 'manual'){ depRead(); return renderDepEditor(); }
  depRefresh();
});

// ---------- 저장 / 삭제 ----------
async function depSave(btn){
  depRead(); const D = depDraft; if (!depCan()) return;
  if (!D.title.trim()) return alert('고객·물건명을 입력해주세요.');
  const c = depCalc(D.d), row = { title: D.title.trim(), data: D.d, appraisal: Math.round(c.A), deduct: Math.round(c.total), loanable: Math.round(c.loanable), memo: D.memo.trim() || null, updated_at: new Date().toISOString() };
  btn.disabled = true;
  const r = D.id ? await sb.from('deposit_calcs').update(row).eq('id', D.id) : await sb.from('deposit_calcs').insert(row).select('id').single();
  btn.disabled = false; if (r.error) return alert(r.error.message);
  if (!D.id && r.data) D.id = r.data.id;
  toast('💾 저장했어요'); await loadDep(); renderDepEditor();
}
async function depDelete(){
  const D = depDraft; if (!D || !D.id) return;
  if (!confirm(`"${D.title}" 계산을 삭제할까요?`)) return;
  const { error } = await sb.from('deposit_calcs').delete().eq('id', D.id); if (error) return alert(error.message);
  depDraft = null; depMode = 'list'; toast('삭제했어요'); await loadDep(); renderDep();
}

// ---------- 인쇄 ----------
function depPrint(){
  depRead(); const D = depDraft, d = D.d, c = depCalc(d), today = kstToday(), mode = d.mode || 'res';
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const css = `@page{size:A4;margin:14mm 15mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;padding:0 1px;font-size:12px;line-height:1.5}
  .org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444}.title{margin-top:12px;border-top:5px solid #111;border-bottom:1px solid #111;padding:12px 0 9px;text-align:center}.title h1{font-size:22px;margin:0;letter-spacing:2px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  h2{font-size:13.5px;margin:14px 0 5px;padding-left:9px;border-left:5px solid #111}table.t{width:calc(100% - 1px);border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:5px 8px;vertical-align:middle}table.t th{background:#eee}
  .r{text-align:right}.c{text-align:center}.big td{font-size:14px;font-weight:800;background:#f3f3f3}tr{page-break-inside:avoid}.why{border:1px solid #444;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11.5px}.note{font-size:11px;color:#555;margin-top:6px}table.m td,table.m th{font-size:11px;padding:4px 5px}`;
  const tr = (k, v, cls = '') => `<tr class="${cls}"><td>${k}</td><td class="r">${v}</td></tr>`;
  const reg = `${esc(depReg(d.region).name)} — 소액임차보증금 ${mode !== 'com' ? `주택 ${depW(d.small)}원` : ''}${mode === 'mix' ? ' · ' : ''}${mode !== 'res' ? `상가 ${depW(d.smallCom)}원` : ''}`;
  let main = '', why = '';
  if (mode === 'mix'){
    main = `<table class="t m"><thead><tr><th>용도</th><th>구분</th><th>안분</th><th>감정평가액</th><th>담보인정비율</th><th>담보가치</th><th>선순위</th><th>임차보증금</th><th>소액(미임대)</th><th>기타</th><th>대출가능</th></tr></thead><tbody>${c.rows.map((r, i) => `<tr><td>${esc(r.name)}</td><td class="c">${r.kind}</td><td class="r">${depW(r.share * 100)}%</td><td class="r">${depW(r.A)}</td><td class="c">${esc(String(d.parts[i].ratio))}%</td><td class="r">${depW(r.value)}</td><td class="r">${depW(r.senior)}</td><td class="r">${depW(r.kind === '상가' ? r.dep : r.D)}</td><td class="r">${depW(r.small)}</td><td class="r">${depW(r.other)}</td><td class="r">${r.raw < 0 ? '0' : depW(r.loanable)}</td></tr>`).join('')}
      <tr class="big"><td colspan="3">합계</td><td class="r">${depW(c.A)}</td><td></td><td class="r">${depW(c.rows.reduce((a, r) => a + r.value, 0))}</td><td class="r">${depW(c.rows.reduce((a, r) => a + r.senior, 0))}</td><td class="r">${depW(c.rows.reduce((a, r) => a + (r.kind === '상가' ? r.dep : r.D), 0))}</td><td class="r">${depW(c.rows.reduce((a, r) => a + r.small, 0))}</td><td class="r">${depW(c.rows.reduce((a, r) => a + r.other, 0))}</td><td class="r">${depW(c.loanable)}</td></tr></tbody></table>
      <div class="note">건물 감정평가액 ${depW(c.Ab)}원 + 토지 감정평가액 ${depW(c.Al)}원을 용도별 면적비로 안분하여 용도별로 대출가능금액을 산정한 뒤 합산 (음수는 0). 선순위 설정금액·기타 우선채권은 ${d.manual ? '용도별로 직접 입력' : '감정평가액 비율로 안분'}.</div>`;
    why = c.rows.map(r => `■ ${r.name} (${r.kind}) — 감정평가액 ${depW(r.A)} (건물 ${depW(r.bldg)} + 토지 ${depW(r.land)})\n${r.steps.join('\n')}\n   → ${depW(r.value)} − ${depW(r.senior)} − ${depW(r.total)} − ${depW(r.other)} = ${depW(r.raw)}`).join('\n\n');
  } else {
    main = `<table class="t">${depRowsOf(c, d).filter(r => r.v !== '').map(r => tr(r.k, r.v, r.cls.startsWith('big') ? 'big' : '')).join('')}</table>`;
    why = c.steps.join('\n');
  }
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>임차보증금 차감계산</title>${link}<style>${css}</style></head><body>
  <div class="org">${esc(org)}</div><div class="title"><h1>임차보증금 차감계산 (${esc(D.title || '')})</h1><div class="sub">${esc(DEP_MODES[mode])} · 작성일 ${esc(today)} · 작성자 ${esc(nameOf(me))}</div></div>
  <h2>기본 사항</h2><table class="t"><tr><th style="width:26%">소재지·소액보증금</th><td>${reg}</td></tr>
    ${mode === 'res' ? `<tr><th>담보물 유형</th><td>${esc(d.type === '공동주택' ? '공동주택(아파트·연립·다세대·주거용 오피스텔)' : '단독·다가구주택')} · ${d.metro ? '수도권' : '지방'}</td></tr><tr><th>임대 현황</th><td>${esc(c.cnt)} · 실제 임차보증금 합계 ${depW(c.D)}원</td></tr>` : mode === 'com' ? `<tr><th>임대 현황</th><td>${esc(c.cnt)} · 실제 임차보증금 합계 ${depW(c.D)}원</td></tr>` : `<tr><th>건물 구성</th><td>${esc(d.parts.map(p => `${p.name || p.kind}(${p.kind})`).join(' / '))}</td></tr>`}</table>
  <h2>대출가능금액 산정</h2>${main}
  <h2>임차보증금·소액임차보증금 산출 근거</h2><div class="why">${esc(why)}</div>
  <div class="note">${mode === 'com' ? '비주거용: 대출가능금액 = 총감정평가액(토지 포함) × 담보인정비율 − 선순위 설정금액 − 임차보증금 − (미임대점포 × 점포별배당가능소액임차보증금) − 기타 우선채권' : '대출가능금액 = 총감정평가액(토지 포함) × 담보인정비율 − 선순위 설정금액 − 임차보증금 − 소액임차보증금 − 기타 우선채권'} · 임차보증금과 소액임차보증금은 근저당권 등 담보물권 취득 시점 기준으로 산정 · 소액임차보증금은 감정가액의 1/2을 최고 금액으로 함</div>
  ${D.memo ? `<h2>메모</h2><div class="note" style="white-space:pre-wrap;font-size:12px;color:#111">${esc(D.memo)}</div>` : ''}</body></html>`;
  apPreview(html, '임차보증금 차감계산', `임차보증금차감계산_${D.title || ''}`);
}
