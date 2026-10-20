// 감정평가 관리 — index.html 의 전역(sb, $, esc, me, meRow, members, nameOf, kstToday, toast, divn …)을 함께 쓴다.
// 상태 구분 없이: 의뢰 등록 → 담당자가 평가기관별 가격을 받아 입력 → (선택) 채택

const VWORLD_KEY = '77A8D989-2D72-4900-A553-C5CF92742E9C';   // 브이월드 인증키 (NFCF_CRM 과 동일, 도메인 등록 필요)
const AP_KINDS = {
  '토지':   { area: '토지면적 (㎡)', detail: '비고' },
  '건물':   { area: '연면적 (㎡)',   detail: '건물명 · 비고' },
  '집합건물': { area: '전용면적 (㎡)', detail: '동 · 호수' },
};
const AP_JIMOK = ['대', '전', '답', '임야', '잡종지', '공장용지', '도로', '구거', '하천', '과수원', '목장용지', '학교용지', '주차장', '주유소용지', '창고용지', '체육용지', '종교용지', '철도용지', '제방', '유지', '수도용지', '공원', '묘지', '양어장', '염전', '광천지', '사적지', '유원지'];
const AP_JIMOK_ABBR = { '대': '대', '전': '전', '답': '답', '임': '임야', '잡': '잡종지', '공': '공장용지', '도': '도로', '구': '구거', '천': '하천', '과': '과수원', '목': '목장용지', '학': '학교용지', '차': '주차장', '주': '주유소용지', '창': '창고용지', '체': '체육용지', '종': '종교용지', '철': '철도용지', '제': '제방', '수': '수도용지', '원': '공원', '묘': '묘지' };

let apCases = [], apFirms = [], apOpenId = null, apFormId = null, apTimer = null;
let apQ = '', apMine = false, apScope = 'all';

const apCan = () => !!(meRow && (meRow.is_admin || meRow.perm_appraisal));

// ---------- 금액 ----------
const apWon = (n) => {
  if (n === null || n === undefined || n === '') return '-';
  n = Number(n); if (!n) return '0원';
  const e = Math.floor(n / 1e8), m = Math.floor(n % 1e8 / 1e4), r = n % 1e4;
  return [e && `${e}억`, m && `${m.toLocaleString('ko-KR')}만`, r && `${r.toLocaleString('ko-KR')}`].filter(Boolean).join(' ') + '원';
};
const apNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const apComma = (s) => { const n = apNum(s); return n === null ? '' : n.toLocaleString('ko-KR'); };

// ---------- 스타일 ----------
(function(){
  const st = document.createElement('style');
  st.textContent = `
  #app[data-div=appraisal]{ background:linear-gradient(135deg,#b45309 0%,#be185d 55%,#6d28d9 100%); }
  #appraisal{ display:none; flex-direction:column; gap:14px; min-width:0; }
  .aphead,.aprow{ display:grid; grid-template-columns:minmax(170px,1.1fr) minmax(200px,1.5fr) minmax(170px,1.3fr) 190px 86px; gap:12px; align-items:center; padding:0 18px; }
  .aphead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:9px; padding-bottom:9px; border-bottom:1px solid var(--line); background:#fafbfc; }
  .aprow{ padding-top:12px; padding-bottom:12px; border-bottom:1px solid var(--line); cursor:pointer; background:#fff; }
  .aprow:hover{ background:#f7f8fa; }
  .aprow .tt{ font-size:15.5px; font-weight:700; line-height:1.35; word-break:break-word; }
  .aprow .ts{ font-size:12.5px; color:var(--muted); margin-top:2px; }
  .afc{ display:inline-flex; align-items:center; gap:3px; font-size:12.5px; font-weight:700; padding:3px 9px; border-radius:6px; margin:2px 4px 2px 0; background:#fff3d6; color:#7a4b00; white-space:nowrap; }
  .afc.ok{ background:var(--green-soft); color:var(--green); }
  .apmoney{ font-size:14px; font-weight:700; line-height:1.4; }
  .apmoney small{ display:block; font-size:12px; font-weight:500; color:var(--muted); }
  .chip.sc-본점{ background:#dbeafe; color:#1e40af; } .chip.sc-지점{ background:#dcfce7; color:#166534; } .chip.sc-통합{ background:#ede9fe; color:#5b21b6; }
  .apPanel{ max-width:1040px !important; }
  .apsec{ margin-top:22px; } .apsec > .k{ font-size:13px; font-weight:800; color:#44546f; margin-bottom:8px; }
  .apinfo{ margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px 18px; }
  .apinfo .k{ font-size:12px; color:var(--muted); font-weight:600; } .apinfo .v{ font-size:15px; font-weight:600; margin-top:2px; word-break:break-word; }
  table.apt{ width:100%; border-collapse:collapse; font-size:14px; }
  table.apt th{ text-align:left; font-size:12.5px; color:#44546f; font-weight:700; background:#fafbfc; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:bottom; }
  table.apt td{ padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  .apm{ overflow-x:auto; } .apm table{ min-width:560px; }
  .apm th.f{ min-width:170px; } .apm td.c{ min-width:170px; }
  .apm input.amt{ width:100%; text-align:right; font-weight:700; }
  .apm .hint{ font-size:12px; color:var(--muted); text-align:right; margin-top:2px; min-height:16px; }
  .apm tr.tot td{ background:#f4f5f7; font-weight:800; font-size:15px; text-align:right; }
  .apm tr.tot td:first-child{ text-align:left; }
  .apm th.f.chosen, .apm td.chosen{ background:#eefbf3; }
  .apm .fh{ display:flex; align-items:center; gap:6px; font-size:15px; color:var(--ink); }
  .apm .fh label{ display:inline-flex; align-items:center; gap:4px; margin:0; font-size:12.5px; font-weight:700; color:var(--green); }
  .apm .fh input[type=radio]{ width:16px; height:16px; min-height:0; -webkit-appearance:auto; appearance:auto; }
  .apm input[type=date]{ font-size:13px; padding:5px 8px; min-height:34px; margin-top:6px; }
  .apblock{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#fbfbfc; }
  .apblock .bh{ display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:14px; margin-bottom:6px; }
  .apblock .grid{ display:grid; grid-template-columns:130px 1fr; gap:0 10px; }
  .apblock .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:0 10px; }
  .apres{ border:1px solid var(--line); border-radius:8px; background:#fff; max-height:240px; overflow:auto; margin-top:6px; display:none; }
  .apres .it{ padding:9px 12px; cursor:pointer; border-bottom:1px solid var(--line); font-size:14px; } .apres .it:hover{ background:var(--accent-soft); }
  .apres .it small{ display:block; color:var(--muted); font-size:12px; }
  .apst{ font-size:12.5px; margin-top:4px; color:var(--muted); } .apst.ok{ color:var(--green); } .apst.bad{ color:var(--danger); }
  .apaddr{ background:#f1f2f4 !important; font-weight:600; }
  #apFirmList,#apNotifyList{ display:flex; flex-wrap:wrap; gap:4px 16px; }
  @media (max-width:900px){
    .aphead{ display:none; }
    .aprow{ grid-template-columns:minmax(0,1fr) auto; gap:6px 10px; padding:12px 14px; }
    .aprow > :nth-child(2),.aprow > :nth-child(3){ grid-column:1 / -1; }
    .apblock .grid{ grid-template-columns:1fr; } .apblock .grid3{ grid-template-columns:1fr; }
  }`;
  document.head.appendChild(st);
})();

// ---------- 오버레이(상세 / 등록·수정) ----------
(function(){
  const d = document.createElement('div');
  d.innerHTML = `
  <div class="ov" id="apDetailOv"><div class="panel apPanel" id="apDetailPanel"></div></div>
  <div class="ov" id="apFormOv"><div class="panel apPanel" id="apFormPanel"></div></div>`;
  document.body.appendChild(d);
  $('apDetailOv').addEventListener('click', (e) => { if (e.target === $('apDetailOv')) apCloseDetail(); });
  $('apFormOv').addEventListener('click', (e) => { if (e.target === $('apFormOv')) apCloseForm(); });
})();

// ---------- 데이터 ----------
const apProps = (c) => [...(c.appraisal_properties || [])].sort((a, b) => a.seq - b.seq);
const apFirmName = (id) => (apFirms.find(f => f.id === id) || {}).name || '?';
const apReqs = (c) => [...(c.appraisal_requests || [])].sort((a, b) => ((apFirms.find(f => f.id === a.firm_id) || {}).sort || 0) - ((apFirms.find(f => f.id === b.firm_id) || {}).sort || 0));
function apReqSum(r, props){
  const m = new Map((r.appraisal_prices || []).map(p => [p.property_id, Number(p.amount)]));
  const have = props.filter(p => m.has(p.id));
  return { total: props.reduce((s, p) => s + (m.get(p.id) || 0), 0), filled: have.length, done: props.length > 0 && have.length === props.length, map: m };
}

async function loadAppraisal(){
  const [c, f] = await Promise.all([
    sb.from('appraisal_cases').select('*, appraisal_properties(*), appraisal_requests(*, appraisal_prices(*))').order('id', { ascending: false }),
    sb.from('appraisal_firms').select('*').order('sort'),
  ]);
  if (c.error || f.error){ console.warn('감정평가 불러오기 실패', c.error || f.error); return; }
  apCases = c.data || []; apFirms = f.data || [];
  apBadge();
  if (divn === 'appraisal') renderAppraisal();
  if (apOpenId && !(document.activeElement && $('apDetailOv').contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName))) renderApDetail();
  if (typeof apRenderFirms === 'function' && $('aFirms')) apRenderFirms();
}
function scheduleAp(){ clearTimeout(apTimer); apTimer = setTimeout(() => { if (me) loadAppraisal(); }, 400); }
function apBadge(){
  const n = apCases.filter(c => apReqs(c).some(r => !apReqSum(r, apProps(c)).done)).length;
  const el = $('nAppraisal'); if (!el) return;
  el.textContent = n || ''; el.style.display = n ? '' : 'none';
}

// ---------- 목록 ----------
function renderAppraisal(){
  const el = $('appraisal');
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.innerHTML = `<div class="list-panel">
      <div class="toolbar">
        <select id="apScope"><option value="all">본점·지점</option><option value="본점">본점</option><option value="지점">지점</option></select>
        <label class="chk"><input type="checkbox" id="apMine" /> 내 의뢰만</label>
        <input id="apQ" class="search" type="search" placeholder="🔍 채무자·소재지 검색" />
      </div>
      <div class="aphead"><span>채무자</span><span>물건</span><span>평가기관 (✓ 가격 입력 완료)</span><span>금액</span><span>의뢰일</span></div>
      <div id="apList"></div></div>`;
    $('apScope').onchange = () => { apScope = $('apScope').value; renderAppraisal(); };
    $('apMine').onchange = () => { apMine = $('apMine').checked; renderAppraisal(); };
    $('apQ').oninput = () => { apQ = $('apQ').value.trim().toLowerCase(); renderAppraisal(); };
    $('apList').addEventListener('click', (e) => { const r = e.target.closest('[data-ap]'); if (r) apOpenDetail(+r.dataset.ap); });
  }
  const shown = apCases.filter(c => (apScope === 'all' || c.scope === apScope)
    && (!apMine || c.requester_email === me)
    && (!apQ || [c.debtor_name, c.memo, ...apProps(c).map(p => p.address)].some(v => (v || '').toLowerCase().includes(apQ))));
  $('apList').innerHTML = shown.map(apRowHtml).join('') || `<div class="blk-empty">${apCases.length ? '조건에 맞는 의뢰가 없어요.' : '등록된 감정평가 의뢰가 없어요.'}</div>`;
}
function apRowHtml(c){
  const props = apProps(c), reqs = apReqs(c);
  const chosen = reqs.find(r => r.firm_id === c.chosen_firm_id);
  let money = '<span class="muted">-</span>';
  if (chosen && apReqSum(chosen, props).filled){ money = `<div class="apmoney">${apWon(apReqSum(chosen, props).total)}<small>채택 · ${esc(apFirmName(chosen.firm_id))}</small></div>`; }
  else {
    const t = reqs.map(r => apReqSum(r, props)).filter(s => s.done).map(s => s.total);
    if (t.length) money = `<div class="apmoney">${t.length > 1 && Math.min(...t) !== Math.max(...t) ? `${apWon(Math.min(...t))} ~ ${apWon(Math.max(...t))}` : apWon(t[0])}<small>${t.length}곳 입력됨 · 미채택</small></div>`;
  }
  const first = props[0];
  return `<div class="aprow" data-ap="${c.id}">
    <div><div class="tt"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)}</div><div class="ts">의뢰 ${esc(nameOf(c.requester_email))}${c.due_date ? ` · 회신예정 ${esc(c.due_date.slice(5).replace('-', '/'))}` : ''}</div></div>
    <div><b>${props.length}건</b>${first ? ` · ${esc(first.address)}${props.length > 1 ? ` 외 ${props.length - 1}` : ''}` : ''}</div>
    <div>${reqs.map(r => `<span class="afc ${apReqSum(r, props).done ? 'ok' : ''}">${esc(apFirmName(r.firm_id))}${apReqSum(r, props).done ? ' ✓' : ''}</span>`).join('') || '<span class="muted">의뢰기관 없음</span>'}</div>
    <div>${money}</div>
    <div class="muted">${esc(c.request_date.slice(5).replace('-', '/'))}</div></div>`;
}

// ---------- 상세 ----------
function apOpenDetail(id){ apOpenId = id; renderApDetail(); $('apDetailOv').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function apCloseDetail(){ apOpenId = null; $('apDetailOv').style.display = 'none'; document.body.style.overflow = $('apFormOv').style.display === 'block' ? 'hidden' : ''; }
function renderApDetail(){
  const c = apCases.find(x => x.id === apOpenId);
  if (!c){ if (apOpenId) apCloseDetail(); return; }
  const props = apProps(c), reqs = apReqs(c), can = apCan();
  // 다시 그리기 전에, 아직 저장하지 않고 입력 중인 금액(다른 기관 칸)을 보존한다
  const draft = [...$('apDetailPanel').querySelectorAll('input.amt')].filter(i => i.value !== i.dataset.orig).map(i => [i.dataset.r, i.dataset.p, i.value]);
  const unit = (p) => p.kind === '토지' ? '토지' : p.kind === '건물' ? '연면적' : '전용';
  const propRows = props.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.kind)}</td><td>${esc(p.address)}${p.detail ? `<div class="muted">${esc(p.detail)}</div>` : ''}</td><td>${esc(p.jimok || '-')}</td><td style="text-align:right">${p.area !== null ? `${Number(p.area).toLocaleString('ko-KR')}㎡` : '-'}<div class="muted">${unit(p)}</div></td></tr>`).join('');
  const head = reqs.map(r => {
    const sel = c.chosen_firm_id === r.firm_id;
    return `<th class="f ${sel ? 'chosen' : ''}"><div class="fh"><b>${esc(apFirmName(r.firm_id))}</b>${can ? `<label><input type="radio" name="apChosen" value="${r.firm_id}" ${sel ? 'checked' : ''} data-act="choose"/> 채택</label>` : sel ? '<label>✔ 채택</label>' : ''}</div>
      <input type="date" class="rcv" data-r="${r.id}" value="${esc(r.received_at || '')}" ${can ? '' : 'disabled'} title="가격 수령일"/></th>`;
  }).join('');
  const body = props.map((p, i) => `<tr><td>${i + 1}. ${esc(p.address)}<div class="muted">${esc(p.kind)}${p.area !== null ? ` · ${Number(p.area).toLocaleString('ko-KR')}㎡` : ''}</div></td>${reqs.map(r => {
    const v = apReqSum(r, props).map.get(p.id);
    return `<td class="c ${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}"><input class="amt" inputmode="numeric" data-r="${r.id}" data-p="${p.id}" placeholder="${can ? '원 단위' : ''}" value="${v === undefined ? '' : v.toLocaleString('ko-KR')}" data-orig="${v === undefined ? '' : v.toLocaleString('ko-KR')}" ${can ? '' : 'disabled'}/><div class="hint">${v === undefined ? '' : apWon(v)}</div></td>`;
  }).join('')}</tr>`).join('');
  const tot = reqs.map(r => `<td class="${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}" data-tot="${r.id}">${apWon(apReqSum(r, props).total)}</td>`).join('');
  const save = reqs.map(r => `<td>${can ? `<button class="btn primary small" data-act="save" data-r="${r.id}" style="width:100%">💾 ${esc(apFirmName(r.firm_id))} 저장</button>` : ''}</td>`).join('');
  $('apDetailPanel').innerHTML = `
    <div class="ph"><div><div style="margin-bottom:8px"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> <span class="chip" style="background:#fdf2f8;color:#9d174d">감정평가</span></div><h2>${esc(c.debtor_name)}</h2></div><button class="x" data-act="close">✕</button></div>
    <div class="apinfo">
      <div><div class="k">의뢰자</div><div class="v">${esc(nameOf(c.requester_email))}</div></div>
      <div><div class="k">의뢰일</div><div class="v">${esc(c.request_date)}</div></div>
      <div><div class="k">회신 예정일</div><div class="v">${esc(c.due_date || '-')}</div></div>
      <div><div class="k">알림 받는 사람</div><div class="v">${esc((c.notify_emails || []).map(nameOf).join(', ') || '없음')}</div></div>
    </div>
    ${c.memo ? `<div class="apsec"><div class="k">메모</div><div style="white-space:pre-wrap">${esc(c.memo)}</div></div>` : ''}
    <div class="apsec"><div class="k">물건 (${props.length}건)</div><div class="apm"><table class="apt"><thead><tr><th>#</th><th>구분</th><th>소재지</th><th>지목</th><th style="text-align:right">면적</th></tr></thead><tbody>${propRows || '<tr><td colspan="5" class="muted">등록된 물건이 없어요.</td></tr>'}</tbody></table></div></div>
    <div class="apsec"><div class="k">평가기관별 가격 ${can ? '· 기관별로 입력하고 저장하세요' : ''}</div>
      ${reqs.length && props.length ? `<div class="apm"><table class="apt"><thead><tr><th>물건</th>${head}</tr></thead><tbody>${body}<tr class="tot"><td>합계</td>${tot}</tr><tr><td></td>${save}</tr></tbody></table></div>` : '<div class="blk-empty">의뢰한 평가기관이나 물건이 없어요. 수정에서 추가해주세요.</div>'}
      ${can && c.chosen_firm_id ? '<div style="margin-top:8px"><button class="btn small" data-act="unchoose">채택 해제 (가격만 조회)</button></div>' : ''}
    </div>
    <div class="foot" style="margin-top:22px">${can ? `<button class="btn" data-act="edit">✏ 수정</button>${(c.created_by === me || isAdmin()) ? '<button class="btn danger" data-act="del">삭제</button>' : ''}` : '<span class="muted">👀 감정평가 권한이 없어 보기만 할 수 있어요.</span>'}</div>`;
  draft.forEach(([rid, pid, val]) => {
    const inp = $('apDetailPanel').querySelector(`input.amt[data-r="${rid}"][data-p="${pid}"]`);
    if (inp && inp.value !== val){ inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
$('apDetailPanel').addEventListener('input', (e) => {
  const inp = e.target.closest('input.amt'); if (!inp) return;
  inp.value = apComma(inp.value);
  inp.nextElementSibling.textContent = inp.value ? apWon(apNum(inp.value)) : '';
  const rid = inp.dataset.r;
  const sum = [...$('apDetailPanel').querySelectorAll(`input.amt[data-r="${rid}"]`)].reduce((s, i) => s + (apNum(i.value) || 0), 0);
  $('apDetailPanel').querySelector(`[data-tot="${rid}"]`).textContent = apWon(sum);
});
$('apDetailPanel').addEventListener('change', async (e) => {
  const c = apCases.find(x => x.id === apOpenId); if (!c) return;
  if (e.target.matches('input[data-act=choose]')){
    const fid = +e.target.value;
    const { error } = await sb.from('appraisal_cases').update({ chosen_firm_id: fid }).eq('id', c.id);
    if (error) return alert(error.message);
    sb.functions.invoke('task-notify', { body: { event: 'appraisal_chosen', case_id: c.id, firm_id: fid } });
    await loadAppraisal();
  }
});
$('apDetailPanel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const c = apCases.find(x => x.id === apOpenId); if (!c) return;
  const act = b.dataset.act;
  if (act === 'close') return apCloseDetail();
  if (act === 'edit') return apOpenForm(c.id);
  if (act === 'unchoose'){
    const { error } = await sb.from('appraisal_cases').update({ chosen_firm_id: null }).eq('id', c.id);
    if (error) return alert(error.message);
    return loadAppraisal();
  }
  if (act === 'del'){
    if (!confirm(`"${c.debtor_name}" 의뢰를 삭제할까요?\n물건과 입력한 가격이 모두 삭제됩니다.`)) return;
    const { error } = await sb.from('appraisal_cases').delete().eq('id', c.id);
    if (error) return alert(error.message);
    apCloseDetail(); return loadAppraisal();
  }
  if (act === 'save'){
    b.disabled = true;
    try { await apSavePrices(c, +b.dataset.r); } finally { b.disabled = false; }
  }
});
async function apSavePrices(c, rid){
  const props = apProps(c), req = c.appraisal_requests.find(r => r.id === rid); if (!req) return;
  const up = [], del = [];
  $('apDetailPanel').querySelectorAll(`input.amt[data-r="${rid}"]`).forEach(i => {
    const v = apNum(i.value);
    if (v === null) del.push(+i.dataset.p); else up.push({ request_id: rid, property_id: +i.dataset.p, amount: v });
  });
  const before = apReqSum(req, props).map;
  const changed = up.some(u => before.get(u.property_id) !== u.amount) || del.some(id => before.has(id));
  if (up.length){ const { error } = await sb.from('appraisal_prices').upsert(up, { onConflict: 'request_id,property_id' }); if (error) return alert(error.message); }
  if (del.length){ const { error } = await sb.from('appraisal_prices').delete().eq('request_id', rid).in('property_id', del); if (error) return alert(error.message); }
  const inDate = $('apDetailPanel').querySelector(`input.rcv[data-r="${rid}"]`).value || null;
  const recv = inDate || (up.length === props.length && up.length ? kstToday() : null);
  const { error: e2 } = await sb.from('appraisal_requests').update({ received_at: recv }).eq('id', rid);
  if (e2) return alert(e2.message);
  if (changed && up.length) sb.functions.invoke('task-notify', { body: { event: 'appraisal_priced', case_id: c.id, firm_id: req.firm_id } });
  toast(`💾 ${apFirmName(req.firm_id)} 가격을 저장했어요`);
  await loadAppraisal();
}

// ---------- 주소 검색 (브이월드) ----------
function apJsonp(url, timeout = 12000){
  return new Promise((resolve, reject) => {
    const cb = 'apCb' + Date.now() + Math.floor(Math.random() * 1e4);
    const s = document.createElement('script');
    const done = (fn, v) => { clearTimeout(t); delete window[cb]; s.remove(); fn(v); };
    const t = setTimeout(() => done(reject, new Error('시간 초과')), timeout);
    window[cb] = (data) => done(resolve, data);
    s.onerror = () => done(reject, new Error('요청 실패'));
    s.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.body.appendChild(s);
  });
}
// 반환: { items: [{addr, road, pnu}], raw }
async function apSearchAddr(q){
  let raw = null;
  try {   // 1순위: 검색 API 2.0 (지번 주소 + 필지 고유번호)
    raw = await apJsonp(`https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&type=address&category=parcel&format=json&errorformat=json&key=${VWORLD_KEY}&domain=${encodeURIComponent(location.hostname)}&query=${encodeURIComponent(q)}`);
    const arr = raw && raw.response && raw.response.result && raw.response.result.items;
    if (arr && arr.length) return { raw, items: arr.map(it => ({ addr: (it.address && (it.address.parcel || it.address.road)) || '', road: (it.address && it.address.road) || '', pnu: it.id || '' })).filter(x => x.addr) };
  } catch (e) { raw = { error: String(e.message || e) }; }
  try {   // 2순위: NFCF_CRM 에서 쓰던 지번 검색
    const d = await apJsonp(`https://map.vworld.kr/search.do?category=jibun&q=${encodeURIComponent(q)}&pageunit=10&output=json&pageindex=1&apiKey=${VWORLD_KEY}`);
    const cands = [d && d.response && d.response.result && d.response.result.items, d && d.response && d.response.result && d.response.result.item, d && d.response && d.response.items, d && d.response && d.response.LIST && d.response.LIST.item, d && d.LIST && d.LIST.item, d && d.LIST, d && d.result && d.result.items, d && d.items];
    const arr = (cands.find(Boolean) ? [].concat(cands.find(Boolean)) : []);
    const items = arr.map(it => ({ addr: it.JUSO || it.juso || it.address || it.nameFull || it.jibunAddr || '', road: '', pnu: it.PNU || it.pnu || it.id || '' })).filter(x => x.addr);
    return { raw: { primary: raw, fallback: d }, items };
  } catch (e) { return { raw: { primary: raw, fallback: { error: String(e.message || e) } }, items: [] }; }
}
// 지목·면적 자동조회 (확인되는 것만 반환)
function apDeepFind(o, test){ if (!o || typeof o !== 'object') return null; if (test(o)) return o; for (const k of Object.keys(o)){ const r = apDeepFind(o[k], test); if (r) return r; } return null; }
async function apLookupLand(pnu){
  const out = { jimok: '', area: null, note: '' };
  if (!pnu) return Object.assign(out, { note: '필지번호가 없어 자동조회를 건너뜁니다' });
  try {   // 토지특성 (지목·면적)
    const res = await fetch(`https://api.vworld.kr/ned/data/getLandCharacteristics?key=${VWORLD_KEY}&domain=${encodeURIComponent(location.hostname)}&pnu=${encodeURIComponent(pnu)}&format=json&numOfRows=5&pageNo=1`);
    const j = await res.json();
    const f = apDeepFind(j, (x) => x.lndcgrCodeNm !== undefined || x.lndpclAr !== undefined);
    if (f){
      if (f.lndcgrCodeNm) out.jimok = String(f.lndcgrCodeNm);
      if (f.lndpclAr && !isNaN(Number(f.lndpclAr))) out.area = Number(f.lndpclAr);
    }
  } catch (e) { out.note = '토지특성 조회 실패'; }
  if (!out.jimok){   // 지목만이라도: 연속지적도 지번 끝글자
    try {
      const d = await apJsonp(`https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&domain=${encodeURIComponent(location.hostname)}&format=json&size=1&geometry=false&attrFilter=${encodeURIComponent('pnu:=:' + pnu)}`);
      const f = apDeepFind(d, (x) => typeof x.jibun === 'string');
      if (f){ const ch = f.jibun.trim().slice(-1); if (AP_JIMOK_ABBR[ch]) out.jimok = AP_JIMOK_ABBR[ch]; }
    } catch (e) {}
  }
  return out;
}

// ---------- 등록 / 수정 폼 ----------
function apOpenForm(id){
  if (!apCan()) return alert('감정평가에 등록할 권한이 없어요. 관리자에게 문의해주세요.');
  apFormId = id || null;
  const c = id ? apCases.find(x => x.id === id) : null;
  const props = c ? apProps(c) : [], have = new Set(c ? c.appraisal_requests.map(r => r.firm_id) : []);
  const notify = new Set(c ? c.notify_emails : [me]);
  $('apFormPanel').innerHTML = `
    <div class="ph"><h2>${c ? '감정평가 의뢰 수정' : '새 감정평가 의뢰'}</h2><button class="x" data-act="close">✕</button></div>
    <label>본점 / 지점 <span style="color:var(--danger)">*</span></label>
    <select id="apfScope"><option value="">선택하세요 (필수)</option><option>본점</option><option>지점</option></select>
    <div class="row">
      <div><label>채무자 (예정자) <span style="color:var(--danger)">*</span></label><input id="apfDebtor" maxlength="60" placeholder="이름" /></div>
      <div><label>의뢰자 (자동)</label><input id="apfReq" disabled /></div>
    </div>
    <div class="row">
      <div><label>의뢰일</label><input id="apfDate" type="date" /></div>
      <div><label>회신 예정일 (선택)</label><input id="apfDue" type="date" /></div>
    </div>
    <div class="apsec"><div class="k">물건 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">· 소재지는 검색 결과에서 선택한 주소만 입력됩니다</span></div>
      <div id="apfProps"></div>
      <button class="btn small" id="apfAddProp" type="button">＋ 물건 추가</button></div>
    <div class="apsec"><div class="k">평가기관 (의뢰할 곳 체크)</div><div class="checks" id="apFirmList">${apFirms.filter(f => f.active || have.has(f.id)).map(f => `<label><input type="checkbox" value="${f.id}" ${have.has(f.id) ? 'checked' : ''}/> ${esc(f.name)}</label>`).join('')}</div></div>
    <div class="apsec"><div class="k">알림 받을 사람 (체크한 사람에게만 텔레그램)</div><div class="checks" id="apNotifyList">${members.filter(m => m.is_admin || m.perm_appraisal || notify.has(m.email)).map(m => `<label><input type="checkbox" value="${esc(m.email)}" ${notify.has(m.email) ? 'checked' : ''}/> ${esc(m.name)}</label>`).join('')}</div></div>
    <label>메모 (선택)</label><textarea id="apfMemo" rows="2"></textarea>
    <div class="acts" style="margin-top:20px"><button class="btn primary" id="apfSave" style="min-height:44px;padding:8px 28px">저장</button><button class="btn" data-act="close" style="min-height:44px">취소</button></div>`;
  $('apfScope').value = c ? c.scope : ''; $('apfDebtor').value = c ? c.debtor_name : '';
  $('apfReq').value = nameOf(c ? c.requester_email : me); $('apfDate').value = c ? c.request_date : kstToday(); $('apfDue').value = c ? (c.due_date || '') : ''; $('apfMemo').value = c ? (c.memo || '') : '';
  (props.length ? props : [null]).forEach(p => apAddPropBlock(p));
  $('apFormOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('apfDebtor').focus(); } catch (e) {} }, 50);
}
function apCloseForm(){ $('apFormOv').style.display = 'none'; apFormId = null; document.body.style.overflow = $('apDetailOv').style.display === 'block' ? 'hidden' : ''; }
function apRenumber(){ document.querySelectorAll('#apfProps .apblock').forEach((b, i) => { b.querySelector('.bn').textContent = `물건 ${i + 1}`; }); }
function apKindSync(blk){
  const k = AP_KINDS[blk.querySelector('.pk').value];
  blk.querySelector('.la').textContent = k.area; blk.querySelector('.ld').textContent = k.detail;
  blk.querySelector('.pj').placeholder = blk.querySelector('.pk').value === '토지' ? '필수' : '선택';
}
function apAddPropBlock(p){
  const blk = document.createElement('div'); blk.className = 'apblock';
  if (p) blk.dataset.id = p.id;
  blk.innerHTML = `<div class="bh"><span class="bn"></span><button class="btn danger small" type="button" data-pa="del">삭제</button></div>
    <div class="grid"><div><label>구분</label><select class="pk"><option>토지</option><option>건물</option><option>집합건물</option></select></div>
      <div><label>소재지 (지번) <span style="color:var(--danger)">*</span></label>
        <div style="display:flex;gap:6px"><input class="pq" placeholder="예: 제주시 연동 312, 또는 동 이름 + 번지" style="flex:1" /><button class="btn small" type="button" data-pa="search">검색</button></div>
        <div class="apres"></div></div></div>
    <input class="pa apaddr" placeholder="↑ 검색해서 주소를 선택하세요" readonly style="margin-top:8px" />
    <div class="apst"></div>
    <div class="grid3"><div><label>지목</label><input class="pj" list="apJimokDl" /></div><div><label class="la">면적</label><input class="pr" inputmode="decimal" /></div><div><label class="ld">비고</label><input class="pd" maxlength="80" /></div></div>`;
  $('apfProps').appendChild(blk);
  if (!$('apJimokDl')){ const dl = document.createElement('datalist'); dl.id = 'apJimokDl'; dl.innerHTML = AP_JIMOK.map(j => `<option value="${j}">`).join(''); document.body.appendChild(dl); }
  if (p){
    blk.querySelector('.pk').value = p.kind; blk.querySelector('.pa').value = p.address; blk.dataset.verified = '1'; blk.dataset.pnu = p.pnu || '';
    blk.querySelector('.pj').value = p.jimok || ''; blk.querySelector('.pr').value = p.area === null ? '' : p.area; blk.querySelector('.pd').value = p.detail || '';
  }
  apKindSync(blk); apRenumber();
}
$('apFormPanel').addEventListener('change', (e) => { if (e.target.matches('.pk')) apKindSync(e.target.closest('.apblock')); });
$('apFormPanel').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.pq')){ e.preventDefault(); apDoSearch(e.target.closest('.apblock')); } });
$('apFormPanel').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act],[data-pa],.it,#apfAddProp,#apfSave'); if (!el) return;
  if (el.dataset.act === 'close') return apCloseForm();
  if (el.id === 'apfAddProp') return apAddPropBlock(null);
  if (el.id === 'apfSave') return apSaveForm();
  const blk = el.closest('.apblock');
  if (el.dataset.pa === 'del'){
    if (document.querySelectorAll('#apfProps .apblock').length <= 1) return alert('물건은 최소 1개가 필요해요.');
    blk.remove(); return apRenumber();
  }
  if (el.dataset.pa === 'search') return apDoSearch(blk);
  if (el.classList.contains('it')){
    const res = blk.querySelector('.apres'), st = blk.querySelector('.apst');
    blk.querySelector('.pa').value = el.dataset.addr; blk.dataset.verified = '1'; blk.dataset.pnu = el.dataset.pnu || '';
    res.style.display = 'none'; res.innerHTML = '';
    st.className = 'apst ok'; st.textContent = '✔ 확인된 주소입니다. 지목·면적을 조회하는 중…';
    const land = await apLookupLand(el.dataset.pnu);
    const kind = blk.querySelector('.pk').value;
    const filled = [];
    if (kind === '토지'){
      if (land.jimok && !blk.querySelector('.pj').value){ blk.querySelector('.pj').value = land.jimok; filled.push('지목'); }
      if (land.area !== null && !blk.querySelector('.pr').value){ blk.querySelector('.pr').value = land.area; filled.push('면적'); }
    } else if (land.jimok && !blk.querySelector('.pj').value){ blk.querySelector('.pj').value = land.jimok; filled.push('지목'); }
    st.className = 'apst ok';
    st.textContent = filled.length ? `✔ 확인된 주소 · ${filled.join('·')} 자동 입력됨 (다르면 직접 고쳐주세요)` : `✔ 확인된 주소 · 지목·면적은 자동조회가 되지 않아 직접 입력해주세요${land.note ? ` (${land.note})` : ''}`;
  }
});
async function apDoSearch(blk){
  const q = blk.querySelector('.pq').value.trim(), res = blk.querySelector('.apres');
  if (q.length < 2) return alert('검색어를 두 글자 이상 입력해주세요.');
  res.style.display = 'block'; res.innerHTML = '<div class="it" style="cursor:default">검색 중…</div>';
  const { items, raw } = await apSearchAddr(q);
  if (!items.length){
    res.innerHTML = `<div class="it" style="cursor:default;color:var(--danger)">검색 결과가 없어요. 주소를 다시 확인해주세요.<small>동·리 이름과 번지를 함께 입력해보세요 (예: 연동 312)</small></div>
      <details style="padding:6px 12px"><summary class="muted" style="cursor:pointer;font-size:12px">🔧 응답 원본 보기</summary><pre style="white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto">${esc(JSON.stringify(raw, null, 1)).slice(0, 2500)}</pre></details>`;
    return;
  }
  res.innerHTML = items.map(it => `<div class="it" data-addr="${esc(it.addr)}" data-pnu="${esc(it.pnu)}">${esc(it.addr)}${it.road ? `<small>${esc(it.road)}</small>` : ''}</div>`).join('');
}
async function apSaveForm(){
  const scope = $('apfScope').value, debtor = $('apfDebtor').value.trim();
  if (!scope) return alert('본점 / 지점 중 하나를 선택해주세요.');
  if (!debtor) return alert('채무자(예정자) 이름을 입력해주세요.');
  const blocks = [...document.querySelectorAll('#apfProps .apblock')];
  const props = [];
  for (const [i, b] of blocks.entries()){
    const kind = b.querySelector('.pk').value, addr = b.querySelector('.pa').value.trim(), jimok = b.querySelector('.pj').value.trim(), areaS = b.querySelector('.pr').value.trim();
    if (!addr || b.dataset.verified !== '1') return alert(`물건 ${i + 1}: 소재지를 검색해서 확인된 주소를 선택해주세요.`);
    if (kind === '토지' && !jimok) return alert(`물건 ${i + 1}: 지목을 입력해주세요.`);
    const area = areaS === '' ? null : Number(areaS.replace(/,/g, ''));
    if (area === null || isNaN(area) || area <= 0) return alert(`물건 ${i + 1}: 면적(㎡)을 숫자로 입력해주세요.`);
    props.push({ id: b.dataset.id ? +b.dataset.id : null, seq: i + 1, kind, address: addr, pnu: b.dataset.pnu || null, jimok: jimok || null, area, detail: b.querySelector('.pd').value.trim() || null });
  }
  const firms = [...document.querySelectorAll('#apFirmList input:checked')].map(i => +i.value);
  const notify = [...document.querySelectorAll('#apNotifyList input:checked')].map(i => i.value);
  const patch = { scope, debtor_name: debtor, request_date: $('apfDate').value || kstToday(), due_date: $('apfDue').value || null, memo: $('apfMemo').value.trim() || null, notify_emails: notify };
  $('apfSave').disabled = true;
  try {
    let cid = apFormId;
    if (!cid){
      const { data, error } = await sb.from('appraisal_cases').insert(patch).select('id').single();
      if (error) return alert(error.message);
      cid = data.id;
      const ins = await sb.from('appraisal_properties').insert(props.map(({ id, ...p }) => ({ ...p, case_id: cid })));
      if (ins.error) return alert('물건 저장 실패: ' + ins.error.message);
      if (firms.length){ const r = await sb.from('appraisal_requests').insert(firms.map(f => ({ case_id: cid, firm_id: f, requested_at: patch.request_date }))); if (r.error) return alert('평가기관 저장 실패: ' + r.error.message); }
      sb.functions.invoke('task-notify', { body: { event: 'appraisal_created', case_id: cid } });
    } else {
      const c = apCases.find(x => x.id === cid);
      const upd = { ...patch }; if (c.chosen_firm_id && !firms.includes(c.chosen_firm_id)) upd.chosen_firm_id = null;
      let err = (await sb.from('appraisal_cases').update(upd).eq('id', cid)).error;
      const oldIds = apProps(c).map(p => p.id), keep = props.filter(p => p.id).map(p => p.id);
      const gone = oldIds.filter(i => !keep.includes(i));
      if (!err && gone.length) err = (await sb.from('appraisal_properties').delete().in('id', gone)).error;
      for (const p of props.filter(p => p.id)){ if (err) break; const { id, ...rest } = p; err = (await sb.from('appraisal_properties').update(rest).eq('id', id)).error; }
      const news = props.filter(p => !p.id);
      if (!err && news.length) err = (await sb.from('appraisal_properties').insert(news.map(({ id, ...p }) => ({ ...p, case_id: cid })))).error;
      const oldF = c.appraisal_requests.map(r => r.firm_id);
      const rmF = oldF.filter(f => !firms.includes(f)), addF = firms.filter(f => !oldF.includes(f));
      if (!err && rmF.length){
        const hasPrice = c.appraisal_requests.some(r => rmF.includes(r.firm_id) && (r.appraisal_prices || []).length);
        if (hasPrice && !confirm('가격이 입력된 평가기관을 뺍니다. 입력한 가격도 함께 삭제돼요. 계속할까요?')) return;
        err = (await sb.from('appraisal_requests').delete().eq('case_id', cid).in('firm_id', rmF)).error;
      }
      if (!err && addF.length) err = (await sb.from('appraisal_requests').insert(addF.map(f => ({ case_id: cid, firm_id: f, requested_at: kstToday() })))).error;
      if (err) return alert(err.message);
    }
    apCloseForm();
    await loadAppraisal();
    apOpenDetail(cid);
  } finally { $('apfSave').disabled = false; }
}

// ---------- 관리자: 평가기관 목록 ----------
function apRenderFirms(){
  const box = $('aFirms'); if (!box) return;
  box.innerHTML = `<div class="checks" style="gap:8px">${apFirms.map(f => `<span class="afc ${f.active ? 'ok' : ''}" style="padding:5px 10px" data-f="${f.id}">${esc(f.name)}
      <a href="#" data-fa="toggle" style="margin-left:6px;font-weight:600;color:inherit">${f.active ? '숨김' : '사용'}</a>
      <a href="#" data-fa="del" style="margin-left:4px;font-weight:600;color:var(--danger)">삭제</a></span>`).join('')}</div>
    <div class="row" style="margin-top:10px"><input id="aFirmName" placeholder="평가기관 이름 (예: 대화)" maxlength="30" /><button class="btn primary" id="aFirmAdd" style="flex:0 0 auto">＋ 추가</button></div>`;
}
document.addEventListener('click', async (e) => {
  const add = e.target.closest('#aFirmAdd');
  if (add){
    const name = $('aFirmName').value.trim(); if (!name) return;
    const { error } = await sb.from('appraisal_firms').insert({ name, sort: (Math.max(0, ...apFirms.map(f => f.sort)) + 1) });
    if (error) return alert(error.code === '23505' ? '이미 있는 평가기관이에요.' : error.message);
    return loadAppraisal();
  }
  const a = e.target.closest('[data-fa]'); if (!a) return;
  e.preventDefault();
  const id = +a.closest('[data-f]').dataset.f, f = apFirms.find(x => x.id === id);
  if (a.dataset.fa === 'toggle'){
    const { error } = await sb.from('appraisal_firms').update({ active: !f.active }).eq('id', id);
    if (error) return alert(error.message);
  } else {
    if (!confirm(`${f.name} 평가기관을 삭제할까요?`)) return;
    const { error } = await sb.from('appraisal_firms').delete().eq('id', id);
    if (error) return alert(error.code === '23503' ? '이미 의뢰 내역이 있어 삭제할 수 없어요. "숨김"을 사용해주세요.' : error.message);
  }
  loadAppraisal();
});
