// 감정평가 관리 — index.html 의 전역(sb, $, esc, me, meRow, members, nameOf, kstToday, toast, divn …)을 함께 쓴다.
// 상태 구분 없이: 의뢰 등록 → 담당자가 평가기관별 가격을 받아 입력 → (선택) 채택

const VWORLD_KEY = '77A8D989-2D72-4900-A553-C5CF92742E9C';   // 브이월드 인증키 (NFCF_CRM 과 동일, 도메인 등록 필요)
const AP_FONT = "'Pretendard Variable',Pretendard,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const AP_FONT_LINK = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css">';
const AP_KINDS = {
  '토지':   { area: '토지면적 (㎡)', detail: '비고' },
  '건물':   { area: '건물면적 (㎡)', detail: '건물명 · 비고', land: true },
  '집합건물': { area: '전용면적 (㎡)', detail: '동 · 호수' },
};
const AP_JIMOK = ['대', '전', '답', '임야', '잡종지', '공장용지', '도로', '구거', '하천', '과수원', '목장용지', '학교용지', '주차장', '주유소용지', '창고용지', '체육용지', '종교용지', '철도용지', '제방', '유지', '수도용지', '공원', '묘지', '양어장', '염전', '광천지', '사적지', '유원지'];
const AP_JIMOK_ABBR = { '대': '대', '전': '전', '답': '답', '임': '임야', '잡': '잡종지', '공': '공장용지', '도': '도로', '구': '구거', '천': '하천', '과': '과수원', '목': '목장용지', '학': '학교용지', '차': '주차장', '주': '주유소용지', '창': '창고용지', '체': '체육용지', '종': '종교용지', '철': '철도용지', '제': '제방', '수': '수도용지', '원': '공원', '묘': '묘지' };

let apCases = [], apFirms = [], apSettings = {}, apOpenId = null, apFormId = null, apTimer = null;
let apMainView = (() => { try { return localStorage.getItem('apMain') || 'map'; } catch (e) { return 'map'; } })();
let apQ = '', apMine = false, apScope = 'all', apType = 'all', apView = 'active';

const AP_TYPES = ['신규대출', '기한연장', '채권관리', '기타'];
const apTypeText = (c) => c.handling_type ? (c.handling_type === '기타' && c.handling_note ? `기타 · ${c.handling_note}` : c.handling_type) : '-';
const apCaseNo = (c) => `${String(c.request_date || '').slice(0, 4)}-${String(c.id).padStart(4, '0')}`;
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
  #appraisal{ display:none; flex-direction:column; gap:14px; min-width:0; }
  .aphead,.aprow{ display:grid; grid-template-columns:minmax(170px,1.1fr) minmax(200px,1.5fr) minmax(170px,1.3fr) 190px 86px; gap:12px; align-items:center; padding:0 26px; }
  .aphead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:4px; padding-bottom:8px; }
  .aprow{ padding-top:16px; padding-bottom:16px; cursor:pointer; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; transition:box-shadow .15s, transform .15s; }
  .aprow:hover{ background:#fff; box-shadow:var(--sh-hover); transform:translateY(-1px); }
  .aprow .tt{ font-size:16.5px; letter-spacing:-.02em; font-weight:700; line-height:1.35; word-break:break-word; }
  .aprow .ts{ font-size:12.5px; color:var(--muted); margin-top:2px; }
  .afc{ display:inline-flex; align-items:center; gap:3px; font-size:12.5px; font-weight:700; padding:4px 11px; border-radius:99px; margin:2px 4px 2px 0; background:var(--warn-soft); color:var(--warn); white-space:nowrap; }
  .afc.ok{ background:var(--green-soft); color:var(--green); }
  .apmoney{ font-size:14px; font-weight:700; line-height:1.4; }
  .apmoney small{ display:block; font-size:12px; font-weight:500; color:var(--muted); }
  .chip.sc-본점{ background:var(--accent-soft); color:var(--accent); } .chip.sc-지점{ background:#eef1f6; color:#4b5563; } .chip.sc-통합{ background:#f3eefc; color:#7c3aed; }
  .apPanel{ max-width:1040px !important; }
  .apsec{ margin-top:22px; } .apsec > .k{ font-size:13px; font-weight:800; color:#44546f; margin-bottom:8px; }
  .apinfo{ margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px 18px; }
  .apinfo .k{ font-size:12px; color:var(--muted); font-weight:600; } .apinfo .v{ font-size:15px; font-weight:600; margin-top:2px; word-break:break-word; }
  table.apt{ width:100%; border-collapse:collapse; font-size:14px; }
  table.apt th{ text-align:left; font-size:12.5px; color:#5a6172; font-weight:700; background:var(--field); padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:bottom; }
  table.apt td{ padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  .apm{ overflow-x:auto; } .apm table{ min-width:560px; }
  .apm th.f{ min-width:170px; } .apm td.c{ min-width:170px; }
  .apm input.amt,.apm input.tamt{ width:100%; text-align:right; font-weight:700; }
  .apm textarea.note{ width:100%; font-size:14px; }
  .apm .hint{ font-size:12px; color:var(--muted); text-align:right; margin-top:2px; min-height:16px; }
  .apm tr.tot td{ background:var(--chipbg); font-weight:800; font-size:15px; text-align:right; }
  .apm tr.tot td:first-child{ text-align:left; }
  .apm th.f.chosen, .apm td.chosen{ background:#e6f7ee; }
  .apm .fh{ display:flex; align-items:center; gap:6px; font-size:15px; color:var(--ink); }
  .apm .fh label{ display:inline-flex; align-items:center; gap:4px; margin:0; font-size:12.5px; font-weight:700; color:var(--green); }
  .apm .fh input[type=radio]{ width:16px; height:16px; min-height:0; -webkit-appearance:auto; appearance:auto; }
  .apm input[type=date]{ font-size:13px; padding:5px 8px; min-height:34px; margin-top:6px; }
  .apblock{ border:0; border-radius:20px; padding:14px 16px; margin-bottom:12px; background:var(--field); }
  .apblock .bh{ display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:14px; margin-bottom:6px; }
  .apblock .grid{ display:grid; grid-template-columns:130px 1fr; gap:0 10px; }
  .apblock .grid3{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:0 10px; }
  .apres{ border:1px solid var(--line); border-radius:16px; background:#fff; max-height:240px; overflow:auto; margin-top:6px; display:none; }
  .apres .it{ padding:9px 12px; cursor:pointer; border-bottom:1px solid var(--line); font-size:14px; } .apres .it:hover{ background:var(--accent-soft); }
  .apres .it small{ display:block; color:var(--muted); font-size:12px; }
  .apst{ font-size:12.5px; margin-top:4px; color:var(--muted); } .apst.ok{ color:var(--green); } .apst.bad{ color:var(--danger); }
  .apaddr{ background:#f1f2f4 !important; font-weight:600; }
  #apFirmList,#apNotifyList{ display:flex; flex-wrap:wrap; gap:4px 16px; }
  .apmapbox{ display:grid; grid-template-columns:minmax(0,1fr) 380px; gap:16px; height:calc(100vh - 300px); min-height:520px; }
  #apMapEl{ min-height:300px; background:#e8ecf1; z-index:0; border-radius:28px; box-shadow:var(--sh); overflow:hidden; } #apMapPanel{ overflow-y:auto; padding:18px 18px; background:#fff; border-radius:28px; box-shadow:var(--sh); }
  .aplegend{ display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; padding:14px 8px 2px; font-size:12.5px; color:var(--muted); }
  .aplegend i.apin{ display:inline-block; width:12px; height:12px; margin-right:5px; vertical-align:-1px; }
  .apin{ border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.45); }
  .apin.s-wait{ background:#f59e0b; } .apin.s-done{ background:#2563eb; } .apin.s-sel{ background:#16a34a; } .apin.s-arc{ background:#9ca3af; }
  .apin-wrap{ background:none !important; border:0 !important; } .apin-wrap .apin{ width:26px; height:26px; display:flex; align-items:center; justify-content:center; }
  .apin-wrap .apin b{ transform:rotate(45deg); color:#fff; font-size:11px; font-weight:800; }
  .apq{ width:18px; height:18px; border-radius:50%; background:#ef4444; border:3px solid #fff; box-shadow:0 0 0 4px rgba(239,68,68,.35); }
  .aprec{ border:0; border-radius:18px; padding:12px 14px; margin-bottom:10px; cursor:pointer; background:var(--chipbg); transition:box-shadow .15s; } .aprec:hover{ background:#eceff5; }
  .aprec .h{ font-weight:800; font-size:14.5px; } .aprec .m{ font-size:12.5px; color:var(--muted); margin-top:2px; } .aprec .w{ font-size:13.5px; font-weight:700; margin-top:4px; }
  .aprec.same{ background:#e6f7ee; } .aprec.same:hover{ background:#dcf3e6; }
  .apnew{ border:2px dashed #cdd3df; border-radius:20px; padding:16px; text-align:center; margin-bottom:10px; }
  .apdup{ margin-top:6px; padding:8px 12px; border-radius:14px; background:var(--warn-soft); color:#8a5a00; font-size:12.5px; font-weight:600; }
  .leaflet-popup-content{ font-family:inherit; font-size:13.5px; line-height:1.5; margin:12px 14px; } .leaflet-popup-content button{ margin-top:6px; }
  @media (max-width:900px){
    .apmapbox{ grid-template-columns:1fr; height:auto; } #apMapEl{ height:56vh; } #apMapPanel{ max-height:none; }
    .aprow{ padding:12px 14px; border-radius:18px; margin-bottom:9px; } .aprow .tt{ font-size:14.5px; } .aprow .ts{ font-size:11.5px; } .afc{ font-size:11.5px; padding:3px 9px; } .apmoney{ font-size:13px; }
    .aprec{ padding:10px 12px; border-radius:16px; } .aprec .h{ font-size:13.5px; } .aprec .m{ font-size:11.5px; } .aprec .w{ font-size:12.5px; } #apMapPanel{ padding:14px; border-radius:22px; } #apMapEl{ border-radius:22px; }
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
  <div class="ov" id="apFormOv"><div class="panel apPanel" id="apFormPanel"></div></div>
  <div class="ov" id="apFaxOv" style="z-index:30"><div class="panel" id="apFaxPanel" style="max-width:540px"></div></div>`;
  document.body.appendChild(d);
  $('apDetailOv').addEventListener('click', (e) => { if (e.target === $('apDetailOv')) apCloseDetail(); });
  $('apFormOv').addEventListener('click', (e) => { if (e.target === $('apFormOv')) apCloseForm(); });
  $('apFaxOv').addEventListener('click', (e) => { if (e.target === $('apFaxOv')) apCloseFax(); });
})();

// ---------- 데이터 ----------
const apProps = (c) => [...(c.appraisal_properties || [])].sort((a, b) => a.seq - b.seq);
const apFirmName = (id) => (apFirms.find(f => f.id === id) || {}).name || '?';
const apReqs = (c) => [...(c.appraisal_requests || [])].sort((a, b) => ((apFirms.find(f => f.id === a.firm_id) || {}).sort || 0) - ((apFirms.find(f => f.id === b.firm_id) || {}).sort || 0));
// 가격을 한 번에 받는 물건 묶음(group_no 가 같은 물건)을 하나의 '단위'로 본다. 가격은 묶음의 첫 물건(key)에 저장한다.
function apUnits(props){
  const groups = new Map(), out = [];
  props.forEach((p, idx) => {
    if (p.group_no === null || p.group_no === undefined){ out.push({ key: p.id, members: [p], nos: [idx + 1], group: false }); return; }
    let u = groups.get(p.group_no);
    if (!u){ u = { key: p.id, members: [], nos: [], group: true }; groups.set(p.group_no, u); out.push(u); }
    u.members.push(p); u.nos.push(idx + 1);
  });
  out.forEach(u => { if (u.group && u.members.length < 2) u.group = false; });
  return out;
}
const apNos = (u) => u.nos.join('·');
function apReqSum(r, props){
  const m = new Map((r.appraisal_prices || []).map(p => [p.property_id, Number(p.amount)]));
  const units = apUnits(props), have = units.filter(u => m.has(u.key));
  const useTotal = have.length === 0 && r.total_amount !== null && r.total_amount !== undefined;   // 물건별 입력 없이 총액만 받은 경우
  return { total: useTotal ? Number(r.total_amount) : units.reduce((s, u) => s + (m.get(u.key) || 0), 0), filled: have.length, done: useTotal || (units.length > 0 && have.length === units.length), mode: useTotal ? 'total' : have.length ? 'items' : 'none', map: m };
}

async function loadAppraisal(){
  const [c, f, st] = await Promise.all([
    sb.from('appraisal_cases').select('*, appraisal_properties(*), appraisal_requests(*, appraisal_prices(*))').order('id', { ascending: false }),
    sb.from('appraisal_firms').select('*').order('sort'),
    sb.from('appraisal_settings').select('*'),
  ]);
  if (!st.error) apSettings = Object.fromEntries((st.data || []).map(x => [x.scope, x]));
  if (c.error || f.error){ console.warn('감정평가 불러오기 실패', c.error || f.error); return; }
  apCases = (c.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);   // 최근 등록이 맨 위
  apFirms = f.data || [];
  apBadge();
  if (divn === 'appraisal') renderAppraisal();
  if (apOpenId && !(document.activeElement && $('apDetailOv').contains(document.activeElement) && /INPUT/.test(document.activeElement.tagName))) renderApDetail();
  if (typeof apRenderFirms === 'function' && $('aFirms')) apRenderFirms();
  if ($('aContacts') && !$('aContacts').contains(document.activeElement)) apRenderContacts();
  if ($('aGeo')) apRenderGeo();
}
function scheduleAp(){ clearTimeout(apTimer); apTimer = setTimeout(() => { if (me) loadAppraisal(); }, 400); }
function apBadge(){
  const n = apCases.filter(c => !c.archived_at && apReqs(c).some(r => !apReqSum(r, apProps(c)).done)).length;
  const el = $('nAppraisal'); if (!el) return;
  el.textContent = n || ''; el.style.display = n ? '' : 'none';
}

// ---------- 목록 ----------
function renderAppraisal(){
  const el = $('appraisal');
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.innerHTML = `<div class="seg" id="apMain" style="align-self:flex-start;background:#fff;box-shadow:var(--sh)"><button data-m="map">🗺 지도 (기록 찾기)</button><button data-m="list">📋 목록</button></div>
    <div id="apMapWrap" class="list-panel" style="display:none">
      <div class="toolbar" style="position:relative">
        <input id="apMq" class="search" type="search" placeholder="🔍 지번 검색 (예: 동산면 원창리 99) — 기존 감정 기록 찾기" style="min-width:240px" />
        <button class="btn primary small" id="apMgo">검색</button>
        <select id="apMr" title="근처 기록 반경"><option value="200">반경 200m</option><option value="300" selected>반경 300m</option><option value="500">반경 500m</option><option value="1000">반경 1km</option></select>
        <div class="seg" id="apMlayer"><button data-l="base" class="on">일반</button><button data-l="sat">항공</button></div>
        <label class="chk"><input type="checkbox" id="apMcad" checked /> 지적도</label>
        <label class="chk"><input type="checkbox" id="apMarch" checked /> 보관 기록 포함</label>
        <div id="apMres" class="apres" style="position:absolute;left:12px;top:100%;z-index:500;width:min(520px,calc(100% - 24px));box-shadow:0 6px 20px rgba(9,30,66,.3)"></div>
      </div>
      <div class="apmapbox"><div id="apMapEl"></div><div id="apMapPanel"></div></div>
      <div class="aplegend"><span><i class="apin s-wait"></i>가격 대기</span><span><i class="apin s-done"></i>가격 도착</span><span><i class="apin s-sel"></i>채택 완료</span><span><i class="apin s-arc"></i>보관</span><span id="apMnote" class="muted"></span></div>
    </div>
    <div id="apListWrap" class="list-panel" style="display:none">
      <div class="toolbar">
        <div class="seg" id="apView"><button data-v="active">진행중 <span id="apNA"></span></button><button data-v="archive">📦 보관함 <span id="apNB"></span></button></div>
        <select id="apScope"><option value="all">본점·지점</option><option value="본점">본점</option><option value="지점">지점</option></select>
        <select id="apType"><option value="all">취급구분 전체</option>${AP_TYPES.map(v => `<option>${v}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="apMine" /> 내 의뢰만</label>
        <input id="apQ" class="search" type="search" placeholder="🔍 채무자·소재지 검색" />
      </div>
      <div class="aphead"><span>채무자</span><span>물건</span><span>평가기관 (✓ 가격 입력 완료)</span><span>금액</span><span>의뢰일</span></div>
      <div id="apList"></div></div>`;
    $('apMain').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) apSetMain(b.dataset.m); };
    apMapWire();
    $('apView').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; apView = b.dataset.v; renderAppraisal(); };
    $('apScope').onchange = () => { apScope = $('apScope').value; renderAppraisal(); };
    $('apType').onchange = () => { apType = $('apType').value; renderAppraisal(); };
    $('apMine').onchange = () => { apMine = $('apMine').checked; renderAppraisal(); };
    $('apQ').oninput = () => { apQ = $('apQ').value.trim().toLowerCase(); renderAppraisal(); };
    $('apList').addEventListener('click', (e) => { const r = e.target.closest('[data-ap]'); if (r) apOpenDetail(+r.dataset.ap); });
  }
  apSetMain(apMainView, true);
  const nb = apCases.filter(c => c.archived_at).length;
  $('apNA').textContent = apCases.length - nb; $('apNB').textContent = nb;
  document.querySelectorAll('#apView button').forEach(b => b.classList.toggle('on', b.dataset.v === apView));
  const shown = apCases.filter(c => (apView === 'archive' ? !!c.archived_at : !c.archived_at) && (apScope === 'all' || c.scope === apScope) && (apType === 'all' || c.handling_type === apType)
    && (!apMine || c.requester_email === me)
    && (!apQ || [c.debtor_name, c.memo, ...apProps(c).map(p => p.address)].some(v => (v || '').toLowerCase().includes(apQ))));
  if (apView === 'archive') shown.sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
  $('apList').innerHTML = shown.map(apRowHtml).join('') || `<div class="blk-empty">${apView === 'archive' ? '보관함이 비어 있어요. 가격이 모두 도착한 의뢰는 상세 창에서 📦 보관함으로 옮길 수 있어요.' : apCases.length ? '조건에 맞는 의뢰가 없어요.' : '등록된 감정평가 의뢰가 없어요.'}</div>`;
}
function apRowHtml(c){
  const props = apProps(c), reqs = apReqs(c);
  const chosen = reqs.find(r => r.firm_id === c.chosen_firm_id);
  let money = '<span class="muted">-</span>';
  if (chosen && apReqSum(chosen, props).mode !== 'none'){ money = `<div class="apmoney">${apWon(apReqSum(chosen, props).total)}<small>채택 · ${esc(apFirmName(chosen.firm_id))}</small></div>`; }
  else {
    const t = reqs.map(r => apReqSum(r, props)).filter(s => s.done).map(s => s.total);
    if (t.length) money = `<div class="apmoney">${t.length > 1 && Math.min(...t) !== Math.max(...t) ? `${apWon(Math.min(...t))} ~ ${apWon(Math.max(...t))}` : apWon(t[0])}<small>${t.length}곳 입력됨 · 미채택</small></div>`;
  }
  const first = props[0];
  return `<div class="aprow" data-ap="${c.id}">
    <div><div class="tt"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)}</div><div class="ts">${c.handling_type ? `<b>${esc(c.handling_type === '기타' && c.handling_note ? `기타·${c.handling_note}` : c.handling_type)}</b> · ` : ''}의뢰 ${esc(nameOf(c.requester_email))}${c.loan_amount !== null && c.loan_amount !== undefined ? ` · 신청 ${esc(apWon(c.loan_amount))}` : ''}${c.archived_at ? ` · 📦 보관 ${esc(c.archived_at.slice(5, 10).replace('-', '/'))}` : ''}</div></div>
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
  const draft = [...$('apDetailPanel').querySelectorAll('[data-k]')].filter(i => i.value !== i.dataset.orig).map(i => [i.dataset.k, i.value]);
  const unit = (p) => p.kind === '토지' ? '토지' : p.kind === '건물' ? '연면적' : '전용';
  const units = apUnits(props), grpOf = new Map(); units.forEach(u => { if (u.group) u.members.forEach(m => grpOf.set(m.id, u)); });
  const propRows = props.map((p, i) => `<tr><td>${i + 1}${grpOf.has(p.id) ? `<div><span class="chip" title="가격을 한 번에 받는 묶음">🔗 ${esc(apNos(grpOf.get(p.id)))}</span></div>` : ''}</td><td>${esc(p.kind)}</td><td>${esc(p.address)}${p.detail ? `<div class="muted">${esc(p.detail)}</div>` : ''}</td><td>${esc(p.jimok || '-')}</td><td style="text-align:right">${p.kind === '건물' ? `대지 ${p.land_area !== null && p.land_area !== undefined ? Number(p.land_area).toLocaleString('ko-KR') + '㎡' : '-'}<div>건물 ${p.area !== null ? Number(p.area).toLocaleString('ko-KR') + '㎡' : '-'}</div>` : `${p.area !== null ? `${Number(p.area).toLocaleString('ko-KR')}㎡` : '-'}<div class="muted">${unit(p)}</div>`}</td></tr>`).join('');
  const head = reqs.map(r => {
    const sel = c.chosen_firm_id === r.firm_id;
    return `<th class="f ${sel ? 'chosen' : ''}"><div class="fh"><b>${esc(apFirmName(r.firm_id))}</b>${can ? `<label><input type="radio" name="apChosen" value="${r.firm_id}" ${sel ? 'checked' : ''} data-act="choose"/> 채택</label>` : sel ? '<label>✔ 채택</label>' : ''}</div>
      <input type="date" class="rcv" data-r="${r.id}" value="${esc(r.received_at || '')}" ${can ? '' : 'disabled'} title="가격 수령일"/></th>`;
  }).join('');
  const unitSub = (p) => `${esc(p.kind)}${p.kind === '건물' && p.land_area ? ` · 대지 ${Number(p.land_area).toLocaleString('ko-KR')}㎡` : ''}${p.area !== null ? ` · ${p.kind === '건물' ? '건물 ' : ''}${Number(p.area).toLocaleString('ko-KR')}㎡` : ''}`;
  const unitCell = (u) => u.group
    ? `<span class="chip" style="margin-bottom:3px">🔗 일괄 ${esc(apNos(u))}번</span>${u.members.map(m => `<div>${esc(m.address)} <span class="muted">${unitSub(m)}</span></div>`).join('')}`
    : `${u.nos[0]}. ${esc(u.members[0].address)}<div class="muted">${unitSub(u.members[0])}</div>`;
  const body = units.map(u => { const p = u.members[0]; return `<tr><td>${unitCell(u)}</td>${reqs.map(r => {
    const v = apReqSum(r, props).map.get(p.id);
    return `<td class="c ${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}"><input class="amt" inputmode="numeric" data-r="${r.id}" data-p="${p.id}" data-k="a:${r.id}:${p.id}" placeholder="${can ? '원 단위' : ''}" value="${v === undefined ? '' : v.toLocaleString('ko-KR')}" data-orig="${v === undefined ? '' : v.toLocaleString('ko-KR')}" ${can ? '' : 'disabled'}/><div class="hint">${v === undefined ? '' : apWon(v)}</div></td>`;
  }).join('')}</tr>`; }).join('');
  const tinp = reqs.map(r => {
    const sm = apReqSum(r, props), has = sm.mode === 'items', v = sm.mode === 'total' ? Number(r.total_amount).toLocaleString('ko-KR') : '';
    return `<td class="c ${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}"><input class="tamt" inputmode="numeric" data-r="${r.id}" data-k="t:${r.id}" data-orig="${v}" value="${v}" placeholder="${has ? '물건별 입력의 합계가 적용됨' : '총액만 받은 경우'}" ${can && !has ? '' : 'disabled'}/><div class="hint">${v ? apWon(sm.total) : ''}</div></td>`;
  }).join('');
  const notes = reqs.map(r => `<td class="c ${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}"><textarea class="note" rows="2" maxlength="500" data-r="${r.id}" data-k="n:${r.id}" data-orig="${esc(r.note || '')}" placeholder="${can ? '이 기관의 코멘트·특이사항' : ''}" ${can ? '' : 'disabled'}>${esc(r.note || '')}</textarea></td>`).join('');
  const tot = reqs.map(r => `<td class="${c.chosen_firm_id === r.firm_id ? 'chosen' : ''}" data-tot="${r.id}">${apWon(apReqSum(r, props).total)}</td>`).join('');
  const save = reqs.map(r => `<td>${can ? `<button class="btn primary small" data-act="save" data-r="${r.id}" style="width:100%">💾 ${esc(apFirmName(r.firm_id))} 저장</button>` : ''}</td>`).join('');
  $('apDetailPanel').innerHTML = `
    <div class="ph"><div><div style="margin-bottom:8px"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> <span class="chip" style="background:#fdf2f8;color:#9d174d">감정평가</span></div><h2>${esc(c.debtor_name)}</h2></div><button class="x" data-act="close">✕</button></div>
    ${c.archived_at ? `<div style="margin-top:12px;padding:9px 12px;border-radius:8px;background:#f1f2f4;font-size:13.5px">📦 보관함 · ${esc(c.archived_at.slice(0, 10))} ${esc(nameOf(c.archived_by))}님이 보관했어요</div>` : ''}
    <div class="apinfo">
      <div><div class="k">의뢰번호</div><div class="v">${esc(apCaseNo(c))}</div></div>
      <div><div class="k">취급구분</div><div class="v">${esc(apTypeText(c))}</div></div>
      <div><div class="k">의뢰자</div><div class="v">${esc(nameOf(c.requester_email))}</div></div>
      <div><div class="k">의뢰일</div><div class="v">${esc(c.request_date)}</div></div>
      <div><div class="k">대출신청금액</div><div class="v">${c.loan_amount === null || c.loan_amount === undefined ? '-' : `${esc(apWon(c.loan_amount))}<div class="muted" style="font-weight:500">${Number(c.loan_amount).toLocaleString('ko-KR')}원</div>`}</div></div>
      <div><div class="k">알림 받는 사람</div><div class="v">${esc((c.notify_emails || []).map(nameOf).join(', ') || '없음')}</div></div>
    </div>
    ${c.memo ? `<div class="apsec"><div class="k">메모</div><div style="white-space:pre-wrap">${esc(c.memo)}</div></div>` : ''}
    <div class="apsec"><div class="k">물건 (${props.length}건${units.some(u => u.group) ? ' · 🔗 묶음은 가격을 한 번에 받아요' : ''})</div><div class="apm"><table class="apt"><thead><tr><th>#</th><th>구분</th><th>소재지</th><th>지목</th><th style="text-align:right">면적</th></tr></thead><tbody>${propRows || '<tr><td colspan="5" class="muted">등록된 물건이 없어요.</td></tr>'}</tbody></table></div></div>
    <div class="apsec"><div class="k">평가기관별 가격 ${can ? '· 기관별로 입력하고 저장하세요' : ''}</div>
      ${reqs.length && props.length ? `<div class="apm"><table class="apt"><thead><tr><th>물건</th>${head}</tr></thead><tbody>${body}<tr><td><b>전체금액만 입력</b><div class="muted">물건별 금액 없이 총액만 받은 경우</div></td>${tinp}</tr><tr class="tot"><td>합계</td>${tot}</tr><tr><td><b>특이사항</b><div class="muted">기관별 코멘트</div></td>${notes}</tr><tr><td></td>${save}</tr></tbody></table></div>` : '<div class="blk-empty">의뢰한 평가기관이나 물건이 없어요. 수정에서 추가해주세요.</div>'}
      ${can && c.chosen_firm_id ? '<div style="margin-top:8px"><button class="btn small" data-act="unchoose">채택 해제 (가격만 조회)</button></div>' : ''}
    </div>
    <div class="foot" style="margin-top:22px"><button class="btn" data-act="map">🗺 지도에서 보기</button><button class="btn" data-act="print">🖨 보고서 인쇄</button><button class="btn" data-act="fax">📠 감정평가 의뢰서 (팩스)</button>${can ? `<button class="btn" data-act="edit">✏ 수정</button><button class="btn" data-act="${c.archived_at ? 'unarchive' : 'archive'}">${c.archived_at ? '↩ 보관함에서 꺼내기' : '📦 보관함으로 이동'}</button>${(c.created_by === me || isAdmin()) ? '<button class="btn danger" data-act="del">삭제</button>' : ''}` : '<span class="muted">👀 감정평가 권한이 없어 보기만 할 수 있어요.</span>'}</div>`;
  draft.sort((a, b) => (a[0][0] === 't') - (b[0][0] === 't')).forEach(([k, val]) => {
    const inp = $('apDetailPanel').querySelector(`[data-k="${k}"]`);
    if (inp && !inp.disabled && inp.value !== val){ inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
$('apDetailPanel').addEventListener('input', (e) => {
  const inp = e.target.closest('input.amt, input.tamt'); if (!inp) return;
  inp.value = apComma(inp.value);
  inp.nextElementSibling.textContent = inp.value ? apWon(apNum(inp.value)) : '';
  const rid = inp.dataset.r, P = $('apDetailPanel');
  const items = [...P.querySelectorAll(`input.amt[data-r="${rid}"]`)], tin = P.querySelector(`input.tamt[data-r="${rid}"]`);
  const any = items.some(i => apNum(i.value) !== null);
  // 물건별 금액이 하나라도 있으면 합산이 우선(전체금액 칸은 잠김), 없으면 전체금액만 입력 가능
  tin.disabled = any || !apCan();
  if (any){ tin.value = ''; tin.nextElementSibling.textContent = ''; tin.placeholder = '물건별 입력의 합계가 적용됨'; } else tin.placeholder = '총액만 받은 경우';
  const sum = any ? items.reduce((s, i) => s + (apNum(i.value) || 0), 0) : (apNum(tin.value) || 0);
  P.querySelector(`[data-tot="${rid}"]`).textContent = apWon(sum);
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
  if (act === 'map') return apShowOnMap(c);
  if (act === 'print') return apPrint(c);
  if (act === 'fax') return apOpenFax(c);
  if (act === 'archive' || act === 'unarchive'){
    if (act === 'archive'){
      const wait = apReqs(c).filter(r => !apReqSum(r, apProps(c)).done).length;
      if (!confirm(wait ? `아직 가격이 입력되지 않은 평가기관이 ${wait}곳 있어요.\n그래도 보관함으로 옮길까요?` : `"${c.debtor_name}" 의뢰를 보관함으로 옮길까요?\n진행중 목록에서는 빠지고, 보관함에서 언제든 찾아볼 수 있어요.`)) return;
    }
    const { error } = await sb.from('appraisal_cases').update(act === 'archive' ? { archived_at: new Date().toISOString(), archived_by: me } : { archived_at: null, archived_by: null }).eq('id', c.id);
    if (error) return alert(error.message);
    apCloseDetail(); toast(act === 'archive' ? '📦 보관함으로 옮겼어요' : '↩ 진행중으로 꺼냈어요');
    return loadAppraisal();
  }
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
  const tval = apNum($('apDetailPanel').querySelector(`input.tamt[data-r="${rid}"]`).value);
  const totalAmount = up.length ? null : tval;                       // 물건별 입력이 있으면 합산 사용, 총액은 비움
  const note = $('apDetailPanel').querySelector(`textarea.note[data-r="${rid}"]`).value.trim() || null;
  const changed = up.some(u => before.get(u.property_id) !== u.amount) || del.some(id => before.has(id)) || (totalAmount ?? null) !== (req.total_amount ?? null) || note !== (req.note ?? null);
  if (up.length){ const { error } = await sb.from('appraisal_prices').upsert(up, { onConflict: 'request_id,property_id' }); if (error) return alert(error.message); }
  if (del.length){ const { error } = await sb.from('appraisal_prices').delete().eq('request_id', rid).in('property_id', del); if (error) return alert(error.message); }
  const inDate = $('apDetailPanel').querySelector(`input.rcv[data-r="${rid}"]`).value || null;
  const recv = inDate || ((up.length === apUnits(props).length && up.length) || totalAmount !== null ? kstToday() : null);
  const { error: e2 } = await sb.from('appraisal_requests').update({ received_at: recv, total_amount: totalAmount, note }).eq('id', rid);
  if (e2) return alert(e2.message);
  if (changed && (up.length || totalAmount !== null || note)) sb.functions.invoke('task-notify', { body: { event: 'appraisal_priced', case_id: c.id, firm_id: req.firm_id } });
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
const apCoord = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
// 반환: { items: [{addr, road, pnu, lat, lng}], raw }
async function apSearchAddr(q){
  let raw = null;
  try {   // 1순위: 검색 API 2.0 (지번 주소 + 필지 고유번호)
    raw = await apJsonp(`https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&type=address&category=parcel&format=json&errorformat=json&key=${VWORLD_KEY}&domain=${encodeURIComponent(location.hostname)}&query=${encodeURIComponent(q)}`);
    const arr = raw && raw.response && raw.response.result && raw.response.result.items;
    if (arr && arr.length) return { raw, items: arr.map(it => ({ addr: (it.address && (it.address.parcel || it.address.road)) || '', road: (it.address && it.address.road) || '', pnu: it.id || '', lat: apCoord(it.point && it.point.y), lng: apCoord(it.point && it.point.x) })).filter(x => x.addr) };
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
function apOpenForm(id, prefill){
  if (!apCan()) return alert('감정평가에 등록할 권한이 없어요. 관리자에게 문의해주세요.');
  apFormId = id || null;
  const c = id ? apCases.find(x => x.id === id) : null;
  const props = c ? apProps(c) : [], have = new Set(c ? c.appraisal_requests.map(r => r.firm_id) : []);
  const notify = new Set(c ? c.notify_emails : [me]);
  $('apFormPanel').innerHTML = `
    <div class="ph"><h2>${c ? '감정평가 의뢰 수정' : '새 감정평가 의뢰'}</h2><button class="x" data-act="close">✕</button></div>
    <label>본점 / 지점 <span style="color:var(--danger)">*</span></label>
    <div class="checks" id="apfScope">${['본점', '지점'].map(v => `<label><input type="radio" name="apfScopeR" value="${v}" ${c && c.scope === v ? 'checked' : ''}/> ${v}</label>`).join('')}</div>
    <label>취급구분 <span style="color:var(--danger)">*</span></label>
    <div class="checks" id="apfType">${AP_TYPES.map(v => `<label><input type="radio" name="apfTypeR" value="${v}" ${c && c.handling_type === v ? 'checked' : ''}/> ${v}</label>`).join('')}</div>
    <input id="apfTypeNote" maxlength="100" placeholder="기타 사유를 입력하세요 (필수)" style="margin-top:8px;display:none" />
    <div class="row">
      <div><label>채무자 (예정자) <span style="color:var(--danger)">*</span></label><input id="apfDebtor" maxlength="60" placeholder="이름" /></div>
      <div><label>의뢰자 (자동)</label><input id="apfReq" disabled /></div>
    </div>
    <div class="row">
      <div><label>의뢰일</label><input id="apfDate" type="date" /></div>
      <div><label>대출신청금액 (원)</label><input id="apfLoan" inputmode="numeric" placeholder="원 단위" /><div class="apst" id="apfLoanHint"></div></div>
    </div>
    <div class="apsec"><div class="k">물건 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">· 소재지는 검색 결과에서 선택한 주소만 입력됩니다</span></div>
      <div id="apfProps"></div>
      <button class="btn small" id="apfAddProp" type="button">＋ 물건 추가</button></div>
    <div class="apsec"><div class="k">평가기관 (의뢰할 곳 체크)</div><div class="checks" id="apFirmList">${apFirms.filter(f => f.active || have.has(f.id)).map(f => `<label><input type="checkbox" value="${f.id}" ${have.has(f.id) ? 'checked' : ''}/> ${esc(f.name)}</label>`).join('')}</div></div>
    <div class="apsec"><div class="k">알림 받을 사람 (체크한 사람에게만 텔레그램)</div><div class="checks" id="apNotifyList">${members.filter(m => m.is_admin || m.perm_appraisal || notify.has(m.email)).map(m => `<label><input type="checkbox" value="${esc(m.email)}" ${notify.has(m.email) ? 'checked' : ''}/> ${esc(m.name)}</label>`).join('')}</div></div>
    <label>메모 (선택)</label><textarea id="apfMemo" rows="2"></textarea>
    <div class="acts" style="margin-top:20px"><button class="btn primary" id="apfSave" style="min-height:44px;padding:8px 28px">저장</button><button class="btn" data-act="close" style="min-height:44px">취소</button></div>`;
  $('apfTypeNote').value = c ? (c.handling_note || '') : ''; apTypeSync();
  $('apfDebtor').value = c ? c.debtor_name : '';
  $('apfReq').value = nameOf(c ? c.requester_email : me); $('apfDate').value = c ? c.request_date : kstToday(); $('apfLoan').value = c && c.loan_amount !== null && c.loan_amount !== undefined ? Number(c.loan_amount).toLocaleString('ko-KR') : ''; apLoanHint(); $('apfMemo').value = c ? (c.memo || '') : '';
  (props.length ? props : [null]).forEach(p => apAddPropBlock(p));
  if (prefill && !c){ const b0 = document.querySelector('#apfProps .apblock'); b0.querySelector('.pq').value = prefill.addr; apApplyAddress(b0, prefill); }
  $('apFormOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('apfDebtor').focus(); } catch (e) {} }, 50);
}
function apLoanHint(){ const n = apNum($('apfLoan').value); $('apfLoanHint').textContent = n === null ? '' : apWon(n); }
function apTypeSync(){
  const t = document.querySelector('input[name=apfTypeR]:checked');
  $('apfTypeNote').style.display = t && t.value === '기타' ? 'block' : 'none';
}
function apCloseForm(){ $('apFormOv').style.display = 'none'; apFormId = null; document.body.style.overflow = $('apDetailOv').style.display === 'block' ? 'hidden' : ''; }
function apRenumber(){ document.querySelectorAll('#apfProps .apblock').forEach((b, i) => { b.querySelector('.bn').textContent = `물건 ${i + 1}`; }); }
function apKindSync(blk){
  const k = AP_KINDS[blk.querySelector('.pk').value];
  blk.querySelector('.lwc').style.display = k.land ? '' : 'none';
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
    <div class="grid3"><div><label>지목</label><input class="pj" list="apJimokDl" /></div><div class="lwc"><label>대지면적 (㎡)</label><input class="pl" inputmode="decimal" /></div><div><label class="la">면적</label><input class="pr" inputmode="decimal" /></div><div class="gwc"><label title="같은 묶음으로 고른 물건은 감정평가기관이 가격을 한 번에 불러줘요">가격 묶음</label><select class="pg"><option value="">개별</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">묶음 ${n}</option>`).join('')}</select></div><div><label class="ld">비고</label><input class="pd" maxlength="80" /></div></div>`;
  $('apfProps').appendChild(blk);
  if (!$('apJimokDl')){ const dl = document.createElement('datalist'); dl.id = 'apJimokDl'; dl.innerHTML = AP_JIMOK.map(j => `<option value="${j}">`).join(''); document.body.appendChild(dl); }
  if (p){
    blk.querySelector('.pk').value = p.kind; blk.querySelector('.pa').value = p.address; blk.dataset.verified = '1'; blk.dataset.pnu = p.pnu || ''; blk.dataset.lat = p.lat ?? ''; blk.dataset.lng = p.lng ?? '';
    blk.querySelector('.pj').value = p.jimok || ''; blk.querySelector('.pl').value = p.land_area === null || p.land_area === undefined ? '' : p.land_area; blk.querySelector('.pr').value = p.area === null ? '' : p.area; blk.querySelector('.pg').value = p.group_no ?? ''; blk.querySelector('.pd').value = p.detail || '';
  }
  apKindSync(blk); apRenumber();
}
$('apFormPanel').addEventListener('input', (e) => { if (e.target.id === 'apfLoan'){ e.target.value = apComma(e.target.value); apLoanHint(); } });
$('apFormPanel').addEventListener('change', (e) => { if (e.target.matches('input[name=apfTypeR]')){ apTypeSync(); if (e.target.value === '기타') $('apfTypeNote').focus(); } if (e.target.matches('.pk')) apKindSync(e.target.closest('.apblock')); });
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
    blk.querySelector('.apres').style.display = 'none'; blk.querySelector('.apres').innerHTML = '';
    return apApplyAddress(blk, { addr: el.dataset.addr, pnu: el.dataset.pnu || '', lat: apCoord(el.dataset.lat), lng: apCoord(el.dataset.lng) });
  }
});
const apNorm = (t) => String(t || '').replace(/\s+/g, '');
// 같은 필지(PNU 또는 주소 일치)의 기존 기록
function apSameRecords(pnu, addr, excludeCid){
  const out = [];
  apCases.forEach(c => { if (c.id === excludeCid) return; const hit = apProps(c).find(p => (pnu && p.pnu && p.pnu === pnu) || (addr && apNorm(p.address) === apNorm(addr))); if (hit) out.push({ c, p: hit }); });
  return out.sort((a, b) => String(b.c.request_date).localeCompare(String(a.c.request_date)));
}
function apCaseMoney(c){
  const props = apProps(c), reqs = apReqs(c), ch = reqs.find(r => r.firm_id === c.chosen_firm_id);
  if (ch && apReqSum(ch, props).mode !== 'none') return `채택 ${apFirmName(ch.firm_id)} ${apWon(apReqSum(ch, props).total)}`;
  const t = reqs.map(r => apReqSum(r, props)).filter(x => x.done).map(x => x.total);
  if (!t.length) return '가격 미접수';
  const mn = Math.min(...t), mx = Math.max(...t);
  return mn === mx ? apWon(mn) : `${apWon(mn)} ~ ${apWon(mx)}`;
}
async function apApplyAddress(blk, a){
  const st = blk.querySelector('.apst');
  blk.querySelector('.pa').value = a.addr; blk.dataset.verified = '1'; blk.dataset.pnu = a.pnu || '';
  blk.dataset.lat = a.lat ?? ''; blk.dataset.lng = a.lng ?? '';
  st.className = 'apst ok'; st.textContent = '✔ 확인된 주소입니다. 지목·면적을 조회하는 중…';
  const dup = apSameRecords(a.pnu, a.addr, apFormId);
  const dupHtml = dup.length ? `<div class="apdup">⚠ 이 필지에 기존 감정평가 기록이 ${dup.length}건 있어요 — ${dup.slice(0, 3).map(d => `${esc(d.c.request_date)} ${esc(d.c.scope)} ${esc(apTypeText(d.c))} · ${esc(apCaseMoney(d.c))}`).join(' / ')}${dup.length > 3 ? ' …' : ''}</div>` : '';
  const land = await apLookupLand(a.pnu);
  const kind = blk.querySelector('.pk').value, filled = [];
  const setIf = (sel, v, label) => { if (v !== '' && v !== null && !blk.querySelector(sel).value){ blk.querySelector(sel).value = v; filled.push(label); } };
  setIf('.pj', land.jimok, '지목');
  if (kind === '토지') setIf('.pr', land.area ?? '', '면적'); else if (kind === '건물') setIf('.pl', land.area ?? '', '대지면적');
  st.className = 'apst ok';
  st.innerHTML = (filled.length ? `✔ 확인된 주소 · ${filled.join('·')} 자동 입력됨 (다르면 직접 고쳐주세요)` : `✔ 확인된 주소 · 지목·면적은 자동조회가 되지 않아 직접 입력해주세요${land.note ? ` (${esc(land.note)})` : ''}`) + dupHtml;
}
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
  res.innerHTML = items.map(it => `<div class="it" data-addr="${esc(it.addr)}" data-pnu="${esc(it.pnu)}" data-lat="${it.lat ?? ''}" data-lng="${it.lng ?? ''}">${esc(it.addr)}${it.road ? `<small>${esc(it.road)}</small>` : ''}</div>`).join('');
}
async function apSaveForm(){
  const scope = (document.querySelector('input[name=apfScopeR]:checked') || {}).value, debtor = $('apfDebtor').value.trim();
  const htype = (document.querySelector('input[name=apfTypeR]:checked') || {}).value, hnote = $('apfTypeNote').value.trim();
  if (!scope) return alert('본점 / 지점 중 하나를 선택해주세요.');
  if (!htype) return alert('취급구분(신규대출 / 기한연장 / 채권관리 / 기타)을 선택해주세요.');
  if (htype === '기타' && !hnote) return alert('기타를 선택했어요. 사유를 입력해주세요.');
  if (!debtor) return alert('채무자(예정자) 이름을 입력해주세요.');
  const blocks = [...document.querySelectorAll('#apfProps .apblock')];
  const props = [];
  for (const [i, b] of blocks.entries()){
    const kind = b.querySelector('.pk').value, addr = b.querySelector('.pa').value.trim(), jimok = b.querySelector('.pj').value.trim(), areaS = b.querySelector('.pr').value.trim();
    if (!addr || b.dataset.verified !== '1') return alert(`물건 ${i + 1}: 소재지를 검색해서 확인된 주소를 선택해주세요.`);
    if (kind === '토지' && !jimok) return alert(`물건 ${i + 1}: 지목을 입력해주세요.`);
    const area = areaS === '' ? null : Number(areaS.replace(/,/g, ''));
    if (area === null || isNaN(area) || area <= 0) return alert(`물건 ${i + 1}: ${kind === '건물' ? '건물면적' : '면적'}(㎡)을 숫자로 입력해주세요.`);
    let landArea = null;
    if (kind === '건물'){
      landArea = Number(b.querySelector('.pl').value.trim().replace(/,/g, ''));
      if (!landArea || isNaN(landArea) || landArea <= 0) return alert(`물건 ${i + 1}: 대지면적(㎡)을 숫자로 입력해주세요.`);
    }
    props.push({ id: b.dataset.id ? +b.dataset.id : null, seq: i + 1, kind, address: addr, pnu: b.dataset.pnu || null, lat: b.dataset.lat ? Number(b.dataset.lat) : null, lng: b.dataset.lng ? Number(b.dataset.lng) : null, jimok: jimok || null, area, land_area: landArea, group_no: b.querySelector('.pg').value ? Number(b.querySelector('.pg').value) : null, detail: b.querySelector('.pd').value.trim() || null });
  }
  const gcount = new Map(); props.forEach(p => { if (p.group_no) gcount.set(p.group_no, (gcount.get(p.group_no) || 0) + 1); });
  for (const [g, n] of gcount) if (n < 2) return alert(`가격 묶음 ${g}에 물건이 하나뿐이에요. 같은 묶음으로 고른 물건이 2개 이상이어야 해요. 묶음을 풀거나 다른 물건도 같은 묶음으로 선택해주세요.`);
  const firms = [...document.querySelectorAll('#apFirmList input:checked')].map(i => +i.value);
  const notify = [...document.querySelectorAll('#apNotifyList input:checked')].map(i => i.value);
  const patch = { scope, handling_type: htype, handling_note: htype === '기타' ? hnote : null, debtor_name: debtor, request_date: $('apfDate').value || kstToday(), loan_amount: apNum($('apfLoan').value), memo: $('apfMemo').value.trim() || null, notify_emails: notify };
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
      // 묶음 구성이 바뀌면 그 물건들에 입력된 가격은 의미가 달라지므로 지운다(확인 후)
      const oldG = new Map(apProps(c).map(p => [p.id, p.group_no ?? null]));
      const chg = props.filter(p => p.id && (oldG.get(p.id) ?? null) !== (p.group_no ?? null));
      const gs = new Set(); chg.forEach(p => { if (oldG.get(p.id)) gs.add(oldG.get(p.id)); if (p.group_no) gs.add(p.group_no); });
      const affected = new Set(chg.map(p => p.id));
      props.forEach(p => { if (p.id && ((p.group_no && gs.has(p.group_no)) || (oldG.get(p.id) && gs.has(oldG.get(p.id))))) affected.add(p.id); });
      const priced = c.appraisal_requests.some(rq => (rq.appraisal_prices || []).some(pr => affected.has(pr.property_id)));
      if (affected.size && priced && !confirm('가격 묶음을 바꾸면 관련 물건에 입력된 평가기관 가격이 지워져요. 계속할까요?')) return;
      c.__clearPrices = priced ? [...affected] : [];
      let err = (await sb.from('appraisal_cases').update(upd).eq('id', cid)).error;
      const oldIds = apProps(c).map(p => p.id), keep = props.filter(p => p.id).map(p => p.id);
      const gone = oldIds.filter(i => !keep.includes(i));
      if (!err && gone.length) err = (await sb.from('appraisal_properties').delete().in('id', gone)).error;
      for (const p of props.filter(p => p.id)){ if (err) break; const { id, ...rest } = p; err = (await sb.from('appraisal_properties').update(rest).eq('id', id)).error; }
      const news = props.filter(p => !p.id);
      if (!err && news.length) err = (await sb.from('appraisal_properties').insert(news.map(({ id, ...p }) => ({ ...p, case_id: cid })))).error;
      if (!err && c.__clearPrices && c.__clearPrices.length) err = (await sb.from('appraisal_prices').delete().in('property_id', c.__clearPrices)).error;
      delete c.__clearPrices;
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
  box.innerHTML = `<div class="checks" style="gap:8px">${apFirms.map(f => `<span class="afc ${f.active ? 'ok' : ''}" style="padding:5px 10px" data-f="${f.id}">${esc(f.name)}${f.fax ? ` <span style="font-weight:500">· 📠 ${esc(f.fax)}</span>` : ''}
      <a href="#" data-fa="fax" style="margin-left:6px;font-weight:600;color:inherit">${f.fax ? '팩스 수정' : '팩스 입력'}</a>
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
  if (a.dataset.fa === 'fax'){
    const v = prompt(`${f.name}의 팩스번호를 입력하세요 (비우면 삭제)`, f.fax || '');
    if (v === null) return;
    const { error } = await sb.from('appraisal_firms').update({ fax: v.trim().slice(0, 30) }).eq('id', id);
    if (error) return alert(error.message);
  } else if (a.dataset.fa === 'toggle'){
    const { error } = await sb.from('appraisal_firms').update({ active: !f.active }).eq('id', id);
    if (error) return alert(error.message);
  } else {
    if (!confirm(`${f.name} 평가기관을 삭제할까요?`)) return;
    const { error } = await sb.from('appraisal_firms').delete().eq('id', id);
    if (error) return alert(error.code === '23503' ? '이미 의뢰 내역이 있어 삭제할 수 없어요. "숨김"을 사용해주세요.' : error.message);
  }
  loadAppraisal();
});


// ---------- 보고서 인쇄 ----------
function apReportHtml(c){
  const props = apProps(c), reqs = apReqs(c), n = (v) => Number(v).toLocaleString('ko-KR');
  const sums = reqs.map(r => apReqSum(r, props));
  const chosenIdx = reqs.findIndex(r => r.firm_id === c.chosen_firm_id);
  const num = (v) => (v === null || v === undefined || v === '') ? '-' : n(v);
  const nameOfFirm = (r) => apFirmName(r.firm_id);
  const propRows = props.map((p, i) => `<tr><td class="c nw">${i + 1}</td><td class="c nw">${esc(p.kind)}</td><td>${esc(p.address)}${p.detail ? ` <span class="m">(${esc(p.detail)})</span>` : ''}</td><td class="c nw">${esc(p.jimok || '-')}</td>
    <td class="r nw">${p.kind === '건물' ? num(p.land_area) : (p.kind === '토지' ? num(p.area) : '-')}</td><td class="r nw">${p.kind === '토지' ? '-' : num(p.area)}</td></tr>`).join('');
  const many = reqs.length > 4;
  const head = reqs.map((r, i) => `<th class="nw ${i === chosenIdx ? 'sel' : ''}">${esc(nameOfFirm(r))}${i === chosenIdx ? ' ★' : ''}</th>`).join('');
  const body = apUnits(props).map(u => `<tr><td>${u.group ? `${esc(apNos(u))}. ${u.members.map(m => esc(m.address)).join(' / ')} <span class="m">(일괄)</span>` : `${u.nos[0]}. ${esc(u.members[0].address)}`}</td>${reqs.map((r, k) => { const v = sums[k].map.get(u.key); return `<td class="r nw ${k === chosenIdx ? 'sel' : ''}">${v === undefined ? '-' : n(v)}</td>`; }).join('')}</tr>`).join('');
  const total = reqs.map((r, k) => `<td class="r nw b ${k === chosenIdx ? 'sel' : ''}">${sums[k].mode === 'none' ? '-' : n(sums[k].total)}${sums[k].mode === 'total' ? ' *' : ''}</td>`).join('');
  const recv = reqs.map((r, k) => `<td class="c nw ${k === chosenIdx ? 'sel' : ''}">${esc(r.received_at || '-')}</td>`).join('');
  const hasNote = reqs.some(r => r.note);
  const notes = reqs.map((r, k) => `<td class="${k === chosenIdx ? 'sel' : ''}">${esc(r.note || '')}</td>`).join('');
  const foot = [sums.some(s => s.mode === 'total') && '* 물건별 금액 없이 총액만 접수한 평가기관입니다.', chosenIdx >= 0 && '★ 채택한 평가기관입니다.'].filter(Boolean).join('　');
  const ch = chosenIdx >= 0 ? sums[chosenIdx] : null;
  const priced = sums.filter(s => s.mode !== 'none').map(s => s.total);
  const summary = ch && ch.mode !== 'none'
    ? `채택: <b>${esc(nameOfFirm(reqs[chosenIdx]))}</b> — 평가금액 합계 <b>${n(ch.total)}원</b> (${esc(apWon(ch.total))})`
    : priced.length ? `채택 없음 (가격 조회용) — 평가금액 ${n(Math.min(...priced))}원 ~ ${n(Math.max(...priced))}원` : '평가금액 미접수';
  const css = `@page{size:A4;margin:15mm 13mm}*{box-sizing:border-box}body{font-family:${AP_FONT};color:#111;font-size:12px;line-height:1.45;margin:0}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}.top .ttl{flex:1;text-align:center;padding-top:6px}.top .sp{width:190px}
  h1{font-size:22px;margin:0 0 4px;letter-spacing:2px}.sub{color:#555;font-size:12px}
  .sign{border-collapse:collapse;width:190px;table-layout:fixed}.sign td,.sign th{border:1px solid #333;text-align:center;font-size:11px;padding:0}.sign th{height:20px;background:#f3f3f3}.sign td{height:46px}
  h2{font-size:14px;margin:18px 0 6px;padding-left:8px;border-left:4px solid #333}.h2u{display:flex;justify-content:space-between;align-items:baseline}.h2u .unit{font-size:12px;font-weight:400;color:#444}
  table.t{width:100%;border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:5px 8px;vertical-align:middle;word-break:keep-all}
  table.t th{background:#eee;font-weight:700;text-align:center}table.t td.k{background:#f3f3f3;font-weight:700;text-align:center;white-space:nowrap;width:1%}
  .nw{white-space:nowrap}.r{text-align:right}.c{text-align:center}.b{font-weight:700}.m{color:#666;font-size:11px;font-weight:400}.sel{background:#fff6d6 !important}
  .box{border:2px solid #333;padding:9px 12px;margin-top:14px;font-size:13px}tr{page-break-inside:avoid}
  .note{margin-top:5px;color:#555;font-size:11px}.foot{margin-top:18px;color:#666;font-size:10.5px;text-align:right}
  ${many ? 'table.price th,table.price td{font-size:11px;padding:4px 5px}' : ''}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>감정평가 결과 보고서 - ${esc(c.debtor_name)}</title>${AP_FONT_LINK}<style>${css}</style></head><body>
  <div class="top"><div class="sp"></div><div class="ttl"><h1>감정평가 결과 보고서</h1><div class="sub">${esc(c.scope)}${c.handling_type ? ` · ${esc(c.handling_type === '기타' && c.handling_note ? `기타(${c.handling_note})` : c.handling_type)}` : ''}</div></div>
  <table class="sign"><tr><th>담당</th><th>과장</th><th>상무</th></tr><tr><td></td><td></td><td></td></tr></table></div>
  <table class="t"><tr><td class="k">채무자(예정자)</td><td>${esc(c.debtor_name)}</td><td class="k">구분</td><td>${esc(c.scope)}</td></tr>
  <tr><td class="k">취급구분</td><td>${esc(apTypeText(c))}</td><td class="k">대출신청금액</td><td>${c.loan_amount === null || c.loan_amount === undefined ? '-' : `${n(c.loan_amount)}원 <span class="m">(${esc(apWon(c.loan_amount))})</span>`}</td></tr>
  <tr><td class="k">의뢰자</td><td>${esc(nameOf(c.requester_email))}</td><td class="k">의뢰일</td><td>${esc(c.request_date)}</td></tr>
  ${c.memo ? `<tr><td class="k">메모</td><td colspan="3" style="white-space:pre-wrap">${esc(c.memo)}</td></tr>` : ''}</table>
  <h2>1. 물건 내역 (${props.length}건)</h2>
  <table class="t"><thead><tr><th class="nw">번호</th><th class="nw">구분</th><th>소재지</th><th class="nw">지목</th><th class="nw">대지·토지(㎡)</th><th class="nw">건물·전용(㎡)</th></tr></thead><tbody>${propRows}</tbody></table>
  <h2 class="h2u"><span>2. 평가기관별 평가금액</span><span class="unit">(단위: 원)</span></h2>
  ${reqs.length ? `<table class="t price"><thead><tr><th>물건</th>${head}</tr></thead><tbody>${body}<tr><td class="b">합계</td>${total}</tr><tr><td class="b nw">가격 수령일</td>${recv}</tr>${hasNote ? `<tr><td class="b nw">특이사항</td>${notes}</tr>` : ''}</tbody></table>${foot ? `<div class="note">${foot}</div>` : ''}` : '<div>의뢰한 평가기관이 없습니다.</div>'}
  <div class="box">${summary}</div>
  </body></html>`;
}
function apPrint(c){ apPreview(apReportHtml(c), '결과 보고서', `보고서_${apCaseNo(c)}`); }


// ---------- 감정평가 의뢰서 (팩스용) ----------
const apFmt2 = (v) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AP_FAX_ROWS = 20;   // 한 장에 들어가는 물건 줄 수 (넘으면 다음 장으로, 장마다 머리글 반복)
function apFaxPage(c, firm, purpose){
  const props = apProps(c), st = apSettings[c.scope] || { org_name: '', staff_text: '', contact_text: '' };
  const org = st.org_name || '', rows = [];
  props.forEach(p => {
    if (p.kind === '건물'){
      rows.push({ addr: p.address, jimok: p.jimok || '', area: p.land_area, land: true, note: '' });
      rows.push({ addr: p.address, jimok: '건물', area: p.area, land: false, note: p.detail || '' });
    } else rows.push({ addr: p.address, jimok: p.kind === '집합건물' ? '집합건물' : (p.jimok || ''), area: p.area, land: p.kind === '토지', note: p.detail || '' });
  });
  const landSum = rows.filter(r => r.land && r.area).reduce((s, r) => s + Number(r.area), 0);
  const bldSum = rows.filter(r => !r.land && r.area).reduce((s, r) => s + Number(r.area), 0);
  const chunks = []; for (let k = 0; k < rows.length; k += AP_FAX_ROWS) chunks.push(rows.slice(k, k + AP_FAX_ROWS));
  if (!chunks.length) chunks.push([]);
  const total = chunks.length, logo = new URL('logo-sj.png', location.href).href;
  const to = firm ? `<div class="to">수 신 : <b>${esc(firm.name)}</b> 귀중${firm.fax ? ` <span class="fx">(팩스 ${esc(firm.fax)})</span>` : ''}</div>` : '';
  return chunks.map((chunk, pi) => {
    const last = pi === total - 1;
    const body = chunk.map((r, i) => `<tr><td class="c">${pi * AP_FAX_ROWS + i + 1}</td><td>${esc(r.addr)}</td><td class="c">${esc(r.jimok)}</td><td class="r">${r.area === null || r.area === undefined ? '' : apFmt2(r.area)}</td><td class="c">${esc(r.note)}</td></tr>`).join('');
    return `<div class="page">
    <div class="hd"><h1>탁상감정의뢰서</h1><img class="logo" src="${logo}" alt="${esc(org)}"></div>
    ${to}
    <table class="info">
      <tr><th><span>의뢰번호</span></th><td>${esc(apCaseNo(c))}</td></tr>
      <tr><th><span class="l3">발신자</span></th><td>${esc(org)}(${esc(c.scope)})</td></tr>
      <tr><th><span>의뢰일자</span></th><td>${esc(c.request_date)}</td></tr>
      <tr><th><span class="l3">담당자</span></th><td>${esc(st.staff_text || nameOf(c.requester_email))}</td></tr>
      <tr><th><span class="l3">연락처</span></th><td>${esc(st.contact_text || '')}</td></tr>
    </table>
    <table class="items"><thead><tr><th style="width:8%">기호</th><th>소재지</th><th style="width:13%">지목</th><th style="width:17%">면적(㎡)</th><th style="width:20%">비고</th></tr></thead><tbody>${body}${last ? `
      <tr class="sum"><td></td><td class="c">${bldSum ? '합 계 (토지)' : '합  계'}</td><td></td><td class="r">${apFmt2(landSum)}</td><td></td></tr>
      ${bldSum ? `<tr class="sum"><td></td><td class="c">합 계 (건물·전용)</td><td></td><td class="r">${apFmt2(bldSum)}</td><td></td></tr>` : ''}` : ''}</tbody></table>
    ${last && purpose ? `<div class="purpose">${esc(purpose)}</div>` : ''}
    ${!last ? '<div class="cont">※ 다음 장에 계속됩니다.</div>' : ''}
    <div class="pg">- ${pi + 1} / ${total} -</div></div>`;
  }).join('');
}
function apOpenFax(c){
  const reqs = apReqs(c), st = apSettings[c.scope] || {};
  const miss = !st.staff_text && !st.contact_text;
  $('apFaxPanel').innerHTML = `<div class="ph"><h2>📠 감정평가 의뢰서 (팩스)</h2><button class="x" data-fx="close">✕</button></div>
    <div class="apsec" style="margin-top:6px"><div class="k">수신처 (체크한 기관마다 의뢰서가 기관마다 따로 인쇄되고, 물건이 많으면 여러 장으로 나뉩니다)</div>
      ${reqs.length ? `<div class="checks" id="apFaxFirms">${reqs.map(r => `<label><input type="checkbox" value="${r.firm_id}" checked/> ${esc(apFirmName(r.firm_id))}</label>`).join('')}</div>` : ''}
      <div class="checks" style="margin-top:6px"><label><input type="checkbox" id="apFaxNoTo" ${reqs.length ? '' : 'checked'}/> 수신처 없이 인쇄 (수신 표시 없이 1장)</label></div></div>
    <label>특이사항 (선택)</label><textarea id="apFaxPurpose" rows="3" maxlength="300" placeholder="평가의뢰서에 입력할 내용을 기재하세요"></textarea>
    <div class="apsec"><div class="k">${esc(c.scope)} 회신 연락처</div>
      <div style="font-size:14px">${esc(st.org_name || '')}(${esc(c.scope)})<br>담당자: ${esc(st.staff_text || nameOf(c.requester_email))}<br>연락처: ${esc(st.contact_text || '-')}</div>
      ${miss ? `<div class="apst bad" style="margin-top:6px">${esc(c.scope)} 회신 연락처가 아직 등록되지 않았어요. 관리자 화면 → "의뢰서 회신 연락처"에서 입력해주세요.</div>` : '<div class="muted" style="margin-top:4px">바꾸려면 관리자 화면 → "의뢰서 회신 연락처"</div>'}</div>
    <div class="acts" style="margin-top:18px"><button class="btn primary" data-fx="print" style="min-height:44px;padding:8px 26px">🖨 인쇄</button><button class="btn" data-fx="close" style="min-height:44px">취소</button></div>`;
  $('apFaxPanel').dataset.cid = c.id;
  document.querySelectorAll('#apFaxFirms input').forEach(i => { i.disabled = $('apFaxNoTo').checked; });
  $('apFaxOv').style.display = 'block';
}
$('apFaxPanel').addEventListener('change', (e) => { if (e.target.id === 'apFaxNoTo') document.querySelectorAll('#apFaxFirms input').forEach(i => { i.disabled = e.target.checked; }); });
function apCloseFax(){ $('apFaxOv').style.display = 'none'; }
$('apFaxPanel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fx]'); if (!b) return;
  if (b.dataset.fx === 'close') return apCloseFax();
  const c = apCases.find(x => x.id === +$('apFaxPanel').dataset.cid); if (!c) return;
  const noTo = $('apFaxNoTo').checked;
  const ids = noTo ? [] : [...document.querySelectorAll('#apFaxFirms input:checked')].map(i => +i.value);
  if (!noTo && !ids.length) return alert('수신처를 하나 이상 체크하거나, "수신처 없이 인쇄"를 체크해주세요.');
  const purpose = $('apFaxPurpose').value.trim();
  const pages = ids.length ? ids.map(id => apFaxPage(c, apFirms.find(f => f.id === id) || { name: apFirmName(id), fax: '' }, purpose)) : [apFaxPage(c, null, purpose)];
  apPreview(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>탁상감정의뢰서 - ${esc(c.debtor_name)}</title>${AP_FONT_LINK}<style>
  @page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{font-family:${AP_FONT};color:#000;font-size:14px;margin:0}
  .page{page-break-after:always}.page:last-child{page-break-after:auto}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px}h1{font-size:30px;margin:0;display:inline-block;border-bottom:3px solid #000;padding-bottom:2px;letter-spacing:1px}.logo{height:46px;width:auto}
  .to{font-size:15px;margin:2px 0 10px}
  table.info{border-collapse:collapse;margin-bottom:16px}table.info th{text-align:left;font-weight:700;padding:3px 22px 3px 0;white-space:nowrap;font-size:15px}table.info th span{display:block;width:4em;white-space:nowrap}table.info th span.l3{letter-spacing:.3334em}table.info td{padding:3px 0;font-size:15px}
  table.items{width:100%;border-collapse:collapse}table.items th,table.items td{border:1px solid #000;padding:4px 8px;white-space:nowrap}table.items td:nth-child(2){white-space:normal}
  table.items th{background:#fff;font-weight:700;text-align:center;border-bottom:2px solid #000}.c{text-align:center}.r{text-align:right}tr{page-break-inside:avoid}
  table.items tr.sum td{font-weight:700;border-top:2px solid #000}.to .fx{font-size:13px;color:#333}.pg{text-align:center;color:#444;font-size:12px;margin-top:16px}.cont{margin-top:8px;color:#444;font-size:12px;text-align:right}.purpose{margin-top:22px;font-size:15px;font-weight:700;white-space:pre-wrap}
  </style></head><body>${pages.join('')}</body></html>`, '탁상감정의뢰서', `의뢰서_${apCaseNo(c)}`);
  apCloseFax();
});
// ---------- 미리보기 / 인쇄 / 이미지 공유 (PC·휴대폰 공통) ----------
let apPvHtml = '', apPvName = '', apPvTitle = '';
(function(){
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="apPvOv" style="z-index:40;background:#6b7280;padding:0 0 30px">
    <div id="apPvBar" style="position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;padding-top:max(10px, env(safe-area-inset-top));background:#1f2937;color:#fff">
      <b id="apPvT" style="margin-right:auto;font-size:15px"></b>
      <button class="btn primary small" id="apPvPrint">🖨 인쇄</button>
      <button class="btn glass small" id="apPvShare">📤 이미지로 공유 (카톡 등)</button>
      <button class="btn glass small" id="apPvClose">✕ 닫기</button></div>
    <div id="apPvMsg" style="display:none;padding:8px 14px;background:#fff7d6;color:#7a4b00;font-size:13px"></div>
    <div id="apPvBox" style="overflow:hidden;margin:12px auto 0"><iframe id="apPvFrame" style="width:794px;border:0;background:#fff;transform-origin:0 0;display:block"></iframe></div></div>`;
  document.body.appendChild(d);
  $('apPvClose').onclick = apClosePv;
  $('apPvPrint').onclick = apPvPrint;
  $('apPvShare').onclick = apPvShare;
  window.addEventListener('resize', apPvFit);
})();
// 인쇄가 막히는 곳은 'iPhone/iPad 의 홈 화면 앱' 뿐이다. PC 에 설치한 앱(크롬·엣지)과 안드로이드는 인쇄가 된다
const apIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
const apStandalone = () => apIos() && (navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
function apPreview(html, title, name){
  apPvHtml = html; apPvTitle = title; apPvName = name; $('apPvT').textContent = `📄 ${title} 미리보기`;
  const inject = '<style>@media screen{html{background:#fff}body{width:794px;margin:0;padding:22px 42px;box-sizing:border-box}.page{padding-bottom:18px;margin-bottom:22px;border-bottom:1px dashed #aaa}.page:last-child{border-bottom:0}}</style>';
  const fr = $('apPvFrame'), sa = apStandalone();
  // 홈 화면에 추가한 웹앱(스탠드얼론)에서는 브라우저 인쇄가 막혀 있어서, 이미지 공유(공유창의 프린트·카카오톡)로 안내한다
  $('apPvPrint').style.display = sa ? 'none' : '';
  $('apPvShare').className = sa ? 'btn primary small' : 'btn glass small';
  $('apPvMsg').textContent = sa ? '홈 화면 앱에서는 바로 인쇄가 안 돼요. "이미지로 공유"를 누른 뒤 공유 창에서 프린트(인쇄) 또는 카카오톡을 선택하세요.' : '';
  $('apPvMsg').style.display = sa ? 'block' : 'none';
  fr.onload = () => { apPvFit(); try { fr.contentDocument.fonts.ready.then(apPvFit); } catch (e) {} };
  fr.srcdoc = html.replace('</head>', inject + '</head>');
  $('apPvOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  $('apPvOv').scrollTop = 0;
}
function apPvFit(){
  const fr = $('apPvFrame'); if (!fr.contentDocument || !fr.contentDocument.body) return;
  const k = Math.min(1, (window.innerWidth - 16) / 794), h = fr.contentDocument.documentElement.scrollHeight;
  fr.style.height = h + 'px'; fr.style.transform = `scale(${k})`;
  const box = $('apPvBox'); box.style.width = Math.round(794 * k) + 'px'; box.style.height = Math.round(h * k) + 'px';
}
function apClosePv(){ $('apPvOv').style.display = 'none'; $('apPvFrame').srcdoc = ''; document.body.style.overflow = ($('apDetailOv').style.display === 'block' || $('apFormOv').style.display === 'block') ? 'hidden' : ''; }
async function apPvPrint(){
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  if (!mobile){ try { await $('apPvFrame').contentDocument.fonts.ready; $('apPvFrame').contentWindow.focus(); $('apPvFrame').contentWindow.print(); return; } catch (e) {} }
  // 휴대폰: 화면 안의 iframe 은 인쇄가 안 되는 경우가 많아, 새 창에 열어서 인쇄한다
  const w = window.open('', '_blank');
  if (!w){ $('apPvMsg').textContent = '팝업이 차단돼서 인쇄 창을 열 수 없어요. 팝업을 허용하거나, "이미지로 공유"를 이용해주세요.'; $('apPvMsg').style.display = 'block'; return; }
  w.document.open(); w.document.write(apPvHtml); w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch (e) {} };
  setTimeout(() => { try { w.document.fonts.ready.then(go); } catch (e) { go(); } }, 400);
}
function apLoadH2C(){
  if (window.html2canvas) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/html2canvas.min.js?v=1'; s.onload = res; s.onerror = () => rej(new Error('이미지 도구를 불러오지 못했어요')); document.head.appendChild(s); });
}
async function apPvShare(){
  const btn = $('apPvShare'), msg = $('apPvMsg'), old = btn.textContent;
  btn.disabled = true; btn.textContent = '이미지 만드는 중…';
  try {
    await apLoadH2C();
    const fr = $('apPvFrame'), doc = fr.contentDocument;
    try { await doc.fonts.ready; } catch (e) {}
    let els = [...doc.querySelectorAll('.page')]; if (!els.length) els = [doc.body];
    const files = [];
    for (const [i, el] of els.entries()){
      const cv = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      files.push(new File([blob], `${apPvName}${els.length > 1 ? `_${i + 1}` : ''}.png`, { type: 'image/png' }));
    }
    if (navigator.canShare && navigator.canShare({ files })){
      try { await navigator.share({ files }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    files.forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); });
    msg.textContent = `이미지 ${files.length}장을 저장했어요. 사진/파일 앱에서 카카오톡으로 보내세요.`; msg.style.display = 'block';
  } catch (e) {
    msg.textContent = '이미지를 만들지 못했어요: ' + (e.message || e); msg.style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = old; }
}

// ---------- 관리자: 회신 연락처 ----------
function apRenderContacts(){
  const box = $('aContacts'); if (!box) return;
  box.innerHTML = ['본점', '지점'].map(sc => { const v = apSettings[sc] || {}; return `<div class="apblock" data-sc="${sc}"><div class="bh"><span>${sc}</span><button class="btn small primary" data-ac="save">저장</button></div>
    <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div><label>조합명</label><input class="ao" maxlength="40" value="${esc(v.org_name || '')}" placeholder="예: 춘천시산림조합" /></div>
      <div><label>담당자 표기</label><input class="as" maxlength="80" value="${esc(v.staff_text || '')}" placeholder="예: 정재훈 과장, 정다정 사원" /></div>
      <div><label>회신 연락처</label><input class="ac" maxlength="80" value="${esc(v.contact_text || '')}" placeholder="예: 사무실 033-252-1800 (내선2)" /></div></div></div>`; }).join('');
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ac=save]'); if (!b) return;
  const blk = b.closest('[data-sc]'), sc = blk.dataset.sc;
  const row = { scope: sc, org_name: blk.querySelector('.ao').value.trim(), staff_text: blk.querySelector('.as').value.trim(), contact_text: blk.querySelector('.ac').value.trim(), updated_at: new Date().toISOString() };
  b.disabled = true;
  const { error } = await sb.from('appraisal_settings').upsert(row, { onConflict: 'scope' });
  b.disabled = false;
  if (error) return alert('저장하지 못했어요: ' + error.message);
  apSettings[sc] = row; toast(`${sc} 회신 연락처를 저장했어요`);
});

// ---------- 지도: 기존 감정 기록 찾기 (브이월드 타일 + Leaflet) ----------
let apMap = null, apCluster = null, apTemp = null, apBase = null, apSat = null, apHyb = null, apCad = null, apFallback = null;
let apMapInitP = null, apMapFirst = true, apMapLast = null, apMarkers = {}, apTileErr = 0, apTileOk = 0;
const AP_CENTER = [37.8813, 127.7298];   // 춘천시청 부근 (기록이 없을 때)
const AP_STATE = { wait: '가격 대기', done: '가격 도착', sel: '채택 완료', arc: '보관' };

function apLoadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('지도 도구를 불러오지 못했어요')); document.head.appendChild(s); }); }
function apLoadCss(href){ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
function apLoadLeaflet(){
  if (window.L && L.markerClusterGroup) return Promise.resolve();
  if (!apMapInitP) apMapInitP = (async () => {
    ['vendor/leaflet.css?v=1', 'vendor/MarkerCluster.css?v=1', 'vendor/MarkerCluster.Default.css?v=1'].forEach(apLoadCss);
    await apLoadScript('vendor/leaflet.js?v=1'); await apLoadScript('vendor/leaflet.markercluster.js?v=1');
  })().catch(e => { apMapInitP = null; throw e; });
  return apMapInitP;
}
function apSetMain(v, quiet){
  apMainView = v === 'list' ? 'list' : 'map';
  if (!quiet){ try { localStorage.setItem('apMain', apMainView); } catch (e) {} }
  document.querySelectorAll('#apMain button').forEach(b => b.classList.toggle('on', b.dataset.m === apMainView));
  $('apMapWrap').style.display = apMainView === 'map' ? 'block' : 'none';
  $('apListWrap').style.display = apMainView === 'list' ? 'block' : 'none';
  if (apMainView === 'map') apMapEnsure();
}
async function apMapEnsure(){
  try { await apLoadLeaflet(); } catch (e) { $('apMapPanel').innerHTML = `<div class="apdup">${esc(e.message)} — 목록 화면을 이용해주세요.</div>`; return; }
  if ($('apMapWrap').style.display === 'none') return;
  if (!apMap) apMapCreate();
  apMap.invalidateSize();
  apMapRefresh();
}
function apMapCreate(){
  const key = VWORLD_KEY, tile = (layer, ext) => `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;
  apMap = L.map('apMapEl', { zoomControl: true, preferCanvas: true }).setView(AP_CENTER, 13);
  const opt = { maxZoom: 19, maxNativeZoom: 18, attribution: '© 브이월드(국토교통부)' };
  apBase = L.tileLayer(tile('Base', 'png'), opt).addTo(apMap);
  apSat = L.tileLayer(tile('Satellite', 'jpeg'), opt); apHyb = L.tileLayer(tile('Hybrid', 'png'), { ...opt, maxNativeZoom: 18 });
  apCad = L.tileLayer.wms('https://api.vworld.kr/req/wms', { layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', styles: 'lp_pa_cbnd_bubun_line,lp_pa_cbnd_bonbun_line', format: 'image/png', transparent: true, version: '1.3.0', key, domain: location.hostname, maxZoom: 19, opacity: .9 });
  apCad.addTo(apMap);
  // 브이월드 타일이 계속 실패하면(키·도메인 문제 등) 기본 지도로 대체
  [apBase, apSat].forEach(l => { l.on('tileload', () => { apTileOk++; }); l.on('tileerror', () => { apTileErr++; if (apTileErr >= 6 && !apTileOk && !apFallback) apMapFallback(); }); });
  apCluster = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false }); apMap.addLayer(apCluster);
  apMap.on('click', () => { /* 지도 빈 곳 클릭: 아무 동작 없음 */ });
}
function apMapFallback(){
  apFallback = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(apMap);
  apFallback.bringToBack();
  $('apMnote').textContent = '⚠ 브이월드 지도를 불러오지 못해 기본 지도로 표시 중이에요 (인증키·도메인 등록 확인 필요).';
}
function apCaseState(c){
  if (c.archived_at) return 'arc';
  const props = apProps(c), reqs = apReqs(c), ch = reqs.find(r => r.firm_id === c.chosen_firm_id);
  if (ch && apReqSum(ch, props).mode !== 'none') return 'sel';
  return reqs.some(r => apReqSum(r, props).done) ? 'done' : 'wait';
}
function apMapRefresh(){
  if (!apMap || !apCluster) return;
  apCluster.clearLayers(); apMarkers = {};
  const withArc = $('apMarch').checked; let missing = 0, latest = null;
  apCases.forEach(c => {
    if (c.archived_at && !withArc) return;
    const props = apProps(c), st = apCaseState(c);
    props.forEach((p, i) => {
      if (p.lat === null || p.lat === undefined || p.lng === null || p.lng === undefined){ missing++; return; }
      const icon = L.divIcon({ className: 'apin-wrap', html: `<div class="apin s-${st}"><b>${props.length > 1 ? i + 1 : ''}</b></div>`, iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24] });
      const m = L.marker([p.lat, p.lng], { icon }).bindPopup(apPopupHtml(c, p, i, props.length, st));
      apCluster.addLayer(m); (apMarkers[c.id] = apMarkers[c.id] || []).push(m);
      if (!latest || c.id > latest.c.id) latest = { c, p };
    });
  });
  const note = $('apMnote');
  if (!apFallback) note.textContent = missing ? `⚠ 좌표가 없는 물건 ${missing}개는 지도에 표시되지 않아요 (관리자 화면 → 지도 좌표 채우기)` : '';
  if (apMapFirst && latest){
    apMapFirst = false;
    apMap.setView([latest.p.lat, latest.p.lng], 15);   // 가장 최근 등록 위치부터
  }
  apMapPanelRender();
}
function apPopupHtml(c, p, i, n, st){
  return `<b>${esc(c.debtor_name)}</b> <span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span><br>${esc(p.address)}${n > 1 ? ` <span class="muted">(물건 ${n}개 중 ${i + 1}번)</span>` : ''}
    <br><span class="muted">${esc(p.kind)}${p.jimok ? ` · ${esc(p.jimok)}` : ''}${p.area ? ` · ${Number(p.area).toLocaleString('ko-KR')}㎡` : ''}</span>
    <br>${esc(apTypeText(c))} · ${esc(c.request_date)}<br><b>${esc(apCaseMoney(c))}</b> <span class="muted">· ${AP_STATE[st]}</span>
    <br><button class="btn small primary" data-apopen="${c.id}">상세 보기</button>`;
}
const apDist = (a, b, c2, d) => { const R = 6371000, t = Math.PI / 180, dLa = (c2 - a) * t, dLo = (d - b) * t, x = Math.sin(dLa / 2) ** 2 + Math.cos(a * t) * Math.cos(c2 * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const apDistText = (m) => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
function apRecHtml(c, p, extra, cls){
  return `<div class="aprec ${cls || ''}" data-apopen="${c.id}" data-aplat="${p && p.lat !== null && p.lat !== undefined ? p.lat : ''}" data-aplng="${p && p.lng !== null && p.lng !== undefined ? p.lng : ''}">
    <div class="h"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)}${c.archived_at ? ' <span class="muted">📦</span>' : ''}</div>
    <div class="m">${p ? esc(p.address) : ''}${extra ? ` · <b>${esc(extra)}</b>` : ''}</div>
    <div class="m">${esc(c.request_date)} · ${esc(apTypeText(c))} · ${esc(nameOf(c.requester_email))}</div>
    <div class="w">${esc(apCaseMoney(c))}</div></div>`;
}
function apMapPanelRender(){
  const el = $('apMapPanel'), a = apMapLast;
  if (!a){
    const rec = [...apCases].sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).slice(0, 8);
    el.innerHTML = `<div style="font-weight:800;margin-bottom:6px">🔎 새 의뢰 전에 기존 기록부터 찾아보세요</div>
      <div class="muted" style="margin-bottom:12px;font-size:13px">위 검색창에 지번을 입력하면 그 위치로 이동하고, 같은 필지와 근처의 기존 감정 기록을 보여 드려요.</div>
      <div style="font-weight:800;margin:8px 0">최근 등록 기록</div>${rec.map(c => apRecHtml(c, apProps(c)[0], '')).join('') || '<div class="muted">아직 기록이 없어요.</div>'}`;
    return;
  }
  const r = +$('apMr').value, withArc = $('apMarch').checked;
  const same = apSameRecords(a.pnu, a.addr, null).filter(x => withArc || !x.c.archived_at);
  const sameIds = new Set(same.map(x => x.c.id + ':' + x.p.id));
  const near = [];
  if (a.lat !== null && a.lng !== null) apCases.forEach(c => { if (c.archived_at && !withArc) return; apProps(c).forEach(p => {
    if (p.lat === null || p.lat === undefined || sameIds.has(c.id + ':' + p.id)) return;
    const d = apDist(a.lat, a.lng, p.lat, p.lng); if (d <= r) near.push({ c, p, d }); }); });
  near.sort((x, y) => x.d - y.d);
  let h = `<div style="font-weight:800;font-size:15px;margin-bottom:2px">📍 ${esc(a.addr)}</div><div class="muted" style="margin-bottom:12px;font-size:12.5px">${a.lat === null ? '좌표를 가져오지 못해 지도 이동과 근처 검색은 되지 않았어요.' : `검색한 위치 · 반경 ${r >= 1000 ? r / 1000 + 'km' : r + 'm'} 기준`}</div>`;
  if (same.length) h += `<div style="font-weight:800;margin:6px 0">✅ 이 필지 기록 ${same.length}건</div>` + same.map(x => apRecHtml(x.c, x.p, '', 'same')).join('');
  else h += `<div class="apnew"><div style="font-weight:800;margin-bottom:4px">🆕 신규 — 이 필지의 기록이 없어요</div>${apCan() ? '<button class="btn primary" data-apnew="1">＋ 이 주소로 감정평가 의뢰</button>' : '<div class="muted" style="font-size:12.5px">의뢰 등록은 감정평가 권한이 있는 담당자가 할 수 있어요.</div>'}</div>`;
  if (near.length) h += `<div style="font-weight:800;margin:12px 0 6px">📌 근처 기록 ${near.length}건 <span class="muted" style="font-weight:500">(가까운 순)</span></div>` + near.slice(0, 30).map(x => apRecHtml(x.c, x.p, apDistText(x.d))).join('') + (near.length > 30 ? `<div class="muted">… 외 ${near.length - 30}건</div>` : '');
  else if (same.length === 0) h += `<div class="muted" style="margin-top:6px">반경 ${r >= 1000 ? r / 1000 + 'km' : r + 'm'} 안에 다른 기록도 없어요.</div>`;
  if (same.length && apCan()) h += `<div style="margin-top:10px"><button class="btn small" data-apnew="1">그래도 새로 의뢰하기</button></div>`;
  el.innerHTML = h;
}
function apMapLocate(a){
  apMapLast = a;
  if (apTemp){ apMap.removeLayer(apTemp); apTemp = null; }
  if (a.lat !== null && a.lng !== null){
    apTemp = L.marker([a.lat, a.lng], { icon: L.divIcon({ className: 'apin-wrap', html: '<div class="apq"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(apMap);
    apMap.setView([a.lat, a.lng], 17);
  }
  apMapPanelRender();
  $('apMapPanel').scrollTop = 0;
}
async function apMapSearch(){
  const q = $('apMq').value.trim(), res = $('apMres');
  if (q.length < 2) return alert('검색어를 두 글자 이상 입력해주세요.');
  res.style.display = 'block'; res.innerHTML = '<div class="it" style="cursor:default">검색 중…</div>';
  const { items, raw } = await apSearchAddr(q);
  if (!items.length){
    res.innerHTML = `<div class="it" style="cursor:default;color:var(--danger)">검색 결과가 없어요. 동·리 이름과 번지를 함께 입력해보세요.</div>
      <details style="padding:6px 12px"><summary class="muted" style="cursor:pointer;font-size:12px">🔧 응답 원본 보기</summary><pre style="white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto">${esc(JSON.stringify(raw, null, 1)).slice(0, 2500)}</pre></details>`;
    return;
  }
  res.innerHTML = items.map(it => `<div class="it" data-addr="${esc(it.addr)}" data-pnu="${esc(it.pnu)}" data-lat="${it.lat ?? ''}" data-lng="${it.lng ?? ''}">${esc(it.addr)}${it.road ? `<small>${esc(it.road)}</small>` : ''}</div>`).join('');
}
function apMapWire(){
  $('apMgo').onclick = apMapSearch;
  $('apMq').addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); apMapSearch(); } });
  $('apMres').addEventListener('click', (e) => {
    const it = e.target.closest('.it[data-addr]'); if (!it) return;
    $('apMres').style.display = 'none'; $('apMq').value = it.dataset.addr;
    if (!apMap) return;
    apMapLocate({ addr: it.dataset.addr, pnu: it.dataset.pnu || '', lat: apCoord(it.dataset.lat), lng: apCoord(it.dataset.lng) });
  });
  $('apMr').onchange = apMapPanelRender;
  $('apMarch').onchange = apMapRefresh;
  $('apMcad').onchange = () => { if (!apMap) return; $('apMcad').checked ? apCad.addTo(apMap) : apMap.removeLayer(apCad); };
  $('apMlayer').onclick = (e) => {
    const b = e.target.closest('[data-l]'); if (!b || !apMap) return;
    document.querySelectorAll('#apMlayer button').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.l === 'sat'){ apMap.removeLayer(apBase); apSat.addTo(apMap); apHyb.addTo(apMap); apSat.bringToBack(); } else { apMap.removeLayer(apSat); apMap.removeLayer(apHyb); apBase.addTo(apMap); apBase.bringToBack(); }
    if (apFallback) apFallback.bringToBack();
  };
  $('apMapPanel').addEventListener('click', (e) => {
    if (e.target.closest('[data-apnew]') && apMapLast) return apOpenForm(null, apMapLast);
    const r = e.target.closest('[data-apopen]'); if (!r) return;
    const lat = apCoord(r.dataset.aplat), lng = apCoord(r.dataset.aplng);
    if (lat !== null && lng !== null && apMap) apMap.setView([lat, lng], Math.max(apMap.getZoom(), 17));
    apOpenDetail(+r.dataset.apopen);
  });
  $('apMapEl').addEventListener('click', (e) => { const b = e.target.closest('[data-apopen]'); if (b) apOpenDetail(+b.dataset.apopen); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#apMres') && !e.target.closest('#apMq') && !e.target.closest('#apMgo')) { const r = $('apMres'); if (r) r.style.display = 'none'; } });
}
async function apShowOnMap(c){
  apCloseDetail(); apSetMain('map');
  await apMapEnsure();
  const ms = apMarkers[c.id];
  if (ms && ms.length){
    apMap.setView(ms[0].getLatLng(), 17);
    apCluster.zoomToShowLayer(ms[0], () => ms[0].openPopup());
  } else toast('이 의뢰의 물건에는 좌표가 없어 지도에 표시할 수 없어요');
}

// ---------- 관리자: 지도 좌표 채우기 ----------
function apRenderGeo(){
  const box = $('aGeo'); if (!box) return;
  const miss = apCases.flatMap(c => apProps(c)).filter(p => p.lat === null || p.lat === undefined);
  box.innerHTML = `<div style="font-size:14px">좌표가 없는 물건: <b>${miss.length}개</b> <span class="muted">(지도에 표시되려면 좌표가 필요해요. 새로 등록하는 물건은 자동으로 저장돼요)</span></div>
    <button class="btn primary small" id="aGeoRun" style="margin-top:8px" ${miss.length ? '' : 'disabled'}>📍 좌표 채우기</button> <span id="aGeoMsg" class="muted" style="margin-left:8px"></span>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('#aGeoRun'); if (!b) return;
  const miss = apCases.flatMap(c => apProps(c)).filter(p => p.lat === null || p.lat === undefined);
  b.disabled = true; let done = 0, fail = 0;
  for (const p of miss){
    $('aGeoMsg').textContent = `처리 중… ${done + fail}/${miss.length}`;
    const { items } = await apSearchAddr(p.address);
    const hit = items.find(x => x.pnu && p.pnu && x.pnu === p.pnu && x.lat !== null) || items.find(x => x.lat !== null);
    if (hit){ const { error } = await sb.from('appraisal_properties').update({ lat: hit.lat, lng: hit.lng, pnu: p.pnu || hit.pnu || null }).eq('id', p.id); if (error) fail++; else done++; } else fail++;
    await new Promise(r => setTimeout(r, 250));
  }
  $('aGeoMsg').textContent = `완료: ${done}개 저장, ${fail}개 실패`;
  await loadAppraisal(); b.disabled = false;
});
