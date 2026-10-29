// 사후관리 > 화재보험관리 — 담보물 화재보험(질권설정) 가입 현황. 사후관리 권한자(perm_debt)/관리자만 보고 입력한다.
// 보험 종료일 1개월 전 · 1주 전 · 당일, 갱신이 없으면 매일 담당자에게 텔레그램 (Edge Function task-notify 정기 알림에서 발송)
// index.html 의 전역(sb, $, esc, me, members, nameOf, kstToday, toast, divn)과 debt.js(dbDiff, debtCan), appraisal.js(apSearchAddr)를 함께 쓴다.

let fireRows = [], fireHist = {}, fireDetId = null, fireFormId = null, fireTimer = null, fireCsv = null;
let fireOpen = (() => { try { return localStorage.getItem('fireOpen') === '1'; } catch (e) { return false; } })();
let fireScope = 'all', fireClosed = false, fireSoonOnly = false, fireQ = '';

const frN = (n) => (n === null || n === undefined || n === '') ? '-' : Number(n).toLocaleString('ko-KR');
const frNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const frAcct = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, '').slice(0, 12); return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 12)].filter(Boolean).join('-'); };
const frAcctOk = (s) => /^\d{3}-\d{2}-\d{7}$/.test(s);
const frLeft = (r) => dbDiff(r.ins_end);   // 보험 종료일까지 남은 일수 (지나면 음수)
const frState = (r) => r.status === '종료' ? 'end' : frLeft(r) < 0 ? 'dead' : frLeft(r) <= 30 ? 'warn' : '';
function frChip(r){
  if (r.status === '종료') return '<span class="frc end">종료</span>';
  const l = frLeft(r);
  return l < 0 ? `<span class="frc dead">만기 지남 D+${-l}</span>` : l === 0 ? '<span class="frc dead">오늘 만기</span>' : l <= 30 ? `<span class="frc warn">${l <= 7 ? '1주 내' : '1개월 내'} D-${l}</span>` : '';
}
const frScopeChip = (s) => `<span class="chip sc-${esc(s)}">${esc(s)}</span>`;

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #fire{ min-width:0; }
  .frcard{ background:#fff; border-radius:26px; box-shadow:var(--sh); padding:18px 22px 20px; }
  .frh{ display:flex; align-items:center; gap:8px 10px; flex-wrap:wrap; } .frh b{ font-size:19px; letter-spacing:-.03em; } .frh .sp{ flex:1; }
  .frc{ display:inline-block; font-size:12px; font-weight:800; padding:3px 10px; border-radius:99px; white-space:nowrap; background:#eef1f6; color:#5a6280; }
  .frc.warn{ background:var(--warn-soft); color:#a54800; } .frc.dead{ background:var(--danger-soft); color:#c9372c; } .frc.end{ background:#e9ecf1; color:#7b8398; }
  .frtool{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; } .frtool .search{ flex:1; min-width:160px; min-height:38px; padding:6px 12px; font-size:14px; }
  .frtool select{ width:auto; min-height:38px; padding:6px 32px 6px 12px; font-size:14px; }
  .frm{ overflow-x:auto; margin-top:12px; }
  table.frt{ width:100%; min-width:1080px; border-collapse:separate; border-spacing:0; font-size:13.5px; font-variant-numeric:tabular-nums; }
  table.frt th{ background:#f3f5fa; padding:8px 8px; font-size:12px; color:#5a6172; font-weight:800; text-align:center; border-bottom:1px solid #e8ebf3; white-space:nowrap; }
  table.frt td{ padding:10px 8px; border-bottom:1px solid #eef0f5; text-align:center; vertical-align:middle; }
  table.frt td.l{ text-align:left; } table.frt td.r{ text-align:right; white-space:nowrap; } table.frt td.nw{ white-space:nowrap; }
  table.frt tr.frow{ cursor:pointer; } table.frt tr.frow:hover td{ background:#f8f9fd; }
  table.frt tr.warn td{ background:#fffaf0; } table.frt tr.dead td{ background:#fff5f5; } table.frt tr.end td{ opacity:.55; }
  .frper b.d{ color:#c9372c; } .frper b.w{ color:#a54800; }
  .frnote{ margin-top:8px; color:var(--muted); font-size:12.5px; }
  .frempty{ text-align:center; padding:26px 8px 8px; color:var(--muted); font-size:14px; line-height:1.6; }
  .frgrid{ display:grid; grid-template-columns:1fr 1fr; gap:2px 14px; } .frgrid .full{ grid-column:1 / 3; }
  .frgrid input.num{ text-align:right; font-weight:700; }
  .frkv{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px 18px; margin-top:14px; } .frkv .k{ font-size:12px; color:var(--muted); font-weight:600; } .frkv .v{ font-size:15px; font-weight:600; margin-top:2px; word-break:break-word; }
  .frhis{ margin-top:18px; background:var(--field); border-radius:16px; padding:12px 14px; } .frhis .k{ font-size:13px; font-weight:800; color:#44546f; margin-bottom:6px; }
  .frhr{ display:flex; justify-content:space-between; gap:10px; font-size:13.5px; padding:6px 0; border-bottom:1px solid var(--line); flex-wrap:wrap; } .frhr:last-child{ border-bottom:0; } .frhr small{ color:var(--muted); }
  .frcsv{ max-width:960px !important; } .frcsv table{ width:100%; border-collapse:collapse; font-size:12.5px; margin-top:10px; } .frcsv th,.frcsv td{ border:1px solid var(--line); padding:5px 7px; text-align:left; white-space:nowrap; }
  .frcsv th{ background:var(--field); } .frcsv tr.bad td{ background:#fff5f5; } .frcsv tr.wn td{ background:#fffaf0; } .frcsv .sc{ overflow-x:auto; max-height:46vh; overflow-y:auto; }
  @media (max-width:760px){
    .frcard{ padding:14px 14px 16px; border-radius:22px; }
    .frm{ overflow:visible; } table.frt{ min-width:0; } table.frt thead{ display:none; }
    table.frt, table.frt tbody{ display:block; } table.frt tr.frow{ display:block; background:#f8f9fc; border-radius:18px; padding:10px 12px; margin-bottom:10px; }
    table.frt tr.warn{ background:#fffaf0; } table.frt tr.dead{ background:#fff5f5; }
    table.frt td{ display:flex; justify-content:space-between; gap:12px; text-align:right; border:0 !important; background:transparent !important; padding:3px 0; }
    table.frt td::before{ content:attr(data-l); color:var(--muted); font-weight:600; font-size:12px; text-align:left; flex:none; }
    table.frt td.l{ text-align:right; } table.frt td.frper{ flex-wrap:wrap; justify-content:flex-end; } table.frt td.frper::before{ margin-right:auto; }
    .frgrid{ grid-template-columns:1fr; } .frgrid .full{ grid-column:1; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="frOvForm" style="z-index:30"><div class="panel" style="max-width:560px" id="frFormPanel"></div></div>
    <div class="ov" id="frOvDet"><div class="panel" style="max-width:640px" id="frDetPanel"></div></div>
    <div class="ov" id="frOvCsv" style="z-index:30"><div class="panel frcsv" id="frCsvPanel"></div></div>`;
  document.body.appendChild(d);
  ['frOvForm', 'frOvDet', 'frOvCsv'].forEach(id => $(id).addEventListener('click', (e) => { if (e.target === $(id)) frCloseOv(id); }));
})();
function frCloseOv(id){ $(id).style.display = 'none'; if (id === 'frOvDet') fireDetId = null; if (id === 'frOvForm') fireFormId = null; document.body.style.overflow = ['frOvForm', 'frOvDet', 'frOvCsv'].some(x => $(x).style.display === 'block') ? 'hidden' : ''; }
function frShowOv(id){ $(id).style.display = 'block'; document.body.style.overflow = 'hidden'; }

// ---------- 불러오기 ----------
async function loadFire(){
  if (!debtCan()){ fireRows = []; return; }
  const { data, error } = await sb.from('fire_insurance').select('*').order('ins_end', { ascending: true }).order('id');
  if (error){ console.warn('화재보험 불러오기 실패', error.message); return; }
  fireRows = data || [];
  if (divn === 'debt') renderFire();
  if (fireDetId){ const ae = document.activeElement; if (!(ae && $('frOvDet').contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) frRenderDet(); }
}

// ---------- 목록 ----------
function renderFire(){
  const el = $('fire'); if (!el) return;
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fr]');
      if (b){ const a = b.dataset.fr;
        if (a === 'fold'){ fireOpen = !fireOpen; try { localStorage.setItem('fireOpen', fireOpen ? '1' : '0'); } catch (x) {} renderFire(); }
        else if (a === 'add') frOpenForm(null);
        else if (a === 'csv') frOpenCsv();
        else if (a === 'scope'){ fireScope = b.dataset.v; renderFire(); }
        return; }
      const r = e.target.closest('[data-frid]'); if (r) frOpenDet(+r.dataset.frid);
    });
    el.addEventListener('change', (e) => { if (e.target.id === 'frClosed'){ fireClosed = e.target.checked; renderFire(); } if (e.target.id === 'frSoon'){ fireSoonOnly = e.target.checked; renderFire(); } });
    el.addEventListener('input', (e) => { if (e.target.id === 'frQ'){ fireQ = e.target.value.trim().toLowerCase(); clearTimeout(el._t); el._t = setTimeout(() => { const p = e.target.selectionStart; renderFire(); const q = $('frQ'); if (q){ q.focus(); try { q.setSelectionRange(p, p); } catch (x) {} } }, 250); } });
  }
  const act = fireRows.filter(r => r.status !== '종료'), soon = act.filter(r => frLeft(r) >= 0 && frLeft(r) <= 30).length, dead = act.filter(r => frLeft(r) < 0).length;
  const chips = `<span class="frc">유효 ${act.length}건</span>${soon ? `<span class="frc warn">1개월 내 만기 ${soon}건</span>` : ''}${dead ? `<span class="frc dead">만기 지남 ${dead}건</span>` : ''}`;
  let html = `<div class="frcard"><div class="frh"><b>🔥 화재보험관리</b>${chips}<span class="sp"></span>${fireOpen ? '<button class="btn small primary" data-fr="add">＋ 보험 등록</button><button class="btn small" data-fr="csv">📥 CSV 올리기</button>' : ''}<button class="btn small" data-fr="fold">${fireOpen ? '접기 ▴' : '펼치기 ▾'}</button></div>`;
  if (fireOpen){
    const rows = fireRows.filter(r => (fireClosed || r.status !== '종료') && (fireScope === 'all' || r.scope === fireScope) && (!fireSoonOnly || (r.status !== '종료' && frLeft(r) <= 30))
      && (!fireQ || [r.debtor_name, r.loan_account, r.address, r.memo].some(v => (v || '').toLowerCase().includes(fireQ))))
      .sort((a, b) => (a.status === '종료') - (b.status === '종료') || a.ins_end.localeCompare(b.ins_end) || a.id - b.id);
    html += `<div class="frtool"><div class="seg">${[['all', '전체'], ['본점', '본점'], ['지점', '지점']].map(([v, n]) => `<button data-fr="scope" data-v="${v}" class="${fireScope === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="frSoon" ${fireSoonOnly ? 'checked' : ''}/> 만기 임박만</label><label class="chk"><input type="checkbox" id="frClosed" ${fireClosed ? 'checked' : ''}/> 종료 포함</label>
      <input id="frQ" class="search" type="search" placeholder="🔍 채무자·계좌·소재지 검색" value="${esc(fireQ)}" /></div>`;
    html += rows.length ? `<div class="frm"><table class="frt"><thead><tr><th>순번</th><th>구분</th><th>채무자</th><th>대출계좌번호</th><th>대출금액(원)</th><th>대출만기일</th><th>보험가입기간</th><th>질권설정액(원)</th><th>담보물 소재지</th><th>비고</th></tr></thead><tbody>
      ${rows.map((r, i) => { const s = frState(r); return `<tr class="frow ${s}" data-frid="${r.id}"><td data-l="순번">${i + 1}</td><td data-l="구분">${frScopeChip(r.scope)}</td><td class="l nw" data-l="채무자"><b>${esc(r.debtor_name)}</b></td><td class="nw" data-l="대출계좌번호">${esc(r.loan_account)}</td>
        <td class="r" data-l="대출금액(원)">${frN(r.loan_amount)}</td><td class="nw" data-l="대출만기일">${esc(r.loan_maturity || '-')}</td>
        <td class="nw frper" data-l="보험가입기간">${esc(r.ins_start)} ~ <b class="${s === 'dead' ? 'd' : s === 'warn' ? 'w' : ''}">${esc(r.ins_end)}</b> ${frChip(r)}</td>
        <td class="r" data-l="질권설정액(원)">${frN(r.pledge_amount)}</td><td class="l" data-l="담보물 소재지">${esc(r.address || '-')}</td><td class="l" data-l="비고">${esc(r.memo || '')}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="frnote">보험 만기 임박순 · 1개월 안이면 노란색, 지나면 빨간색 · 줄을 누르면 상세(수정·갱신·종료·삭제)</div>`
      : `<div class="frempty">${fireRows.length ? '조건에 맞는 화재보험이 없어요.' : '등록된 화재보험이 없어요.<br>“＋ 보험 등록” 또는 “📥 CSV 올리기”로 시작해요.'}</div>`;
  }
  el.innerHTML = html + '</div>';
}

// ---------- 상세 ----------
async function frOpenDet(id){ fireDetId = id; frRenderDet(); frShowOv('frOvDet'); await frLoadHist(id); }
async function frLoadHist(id){
  const { data } = await sb.from('fire_insurance_history').select('*').eq('ins_id', id).order('renewed_at', { ascending: false }).order('id', { ascending: false });
  fireHist[id] = data || []; if (fireDetId === id) frRenderDet();
}
function frRenderDet(){
  const r = fireRows.find(x => x.id === fireDetId);
  if (!r){ if (fireDetId) frCloseOv('frOvDet'); return; }
  const hs = fireHist[r.id] || [], left = frLeft(r);
  $('frDetPanel').innerHTML = `<div class="ph"><div><div style="margin-bottom:8px">${frScopeChip(r.scope)} ${frChip(r)}</div><h2>🔥 ${esc(r.debtor_name)}</h2></div><button class="x" data-fd="close">✕</button></div>
    <div class="frkv">
      <div><div class="k">대출계좌번호</div><div class="v">${esc(r.loan_account)}</div></div><div><div class="k">대출금액</div><div class="v">${frN(r.loan_amount)}원</div></div>
      <div><div class="k">대출만기일</div><div class="v">${esc(r.loan_maturity || '-')}</div></div><div><div class="k">질권설정액</div><div class="v">${r.pledge_amount === null ? '-' : frN(r.pledge_amount) + '원'}</div></div>
      <div><div class="k">보험가입기간</div><div class="v">${esc(r.ins_start)} ~ ${esc(r.ins_end)}${r.status !== '종료' ? `<div class="muted" style="font-weight:500;font-size:13px">${left < 0 ? `만기 ${-left}일 지남` : left === 0 ? '오늘 만기' : `만기까지 ${left}일`}</div>` : ''}</div></div>
      <div><div class="k">담당자 (알림)</div><div class="v">${esc(r.assignee_email ? nameOf(r.assignee_email) : '-')}</div></div>
      <div style="grid-column:1/-1"><div class="k">담보물 소재지</div><div class="v">${esc(r.address || '-')}</div></div>
      ${r.memo ? `<div style="grid-column:1/-1"><div class="k">비고</div><div class="v" style="white-space:pre-wrap">${esc(r.memo)}</div></div>` : ''}
      <div><div class="k">등록</div><div class="v">${esc(nameOf(r.created_by))} · ${esc(String(r.created_at).slice(0, 10))}</div></div>${r.status === '종료' && r.closed_at ? `<div><div class="k">종료일</div><div class="v">${esc(String(r.closed_at).slice(0, 10))}</div></div>` : ''}
    </div>
    <div class="frhis"><div class="k">🔄 갱신 이력 <span class="muted">(${hs.length}건)</span></div>${hs.map(h => `<div class="frhr"><span>${esc(h.old_start)} ~ ${esc(h.old_end)} <b>→</b> ${esc(h.new_start)} ~ ${esc(h.new_end)}${h.note ? `<br><small>${esc(h.note)}</small>` : ''}</span><small>${esc(nameOf(h.renewed_by))} · ${esc(String(h.renewed_at).slice(0, 10))}</small></div>`).join('') || '<div class="muted" style="font-size:13px">아직 갱신 이력이 없어요.</div>'}</div>
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-fd="renew">🔄 갱신</button><button class="btn" data-fd="edit">수정</button><button class="btn" data-fd="${r.status === '종료' ? 'reopen' : 'end'}">${r.status === '종료' ? '↩ 유효로 되돌리기' : '종료 처리'}</button></div><button class="btn danger" data-fd="del">삭제</button></div>
    ${r.status === '종료' ? '' : '<div class="muted" style="font-size:12.5px;margin-top:10px">만기 1개월 전 · 1주 전 · 당일에 담당자에게 알림이 가고, 갱신하지 않으면 만기 후에도 매일 알림이 가요. 대출 상환·해지로 더 알릴 필요가 없으면 “종료 처리”하세요.</div>'}`;
}
$('frDetPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-fd]'); if (!b) return;
  const r = fireRows.find(x => x.id === fireDetId); if (!r) return;
  const a = b.dataset.fd;
  if (a === 'close') return frCloseOv('frOvDet');
  if (a === 'edit') return frOpenForm(r.id);
  if (a === 'renew') return frOpenRenew(r);
  const upd = async (patch, msg) => { const { error } = await sb.from('fire_insurance').update(patch).eq('id', r.id); if (error) return alert(error.message); if (msg) toast(msg); await loadFire(); };
  if (a === 'end'){ if (!confirm('종료 처리할까요? (더 이상 알림이 가지 않고, “종료 포함”을 켜야 목록에 보여요)')) return; return upd({ status: '종료', closed_at: new Date().toISOString() }, '종료 처리했어요'); }
  if (a === 'reopen') return upd({ status: '유효', closed_at: null, alert_stage: 0, overdue_alert_on: null }, '유효로 되돌렸어요');
  if (a === 'del'){
    if (!confirm(`"${r.debtor_name}" 화재보험과 갱신 이력을 삭제할까요? 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from('fire_insurance').delete().eq('id', r.id); if (error) return alert(error.message);
    frCloseOv('frOvDet'); toast('삭제했어요'); return loadFire();
  }
});

// ---------- 갱신 ----------
function frOpenRenew(r){
  const ns = pfAddIso(r.ins_end, 1), ne = pfAddIso(`${+ns.slice(0, 4) + 1}${ns.slice(4)}`, -1);
  $('frFormPanel').innerHTML = `<div class="ph"><h2>🔄 보험 갱신</h2><button class="x" data-ff="close">✕</button></div>
    <div class="muted" style="font-size:13.5px;margin-top:6px">${esc(r.debtor_name)} · 현재 가입기간 ${esc(r.ins_start)} ~ ${esc(r.ins_end)}</div>
    <div class="frgrid" style="margin-top:6px"><div><label>새 보험 시작일</label><input id="frRs" type="date" value="${ns}" /></div><div><label>새 보험 종료일</label><input id="frRe" type="date" value="${ne}" /></div>
      <div class="full"><label>갱신 메모 (선택)</label><input id="frRn" maxlength="300" placeholder="예: 증권번호 변경, 보험료 납부 완료" /></div></div>
    <div class="muted" style="font-size:12.5px;margin-top:8px">저장하면 이전 가입기간이 갱신 이력에 남고, 알림은 새 종료일 기준으로 다시 시작해요.</div>
    <div class="acts" style="margin-top:18px"><button class="btn primary" data-ff="renewsave" style="min-height:44px;padding:8px 26px">갱신 저장</button><button class="btn" data-ff="close" style="min-height:44px">취소</button></div>`;
  fireFormId = r.id; frShowOv('frOvForm');
}
const pfAddIso = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// ---------- 등록/수정 ----------
function frOpenForm(id){
  if (!debtCan()) return;
  const r = id ? fireRows.find(x => x.id === id) : null; if (id && !r) return;
  const staff = members.filter(m => m.is_admin || m.perm_debt), asg = r ? r.assignee_email : me;
  $('frFormPanel').innerHTML = `<div class="ph"><h2>${r ? '화재보험 수정' : '화재보험 등록'}</h2><button class="x" data-ff="close">✕</button></div>
    <div class="frgrid">
      <div><label>구분 <span style="color:var(--danger)">*</span></label><div class="checks"><label><input type="radio" name="frScopeR" value="본점" ${!r || r.scope === '본점' ? 'checked' : ''}/> 본점</label><label><input type="radio" name="frScopeR" value="지점" ${r && r.scope === '지점' ? 'checked' : ''}/> 지점</label></div></div>
      <div><label>채무자 <span style="color:var(--danger)">*</span></label><input id="frName" maxlength="100" /></div>
      <div><label>대출계좌번호 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">(000-00-0000000)</span></label><input id="frAcct" inputmode="numeric" placeholder="숫자 12자리" /></div>
      <div><label>대출금액 (원) <span style="color:var(--danger)">*</span></label><input id="frLoan" class="num" inputmode="numeric" /></div>
      <div><label>대출만기일</label><input id="frMat" type="date" /></div>
      <div><label>질권설정액 (원)</label><input id="frPl" class="num" inputmode="numeric" /></div>
      <div><label>보험 시작일 <span style="color:var(--danger)">*</span></label><input id="frIs" type="date" /></div>
      <div><label>보험 종료일 <span style="color:var(--danger)">*</span> <span class="muted" style="font-weight:500">(1개월 전 알림)</span></label><input id="frIe" type="date" /></div>
      <div class="full"><label>담보물 소재지</label><div style="display:flex;gap:8px"><input id="frAddr" placeholder="주소 검색 후 선택하거나 직접 입력" style="flex:1" /><button class="btn small" type="button" data-ff="addrsearch">🔍 검색</button></div><div id="frAres" class="apres" style="display:none;margin-top:6px"></div><div id="frAst" class="muted" style="font-size:12.5px;margin-top:4px"></div></div>
      <div><label>담당자 (알림 받는 사람)</label><select id="frAsg"><option value="">(지정 안 함)</option>${staff.map(m => `<option value="${esc(m.email)}" ${m.email === asg ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}</select></div>
      <div><label>비고</label><input id="frMemo" maxlength="500" /></div>
    </div>
    <div class="acts" style="margin-top:18px"><button class="btn primary" data-ff="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-ff="close" style="min-height:44px">취소</button></div>`;
  const set = (i, v) => { $(i).value = v ?? ''; };
  set('frName', r && r.debtor_name); set('frAcct', r && r.loan_account); set('frLoan', r ? frN(r.loan_amount) : ''); set('frMat', r && r.loan_maturity); set('frPl', r && r.pledge_amount !== null ? frN(r.pledge_amount) : '');
  set('frIs', r && r.ins_start); set('frIe', r && r.ins_end); set('frAddr', r && r.address); set('frMemo', r && r.memo);
  $('frFormPanel').dataset.pnu = r && r.pnu || ''; $('frFormPanel').dataset.lat = r && r.lat !== null ? r.lat : ''; $('frFormPanel').dataset.lng = r && r.lng !== null ? r.lng : '';
  $('frAst').textContent = r && r.pnu ? '✔ 확인된 주소' : '';
  $('frAcct').oninput = () => { $('frAcct').value = frAcct($('frAcct').value); };
  ['frLoan', 'frPl'].forEach(i => { $(i).oninput = () => { const n = frNum($(i).value); $(i).value = n === null ? '' : n.toLocaleString('ko-KR'); }; });
  $('frAddr').oninput = () => { $('frFormPanel').dataset.pnu = ''; $('frFormPanel').dataset.lat = ''; $('frFormPanel').dataset.lng = ''; $('frAst').textContent = ''; };
  fireFormId = id || null; $('frFormPanel').dataset.mode = 'form'; frShowOv('frOvForm');
  setTimeout(() => { try { $('frName').focus(); } catch (x) {} }, 50);
}
async function frAddrSearch(){
  const q = $('frAddr').value.trim(), res = $('frAres');
  if (q.length < 2) return alert('검색어를 두 글자 이상 입력해주세요.');
  res.style.display = 'block'; res.innerHTML = '<div class="it" style="cursor:default">검색 중…</div>';
  const { items } = await apSearchAddr(q);
  if (!items.length){ res.innerHTML = '<div class="it" style="cursor:default;color:var(--danger)">검색 결과가 없어요. 동·리 이름과 번지를 함께 입력해보세요.<small>그대로 두고 저장하면 입력한 글자가 소재지로 저장돼요.</small></div>'; return; }
  res.innerHTML = items.map(it => `<div class="it" data-addr="${esc(it.addr)}" data-pnu="${esc(it.pnu)}" data-lat="${it.lat ?? ''}" data-lng="${it.lng ?? ''}">${esc(it.addr)}${it.road ? `<small>${esc(it.road)}</small>` : ''}</div>`).join('');
}
$('frFormPanel').addEventListener('click', async (ev) => {
  const it = ev.target.closest('#frAres .it[data-addr]');
  if (it){ $('frAddr').value = it.dataset.addr; $('frFormPanel').dataset.pnu = it.dataset.pnu; $('frFormPanel').dataset.lat = it.dataset.lat; $('frFormPanel').dataset.lng = it.dataset.lng; $('frAres').style.display = 'none'; $('frAst').textContent = '✔ 확인된 주소'; return; }
  const b = ev.target.closest('[data-ff]'); if (!b) return;
  const a = b.dataset.ff;
  if (a === 'close') return frCloseOv('frOvForm');
  if (a === 'addrsearch') return frAddrSearch();
  if (a === 'renewsave'){
    const s = $('frRs').value, e = $('frRe').value;
    if (!s || !e) return alert('새 보험 시작일과 종료일을 입력해주세요.');
    if (e < s) return alert('종료일이 시작일보다 앞이에요.');
    b.disabled = true;
    const { error } = await sb.rpc('renew_fire_insurance', { p_id: fireFormId, p_start: s, p_end: e, p_note: $('frRn').value.trim() });
    b.disabled = false; if (error) return alert(error.message);
    const id = fireFormId; frCloseOv('frOvForm'); toast('🔄 갱신했어요'); await loadFire(); if (fireDetId === id) await frLoadHist(id); return;
  }
  if (a === 'save'){
    const P = $('frFormPanel'), scope = (document.querySelector('input[name=frScopeR]:checked') || {}).value, name = $('frName').value.trim(), acct = $('frAcct').value.trim();
    const loan = frNum($('frLoan').value), is = $('frIs').value, ie = $('frIe').value;
    if (!scope) return alert('본점 / 지점을 선택해주세요.');
    if (!name) return alert('채무자를 입력해주세요.');
    if (!frAcctOk(acct)) return alert('대출계좌번호는 숫자 12자리(000-00-0000000)로 입력해주세요.');
    if (loan === null) return alert('대출금액을 입력해주세요.');
    if (!is || !ie) return alert('보험 시작일과 종료일을 입력해주세요.');
    if (ie < is) return alert('보험 종료일이 시작일보다 앞이에요.');
    const row = { scope, debtor_name: name, loan_account: acct, loan_amount: loan, loan_maturity: $('frMat').value || null, ins_start: is, ins_end: ie, pledge_amount: frNum($('frPl').value),
      address: $('frAddr').value.trim() || null, pnu: P.dataset.pnu || null, lat: P.dataset.lat ? Number(P.dataset.lat) : null, lng: P.dataset.lng ? Number(P.dataset.lng) : null,
      assignee_email: $('frAsg').value || null, memo: $('frMemo').value.trim() || null };
    const old = fireFormId ? fireRows.find(x => x.id === fireFormId) : null;
    if (old && (old.ins_end !== ie)){ row.alert_stage = 0; row.overdue_alert_on = null; }   // 종료일을 고치면 알림을 새 종료일 기준으로 다시 시작
    b.disabled = true;
    const { error } = fireFormId ? await sb.from('fire_insurance').update(row).eq('id', fireFormId) : await sb.from('fire_insurance').insert(row);
    b.disabled = false; if (error) return alert(error.message.includes('loan_account') ? '대출계좌번호 형식을 확인해주세요 (000-00-0000000).' : error.message);
    frCloseOv('frOvForm'); toast('💾 저장했어요'); await loadFire();
  }
});

// ---------- CSV 올리기 ----------
const FR_HEAD = ['구분', '채무자', '대출계좌번호', '대출금액', '대출만기일', '보험시작일', '보험종료일', '질권설정액', '담보물소재지', '비고', '담당자'];
function frParseCsv(text){
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
function frDate(s){
  const t = String(s ?? '').trim(); if (!t) return '';
  const m = t.match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/); if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
function frCsvRows(grid){
  const head = grid[0].map(h => h.replace(/\s|﻿/g, '')), ix = (...ks) => head.findIndex(h => ks.some(k => h.includes(k)));
  const col = { scope: ix('구분'), name: ix('채무자'), acct: ix('계좌'), loan: ix('대출금액'), mat: ix('대출만기'), s: ix('보험시작', '가입시작'), e: ix('보험종료', '가입종료', '보험만기'), per: ix('보험가입기간', '보험기간'), pl: ix('질권'), addr: ix('소재지'), memo: ix('비고'), asg: ix('담당') };
  const exist = new Set(fireRows.filter(r => r.status !== '종료').map(r => r.loan_account)), seen = new Set();
  return grid.slice(1).map((c, n) => {
    const g = (k) => col[k] >= 0 ? (c[col[k]] ?? '').trim() : '';
    const errs = [], warns = [];
    const scope = g('scope'); if (scope !== '본점' && scope !== '지점') errs.push('구분(본점/지점)');
    const name = g('name'); if (!name) errs.push('채무자');
    const acct = frAcct(g('acct')); if (!frAcctOk(acct)) errs.push('계좌번호(12자리)');
    const loan = frNum(g('loan')); if (loan === null) errs.push('대출금액');
    let s = frDate(g('s')), e = frDate(g('e'));
    if ((s === '' || e === '') && g('per')){ const m = g('per').split(/~|∼|–|-{2,}|\s+to\s+/i); if (m.length === 2){ s = s === '' ? frDate(m[0]) : s; e = e === '' ? frDate(m[1]) : e; } }
    if (!s) errs.push('보험시작일'); if (!e) errs.push('보험종료일'); if (s && e && e < s) errs.push('종료일<시작일');
    const mat = frDate(g('mat')); if (mat === null) errs.push('대출만기일 형식');
    let asg = null; const a = g('asg'); if (a){ const m = members.find(x => x.email === a || x.name === a); if (m) asg = m.email; else warns.push('담당자 못 찾음 → 본인'); }
    if (acct && (exist.has(acct) || seen.has(acct))) warns.push('계좌 중복'); if (acct) seen.add(acct);
    return { n: n + 2, errs, warns, row: errs.length ? null : { scope, debtor_name: name, loan_account: acct, loan_amount: loan, loan_maturity: mat || null, ins_start: s, ins_end: e, pledge_amount: frNum(g('pl')), address: g('addr') || null, memo: g('memo') || null, assignee_email: asg || me }, view: [scope, name, acct, loan, mat || '', s || '', e || '', frNum(g('pl')), g('addr')] };
  });
}
function frOpenCsv(){
  fireCsv = null;
  $('frCsvPanel').innerHTML = `<div class="ph"><h2>📥 화재보험 CSV 올리기</h2><button class="x" data-fc="close">✕</button></div>
    <div class="muted" style="font-size:13.5px;line-height:1.6;margin-top:6px">엑셀에서 아래 순서의 열로 만든 뒤 <b>CSV로 저장</b>해서 올려주세요. (한글 엑셀 CSV · UTF-8 모두 가능) 첫 줄은 제목 줄이어야 해요.<br>
    <b>${FR_HEAD.join(' · ')}</b> — 대출계좌번호는 숫자 12자리(하이픈은 있어도 없어도 됨), 날짜는 2025-11-20 형식, 금액은 원 단위(콤마 있어도 됨), 담당자는 이름(비우면 본인).</div>
    <div class="acts" style="margin-top:12px"><button class="btn" data-fc="tpl">⬇ 양식(CSV) 내려받기</button><label class="btn primary" style="cursor:pointer;margin:0">📂 CSV 파일 선택<input type="file" id="frCsvFile" accept=".csv,.txt,text/csv" hidden /></label></div>
    <div id="frCsvOut" style="margin-top:12px"></div>`;
  $('frCsvFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer(); let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (x) { text = new TextDecoder('euc-kr').decode(buf); }   // 한글 엑셀 CSV(CP949)
    const grid = frParseCsv(text.replace(/^﻿/, ''));
    if (grid.length < 2) return ($('frCsvOut').innerHTML = '<div class="muted">데이터 줄이 없어요. 첫 줄은 제목, 둘째 줄부터 데이터여야 해요.</div>');
    const rows = frCsvRows(grid); fireCsv = rows;
    const okN = rows.filter(r => r.row).length, badN = rows.length - okN;
    $('frCsvOut').innerHTML = `<div style="font-weight:700">${rows.length}줄 읽음 · <span style="color:var(--green)">등록 가능 ${okN}건</span>${badN ? ` · <span style="color:var(--danger)">오류 ${badN}건(제외)</span>` : ''}</div>
      <div class="sc"><table><thead><tr><th>줄</th><th>결과</th>${['구분', '채무자', '계좌', '대출금액', '대출만기', '시작', '종료', '질권', '소재지'].map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.errs.length ? 'bad' : r.warns.length ? 'wn' : ''}"><td>${r.n}</td><td>${r.errs.length ? `✕ ${esc(r.errs.join(', '))}` : `✓${r.warns.length ? ' ⚠ ' + esc(r.warns.join(', ')) : ''}`}</td>${r.view.map((v, i) => `<td>${esc(i === 3 || i === 7 ? frN(v) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="acts" style="margin-top:12px"><button class="btn primary" data-fc="import" ${okN ? '' : 'disabled'}>${okN}건 등록</button><button class="btn" data-fc="close">취소</button></div>`;
  };
  frShowOv('frOvCsv');
}
$('frCsvPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-fc]'); if (!b) return;
  const a = b.dataset.fc;
  if (a === 'close') return frCloseOv('frOvCsv');
  if (a === 'tpl'){
    const sample = ['본점', '홍길동', '123-45-6789012', '350000000', '2027-03-15', '2025-11-20', '2026-11-19', '420000000', '강원특별자치도 춘천시 동산면 원창리 99', '건물 전부', ''];
    const blob = new Blob(['﻿' + FR_HEAD.join(',') + '\r\n' + sample.map(v => /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = '화재보험_업로드_양식.csv'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); return;
  }
  if (a === 'import'){
    const rows = (fireCsv || []).filter(r => r.row).map(r => r.row); if (!rows.length) return;
    if (!confirm(`${rows.length}건을 등록할까요?`)) return;
    b.disabled = true;
    const { error } = await sb.from('fire_insurance').insert(rows);
    b.disabled = false; if (error) return alert('등록하지 못했어요: ' + error.message);
    frCloseOv('frOvCsv'); toast(`📥 ${rows.length}건을 등록했어요`); fireOpen = true; try { localStorage.setItem('fireOpen', '1'); } catch (x) {} await loadFire();
  }
});
