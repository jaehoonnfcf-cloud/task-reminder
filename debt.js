// 사후관리 > 연체채권관리 — 연체 채무자별 연체일수 · 연락/방문 이력 · 다음 조치 예정일. 별도 권한(perm_debt) 또는 관리자만 보고 입력한다.
// index.html 의 전역(sb, $, esc, me, meRow, members, nameOf, kstToday, toast, divn)을 함께 쓴다.

const DEBT_KINDS = ['전화', '문자', '방문', '면담', '우편', '기타'];
const DEBT_ICON = { '전화': '📞', '문자': '💬', '방문': '🚪', '면담': '🤝', '우편': '✉️', '기타': '📝' };
let dbLogEdit = null, dbLogEditShown = null;
let debtCases = [], debtOpenId = null, debtFormId = null, debtTimer = null;
let dbView = 'active', dbScope = 'all', dbMine = false, dbQ = '', dbSort = 'next';
const debtCan = () => !!(meRow && (meRow.is_admin || meRow.perm_debt));

const dbNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const dbComma = (s) => { const n = dbNum(s); return n === null ? '' : n.toLocaleString('ko-KR'); };
const dbWon = (n) => {
  if (n === null || n === undefined || n === '') return '-';
  n = Number(n); if (!n) return '0원';
  const e = Math.floor(n / 1e8), m = Math.floor(n % 1e8 / 1e4), r = n % 1e4;
  return [e && `${e}억`, m && `${m.toLocaleString('ko-KR')}만`, r && `${r.toLocaleString('ko-KR')}`].filter(Boolean).join(' ') + '원';
};
const dbDiff = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(kstToday() + 'T12:00:00Z')) / 864e5) + 0;   // -0 방지. 오늘 기준 (미래 +, 과거 −)
const dbDays = (c) => 0 - dbDiff(c.overdue_since);                                  // 연체일수 = 오늘 − 연체기준일
const dbLogs = (c) => [...(c.debt_logs || [])].sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)) || b.id - a.id);
const dbMd = (iso) => iso ? iso.slice(5).replace('-', '/') : '';
function dbDaysTag(c){
  const d = dbDays(c);
  if (c.status === '종결') return `<span class="dbd end">종결</span>`;
  if (d < 0) return `<span class="dbd">연체 전 D${d}</span>`;
  return `<span class="dbd ${d >= 90 ? 'r3' : d >= 30 ? 'r2' : 'r1'}">연체 ${d.toLocaleString('ko-KR')}일</span>`;
}
function dbNext(c){
  if (!c.next_action_date) return { cls: 'none', txt: '예정일 미정' };
  const n = dbDiff(c.next_action_date);
  if (n < 0) return { cls: 'over', txt: `${-n}일 지연`, d: n };
  if (n === 0) return { cls: 'today', txt: '오늘', d: n };
  return { cls: 'soon', txt: `D-${n}`, d: n };
}

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #debt{ display:none; flex-direction:column; gap:18px; min-width:0; }
  #debtMain{ display:flex; flex-direction:column; gap:10px; min-width:0; } .dbsecT{ font-size:19px; font-weight:800; letter-spacing:-.03em; padding:2px 6px; }
  .dbsum{ padding:12px 18px; font-size:13.5px; color:#44546f; display:flex; gap:6px 16px; flex-wrap:wrap; border-bottom:1px solid var(--line); }
  .dbsum b{ color:var(--ink); } .dbsum .r{ color:var(--danger); font-weight:700; } .dbsum .o{ color:var(--warn); font-weight:700; }
  .dbhead,.dbrow{ display:grid; grid-template-columns:minmax(120px,.8fr) 108px 118px minmax(150px,1.7fr) minmax(130px,1fr); gap:10px; align-items:center; padding:0 22px; }
  .dbhead > *, .dbrow > *{ min-width:0; }
  .dbhead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:10px; padding-bottom:8px; }
  .dbrow{ padding-top:15px; padding-bottom:15px; cursor:pointer; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; transition:box-shadow .15s, transform .15s; }
  .dbrow:hover{ box-shadow:var(--sh-hover); transform:translateY(-1px); }
  .dbrow .tt{ font-size:16.5px; letter-spacing:-.02em; font-weight:700; line-height:1.35; word-break:break-word; }
  .dbrow .ts{ font-size:12.5px; color:var(--muted); margin-top:2px; white-space:normal; line-height:1.4; }
  .dbrow.closed{ opacity:.65; }
  .dbd{ display:inline-block; font-size:13px; font-weight:800; padding:4px 11px; border-radius:99px; background:#eef1f6; color:#4b5563; white-space:nowrap; }
  .dbd.r1{ background:var(--warn-soft); color:var(--warn); } .dbd.r2{ background:#ffe4cc; color:#c2570c; } .dbd.r3{ background:var(--danger-soft); color:var(--danger); } .dbd.end{ background:var(--green-soft); color:var(--green); }
  .dbmoney{ font-size:14.5px; font-weight:700; }
  .dblast{ font-size:13px; color:#44546f; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; }
  .dblast .m{ color:var(--muted); font-weight:600; margin-right:4px; }
  .dbnx{ font-size:13.5px; font-weight:700; line-height:1.4; } .dbnx small{ display:block; font-size:12px; font-weight:500; color:var(--muted); }
  .dbnx.over{ color:var(--danger); } .dbnx.today{ color:var(--warn); } .dbnx.soon{ color:var(--accent); } .dbnx.none{ color:var(--muted); font-weight:600; }
  .dbPanel{ max-width:760px !important; }
  .dbinfo{ margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px 18px; }
  .dbinfo .k{ font-size:12px; color:var(--muted); font-weight:600; } .dbinfo .v{ font-size:15px; font-weight:600; margin-top:2px; word-break:break-word; }
  .dbsec{ margin-top:20px; background:var(--field); border-radius:16px; padding:14px 16px; }
  .dbsec > .k{ font-size:13px; font-weight:800; color:#44546f; margin-bottom:8px; }
  .dbline{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .dbline input[type=date]{ width:auto; min-width:150px; } .dbline input.grow{ flex:1; min-width:160px; }
  .dblog{ display:flex; gap:10px; padding:11px 2px; border-bottom:1px solid var(--line); }
  .dblog:last-child{ border-bottom:0; }
  .dblog .ic{ flex:none; width:34px; height:34px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; }
  .dblog .bd{ flex:1; min-width:0; } .dblog .hd{ font-size:12.5px; color:var(--muted); font-weight:600; }
  .dblog .tx{ font-size:14.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; margin-top:2px; }
  .dblog .del{ border:0; background:transparent; color:var(--muted); cursor:pointer; font-size:14px; align-self:flex-start; }
  @media (max-width:760px){
    .dbhead{ display:none; }
    .dbrow{ grid-template-columns:1fr auto; gap:6px 10px; padding:14px 16px; border-radius:20px; }
    .dbrow > :nth-child(1){ grid-column:1 / 2; } .dbrow > :nth-child(2){ grid-column:2 / 3; justify-self:end; }
    .dbrow > :nth-child(3), .dbrow > :nth-child(4), .dbrow > :nth-child(5){ grid-column:1 / 3; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="dbDetailOv"><div class="panel dbPanel" id="dbDetailPanel"></div></div>
    <div class="ov" id="dbFormOv" style="z-index:30"><div class="panel" style="max-width:520px" id="dbFormPanel"></div></div>`;
  document.body.appendChild(d);
  $('dbDetailOv').addEventListener('click', (e) => { if (e.target === $('dbDetailOv')) dbCloseDetail(); });
  $('dbFormOv').addEventListener('click', (e) => { if (e.target === $('dbFormOv')) dbCloseForm(); });
})();

// ---------- 불러오기 ----------
async function loadDebt(){
  if (!debtCan()){ debtCases = []; dbBadge(); return; }
  const { data, error } = await sb.from('debt_cases').select('*, debt_logs(*)').order('id', { ascending: false });
  if (error){ console.warn('채권관리 불러오기 실패', error.message); return; }
  debtCases = data || [];
  dbBadge();
  if (divn === 'debt') renderDebt();
  if (typeof loadFire === 'function') loadFire();
  const ae = document.activeElement;
  if (debtOpenId && !(ae && $('dbDetailOv').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) renderDbDetail();
}
function scheduleDebt(){ clearTimeout(debtTimer); debtTimer = setTimeout(() => { if (me) loadDebt(); }, 400); }
function dbBadge(){   // 오늘 조치 + 지연된 조치 건수
  const n = debtCases.filter(c => c.status !== '종결' && c.next_action_date && dbDiff(c.next_action_date) <= 0).length;
  const el = $('nDebt'); if (!el) return;
  el.textContent = n || ''; el.style.display = n ? '' : 'none';
}

// ---------- 목록 ----------
function renderDebt(){
  const el = $('debtMain');
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.innerHTML = `<div class="dbsecT">📞 연체채권관리</div><div class="list-panel">
      <div class="toolbar">
        <div class="seg" id="dbViewSeg"><button data-v="active">진행중 <span id="dbNA"></span></button><button data-v="closed">종결 <span id="dbNB"></span></button></div>
        <select id="dbScope"><option value="all">본점·지점</option><option value="본점">본점</option><option value="지점">지점</option></select>
        <select id="dbSort"><option value="next">다음 조치 임박순</option><option value="days">연체일수 많은순</option><option value="new">최근 등록순</option></select>
        <label class="chk"><input type="checkbox" id="dbMine" /> 내 담당만</label>
        <input id="dbQ" class="search" type="search" placeholder="🔍 채무자 검색" />
        <button class="btn small" id="dbRpBtn" type="button" title="사후관리대장 보고서 출력">🖨 사후관리대장</button>
      </div>
      <div class="dbsum" id="dbSum"></div>
      <div class="dbhead"><span>채무자</span><span>연체일수</span><span>연체 원금</span><span>최근 연락·방문</span><span>다음 조치</span></div>
      <div id="dbList"></div></div>`;
    $('dbViewSeg').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; dbView = b.dataset.v; renderDebt(); };
    $('dbScope').onchange = () => { dbScope = $('dbScope').value; renderDebt(); };
    $('dbSort').onchange = () => { dbSort = $('dbSort').value; renderDebt(); };
    $('dbMine').onchange = () => { dbMine = $('dbMine').checked; renderDebt(); };
    $('dbQ').oninput = () => { dbQ = $('dbQ').value.trim().toLowerCase(); renderDebt(); };
    $('dbRpBtn').onclick = () => dbrOpenDialog();
    $('dbList').addEventListener('click', (e) => { const r = e.target.closest('[data-db]'); if (r) dbOpenDetail(+r.dataset.db); });
  }
  const nEnd = debtCases.filter(c => c.status === '종결').length;
  $('dbNA').textContent = debtCases.length - nEnd; $('dbNB').textContent = nEnd;
  document.querySelectorAll('#dbViewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === dbView));
  const shown = debtCases.filter(c => (dbView === 'closed' ? c.status === '종결' : c.status !== '종결') && (dbScope === 'all' || c.scope === dbScope)
    && (!dbMine || c.assignee_email === me) && (!dbQ || (c.debtor_name || '').toLowerCase().includes(dbQ)));
  const nx = (c) => c.next_action_date || '9999-12-31';
  shown.sort(dbSort === 'days' ? (a, b) => dbDays(b) - dbDays(a) : dbSort === 'new' ? (a, b) => b.id - a.id : (a, b) => nx(a).localeCompare(nx(b)) || dbDays(b) - dbDays(a));
  const act = shown.filter(c => c.status !== '종결');
  const late = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) < 0).length, tod = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) === 0).length;
  const sum = act.reduce((s, c) => s + Number(c.principal || 0), 0);
  $('dbSum').innerHTML = `<span><b>${shown.length}건</b></span>${act.length && sum ? `<span>연체 원금 합계 <b>${dbWon(sum)}</b></span>` : ''}${late ? `<span class="r">조치 지연 ${late}건</span>` : ''}${tod ? `<span class="o">오늘 조치 ${tod}건</span>` : ''}`;
  $('dbList').innerHTML = shown.map(dbRowHtml).join('') || `<div class="blk-empty">${dbView === 'closed' ? '종결된 채권이 없어요.' : debtCases.length ? '조건에 맞는 채권이 없어요.' : '등록된 채권이 없어요. 오른쪽 위 “＋ 채권 등록”으로 시작해요.'}</div>`;
}
function dbRowHtml(c){
  const lg = dbLogs(c)[0], nx = dbNext(c);
  return `<div class="dbrow ${c.status === '종결' ? 'closed' : ''}" data-db="${c.id}">
    <div><div class="tt"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)}</div><div class="ts">담당 ${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')} · 기준일 ${esc(c.overdue_since)}</div></div>
    <div>${dbDaysTag(c)}</div>
    <div class="dbmoney">${c.principal === null ? '<span class="muted">-</span>' : dbWon(c.principal)}</div>
    <div class="dblast">${lg ? `<span class="m">${DEBT_ICON[lg.kind] || ''} ${esc(dbMd(lg.log_date))}</span>${esc(lg.body)}` : '<span class="muted">이력 없음</span>'}</div>
    <div class="dbnx ${c.status === '종결' ? 'none' : nx.cls}">${c.status === '종결' ? '-' : `${nx.txt}${c.next_action_date ? `<small>${esc(dbMd(c.next_action_date))}${c.next_action_note ? ' · ' + esc(c.next_action_note) : ''}</small>` : ''}`}</div></div>`;
}

// ---------- 상세 ----------
function dbOpenDetail(id){ debtOpenId = id; dbLogEdit = null; renderDbDetail(); $('dbDetailOv').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function dbCloseDetail(){ debtOpenId = null; dbLogEdit = null; $('dbDetailOv').style.display = 'none'; document.body.style.overflow = $('dbFormOv').style.display === 'block' ? 'hidden' : ''; }
function renderDbDetail(){
  const c = debtCases.find(x => x.id === debtOpenId);
  if (!c){ if (debtOpenId) dbCloseDetail(); return; }
  const logs = dbLogs(c), closed = c.status === '종결';
  const editing = dbLogEdit ? logs.find(l => l.id === dbLogEdit) : null; if (dbLogEdit && !editing) dbLogEdit = null;
  const fresh = !!editing && dbLogEditShown !== dbLogEdit; dbLogEditShown = dbLogEdit;
  const cur = document.querySelector('input[name=dbLogKindR]:checked');
  // 작성 중인 이력은 다시 그려도 유지 (수정을 막 시작한 때만 기존 값으로 채움)
  const keep = fresh ? { d: editing.body, date: editing.log_date, kind: editing.kind } : { d: ($('dbLogBody') || {}).value || '', date: ($('dbLogDate') || {}).value || kstToday(), kind: cur ? cur.value : '전화' };
  $('dbDetailPanel').innerHTML = `<div class="ph"><h2><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)} ${dbDaysTag(c)}</h2><button class="x" data-d="close">✕</button></div>
    <div class="dbinfo">
      <div><div class="k">연체기준일</div><div class="v">${esc(c.overdue_since)}</div></div>
      <div><div class="k">연체일수</div><div class="v">${closed ? '-' : dbDays(c) < 0 ? `연체 전 (D${dbDays(c)})` : `${dbDays(c).toLocaleString('ko-KR')}일`}</div></div>
      <div><div class="k">연체 원금</div><div class="v">${c.principal === null ? '-' : dbWon(c.principal)}</div></div>
      <div><div class="k">담당자</div><div class="v">${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')}</div></div>
      <div><div class="k">등록</div><div class="v">${esc(nameOf(c.created_by))} · ${esc(String(c.created_at).slice(0, 10))}</div></div>
      ${closed && c.closed_at ? `<div><div class="k">종결일</div><div class="v">${esc(String(c.closed_at).slice(0, 10))}</div></div>` : ''}
    </div>
    ${c.memo ? `<div class="dbsec"><div class="k">메모</div><div style="white-space:pre-wrap;font-size:14.5px;line-height:1.5">${esc(c.memo)}</div></div>` : ''}
    ${closed ? '' : `<div class="dbsec"><div class="k">📅 다음 조치 예정</div>
      <div class="dbline"><input type="date" id="dbNxD" value="${esc(c.next_action_date || '')}" /><input class="grow" id="dbNxN" maxlength="200" placeholder="예: 내용증명 발송 / 자택 방문" value="${esc(c.next_action_note || '')}" />
      <button class="btn primary small" data-d="savenext">저장</button>${c.next_action_date ? '<button class="btn small" data-d="clearnext">비우기</button>' : ''}</div></div>`}
    <div class="dbsec"><div class="k">연락·방문 이력 <span class="muted">(${logs.length}건)</span></div>
      <div class="checks" id="dbLogKind">${DEBT_KINDS.map((k, i) => `<label><input type="radio" name="dbLogKindR" value="${k}" ${keep.kind === k ? 'checked' : ''}/> ${DEBT_ICON[k]} ${k}</label>`).join('')}</div>
      <div class="dbline" style="margin-top:8px"><input type="date" id="dbLogDate" value="${esc(keep.date)}" /></div>
      <textarea id="dbLogBody" rows="3" maxlength="1000" placeholder="통화·방문 내용, 채무자 반응, 약속한 사항 등" style="margin-top:8px">${esc(keep.d)}</textarea>
      ${editing ? `<div class="muted" style="font-size:13px;margin-top:8px">✏️ ${esc(editing.log_date)} 이력을 수정하는 중이에요</div>` : ''}
      <div class="dbline" style="margin-top:8px">${editing ? '' : '<span class="muted" style="font-size:13px">다음 조치일도 같이 정하기</span><input type="date" id="dbLogNext" />'}<span style="flex:1"></span>${editing ? '<button class="btn" data-d="canceledit">취소</button>' : ''}<button class="btn primary" data-d="addlog">${editing ? '수정 저장' : '이력 추가'}</button></div>
      <div style="margin-top:10px">${logs.map(l => `<div class="dblog"><div class="ic">${DEBT_ICON[l.kind] || '📝'}</div><div class="bd"><div class="hd">${esc(l.log_date)} · ${esc(l.kind)} · ${esc(nameOf(l.created_by))}</div><div class="tx">${esc(l.body)}</div></div>${l.created_by === me || isAdmin() ? `<button class="del" data-ledit="${l.id}" title="이 이력 수정">✏️</button><button class="del" data-ldel="${l.id}" title="이 이력 삭제">✕</button>` : ''}</div>`).join('') || '<div class="muted" style="padding:6px 2px">아직 이력이 없어요.</div>'}</div></div>
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-d="edit">수정</button><button class="btn" data-d="print">🖨 기록 출력</button><button class="btn" data-d="${closed ? 'reopen' : 'close2'}">${closed ? '↩ 진행중으로 되돌리기' : '✅ 종결 처리'}</button></div>${c.created_by === me || isAdmin() ? '<button class="btn danger" data-d="del">삭제</button>' : ''}</div>`;
}
$('dbDetailPanel').addEventListener('click', async (ev) => {
  const c = debtCases.find(x => x.id === debtOpenId); if (!c) return;
  const le = ev.target.closest('[data-ledit]');
  if (le){ dbLogEdit = +le.dataset.ledit; renderDbDetail(); const t = $('dbLogBody'); if (t){ t.scrollIntoView({ block: 'center' }); t.focus(); } return; }
  const ld = ev.target.closest('[data-ldel]');
  if (ld){
    if (!confirm('이 이력을 삭제할까요?')) return;
    const { error } = await sb.from('debt_logs').delete().eq('id', +ld.dataset.ldel);
    if (error) return alert(error.message);
    return loadDebt();
  }
  const b = ev.target.closest('[data-d]'); if (!b) return;
  const act = b.dataset.d;
  if (act === 'close') return dbCloseDetail();
  if (act === 'edit') return dbOpenForm(c.id);
  if (act === 'print') return dbrPrint({ status: 'all', scope: 'all', summary: false, detail: true, from: '', to: '', ids: [c.id] });
  const upd = async (patch, msg) => { const { error } = await sb.from('debt_cases').update(patch).eq('id', c.id); if (error) return alert(error.message); if (msg) toast(msg); await loadDebt(); };
  if (act === 'savenext') return upd({ next_action_date: $('dbNxD').value || null, next_action_note: $('dbNxN').value.trim() || null }, '📅 다음 조치를 저장했어요');
  if (act === 'clearnext') return upd({ next_action_date: null, next_action_note: null }, '다음 조치를 비웠어요');
  if (act === 'close2'){ if (!confirm('종결 처리할까요? (종결 탭으로 이동해요)')) return; return upd({ status: '종결', closed_at: new Date().toISOString(), next_action_date: null, next_action_note: null }, '✅ 종결 처리했어요'); }
  if (act === 'reopen') return upd({ status: '진행중', closed_at: null }, '진행중으로 되돌렸어요');
  if (act === 'del'){
    if (!confirm(`"${c.debtor_name}" 건과 모든 이력을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from('debt_cases').delete().eq('id', c.id);
    if (error) return alert(error.message);
    dbCloseDetail(); return loadDebt();
  }
  if (act === 'canceledit'){ dbLogEdit = null; $('dbLogBody').value = ''; return renderDbDetail(); }
  if (act === 'addlog'){
    const body = $('dbLogBody').value.trim(), date = $('dbLogDate').value, next = $('dbLogNext') ? $('dbLogNext').value : '';
    if (!date) return alert('날짜를 선택해주세요.');
    if (!body) return alert('내용을 입력해주세요.');
    const kind = (document.querySelector('input[name=dbLogKindR]:checked') || {}).value || '전화';
    b.disabled = true;
    if (dbLogEdit){
      const r0 = await sb.from('debt_logs').update({ log_date: date, kind, body }).eq('id', dbLogEdit);
      b.disabled = false; if (r0.error) return alert(r0.error.message);
      dbLogEdit = null; $('dbLogBody').value = ''; toast('✏️ 이력을 수정했어요'); return loadDebt();
    }
    const r1 = await sb.from('debt_logs').insert({ case_id: c.id, log_date: date, kind, body });
    if (r1.error){ b.disabled = false; return alert(r1.error.message); }
    if (next) await sb.from('debt_cases').update({ next_action_date: next }).eq('id', c.id);
    b.disabled = false; $('dbLogBody').value = '';
    toast('📝 이력을 추가했어요'); await loadDebt();
  }
});

// ---------- 등록/수정 ----------
function dbOpenForm(id){
  if (!debtCan()) return;
  debtFormId = id || null;
  const c = id ? debtCases.find(x => x.id === id) : null; if (id && !c) return;
  const staff = members.filter(m => m.is_admin || m.perm_debt);
  const asg = c ? c.assignee_email : me;
  $('dbFormPanel').innerHTML = `<div class="ph"><h2>${c ? '채권 수정' : '채권 등록'}</h2><button class="x" data-f="close">✕</button></div>
    <label>채무자 <span style="color:var(--danger)">*</span></label><input id="dfName" maxlength="100" placeholder="채무자명" />
    <label>구분</label><div class="checks"><label><input type="radio" name="dfScopeR" value="본점" ${(c ? c.scope : '본점') === '본점' ? 'checked' : ''}/> 본점</label><label><input type="radio" name="dfScopeR" value="지점" ${c && c.scope === '지점' ? 'checked' : ''}/> 지점</label></div>
    <div class="row"><div><label>연체기준일 <span style="color:var(--danger)">*</span></label><input id="dfSince" type="date" /></div><div><label>연체 원금 (원)</label><input id="dfAmt" inputmode="numeric" placeholder="예: 35,000,000" /></div></div>
    <label>담당자</label><select id="dfAsg"><option value="">(지정 안 함)</option>${staff.map(m => `<option value="${esc(m.email)}" ${m.email === asg ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}</select>
    <div class="row"><div><label>다음 조치 예정일</label><input id="dfNxD" type="date" /></div><div><label>다음 조치 내용</label><input id="dfNxN" maxlength="200" placeholder="예: 내용증명 발송" /></div></div>
    <label>메모</label><textarea id="dfMemo" rows="3" maxlength="1000"></textarea>
    <div class="acts" style="margin-top:20px"><button class="btn primary" data-f="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-f="close" style="min-height:44px">취소</button></div>`;
  $('dfName').value = c ? c.debtor_name : ''; $('dfSince').value = c ? c.overdue_since : kstToday();
  $('dfAmt').value = c && c.principal !== null ? Number(c.principal).toLocaleString('ko-KR') : '';
  $('dfAmt').oninput = () => { $('dfAmt').value = dbComma($('dfAmt').value); };
  $('dfNxD').value = c && c.next_action_date ? c.next_action_date : ''; $('dfNxN').value = c && c.next_action_note ? c.next_action_note : ''; $('dfMemo').value = c && c.memo ? c.memo : '';
  $('dbFormOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('dfName').focus(); } catch (x) {} }, 50);
}
function dbCloseForm(){ $('dbFormOv').style.display = 'none'; debtFormId = null; document.body.style.overflow = $('dbDetailOv').style.display === 'block' ? 'hidden' : ''; }
$('dbFormPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'close') return dbCloseForm();
  const name = $('dfName').value.trim(), since = $('dfSince').value;
  if (!name) return alert('채무자를 입력해주세요.');
  if (!since) return alert('연체기준일을 선택해주세요.');
  const row = { debtor_name: name, scope: (document.querySelector('input[name=dfScopeR]:checked') || {}).value || '본점', overdue_since: since, principal: dbNum($('dfAmt').value),
    assignee_email: $('dfAsg').value || null, next_action_date: $('dfNxD').value || null, next_action_note: $('dfNxN').value.trim() || null, memo: $('dfMemo').value.trim() || null };
  b.disabled = true; const wasNew = !debtFormId;
  const { data, error } = debtFormId ? await sb.from('debt_cases').update(row).eq('id', debtFormId).select() : await sb.from('debt_cases').insert(row).select();
  b.disabled = false;
  if (error) return alert(error.message);
  const id = debtFormId || (data && data[0] && data[0].id);
  dbCloseForm(); toast('💾 저장했어요'); await loadDebt();
  if (wasNew && id) dbOpenDetail(id);
});
