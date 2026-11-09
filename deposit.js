// 감정평가 > 임차보증금 차감계산 (대출가능금액 산정)
// 규정: 대출가능금액 = 총감정평가액(토지 포함) × 담보인정비율 − 선순위 설정금액 − 임차보증금 − 소액임차보증금 − 기타 우선채권
// 의존: index.html 의 $, esc, sb, me, meRow, isAdmin, nameOf, toast, kstToday, canWrite / appraisal.js 의 apPreview, AP_FONT
let depCalcs = [], depMode = 'list', depDraft = null, depQ = '';
// 소액임차보증금(최우선변제 보증금 중 일정액) 지역별 기본값 — 주택임대차보호법 시행령 제10조(2023.2.21. 개정 기준). 담보물권 취득 시점에 따라 달라질 수 있어 계산마다 직접 고칠 수 있다
const DEP_REGIONS = [
  { k: 'seoul', name: '서울특별시', amt: 55000000 },
  { k: 'over', name: '과밀억제권역(서울 제외)·세종·용인·화성·김포', amt: 48000000 },
  { k: 'metro', name: '광역시(과밀억제권역·군지역 제외)·안산·광주·파주·이천·평택', amt: 28000000 },
  { k: 'etc', name: '그 밖의 지역', amt: 25000000 }];
const depAmt = (k) => (DEP_REGIONS.find(r => r.k === k) || DEP_REGIONS[3]).amt;
const depCan = () => typeof canWrite === 'function' && canWrite('appraisal');
const depNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : 0; };
const depPct = (s) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const depW = (n) => Math.round(Number(n || 0)).toLocaleString('ko-KR');
const depComma = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; };
function depNewData(){ return { type: '공동주택', metro: false, region: 'etc', small: depAmt('etc'), appraisal: 0, ratio: 70, senior: 0, other: 0, rooms: 1, rented: 0, actual: 0, multi: 1 }; }
// 계산: 단계별 근거(steps)를 함께 돌려줘 화면·인쇄에서 그대로 보여준다
function depCompute(d){
  const A = Number(d.appraisal) || 0, s = Number(d.small) || 0, N = Math.max(0, Math.floor(d.rooms) || 0), R = Math.min(N, Math.max(0, Math.floor(d.rented) || 0)), U = N - R, D = Number(d.actual) || 0;
  const cap = A / 2, th = d.metro ? 300000000 : 250000000, house = d.type === '공동주택';
  const steps = [];
  // 제4항 소액임차보증금 차감기준: u = 미임대 방수
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
  return { A, s, N, R, U, D, cap, th, total, small, value, senior, other, raw, loanable: Math.max(0, raw), mode, steps };
}

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
    <div>${rows.map(r => `<div class="dprow" data-pid="${r.id}"><div><div class="nm">${esc(r.title)}</div><div class="sub">${esc((r.data && r.data.type) || '')}</div></div>
      <div class="mo">${depW(r.appraisal)}원</div><div class="mo">${depW(r.deduct)}원</div><div class="ln">${depW(r.loanable)}원</div>
      <div style="font-size:12.5px;color:var(--muted)">${esc(nameOf(r.created_by))}<br>${esc(String(r.updated_at).slice(0, 10))}</div></div>`).join('') || `<div class="blk-empty">${depCalcs.length ? '조건에 맞는 계산이 없어요.' : '저장된 계산이 없어요. “＋ 새 차감계산”으로 시작해요.'}</div>`}</div></div>`;
  $('depQ').oninput = (e) => { depQ = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; renderDep(); const q = $('depQ'); q.focus(); q.setSelectionRange(pos, pos); };
}
function depNew(){ if (!depCan()) return; depDraft = { id: null, title: '', memo: '', d: depNewData() }; depMode = 'edit'; renderDepEditor(); }
function depOpen(id){ const r = depCalcs.find(x => x.id === id); if (!r) return; depDraft = { id: r.id, title: r.title, memo: r.memo || '', d: { ...depNewData(), ...(r.data || {}) } }; depMode = 'edit'; renderDepEditor(); }
$('dep').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-p]');
  if (a){
    const k = a.dataset.p;
    if (k === 'new') return depNew();
    if (k === 'back'){ depDraft = null; depMode = 'list'; return renderDep(); }
    if (k === 'save') return depSave(a);
    if (k === 'print') return depPrint();
    if (k === 'del') return depDelete();
  }
  const row = e.target.closest('[data-pid]'); if (row && depMode === 'list') depOpen(+row.dataset.pid);
});

// ---------- 편집 ----------
function renderDepEditor(){
  const el = $('dep'), D = depDraft, d = D.d, can = depCan(), dis = can ? '' : 'disabled';
  const num = (f, v, extra = '') => `<input class="num" data-f="${f}" inputmode="numeric" value="${v ? depW(v) : ''}" ${dis} ${extra} />`;
  el.innerHTML = `<div class="dpbox" style="padding:14px 18px"><div class="dbline" style="gap:10px">
      <button class="btn small" data-p="back">← 목록</button>
      <input id="depTitle" placeholder="고객·물건명" maxlength="100" value="${esc(D.title)}" style="flex:1;min-width:150px;font-weight:700" ${dis} />
      <button class="btn small" data-p="print">🖨 인쇄</button>${can ? '<button class="btn small primary" data-p="save">💾 저장</button>' : ''}${can && D.id ? '<button class="btn small danger" data-p="del">삭제</button>' : ''}</div></div>
    <div class="dped"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
      <div class="dpbox"><h3>① 담보물</h3><div class="dpg">
        <div class="full"><label>담보물 유형</label><div class="checks"><label><input type="radio" name="depType" value="공동주택" ${d.type === '공동주택' ? 'checked' : ''} ${dis}/> 공동주택 <span class="muted">(아파트·연립·다세대·주거용 오피스텔)</span></label><label><input type="radio" name="depType" value="단독다가구" ${d.type === '단독다가구' ? 'checked' : ''} ${dis}/> 단독·다가구주택</label></div></div>
        <div class="full"><label>소재지 (소액임차보증금 지역 구분)</label><select data-f="region" ${dis}>${DEP_REGIONS.map(r => `<option value="${r.k}" ${d.region === r.k ? 'selected' : ''}>${esc(r.name)} — ${depW(r.amt / 1e4)}만원</option>`).join('')}</select></div>
        <div><label>지역별 소액임차보증금 (원) <span class="muted">직접 수정 가능</span></label>${num('small', d.small)}</div>
        <div><label>수도권 소재 여부 <span class="muted">(서울·인천·경기)</span></label><label class="chk" style="margin-top:8px"><input type="checkbox" data-f="metro" ${d.metro ? 'checked' : ''} ${dis}/> 수도권 (감정가 기준 3억원 · 해제 시 지방 2.5억원)</label></div>
        <div><label>총감정평가액 (토지 포함, 원)</label>${num('appraisal', d.appraisal)}</div>
        <div><label>담보인정비율 (%)</label><input class="num" data-f="ratio" inputmode="decimal" value="${d.ratio}" ${dis} /></div>
        <div><label>선순위 설정금액 (원)</label>${num('senior', d.senior)}<div class="dpnote">본조합 설정은 대출잔액, 한도대출은 한도금액</div></div>
        <div><label>기타 우선채권 (원)</label>${num('other', d.other)}<div class="dpnote">임금채권, 조세채권 등</div></div></div></div>
      <div class="dpbox"><h3>② 임대차 현황</h3><div class="dpg">
        <div><label>총 방수 (임대 가능한 방)</label><input class="num" data-f="rooms" inputmode="numeric" value="${d.rooms || ''}" ${dis} /></div>
        <div><label>임대된 방수</label><input class="num" data-f="rented" inputmode="numeric" value="${d.rented || ''}" ${dis} /></div>
        <div class="full"><label>실제 임차보증금 합계 (임대된 부분, 원)</label>${num('actual', d.actual)}</div>
        <div class="full" id="depMultiBox"><label>소액임차보증금 적용대상 방수 <span class="muted">(공동주택 기본 1개 · 복수 임차 가능성이 있다고 판단되면 2개 이상)</span></label><input class="num" data-f="multi" inputmode="numeric" value="${d.multi || 1}" ${dis} style="max-width:120px" /></div></div>
        <label style="margin-top:12px">메모</label><textarea id="depMemo" rows="2" maxlength="500" ${dis}>${esc(D.memo)}</textarea></div>
    </div>
    <div class="dpbox dpres"><h3>〈대출가능금액〉</h3><table id="depRes"></table><div class="dpwhy" id="depWhy"></div>
      <div class="dpnote">임차보증금·소액임차보증금은 근저당권 등 담보물권 취득 시점 기준으로 산정해요. 소액보증금 금액은 시점에 맞게 직접 고쳐 쓰세요.</div></div></div>`;
  depRefresh();
}
function depRead(){
  const D = depDraft; if (!D) return; const d = D.d;
  D.title = ($('depTitle') || {}).value || D.title; D.memo = ($('depMemo') || {}).value || '';
  const t = document.querySelector('#dep input[name=depType]:checked'); if (t) d.type = t.value;
  document.querySelectorAll('#dep [data-f]').forEach(inp => {
    const f = inp.dataset.f;
    if (f === 'metro') d.metro = inp.checked;
    else if (f === 'region') d.region = inp.value;
    else if (f === 'ratio') d.ratio = depPct(inp.value);
    else d[f] = depNum(inp.value);
  });
}
function depRefresh(){
  depRead(); const D = depDraft, d = D.d, c = depCompute(d);
  const mb = $('depMultiBox'); if (mb) mb.style.display = d.type === '공동주택' ? '' : 'none';
  const w = (n) => `${depW(n)}원`, row = (k, v, cls = '') => `<tr class="${cls}"><td class="k">${k}</td><td>${v}</td></tr>`;
  $('depRes').innerHTML = row(`총감정평가액 × 담보인정비율 (${d.ratio}%)`, w(c.value)) + row('(−) 선순위 설정금액', w(c.senior)) + row('(−) 임차보증금 (실제)', w(c.D)) + row('(−) 소액임차보증금', w(c.small)) + row('(−) 기타 우선채권', w(c.other))
    + row('대출가능금액', c.raw < 0 ? `${w(0)}` : w(c.loanable), `big ${c.raw < 0 ? 'bad' : ''}`) + (c.raw < 0 ? row(`산정액이 음수(${w(c.raw)}) — 대출 불가`, '', 'sub') : '') + row(`방수 ${c.N}개 (임대 ${c.R} / 미임대 ${c.U})`, '', 'sub');
  $('depWhy').textContent = `〈임차보증금·소액임차보증금 산출 근거〉\n${c.steps.join('\n')}`;
}
$('dep').addEventListener('input', (e) => {
  if (!depDraft || depMode !== 'edit') return; const t = e.target;
  if (t.dataset.f && ['small', 'appraisal', 'senior', 'other', 'actual'].includes(t.dataset.f)) t.value = depComma(t.value);
  if (t.dataset.f === 'region'){ return; }
  depRefresh();
});
$('dep').addEventListener('change', (e) => {
  if (!depDraft || depMode !== 'edit') return; const t = e.target;
  if (t.dataset.f === 'region'){ depRead(); depDraft.d.small = depAmt(t.value); const s = document.querySelector('#dep [data-f=small]'); if (s) s.value = depW(depDraft.d.small); }
  depRefresh();
});

// ---------- 저장 / 삭제 ----------
async function depSave(btn){
  depRead(); const D = depDraft; if (!depCan()) return;
  if (!D.title.trim()) return alert('고객·물건명을 입력해주세요.');
  const c = depCompute(D.d), row = { title: D.title.trim(), data: D.d, appraisal: Math.round(c.A), deduct: Math.round(c.total), loanable: Math.round(c.loanable), memo: D.memo.trim() || null, updated_at: new Date().toISOString() };
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
  depRead(); const D = depDraft, d = D.d, c = depCompute(d), today = kstToday();
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const css = `@page{size:A4;margin:14mm 15mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;padding:0 1px;font-size:12px;line-height:1.5}
  .org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444}.title{margin-top:12px;border-top:5px solid #111;border-bottom:1px solid #111;padding:12px 0 9px;text-align:center}.title h1{font-size:22px;margin:0;letter-spacing:2px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  h2{font-size:13.5px;margin:14px 0 5px;padding-left:9px;border-left:5px solid #111}table.t{width:calc(100% - 1px);border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:5px 8px;vertical-align:middle}table.t th{background:#eee}
  .r{text-align:right}.c{text-align:center}.big td{font-size:15px;font-weight:800;background:#f3f3f3}tr{page-break-inside:avoid}.why{border:1px solid #444;padding:8px 10px;white-space:pre-wrap;word-break:break-all;font-size:11.5px}.note{font-size:11px;color:#555;margin-top:6px}`;
  const tr = (k, v, cls = '') => `<tr class="${cls}"><td>${k}</td><td class="r">${v}</td></tr>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>임차보증금 차감계산</title>${link}<style>${css}</style></head><body>
  <div class="org">${esc(org)}</div><div class="title"><h1>임차보증금 차감계산 (${esc(D.title || '')})</h1><div class="sub">작성일 ${esc(today)} · 작성자 ${esc(nameOf(me))}</div></div>
  <h2>담보물 · 임대차 현황</h2><table class="t"><tr><th style="width:28%">담보물 유형</th><td>${esc(d.type === '공동주택' ? '공동주택(아파트·연립·다세대·주거용 오피스텔)' : '단독·다가구주택')}</td></tr>
    <tr><th>소액임차보증금(지역)</th><td>${esc((DEP_REGIONS.find(r => r.k === d.region) || {}).name || '')} — ${depW(d.small)}원 · ${d.metro ? '수도권' : '지방'}</td></tr>
    <tr><th>방수</th><td>총 ${c.N}개 (임대 ${c.R} / 미임대 ${c.U}) · 실제 임차보증금 합계 ${depW(c.D)}원</td></tr></table>
  <h2>대출가능금액 산정</h2><table class="t">${tr(`총감정평가액(토지 포함) ${depW(c.A)}원 × 담보인정비율 ${d.ratio}%`, depW(c.value) + '원')}${tr('(−) 선순위 설정금액', depW(c.senior) + '원')}${tr('(−) 임차보증금(실제)', depW(c.D) + '원')}${tr('(−) 소액임차보증금', depW(c.small) + '원')}${tr('(−) 기타 우선채권', depW(c.other) + '원')}${tr('대출가능금액', (c.raw < 0 ? '0' : depW(c.loanable)) + '원' + (c.raw < 0 ? ` (산정액 ${depW(c.raw)}원, 대출 불가)` : ''), 'big')}</table>
  <h2>임차보증금·소액임차보증금 산출 근거</h2><div class="why">${esc(c.steps.join('\n'))}</div>
  <div class="note">대출가능금액 = 총감정평가액(토지 포함) × 담보인정비율 − 선순위 설정금액 − 임차보증금 − 소액임차보증금 − 기타 우선채권 · 임차보증금과 소액임차보증금은 근저당권 등 담보물권 취득 시점 기준으로 산정 · 소액임차보증금은 감정가액의 1/2을 최고 금액으로 함</div>
  ${D.memo ? `<h2>메모</h2><div class="note" style="white-space:pre-wrap;font-size:12px;color:#111">${esc(D.memo)}</div>` : ''}</body></html>`;
  apPreview(html, '임차보증금 차감계산', `차감계산_${D.title || ''}`);
}
