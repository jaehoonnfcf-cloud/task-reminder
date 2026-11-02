// 사후관리 > 정책자금실태조사 — CSV 일괄 등록 · 실태조사일 입력(=완료) · 가까운 사업장끼리 묶는 현장 조사 권역 추천.
// 권한은 연체채권관리와 같다(사후관리 담당자 = perm_debt 또는 관리자).
// 전역(sb, $, esc, me, members, nameOf, kstToday, toast, dbWon, debtCan, dbTab)과 appraisal.js 의 apJsonp / apCoord / apPreview / apSettings / VWORLD_KEY 를 함께 쓴다.

let svRows = [], svView = 'open', svQ = '', svAsg = 'all', svBiz = 'all', svLimit = 200, svEditId = null, svCsv = null, svGroups = null, svBusy = false;
const svNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const svComma = (n) => n === null || n === undefined ? '-' : Number(n).toLocaleString('ko-KR');
const svAsgName = (r) => r.assignee_email ? nameOf(r.assignee_email) : (r.assignee_name || '');
const svDone = (r) => !!r.survey_date;
const svSites = (r) => r.sites || [];
const svAddrText = (r) => svSites(r).map(x => x.address).join(' / ');
const svCsvCell = (v) => /[,"\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #survey{ display:none; flex-direction:column; gap:10px; min-width:0; }
  .svbar{ height:8px; border-radius:99px; background:#e9edf3; overflow:hidden; margin:8px 0 2px; } .svbar > i{ display:block; height:100%; background:var(--green); border-radius:99px; }
  .svhead,.svrow{ display:grid; grid-template-columns:minmax(110px,.9fr) minmax(120px,1fr) 118px 88px minmax(170px,1.8fr) 72px 150px; gap:10px; align-items:center; padding:0 22px; }
  .svhead > *, .svrow > *{ min-width:0; }
  .svhead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:10px; padding-bottom:8px; }
  .svrow{ padding-top:13px; padding-bottom:13px; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; font-size:13.5px; cursor:pointer; }
  .svrow:hover{ box-shadow:var(--sh-hover); } .svrow.done{ opacity:.7; }
  .svrow .nm{ font-size:16px; font-weight:700; letter-spacing:-.02em; } .svrow .sub{ font-size:12px; color:var(--muted); margin-top:2px; word-break:break-all; }
  .svrow .ad{ line-height:1.4; word-break:break-word; } .svrow .mo{ font-weight:700; }
  .svrow input[type=date]{ width:100%; min-width:0; padding:7px 8px; font-size:13.5px; }
  .svok{ display:inline-block; font-size:12.5px; font-weight:800; padding:3px 10px; border-radius:99px; background:var(--green-soft); color:var(--green); white-space:nowrap; }
  .svgeo{ font-size:11px; color:var(--muted); margin-left:4px; }
  .svcsv{ max-width:960px !important; } .svcsv table{ width:100%; border-collapse:collapse; font-size:12.5px; margin-top:10px; } .svcsv th,.svcsv td{ border:1px solid var(--line); padding:5px 7px; text-align:left; white-space:nowrap; }
  .svcsv th{ background:var(--field); } .svcsv tr.bad td{ background:#fff5f5; } .svcsv tr.wn td{ background:#fffaf0; } .svcsv .sc{ overflow-x:auto; max-height:46vh; overflow-y:auto; }
  .svgp{ max-width:900px !important; }
  .svgrp{ background:var(--field); border-radius:16px; padding:12px 14px; margin-top:12px; }
  .svgrp .gh{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; } .svgrp .gh b{ font-size:15.5px; } .svgrp .gn{ flex:none; width:26px; height:26px; border-radius:50%; background:#16181d; color:#fff; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; }
  .svgrp .gm{ font-size:12.5px; color:var(--muted); margin:3px 0 6px 34px; }
  .svgrp ol{ margin:0; padding-left:34px; font-size:13.5px; line-height:1.55; } .svgrp li small{ color:var(--muted); }
  .svgrp.unk{ background:#fff7ec; }
  .svmap{ height:380px; margin-top:12px; border-radius:16px; overflow:hidden; background:#e9edf3; z-index:0; } @media (max-width:760px){ .svmap{ height:300px; } }
  @media (max-width:900px){
    .svhead{ display:none; }
    .svrow{ grid-template-columns:1fr auto; gap:6px 10px; padding:14px 16px; border-radius:20px; }
    .svrow > :nth-child(1){ grid-column:1 / 2; } .svrow > :nth-child(3){ grid-column:2 / 3; justify-self:end; }
    .svrow > :nth-child(2), .svrow > :nth-child(4), .svrow > :nth-child(5), .svrow > :nth-child(6), .svrow > :nth-child(7){ grid-column:1 / 3; }
  }
  @media (max-width:760px){ .svlf{ display:none; } } @media (min-width:761px){ .svls{ display:none; } }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="svFormOv" style="z-index:30"><div class="panel" style="max-width:560px" id="svFormPanel"></div></div>
    <div class="ov" id="svCsvOv" style="z-index:30"><div class="panel svcsv" id="svCsvPanel"></div></div>
    <div class="ov" id="svGpOv" style="z-index:30"><div class="panel svgp" id="svGpPanel"></div></div>`;
  document.body.appendChild(d);
  ['svFormOv', 'svCsvOv', 'svGpOv'].forEach(id => $(id).addEventListener('click', (e) => { if (e.target === $(id)) svCloseOv(id); }));
})();
function svShowOv(id){ $(id).style.display = 'block'; document.body.style.overflow = 'hidden'; }
function svCloseOv(id){ $(id).style.display = 'none'; if (!['svFormOv', 'svCsvOv', 'svGpOv'].some(i => $(i).style.display === 'block')) document.body.style.overflow = ''; }

// ---------- 불러오기 ----------
async function loadSurvey(){
  if (!debtView()){ svRows = []; return; }
  let all = [];
  for (let from = 0; from < 20000; from += 1000){
    const { data, error } = await sb.from('survey_cases').select('*, survey_sites(*)').order('id', { ascending: true }).range(from, from + 999);
    if (error){ console.warn('정책자금실태조사 불러오기 실패', error.message); return; }
    all = all.concat(data || []); if (!data || data.length < 1000) break;
  }
  all.forEach(r => { r.sites = [...(r.survey_sites || [])].sort((a, b) => a.seq - b.seq || a.id - b.id); });
  svRows = all;
  if (typeof divn !== 'undefined' && divn === 'debt' && dbTab === 'survey'){
    const ae = document.activeElement;
    if (!(ae && ae.closest && ae.closest('#survey') && /INPUT|SELECT/.test(ae.tagName))) renderSurvey();
  }
  if (svGroups) svGroups = null;
}

// 목록 화면의 담당자·사업구분·검색 조건에 맞는지 (현장 묶음 추천도 이 조건에 맞는 대출건만 대상으로 한다)
const svMatch = (r) => (svAsg === 'all' || svAsgName(r) === svAsg) && (svBiz === 'all' || r.biz_type === svBiz) && (!svQ || [r.name, r.cust_no, r.account_no, svAddrText(r)].some(v => String(v || '').toLowerCase().includes(svQ)));
const svTargets = () => svRows.filter(r => !svDone(r) && svMatch(r));
const svCondText = () => [svBiz !== 'all' ? `사업구분 ${svBiz}` : '', svAsg !== 'all' ? `담당 ${svAsg || '없음'}` : '', svQ ? `검색 “${svQ}”` : ''].filter(Boolean).join(' · ') || '전체';

// ---------- 목록 ----------
function renderSurvey(){
  const el = $('survey');
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.innerHTML = `<div class="dbsecT">🏭 정책자금실태조사</div><div class="list-panel">
      <div class="toolbar">
        <div class="seg" id="svViewSeg"><button data-v="open">미완료 <span id="svNA"></span></button><button data-v="done">완료 <span id="svNB"></span></button></div>
        <select id="svAsgSel"></select><select id="svBizSel"></select>
        <input id="svQ" class="search" type="search" placeholder="🔍 성명·고객번호·계좌·소재지" />
        ${debtCan() ? '<button class="btn small" data-sv="csv">📥 CSV 올리기</button>' : '<span class="pill ro" title="등록·수정 권한이 없어 보기만 가능해요">👀 보기 전용</span>'}<button class="btn small primary" data-sv="group">📍 현장 묶음 추천</button>
      </div>
      <div class="dbsum" id="svSum"></div>
      <div class="svhead"><span>성명 / 고객번호</span><span>계좌번호</span><span>대출잔액</span><span>사업구분</span><span>사업장 소재지</span><span>담당자</span><span>실태조사일</span></div>
      <div id="svList"></div></div>`;
    $('svViewSeg').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; svView = b.dataset.v; svLimit = 200; renderSurvey(); };
    $('svAsgSel').onchange = () => { svAsg = $('svAsgSel').value; svLimit = 200; renderSurvey(); };
    $('svBizSel').onchange = () => { svBiz = $('svBizSel').value; svLimit = 200; renderSurvey(); };
    $('svQ').oninput = () => { svQ = $('svQ').value.trim().toLowerCase(); svLimit = 200; renderSurvey(); };
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-sv]');
      if (a){ if (a.dataset.sv === 'csv') return svOpenCsv(); if (a.dataset.sv === 'group') return svOpenGroup(); if (a.dataset.sv === 'more'){ svLimit += 200; return renderSurvey(); } }
      if (e.target.closest('input,button')) return;
      const r = e.target.closest('[data-sid]'); if (r) svOpenForm(+r.dataset.sid);
    });
    el.addEventListener('change', async (e) => {
      const inp = e.target.closest('input[data-sdate]'); if (!inp) return;
      const v = inp.value || null, row = svRows.find(x => x.id === +inp.dataset.sdate); if (!row) return;
      if (v && v > kstToday() && !confirm('오늘 이후 날짜예요. 실태조사 완료로 처리할까요?')){ inp.value = row.survey_date || ''; return; }
      const { error } = await sb.from('survey_cases').update({ survey_date: v, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (error){ inp.value = row.survey_date || ''; return alert(error.message); }
      toast(v ? `✅ ${row.name} 실태조사 완료 처리` : `↩ ${row.name} 미완료로 되돌렸어요`);
      await loadSurvey(); renderSurvey();
    });
  }
  const nDone = svRows.filter(svDone).length;
  $('svNA').textContent = svRows.length - nDone; $('svNB').textContent = nDone;
  document.querySelectorAll('#svViewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === svView));
  const asgs = [...new Set(svRows.map(svAsgName).filter(Boolean))].sort(), bizs = [...new Set(svRows.map(r => r.biz_type).filter(Boolean))].sort();
  if (svAsg !== 'all' && svAsg !== '' && !asgs.includes(svAsg)) svAsg = 'all'; if (svBiz !== 'all' && !bizs.includes(svBiz)) svBiz = 'all';
  $('svAsgSel').innerHTML = `<option value="all">담당자 전체</option>${asgs.map(a => `<option ${a === svAsg ? 'selected' : ''}>${esc(a)}</option>`).join('')}<option value="" ${svAsg === '' ? 'selected' : ''}>(담당자 없음)</option>`;
  $('svBizSel').innerHTML = `<option value="all">사업구분 전체</option>${bizs.map(a => `<option ${a === svBiz ? 'selected' : ''}>${esc(a)}</option>`).join('')}`;
  const shown = svRows.filter(r => (svView === 'done' ? svDone(r) : !svDone(r)) && svMatch(r));
  shown.sort(svView === 'done' ? (a, b) => String(b.survey_date).localeCompare(String(a.survey_date)) || a.id - b.id : (a, b) => a.id - b.id);
  const pct = svRows.length ? Math.round(nDone / svRows.length * 100) : 0, sumAll = svRows.reduce((s, r) => s + Number(r.balance || 0), 0), sumOpen = svRows.filter(r => !svDone(r)).reduce((s, r) => s + Number(r.balance || 0), 0);
  $('svSum').innerHTML = `<span style="flex:1 1 100%"><b>완료 ${nDone} / ${svRows.length}건 (${pct}%)</b><div class="svbar"><i style="width:${pct}%"></i></div></span>${svRows.length ? `<span>대출잔액 합계 <b>${dbWon(sumAll)}</b></span><span>미완료 잔액 <b>${dbWon(sumOpen)}</b></span>` : ''}<span>목록 <b>${shown.length}건</b></span>`;
  $('svList').innerHTML = shown.slice(0, svLimit).map(svRowHtml).join('') + (shown.length > svLimit ? `<div style="text-align:center;padding:6px"><button class="btn" data-sv="more">더 보기 (${shown.length - svLimit}건 남음)</button></div>` : '')
    || `<div class="blk-empty">${svRows.length ? (svView === 'done' ? '완료된 조사가 없어요.' : '미완료 조사가 없어요. 🎉') : '등록된 조사 대상이 없어요. “📥 CSV 올리기”로 시작해요.'}</div>`;
}
function svRowHtml(r){
  const a = svAsgName(r);
  return `<div class="svrow ${svDone(r) ? 'done' : ''}" data-sid="${r.id}">
    <div><div class="nm">${esc(r.name)}</div><div class="sub">고객번호 ${esc(r.cust_no)}</div></div>
    <div>${esc(r.account_no)}</div><div class="mo">${r.balance === null ? '-' : svComma(r.balance) + '원'}</div><div>${esc(r.biz_type || '-')}</div>
    <div class="ad">${svSites(r).map(x => `<div>${svSites(r).length > 1 ? '· ' : ''}${esc(x.address)}${x.geo_status === 'fail' ? '<span class="svgeo">📍위치 미확인</span>' : ''}</div>`).join('') || '-'}${svSites(r).length > 1 ? `<span class="svgeo">현장 ${svSites(r).length}곳</span>` : ''}</div><div>${esc(a || '-')}</div>
    <div>${svDone(r) ? `<span class="svok">✅ 완료</span><br>` : ''}${debtCan() ? `<input type="date" data-sdate="${r.id}" value="${esc(r.survey_date || '')}" title="날짜를 넣으면 완료 처리돼요" />` : (r.survey_date ? esc(r.survey_date) : '<span class="muted">-</span>')}</div></div>`;
}

// ---------- 등록/수정 ----------
const svSiteInput = (x) => `<div class="svsite" data-sid="${x.id || ''}" style="display:flex;gap:6px;margin-top:6px"><input class="svsa" maxlength="200" placeholder="사업장 소재지" value="${esc(x.address)}" style="flex:1" /><button class="btn small danger" type="button" data-f="delsite" title="이 현장 삭제">✕</button></div>`;
function svOpenForm(id){
  svEditId = id || null; const r = id ? svRows.find(x => x.id === id) : null; if (id && !r) return;
  const asgOpts = `<option value="">미지정</option>${members.map(m => `<option value="${esc(m.email)}" ${r && r.assignee_email === m.email ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}`;
  $('svFormPanel').innerHTML = `<div class="ph"><h2>${r ? '조사 대상 수정' : '조사 대상 등록'}</h2><button class="x" data-f="close">✕</button></div>
    <label>성명</label><input id="svfName" maxlength="100" value="${esc(r ? r.name : '')}" />
    <div class="row"><div><label>고객번호</label><input id="svfCust" maxlength="30" value="${esc(r ? r.cust_no : '')}" /></div><div><label>계좌번호</label><input id="svfAcct" maxlength="30" value="${esc(r ? r.account_no : '')}" /></div></div>
    <div class="row"><div><label>대출잔액 (원)</label><input id="svfBal" inputmode="numeric" value="${r && r.balance !== null ? svComma(r.balance) : ''}" /></div><div><label>사업구분</label><input id="svfBiz" maxlength="50" value="${esc(r ? r.biz_type || '' : '')}" /></div></div>
    <label>사업장 소재지 <span class="muted" style="font-weight:400">(현장이 여러 곳이면 추가해요 · 대출건 하나에 포함)</span></label>
    <div id="svfSites">${(r && svSites(r).length ? svSites(r) : [{ id: '', address: '' }]).map(svSiteInput).join('')}</div>
    <button class="btn small" type="button" data-f="addsite" style="margin-top:6px">＋ 현장 추가</button>
    <div class="row"><div><label>담당자</label><select id="svfAsg">${asgOpts}</select></div><div><label>실태조사일 <span class="muted" style="font-weight:400">(넣으면 완료)</span></label><input type="date" id="svfDate" value="${esc(r ? r.survey_date || '' : '')}" /></div></div>
    <label>메모</label><textarea id="svfMemo" rows="3" maxlength="500">${esc(r ? r.memo || '' : '')}</textarea>
    <div class="acts" style="margin-top:14px;justify-content:space-between"><div>${r ? '<button class="btn danger" data-f="del">삭제</button>' : ''}</div><div style="display:flex;gap:8px"><button class="btn" data-f="close">취소</button><button class="btn primary" data-f="save">저장</button></div></div>`;
  if (!debtCan()){   // 권한이 없으면 보기만 (입력칸 잠금, 저장·삭제·현장 추가 버튼 없음)
    $('svFormPanel').querySelectorAll('input,select,textarea').forEach(x => { x.disabled = true; });
    $('svFormPanel').querySelectorAll('[data-f=save],[data-f=del],[data-f=addsite],[data-f=delsite]').forEach(x => x.remove());
    $('svFormPanel').querySelector('h2').textContent = '조사 대상 (보기 전용)';
  }
  svShowOv('svFormOv');
}
$('svFormPanel').addEventListener('input', (e) => { if (e.target.id === 'svfBal'){ const n = svNum(e.target.value); e.target.value = n === null ? '' : svComma(n); } });
$('svFormPanel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'close') return svCloseOv('svFormOv');
  if (b.dataset.f === 'addsite'){ $('svfSites').insertAdjacentHTML('beforeend', svSiteInput({ id: '', address: '' })); return $('svfSites').lastElementChild.querySelector('input').focus(); }
  if (b.dataset.f === 'delsite'){ if ($('svfSites').children.length <= 1) return alert('현장은 최소 1곳이 필요해요.'); return b.closest('.svsite').remove(); }
  const r = svEditId ? svRows.find(x => x.id === svEditId) : null;
  if (b.dataset.f === 'del'){
    if (!r || !confirm(`"${r.name}" 건을 삭제할까요?`)) return;
    const { error } = await sb.from('survey_cases').delete().eq('id', r.id); if (error) return alert(error.message);
    svCloseOv('svFormOv'); toast('삭제했어요'); await loadSurvey(); return renderSurvey();
  }
  const g = (id) => $(id).value.trim();
  const name = g('svfName'), cust = g('svfCust'), acct = g('svfAcct'), date = $('svfDate').value || null, asgE = $('svfAsg').value || null;
  const sites = [...document.querySelectorAll('#svfSites .svsite')].map(d => ({ id: d.dataset.sid ? +d.dataset.sid : null, address: d.querySelector('input').value.trim().replace(/\s+/g, ' ') })).filter(x => x.address);
  if (!name || !cust || !acct || !sites.length) return alert('성명 · 고객번호 · 계좌번호 · 사업장 소재지(1곳 이상)는 꼭 입력해주세요.');
  if (new Set(sites.map(x => x.address)).size !== sites.length) return alert('같은 소재지가 두 번 들어 있어요.');
  if (svRows.some(x => x.cust_no === cust && x.account_no === acct && x.id !== svEditId)) return alert('같은 고객번호·계좌번호가 이미 등록돼 있어요.');
  const patch = { name, cust_no: cust, account_no: acct, balance: svNum(g('svfBal')), biz_type: g('svfBiz') || null, survey_date: date, assignee_email: asgE, assignee_name: asgE ? null : (r && !r.assignee_email ? r.assignee_name : null), memo: g('svfMemo') || null, updated_at: new Date().toISOString() };
  b.disabled = true;
  let cid = r ? r.id : null, error = null;
  if (r) error = (await sb.from('survey_cases').update(patch).eq('id', r.id)).error;
  else { const ins = await sb.from('survey_cases').insert(patch).select('id').single(); error = ins.error; cid = ins.data && ins.data.id; }
  if (!error) error = await svSyncSites(cid, r ? svSites(r) : [], sites);
  b.disabled = false; if (error) return alert(error.message);
  svCloseOv('svFormOv'); toast('저장했어요'); await loadSurvey(); renderSurvey();
});

// 현장 목록 저장: 화면 순서대로 seq 를 매기고, 주소가 바뀐 현장은 좌표를 비운다 (지운 현장은 삭제)
async function svSyncSites(cid, cur, next){
  const keep = new Set(next.filter(x => x.id).map(x => x.id)), gone = cur.filter(x => !keep.has(x.id)).map(x => x.id);
  if (gone.length){ const { error } = await sb.from('survey_sites').delete().in('id', gone); if (error) return error; }
  for (let i = 0; i < next.length; i++){
    const x = next[i], old = x.id ? cur.find(c => c.id === x.id) : null;
    if (old){ if (old.address !== x.address || old.seq !== i + 1){ const { error } = await sb.from('survey_sites').update(old.address !== x.address ? { address: x.address, seq: i + 1, lat: null, lng: null, geo_status: null } : { seq: i + 1 }).eq('id', old.id); if (error) return error; } }
    else { const { error } = await sb.from('survey_sites').insert({ case_id: cid, seq: i + 1, address: x.address }); if (error) return error; }
  }
  return null;
}

// ---------- CSV 올리기 ----------
const SV_HEAD = ['고객번호', '성명', '계좌번호', '대출잔액', '사업구분', '사업장소재지', '실태조사일', '담당자'];
function svParseCsv(text){
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t'){ row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(v => v.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}
function svDate(s){   // '' = 비어 있음, null = 형식 오류
  const t = String(s ?? '').trim(); if (!t) return '';
  const m = t.match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/); if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
function svCsvRows(grid){
  const head = grid[0].map(h => h.replace(/\s|﻿/g, '')), ix = (...ks) => head.findIndex(h => ks.some(k => h.includes(k)));
  const col = { cust: ix('고객번호', '고객'), name: ix('성명', '이름', '고객명'), acct: ix('계좌'), bal: ix('잔액'), biz: ix('사업구분', '업종'), addr: ix('소재지', '주소'), date: ix('실태조사일', '조사일'), asg: ix('담당') };
  if (col.cust < 0 || col.name < 0 || col.acct < 0 || col.addr < 0) return null;
  const key = (c, a) => `${c}|${a}`, exist = new Map(svRows.map(r => [key(r.cust_no, r.account_no), r])), seen = new Set();
  const lines = grid.slice(1).map((c, n) => {
    const g = (k) => col[k] >= 0 ? (c[col[k]] ?? '').trim() : '';
    const errs = [];
    const cust = g('cust'), name = g('name'), acct = g('acct'), addr = g('addr').replace(/\s+/g, ' ');
    if (!cust) errs.push('고객번호'); if (!name) errs.push('성명'); if (!acct) errs.push('계좌번호'); if (!addr) errs.push('소재지');
    const balS = g('bal'), bal = balS === '' ? null : svNum(balS); if (balS !== '' && bal === null) errs.push('대출잔액');
    const date = svDate(g('date')); if (date === null) errs.push('실태조사일 형식');
    return { n: n + 2, errs, warns: [], note: '', key: key(cust, acct), cust, name, acct, addr, bal, biz: g('biz') || null, date: date || '', asg: g('asg'), view: [cust, name, acct, bal === null ? '' : svComma(bal), g('biz'), addr, date || '', g('asg')] };
  });
  // 같은 고객번호+계좌번호의 여러 줄 = 한 대출건의 여러 현장 (대출 정보는 첫 줄 기준, 조사일·담당자는 비어 있지 않은 줄 값)
  const cases = new Map();
  lines.filter(l => !l.errs.length).forEach(l => {
    let c = cases.get(l.key);
    if (!c){ const old = exist.get(l.key); c = { key: l.key, old, first: l, addrs: [], date: '', asg: '' }; cases.set(l.key, c); }
    else l.note = '＋ 같은 대출건의 현장 추가';
    if (c.addrs.includes(l.addr)){ l.warns.push('같은 소재지 중복(무시)'); } else c.addrs.push(l.addr);
    if (l.date) c.date = l.date; if (l.asg) c.asg = l.asg;
  });
  cases.forEach(c => {
    const f = c.first, old = c.old; let asgE = null, asgN = null;
    if (c.asg){ const m = members.find(x => x.email === c.asg || x.name === c.asg); if (m) asgE = m.email; else { asgN = c.asg; f.warns.push('담당자 미등록(이름만 저장)'); } }
    c.row = { cust_no: f.cust, name: f.name, account_no: f.acct, balance: f.bal, biz_type: f.biz, survey_date: c.date || (old ? old.survey_date : null),
      assignee_email: c.asg ? asgE : (old ? old.assignee_email : null), assignee_name: c.asg ? asgN : (old ? old.assignee_name : null), memo: old ? old.memo : null, updated_at: new Date().toISOString() };
    if (old){ const cur = svSites(old).map(x => x.address); if (cur.join('|') !== c.addrs.join('|')) f.warns.push(`현장 목록 교체 (${cur.length}곳 → ${c.addrs.length}곳)`); }
    if (c.addrs.length > 1 && !f.note) f.note = `현장 ${c.addrs.length}곳`;
  });
  return { lines, cases: [...cases.values()] };
}
function svOpenCsv(){
  svCsv = null;
  $('svCsvPanel').innerHTML = `<div class="ph"><h2>📥 정책자금실태조사 CSV 올리기</h2><button class="x" data-sc="close">✕</button></div>
    <div class="muted" style="font-size:13.5px;line-height:1.6;margin-top:6px">엑셀에서 아래 순서의 열로 만든 뒤 <b>CSV로 저장</b>해서 올려주세요. (한글 엑셀 CSV · UTF-8 모두 가능, 첫 줄은 제목 줄)<br>
    <b>${SV_HEAD.join(' · ')}</b><br>· 같은 <b>고객번호+계좌번호</b>가 이미 있으면 새로 만들지 않고 <b>덮어써요</b>(비워둔 실태조사일·담당자는 기존 값 유지).<br>· <b>한 대출건에 현장이 여러 곳</b>이면 같은 고객번호·계좌번호로 줄만 늘려 소재지를 각각 적으세요(대출잔액은 대출건당 한 번만 계산). 이미 있는 대출건은 파일의 현장 목록으로 <b>교체</b>돼요.<br>· 실태조사일이 있는 줄은 올리자마자 <b>완료</b>로 들어가요. 날짜는 2026-11-20 형식, 금액은 원 단위(콤마 가능), 담당자는 이름.</div>
    <div class="acts" style="margin-top:12px"><button class="btn" data-sc="tpl">⬇ 양식(CSV) 내려받기</button><label class="btn primary" style="cursor:pointer;margin:0">📂 CSV 파일 선택<input type="file" id="svCsvFile" accept=".csv,.txt,text/csv" hidden /></label></div>
    <div id="svCsvOut" style="margin-top:12px"></div>`;
  $('svCsvFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer(); let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (x) { text = new TextDecoder('euc-kr').decode(buf); }   // 한글 엑셀 CSV(CP949)
    const grid = svParseCsv(text.replace(/^﻿/, ''));
    if (grid.length < 2) return ($('svCsvOut').innerHTML = '<div class="muted">데이터 줄이 없어요. 첫 줄은 제목, 둘째 줄부터 데이터여야 해요.</div>');
    const res = svCsvRows(grid);
    if (!res) return ($('svCsvOut').innerHTML = `<div style="color:var(--danger)">제목 줄에서 ${SV_HEAD.join(', ')} 열을 찾지 못했어요. 양식을 내려받아 확인해주세요.</div>`);
    const rows = res.lines; svCsv = res.cases;
    const okN = res.cases.length, badN = rows.filter(r => r.errs.length).length, updN = res.cases.filter(c => c.old).length, doneN = res.cases.filter(c => c.row.survey_date).length, siteN = res.cases.reduce((s, c) => s + c.addrs.length, 0);
    $('svCsvOut').innerHTML = `<div style="font-weight:700">${rows.length}줄 읽음 → <span style="color:var(--green)">대출 ${okN}건 (현장 ${siteN}곳)</span>${updN ? ` · 덮어쓰기 ${updN}건` : ''}${doneN ? ` · 완료로 등록 ${doneN}건` : ''}${badN ? ` · <span style="color:var(--danger)">오류 ${badN}줄(제외)</span>` : ''}</div>
      <div class="sc"><table><thead><tr><th>줄</th><th>결과</th>${SV_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(0, 300).map(r => `<tr class="${r.errs.length ? 'bad' : r.warns.length ? 'wn' : ''}"><td>${r.n}</td><td>${r.errs.length ? `✕ ${esc(r.errs.join(', '))}` : `✓${r.note ? ' ' + esc(r.note) : ''}${r.warns.length ? ' ⚠ ' + esc(r.warns.join(', ')) : ''}`}</td>${r.view.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>${rows.length > 300 ? `<div class="muted" style="margin-top:6px">미리보기는 300줄까지만 보여요. (등록은 전체)</div>` : ''}
      <div class="acts" style="margin-top:12px"><button class="btn primary" data-sc="import" ${okN ? '' : 'disabled'}>대출 ${okN}건 등록</button><button class="btn" data-sc="close">취소</button></div>`;
  };
  svShowOv('svCsvOv');
}
$('svCsvPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-sc]'); if (!b) return;
  const a = b.dataset.sc;
  if (a === 'close') return svCloseOv('svCsvOv');
  if (a === 'tpl'){
    const sample = ['1023456', '홍길동', '123-45-6789012', '85000000', '정책자금(시설)', '강원특별자치도 춘천시 동산면 원창리 99', '', '정재훈'], sample2 = [...sample]; sample2[5] = '강원특별자치도 춘천시 신북읍 천전리 12';   // 같은 대출건의 두 번째 현장
    const blob = new Blob(['﻿' + SV_HEAD.join(',') + '\r\n' + sample.map(svCsvCell).join(',') + '\r\n' + sample2.map(svCsvCell).join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = '정책자금실태조사_업로드_양식.csv'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); return;
  }
  if (a === 'import'){
    const cs = (svCsv || []).filter(c => c.row); if (!cs.length) return;
    if (!confirm(`대출 ${cs.length}건(현장 ${cs.reduce((s, c) => s + c.addrs.length, 0)}곳)을 등록할까요?`)) return;
    b.disabled = true;
    const rows = cs.map(c => c.row);
    for (let i = 0; i < rows.length; i += 200){
      const { error } = await sb.from('survey_cases').upsert(rows.slice(i, i + 200), { onConflict: 'cust_no,account_no' });
      if (error){ b.disabled = false; return alert(`등록하지 못했어요 (${i + 1}번째 건부터): ` + error.message); }
    }
    await loadSurvey();   // 새로 생긴 id 를 얻기 위해 다시 읽는다
    const byKey = new Map(svRows.map(r => [`${r.cust_no}|${r.account_no}`, r])), delIds = [], ins = [];
    cs.forEach(c => {
      const r = byKey.get(c.key); if (!r) return;
      const cur = svSites(r); if (cur.map(x => x.address).join('|') === c.addrs.join('|')) return;   // 현장 목록이 같으면 그대로(좌표 유지)
      if (cur.length) delIds.push(r.id);
      c.addrs.forEach((ad, k) => { const o = cur.find(x => x.address === ad); ins.push({ case_id: r.id, seq: k + 1, address: ad, lat: o ? o.lat : null, lng: o ? o.lng : null, geo_status: o ? o.geo_status : null }); });
    });
    for (let i = 0; i < delIds.length; i += 100){ const { error } = await sb.from('survey_sites').delete().in('case_id', delIds.slice(i, i + 100)); if (error){ b.disabled = false; return alert('현장 목록을 바꾸지 못했어요: ' + error.message); } }
    for (let i = 0; i < ins.length; i += 200){ const { error } = await sb.from('survey_sites').insert(ins.slice(i, i + 200)); if (error){ b.disabled = false; return alert('현장 저장에 실패했어요: ' + error.message); } }
    svCloseOv('svCsvOv'); toast(`📥 대출 ${cs.length}건을 등록했어요`); svView = 'open'; await loadSurvey(); renderSurvey();
  }
});

// ---------- 현장 조사 묶음 추천 ----------
// 사업장 주소를 브이월드로 좌표 변환한 뒤, "한 묶음 안에서 가장 먼 두 곳 사이 거리"가 기준 이내이고 건수가 상한 이하가 되도록
// 가까운 곳끼리 계층적으로 합쳐 묶는다(완전연결 군집). 좌표를 못 구한 건은 주소의 읍·면·동으로 묶어 따로 보여준다. (생성형 AI가 아니라 거리 계산 알고리즘)
const svRad = (d) => d * Math.PI / 180;
function svKm(a, b){ const dLa = svRad(b.lat - a.lat), dLo = svRad(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(svRad(a.lat)) * Math.cos(svRad(b.lat)) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); }
function svArea(addr){
  const t = String(addr || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean);
  const sgg = t.find(x => /[시군구]$/.test(x) && x.length > 1 && !/특별|광역|자치/.test(x)) || '';
  const emd = t.find(x => /[읍면동]$/.test(x) && x.length > 1) || '';
  return { sgg, emd };
}
function svName(items){
  const cnt = new Map(), sggs = new Set();
  items.forEach(r => { const a = svArea(r.address); sggs.add(a.sgg); const k = a.emd ? `${a.sgg}\t${a.emd}` : `${a.sgg}\t`; cnt.set(k, (cnt.get(k) || 0) + 1); });
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]), multi = sggs.size > 1;
  const lab = (k) => { const [s, e] = k.split('\t'); return (multi || !e ? s + (e ? ' ' : '') : '') + e || '주소 미상'; };
  return top.slice(0, 2).map(x => lab(x[0])).join('·') + (top.length > 2 ? ' 외' : '') + ' 일대';
}
function svRoute(items){   // 중심에서 가장 먼 곳에서 출발해 가까운 곳으로 이어가는 순서
  const pts = items.filter(r => r.lat != null); if (pts.length < 3) return items;
  const c = { lat: pts.reduce((s, r) => s + r.lat, 0) / pts.length, lng: pts.reduce((s, r) => s + r.lng, 0) / pts.length };
  let cur = pts.reduce((m, r) => svKm(r, c) > svKm(m, c) ? r : m), left = pts.filter(r => r !== cur); const out = [cur];
  while (left.length){ let best = left[0], bd = svKm(cur, best); for (const r of left){ const d = svKm(cur, r); if (d < bd){ bd = d; best = r; } } out.push(best); left = left.filter(r => r !== best); cur = best; }
  return out.concat(items.filter(r => r.lat == null));
}
function svDiam(items){ let m = 0; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) m = Math.max(m, svKm(items[i], items[j])); return m; }
function svCluster(pts, maxKm, maxN){
  const n = pts.length; if (!n) return [];
  if (n > 700){   // 매우 많을 땐 격자 방식으로 단순 분할
    const cell = maxKm / 111, g = new Map();
    pts.forEach(r => { const k = `${Math.floor(r.lat / cell)}_${Math.floor(r.lng / (cell * 1.25))}`; (g.get(k) || g.set(k, []).get(k)).push(r); });
    return [...g.values()].flatMap(a => { const o = []; for (let i = 0; i < a.length; i += maxN) o.push(a.slice(i, i + maxN)); return o; });
  }
  const D = Array.from({ length: n }, () => new Float32Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i][j] = D[j][i] = svKm(pts[i], pts[j]);
  const cl = pts.map((_, i) => ({ m: [i], alive: true })), CD = D;   // 군집 간 거리 = 두 군집에서 가장 먼 쌍의 거리
  for (;;){
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < n; i++){ if (!cl[i].alive) continue; for (let j = i + 1; j < n; j++){ if (!cl[j].alive || cl[i].m.length + cl[j].m.length > maxN) continue; const d = CD[i][j]; if (d < bd && d <= maxKm){ bd = d; bi = i; bj = j; } } }
    if (bi < 0) break;
    cl[bi].m = cl[bi].m.concat(cl[bj].m); cl[bj].alive = false;
    for (let k = 0; k < n; k++) if (k !== bi && cl[k].alive){ const d = Math.max(CD[bi][k], CD[bj][k]); CD[bi][k] = CD[k][bi] = d; }
  }
  return cl.filter(c => c.alive).map(c => c.m.map(i => pts[i]));
}
// 묶음의 점 = 현장 하나. 대출 정보는 대출건 것을 그대로 쓰고(잔액은 묶음 안에서 한 번만 합산), k/n = 그 대출건의 몇 번째 현장인지
const svPoints = (cases) => cases.flatMap(c => svSites(c).map((s, k) => ({ ...c, address: s.address, lat: s.lat, lng: s.lng, geo_status: s.geo_status, siteId: s.id, k: k + 1, n: svSites(c).length })));
const svFirstOf = (items) => { const seen = new Set(); return items.map(r => { const f = !seen.has(r.id); seen.add(r.id); return f; }); };   // 같은 대출건의 첫 현장만 true
const svSiteTag = (r) => r.n > 1 ? `현장 ${r.k}/${r.n}` : '';
function svBuildGroups(targets, maxKm, maxN, byAsg){
  const parts = byAsg ? [...new Set(targets.map(r => svAsgName(r) || '(담당자 없음)'))].map(a => ({ a, rows: targets.filter(r => (svAsgName(r) || '(담당자 없음)') === a) })) : [{ a: '', rows: targets }];
  const groups = [];
  parts.forEach(p => {
    const geo = p.rows.filter(r => r.lat != null && r.lng != null), nog = p.rows.filter(r => r.lat == null || r.lng == null);
    svCluster(geo, maxKm, maxN).forEach(m => groups.push({ unk: false, asg: p.a, items: svRoute(m) }));
    const byArea = new Map(); nog.forEach(r => { const a = svArea(r.address), k = `${a.sgg}|${a.emd}`; (byArea.get(k) || byArea.set(k, []).get(k)).push(r); });
    [...byArea.values()].forEach(a => { for (let i = 0; i < a.length; i += maxN) groups.push({ unk: true, asg: p.a, items: a.slice(i, i + maxN) }); });
  });
  groups.forEach(g => { g.name = svName(g.items); g.loans = new Set(g.items.map(r => r.id)).size; g.sum = g.items.reduce((s, r, i, a) => s + (a.findIndex(x => x.id === r.id) === i ? Number(r.balance || 0) : 0), 0); g.diam = g.unk ? null : svDiam(g.items); });
  groups.sort((a, b) => a.unk - b.unk || b.items.length - a.items.length || b.sum - a.sum);
  return groups;
}
async function svGeocode(addr){
  const q = String(addr || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(); if (!q) return null;
  for (const cat of ['parcel', 'road']){
    try {
      const raw = await apJsonp(`https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=1&page=1&type=address&category=${cat}&format=json&errorformat=json&key=${VWORLD_KEY}&domain=${encodeURIComponent(location.hostname)}&query=${encodeURIComponent(q)}`);
      const it = raw && raw.response && raw.response.result && raw.response.result.items && raw.response.result.items[0];
      const lat = apCoord(it && it.point && it.point.y), lng = apCoord(it && it.point && it.point.x);
      if (lat !== null && lng !== null) return { lat, lng };
    } catch (e) { /* 다음 방법 */ }
  }
  return null;
}
function svOpenGroup(){
  if (!svTargets().length) return alert(svCondText() === '전체' ? '미완료 조사 대상이 없어요.' : `선택한 조건(${svCondText()})에 맞는 미완료 조사 대상이 없어요.`);
  let p = { km: 5, n: 8, asg: false }; try { p = { ...p, ...JSON.parse(localStorage.getItem('svGp') || '{}') }; } catch (e) {}
  $('svGpPanel').innerHTML = `<div class="ph"><h2>📍 현장 조사 묶음 추천</h2><button class="x" data-g="close">✕</button></div>
    <div class="muted" style="font-size:13.5px;line-height:1.6;margin-top:6px">미완료 조사 대상의 사업장 주소를 지도 좌표로 바꿔서, <b>가까운 곳끼리</b> 한 묶음으로 만들어요. 묶음마다 방문 순서(가까운 곳으로 이어가는 길)도 같이 보여줘요.</div>
    <div class="dbsum" style="margin-top:10px;border-radius:12px;background:var(--field);border:0"><span>대상 <b>${esc(svCondText())}</b> · 미완료 대출 <b>${svTargets().length}건</b> (현장 ${svTargets().reduce((s, r) => s + svSites(r).length, 0)}곳)</span><span class="muted">목록 화면에서 사업구분·담당자를 고르면 그 대상만 묶어요</span></div>
    <div class="dbline" style="margin-top:12px"><label style="margin:0">묶음 크기(가장 먼 두 곳 사이)</label><select id="svgKm">${[2, 3, 5, 8, 12, 20].map(k => `<option value="${k}" ${k === p.km ? 'selected' : ''}>${k}km 이내</option>`).join('')}</select>
      <label style="margin:0">최대</label><select id="svgN">${[4, 6, 8, 10, 15, 20].map(k => `<option value="${k}" ${k === p.n ? 'selected' : ''}>${k}곳</option>`).join('')}</select>
      <label class="chk" style="margin:0"><input type="checkbox" id="svgAsg" ${p.asg ? 'checked' : ''} /> 담당자별로 따로</label></div>
    <div class="dbline" style="margin-top:10px">${debtCan() ? '<button class="btn" data-g="geo" id="svgGeoBtn"></button>' : ''}<button class="btn primary" data-g="make">🧭 묶음 만들기</button><span class="muted" id="svgMsg" style="font-size:13px"></span></div>
    <div id="svgOut"></div>`;
  svGeoLabel(); svGroups = null; svShowOv('svGpOv');
}
function svGeoLabel(){
  const t = svTargets().flatMap(svSites), need = t.filter(r => r.lat == null && r.geo_status !== 'fail').length, fail = t.filter(r => r.geo_status === 'fail').length;
  const b = $('svgGeoBtn'); if (!b) return;
  b.textContent = need ? `📌 위치 확인 (${need}건)` : `📌 위치 확인 완료${fail ? ` · 실패 ${fail}건 다시 시도` : ''}`;
  b.dataset.retry = need ? '' : fail ? '1' : '0'; b.disabled = !need && !fail;
}
$('svGpPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-g]'); if (!b) return;
  const a = b.dataset.g;
  if (a === 'close') return svCloseOv('svGpOv');
  if (a === 'geo') return svRunGeo(b.dataset.retry === '1');
  if (a === 'make'){
    const km = +$('svgKm').value, n = +$('svgN').value, asg = $('svgAsg').checked; try { localStorage.setItem('svGp', JSON.stringify({ km, n, asg })); } catch (e) {}
    const targets = svPoints(svTargets()); svGroups = { list: svBuildGroups(targets, km, n, asg), km, n, cond: svCondText() };
    return svShowGroups();
  }
  if (a === 'mt'){ svMapType = b.dataset.t === 'sat' ? 'sat' : 'base'; try { localStorage.setItem('svMapType', svMapType); } catch (e) {} document.querySelectorAll('#svMapSeg button').forEach(x => x.classList.toggle('on', x.dataset.t === svMapType)); return svMapDraw(); }
  if (a === 'focus') return svMapFocus(+b.dataset.i);
  if (a === 'print') return svPrintGroups(b.dataset.i === undefined ? null : +b.dataset.i);
  if (a === 'finish'){
    const gi = +b.dataset.i, g = svGroups.list[gi], inp = $(`svgDate${gi}`), d = inp && inp.value;
    if (!d) return alert('실태조사일을 선택해주세요.');
    // 대출건은 현장을 모두 다녀와야 완료 → 현장이 전부 이 묶음 안에 있는 대출건만 완료 처리 (일부 현장이 다른 묶음에 있는 건은 제외)
    const cnt = new Map(); g.items.forEach(r => cnt.set(r.id, (cnt.get(r.id) || 0) + 1));
    const done = [...cnt].filter(([id, n]) => (svRows.find(x => x.id === id) || { sites: [] }).sites.length === n).map(x => x[0]), skip = cnt.size - done.length;
    if (!done.length) return alert('이 묶음의 대출건은 모두 다른 묶음에도 현장이 있어요. 모든 현장을 다녀온 뒤 목록에서 실태조사일을 넣어주세요.');
    if (!confirm(`${gi + 1}번 묶음의 대출 ${done.length}건의 실태조사일을 ${d}로 입력하고 완료 처리할까요?${skip ? `\n(다른 묶음에도 현장이 남은 ${skip}건은 완료 처리하지 않아요)` : ''}`)) return;
    b.disabled = true;
    const { error } = await sb.from('survey_cases').update({ survey_date: d, updated_at: new Date().toISOString() }).in('id', done);
    b.disabled = false; if (error) return alert(error.message);
    toast(`✅ 대출 ${done.length}건 완료 처리${skip ? ` (현장이 남은 ${skip}건 제외)` : ''}`); svGroups = null; $('svgOut').innerHTML = '<div class="muted" style="margin-top:12px">완료 처리했어요. 다시 “묶음 만들기”를 눌러 남은 곳으로 새로 묶어보세요.</div>';
    await loadSurvey(); svGeoLabel(); renderSurvey();
  }
});
async function svRunGeo(retry){
  if (svBusy) return; svBusy = true;
  const targets = svTargets().flatMap(svSites).filter(r => retry ? r.geo_status === 'fail' : r.lat == null && r.geo_status !== 'fail'), msg = $('svgMsg'); let done = 0, ok = 0, fail = 0, i = 0;
  $('svgGeoBtn').disabled = true;
  const worker = async () => {
    while (i < targets.length){
      const r = targets[i++], pos = await svGeocode(r.address);
      const patch = pos ? { lat: pos.lat, lng: pos.lng, geo_status: 'ok' } : { geo_status: 'fail' };
      const { error } = await sb.from('survey_sites').update(patch).eq('id', r.id);
      if (!error) Object.assign(r, patch);
      pos ? ok++ : fail++; done++; if (msg) msg.textContent = `위치 확인 중… ${done} / ${targets.length}`;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  svBusy = false; if (msg) msg.textContent = `위치 확인 끝 — 성공 ${ok}건${fail ? ` · 못 찾음 ${fail}건 (주소를 고치면 다시 시도할 수 있어요)` : ''}`; svGeoLabel();
}
const SV_COLORS = ['#e4572e', '#2e86de', '#16a34a', '#a855f7', '#f59e0b', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ea580c', '#0d9488', '#4b5563'];
const svColor = (i) => SV_COLORS[i % SV_COLORS.length];
let svMap = null, svMapGroups = [], svMapType = (() => { try { return localStorage.getItem('svMapType') === 'sat' ? 'sat' : 'base'; } catch (e) { return 'base'; } })();
async function svMapDraw(){
  const box = $('svMapEl'); if (!box) return;
  try { await apLoadLeaflet(); } catch (e) { box.innerHTML = `<div class="muted" style="padding:14px">${esc(e.message)} — 지도를 불러오지 못했어요.</div>`; return; }
  if (svMap){ svMap.remove(); svMap = null; }
  svMapGroups = [];
  box.innerHTML = '';
  svMap = L.map('svMapEl', { zoomControl: true, preferCanvas: false }).setView([37.88, 127.73], 11);
  const opt = { maxZoom: 19, maxNativeZoom: 18, attribution: '© 브이월드(국토교통부)' };
  const sat = svMapType === 'sat';
  const base = L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${sat ? 'Satellite' : 'Base'}/{z}/{y}/{x}.${sat ? 'jpeg' : 'png'}`, opt).addTo(svMap);
  if (sat) L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`, opt).addTo(svMap);   // 항공지도 위에 지명·도로명 표시
  let ok = 0, err = 0, fb = null;
  base.on('tileload', () => { ok++; }); base.on('tileerror', () => { err++; if (err >= 6 && !ok && !fb && !sat){ fb = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(svMap); fb.bringToBack(); } });
  const all = [];
  svGroups.list.forEach((g, gi) => {
    const pts = g.items.filter(r => r.lat != null && r.lng != null); if (!pts.length) return;
    const col = svColor(gi), layer = L.layerGroup().addTo(svMap), ll = pts.map(r => [r.lat, r.lng]);
    if (pts.length > 1) L.polyline(ll, { color: col, weight: 3, opacity: .75, dashArray: '6 6' }).addTo(layer);
    pts.forEach((r, k) => {
      const icon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:30px;height:30px;border-radius:50%;background:${col};color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${gi + 1}</div>` });
      L.marker([r.lat, r.lng], { icon }).bindPopup(`<b>${gi + 1}번 묶음 · ${k + 1}번째</b>${svSiteTag(r) ? ' · ' + svSiteTag(r) : ''}<br>${esc(r.name)} ${r.balance !== null ? '· ' + svComma(r.balance) + '원' : ''}<br><span style="color:#667">${esc(r.address)}</span>`).addTo(layer);
    });
    svMapGroups[gi] = L.latLngBounds(ll); all.push(...ll);
  });
  if (all.length) svMap.fitBounds(L.latLngBounds(all).pad(0.15), { maxZoom: 15 });
  setTimeout(() => svMap && svMap.invalidateSize(), 150);
}
function svMapFocus(gi){
  if (!svMap || !svMapGroups[gi]) return;
  $('svMapEl').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  svMap.fitBounds(svMapGroups[gi].pad(0.3), { maxZoom: 16 });
}
function svShowGroups(){
  const gs = svGroups.list, tot = gs.reduce((s, g) => s + g.items.length, 0), loanN = new Set(gs.flatMap(g => g.items.map(r => r.id))).size, unk = gs.filter(g => g.unk).reduce((s, g) => s + g.items.length, 0), today = kstToday();
  const need = svTargets().flatMap(svSites).filter(r => r.lat == null && r.geo_status !== 'fail').length;
  $('svgOut').innerHTML = `<div class="dbsum" style="margin-top:12px;border-radius:12px;background:var(--field)"><span><b>${gs.length}개 묶음</b> · 현장 ${tot}곳 (대출 ${loanN}건)</span><span>묶음당 평균 ${(tot / Math.max(1, gs.length)).toFixed(1)}곳</span>${unk ? `<span class="o">위치 미확인 ${unk}곳 (주소 기준으로 묶음)</span>` : ''}${need ? `<span class="r">위치 확인 안 한 건 ${need}곳 — ${debtCan() ? '먼저 “위치 확인”을 눌러주세요' : '권한자가 위치 확인을 하면 지도에 나와요'}</span>` : ''}<span style="flex:1"></span><button class="btn small" data-g="print">🖨 전체 인쇄</button></div>
    <div class="seg" id="svMapSeg" style="margin-top:12px"><button data-g="mt" data-t="base" class="${svMapType === 'base' ? 'on' : ''}">🗺 일반지도</button><button data-g="mt" data-t="sat" class="${svMapType === 'sat' ? 'on' : ''}">🛰 항공지도</button><span class="muted" style="align-self:center;margin-left:8px;font-size:12.5px">고른 지도로 보고서도 인쇄돼요</span></div>
    <div id="svMapEl" class="svmap" style="margin-top:8px"><div class="muted" style="padding:14px">지도를 불러오는 중…</div></div>
    <div class="muted" style="font-size:12.5px;margin-top:6px">원 안의 숫자 = 묶음 번호, 점선 = 추천 방문 순서. 묶음의 “🗺 지도에서 보기”를 누르면 그 묶음으로 확대돼요.${gs.some(g => g.unk) ? ' (위치 미확인 묶음은 지도에 나오지 않아요)' : ''}</div>
    ${gs.map((g, i) => `<div class="svgrp ${g.unk ? 'unk' : ''}"><div class="gh"><span class="gn" style="background:${g.unk ? '#9aa3b2' : svColor(i)}">${i + 1}</span><b>${esc(g.name)}</b><span class="muted">${g.items.length}곳${g.loans !== g.items.length ? ` · 대출 ${g.loans}건` : ''}</span><span style="flex:1"></span>${g.unk ? '' : `<button class="btn small" data-g="focus" data-i="${i}">🗺 지도에서 보기</button>`}<button class="btn small" data-g="print" data-i="${i}">🖨 인쇄</button></div>
      <div class="gm">대출잔액 ${esc(dbWon(g.sum))}${g.diam !== null && g.items.length > 1 ? ` · 가장 먼 두 곳 약 ${g.diam.toFixed(1)}km` : ''}${g.unk ? ' · 좌표 없음(주소 기준)' : ''}${g.asg ? ` · 담당 ${esc(g.asg)}` : ''}</div>
      <ol>${(() => { const fs = svFirstOf(g.items); return g.items.map((r, ix) => `<li><b>${esc(r.name)}</b> <small>${esc(r.biz_type || '')}${svSiteTag(r) ? ' · ' + svSiteTag(r) : ''}${r.balance !== null ? (fs[ix] ? ' · ' + svComma(r.balance) + '원' : ' · (잔액 위와 같은 대출건)') : ''}${!g.asg && svAsgName(r) ? ' · ' + esc(svAsgName(r)) : ''}</small><br><small>${esc(r.address)}</small></li>`).join(''); })()}</ol>
      <div class="dbline" style="margin:8px 0 0 34px"><span class="muted" style="font-size:13px">이 묶음을 같이 조사했다면</span><input type="date" id="svgDate${i}" value="${today}" /><button class="btn small primary" data-g="finish" data-i="${i}">✅ 조사일 입력·완료</button></div></div>`).join('')}`;
  if (!debtCan()) document.querySelectorAll('#svgOut .dbline').forEach(x => { if (x.querySelector('[data-g=finish]')) x.remove(); });
  svMapDraw();
}
// 인쇄용 지도 그림: 브이월드(안 되면 OpenStreetMap) 타일을 캔버스에 이어 붙이고 마커·방문 순서선을 그려 PNG 로 만든다.
// 타일을 가져올 수 없거나 캔버스가 막히면(CORS) 배경 없는 위치 개략도로 대신한다.
const svLoadImg = (src) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; const t = setTimeout(() => res(null), 9000); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = src; });
async function svMapImage(sets, W = 1400, H = 560, type = 'base'){   // sets: [{ items, color, label: (k, item) => text }]
  const pts = sets.flatMap(g => g.items.filter(r => r.lat != null && r.lng != null)); if (!pts.length) return null;
  const mx = (lng, z) => (lng + 180) / 360 * 2 ** z * 256, my = (lat, z) => (1 - Math.log(Math.tan(svRad(lat)) + 1 / Math.cos(svRad(lat))) / Math.PI) / 2 * 2 ** z * 256;
  const la = pts.map(r => r.lat), lo = pts.map(r => r.lng), pad = 90;
  let z = 17; for (; z > 8; z--){ const w = mx(Math.max(...lo), z) - mx(Math.min(...lo), z), h = my(Math.min(...la), z) - my(Math.max(...la), z); if (w <= (W - pad * 2) / 2 && h <= (H - pad * 2) / 2) break; }
  const cx = mx((Math.min(...lo) + Math.max(...lo)) / 2, z), cy = my((Math.min(...la) + Math.max(...la)) / 2, z), S = 2;   // 타일 1장 = 512px (선명하게)
  const ox = cx * S - W / 2, oy = cy * S - H / 2, tx0 = Math.floor(ox / (256 * S)), tx1 = Math.floor((ox + W) / (256 * S)), ty0 = Math.floor(oy / (256 * S)), ty1 = Math.floor((oy + H) / (256 * S));
  const px = (r) => [mx(r.lng, z) * S - ox, my(r.lat, z) * S - oy];
  const draw = (tiles, credit) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#eef1f5'; g.fillRect(0, 0, W, H);
    tiles.forEach(t => { if (t.im) g.drawImage(t.im, t.x * 256 * S - ox, t.y * 256 * S - oy, 256 * S, 256 * S); });
    if (!tiles.some(t => t.im)){ g.strokeStyle = '#dde2ea'; g.lineWidth = 1; for (let x = 0; x < W; x += 100){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 100){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    sets.forEach(set => {
      const p = set.items.filter(r => r.lat != null && r.lng != null).map(px);
      if (p.length > 1){ g.strokeStyle = set.color; g.lineWidth = 5; g.globalAlpha = .8; g.setLineDash([16, 12]); g.beginPath(); p.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    });
    sets.forEach(set => set.items.filter(r => r.lat != null && r.lng != null).forEach((r, k) => {
      const [x, y] = px(r); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 25, 0, 7); g.fill(); g.fillStyle = set.color; g.beginPath(); g.arc(x, y, 21, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(set.label(k, r)), x, y + 1);
    }));
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(W - 330, H - 30, 330, 30); g.fillStyle = '#556'; g.font = '19px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(credit, W - 8, H - 15);
    return c;
  };
  const tl = []; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) tl.push({ x, y });
  const tryTiles = async (url) => { const t = await Promise.all(tl.map(async (p) => ({ ...p, im: await svLoadImg(url(p.x, p.y)) }))); return t.filter(x => x.im).length >= Math.ceil(t.length * .6) ? t : null; };
  const sat = type === 'sat';
  let tiles = await tryTiles((x, y) => `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${sat ? 'Satellite' : 'Base'}/${z}/${y}/${x}.${sat ? 'jpeg' : 'png'}`), credit = '© 브이월드(국토교통부)';
  if (tiles && sat){ const over = await Promise.all(tl.map(async (p) => ({ ...p, im: await svLoadImg(`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/${z}/${p.y}/${p.x}.png`) }))); tiles = tiles.concat(over.filter(t => t.im)); credit = '© 브이월드(국토교통부) · 항공영상'; }   // 지명 표시 겹치기
  if (!tiles && !sat){ tiles = await tryTiles((x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`); credit = '© OpenStreetMap'; }
  if (tiles){ try { return draw(tiles, credit).toDataURL('image/png'); } catch (e) { /* 캔버스 보안 제한 → 배경 없이 */ } }
  return draw([], '위치 개략도 (지도 배경 없음)').toDataURL('image/png');
}
async function svPrintGroups(only){
  if (!svGroups) return;
  toast('🗺 지도를 만드는 중이에요…');
  const sel = svGroups.list.map((g, i) => ({ g, i })).filter(x => only === null || x.i === only);
  const imgs = new Map();
  await Promise.all(sel.map(async ({ g, i }) => { if (!g.unk) imgs.set(i, await svMapImage([{ items: g.items, color: svColor(i), label: (k) => k + 1 }], 1400, 560, svMapType).catch(() => null)); }));
  const overview = only === null && sel.filter(x => !x.g.unk).length > 1 ? await svMapImage(sel.filter(x => !x.g.unk).map(({ g, i }) => ({ items: g.items, color: svColor(i), label: () => i + 1 })), 1400, 700, svMapType).catch(() => null) : null;
  svPrintGroupsHtml(only, imgs, overview);
}
function svPrintGroupsHtml(only, imgs, overview){
  const today = kstToday(), gs = svGroups.list.map((g, i) => ({ g, i })).filter(x => only === null || x.i === only);
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const css = `@page{size:A4;margin:14mm 15mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;padding:0 1px;font-size:12px;line-height:1.4}
  .top{display:flex;justify-content:space-between;align-items:flex-start}.org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444;padding-top:4px}
    .title{margin-top:14px;border-top:5px solid #111;border-bottom:1px solid #111;padding:12px 0 9px;text-align:center}.title h1{font-size:24px;margin:0;letter-spacing:3px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  h2{font-size:13.5px;margin:14px 0 5px;padding-left:9px;border-left:5px solid #111;page-break-after:avoid}h2 small{font-weight:500;color:#555;font-size:11.5px;margin-left:6px}
  table.t{width:calc(100% - 1px);border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:4px 6px;vertical-align:middle}table.t th{background:#eee;font-size:11.5px}
  tr{page-break-inside:avoid}thead{display:table-header-group}.c{text-align:center}.r{text-align:right}.nw{white-space:nowrap}.g{page-break-inside:avoid}img.map{display:block;width:100%;height:auto;border:1px solid #444;margin:0 0 6px}.foot{margin-top:10px;font-size:11px;color:#666;text-align:center}`;
  const sum = `<h2>묶음 요약 <small>(${gs.length}개 묶음 · 현장 ${gs.reduce((s, x) => s + x.g.items.length, 0)}곳)</small></h2><table class="t"><thead><tr><th style="width:6%">묶음</th><th>권역</th><th style="width:9%">건수</th><th style="width:20%">대출잔액 합계</th><th style="width:16%">조사 예정일</th></tr></thead><tbody>${gs.map(({ g, i }) => `<tr><td class="c">${i + 1}</td><td>${esc(g.name)}${g.unk ? ' (위치 미확인)' : ''}${g.asg ? ' · ' + esc(g.asg) : ''}</td><td class="c">${g.items.length}${g.loans !== g.items.length ? `<br><small>(대출 ${g.loans})</small>` : ''}</td><td class="r">${esc(svComma(g.sum))}원</td><td></td></tr>`).join('')}</tbody></table>`;
  const body = gs.map(({ g, i }) => `<div class="g"><h2>${i + 1}번 묶음 — ${esc(g.name)}<small>${g.items.length}곳 · 잔액 ${esc(svComma(g.sum))}원${g.loans !== g.items.length ? ` (대출 ${g.loans}건 기준)` : ''}${g.diam !== null && g.items.length > 1 ? ` · 가장 먼 두 곳 약 ${g.diam.toFixed(1)}km` : ''}${g.unk ? ' · 위치 미확인(주소 기준)' : ''}</small></h2>
    ${imgs.get(i) ? `<img class="map" src="${imgs.get(i)}" alt="묶음 지도" />` : ''}<table class="t"><thead><tr><th style="width:6.5%;white-space:nowrap">순서</th><th style="width:10%">성명</th><th style="width:10%">고객번호</th><th style="width:17%">계좌번호</th><th style="width:12%">대출잔액(원)</th><th style="width:9%">사업구분</th><th>사업장 소재지</th><th style="width:8%">담당</th><th style="width:11%">조사일</th></tr></thead><tbody>
    ${(() => { const fs = svFirstOf(g.items); return g.items.map((r, k) => `<tr><td class="c">${k + 1}</td><td>${esc(r.name)}</td><td class="c nw">${esc(r.cust_no)}</td><td class="c nw">${esc(r.account_no)}</td><td class="r nw">${r.balance === null ? '-' : fs[k] ? esc(svComma(r.balance)) : '〃'}</td><td class="c">${esc(r.biz_type || '')}</td><td>${esc(r.address)}${svSiteTag(r) ? ` <small>(${svSiteTag(r)})</small>` : ''}</td><td class="c">${esc(svAsgName(r))}</td><td></td></tr>`).join(''); })()}</tbody></table></div>`).join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>정책자금 실태조사 현장 묶음</title>${link}<style>${css}</style></head><body>
    <div class="top"><div class="org">${esc(org)}</div></div>
    <div class="title"><h1>정책자금 실태조사 현장 조사 계획</h1><div class="sub">기준일 ${esc(today)} · 가까운 사업장끼리 묶음 (묶음 ${svGroups.km}km 이내 · 최대 ${svGroups.n}곳 · 대상 ${esc(svGroups.cond || '전체')} · ${svMapType === 'sat' ? '항공지도' : '일반지도'})</div></div>${only === null ? sum : ''}${overview ? `<h2>전체 지도 <small>(원 안의 숫자 = 묶음 번호)</small></h2><img class="map" src="${overview}" alt="전체 지도" />` : ''}${body}
    <div class="foot">방문 순서는 가까운 곳으로 이어가는 추천 순서이며, 실제 동선에 맞게 조정하세요.</div></body></html>`;
  apPreview(html, '정책자금 실태조사 현장 조사 계획', `실태조사_현장묶음_${today}`);
}
