// 대출취급 > 취급 점검 — 대출 건 하나에 RTI · 임차보증금 차감계산 · 담보물 화재보험 가입여부 판단을 묶어 점검한다.
// 항목별 상태: 판단 전(ask) → 필요(need)/해당 없음(none) → 필요한 건은 계산 연결·판단 입력 후 완료(done).
//  · RTI / 임차보증금 차감: 감정평가 탭의 계산(rti_calcs / deposit_calcs)을 loan_task_id 로 연결 (새로 계산 / 기존 계산 연결)
//  · 화재보험: 이 화면에서 수기 입력(fire_judgments). 요보험가입금액 D = 순대출액 A + 선순위설정액 B − 토지감정평가액 C
//    → 면제(전용주택·아파트 단지 내 주거용 오피스텔)이거나 D ≤ 5천만원이면 가입 생략 가능, 아니면 가입 대상(보험 정보 입력까지 완료)
// 의존: index.html(전역 byId, canAct, stepsOf, curIdx, isDropped, openId, renderDetail, render, goAppraisal, me, nameOf, kstToday, toast, esc, $, sb),
//       rti.js(rtiCalcs, rtiCan, rtiNew, rtiOpen), deposit.js(depCalcs, depCan, depNew, depOpen), appraisal.js(apPreview)
const LC_FIRE_MIN = 50000000;                  // 요보험가입금액이 이 금액 이하이면 생략 가능
const LC_KIND = { rti: { name: 'RTI', mode: 'chk_rti', why: 'chk_rti_reason', ask: '임대사업자 대출이면 RTI 계산이 필요해요', tab: 'rti' },
  dep: { name: '임차보증금 차감', mode: 'chk_dep', why: 'chk_dep_reason', ask: '임차인이 있는 담보물이면 임차보증금 차감계산이 필요해요', tab: 'dep' },
  fire: { name: '화재보험', mode: 'chk_fire', why: 'chk_fire_reason', ask: '건물이 담보물에 포함되면 화재보험 가입여부 판단이 필요해요' } };
let lcFire = new Map(), lcPick = null, lcFd = null;   // lcPick: { id, kind } 기존 계산 연결 중 / lcFd: 화재보험 입력 중인 값
const lcW = (n) => Number(n || 0).toLocaleString('ko-KR');
const lcNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : 0; };
const lcComma = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; };

async function loadLc(){
  const r = await sb.from('fire_judgments').select('*');
  if (r.error){ console.warn('화재보험 판단 불러오기 실패', r.error.message); return; }
  lcFire = new Map((r.data || []).map(x => [x.loan_task_id, x])); lcRefresh();
}
function lcRefresh(){   // 열려 있는 대출 상세와 목록을 다시 그린다
  try { if (typeof render === 'function') render(); const t = typeof openId !== 'undefined' && openId ? byId(openId) : null; if (t && t.task_type === 'loan' && $('detailOv').style.display === 'block' && !($('lcFireOv') && $('lcFireOv').style.display === 'block')) renderDetail(t); } catch (e) { console.warn(e); }
}

// ---------- 상태 계산 ----------
function lcFireCalc(f){
  const D = Math.max(0, (f.net_amount || 0) + (f.senior_amount || 0) - (f.land_amount || 0)), target = f.exempt ? 'EX' : D > LC_FIRE_MIN ? 'Y' : 'N';
  return { D, target };
}
const lcFireText = { Y: '가입 대상', N: '생략 가능 (5천만원 이하)', EX: '생략 가능 (면제)' };
function lcItem(t, k){
  const K = LC_KIND[k], mode = t[K.mode] || null, why = t[K.why] || '', it = { k, name: K.name, mode, why, state: 'ask', text: K.ask, calc: null };
  if (mode === 'none'){ it.state = 'na'; it.text = `해당 없음${why ? ' · ' + why : ''}`; return it; }
  if (!mode) return it;
  if (k === 'fire'){
    const f = lcFire.get(t.id); it.calc = f || null;
    if (!f){ it.state = 'todo'; it.text = '화재보험 가입여부 판단을 입력해주세요 (감정평가 완료 후)'; return it; }
    const need = f.target === 'Y', ok = !need || (f.insurer && f.ins_start && f.ins_end && f.min_amount != null);
    it.state = ok ? 'done' : 'todo'; it.text = `요보험가입금액 ${lcW(f.required_amount)}원 · ${lcFireText[f.target]}${need ? (ok ? ` · ${f.insurer} ${f.ins_start}~${f.ins_end}` : ' · 보험 가입 정보를 입력해주세요') : ''}`;
    return it;
  }
  const calc = (k === 'rti' ? (typeof rtiCalcs !== 'undefined' ? rtiCalcs : []) : (typeof depCalcs !== 'undefined' ? depCalcs : [])).find(c => c.loan_task_id === t.id); it.calc = calc || null;
  if (!calc){ it.state = 'todo'; it.text = `${K.name} 계산이 아직 연결되지 않았어요`; return it; }
  it.state = 'done';
  if (k === 'rti') it.text = `RTI ${calc.rti === null ? '-' : Number(calc.rti).toFixed(2)} · ${calc.verdict || '-'} · ${calc.title}`;
  else { const need = t.loan_amount != null ? Number(t.loan_amount) * 1e6 : null, ok = need === null || Number(calc.loanable) >= need; it.warn = !ok;
    it.text = `대출가능 ${lcW(calc.loanable)}원${need === null ? '' : ok ? ` ≥ 신청 ${lcW(t.loan_amount)}백만원 ✓` : ` < 신청 ${lcW(t.loan_amount)}백만원 ⚠ 초과`} · ${calc.title}`; }
  return it;
}
const lcItems = (t) => ['rti', 'dep', 'fire'].map(k => lcItem(t, k));
const lcPending = (t) => lcItems(t).filter(i => i.state === 'ask' || i.state === 'todo');
function lcSub(t){   // 목록·현황표용 한 줄
  if (t.task_type !== 'loan' || isDropped(t) || curIdx(t) >= stepsOf(t).length) return '';
  const p = lcPending(t); return p.length ? `점검 미완료: ${p.map(i => i.name).join('·')}` : '점검 완료';
}
// 목록용 작은 표시: RTI · 차감 · 화재 — ✓ 완료 / ● 필요(미완료) / ? 판단 전 / – 해당 없음 (진행 중인 대출 건에만)
const LC_SHORT = { rti: 'RTI', dep: '차감', fire: '화재' }, LC_MARK = { done: '✓', todo: '●', ask: '?', na: '–' };
function lcChips(t){
  if (t.task_type !== 'loan' || isDropped(t) || curIdx(t) >= stepsOf(t).length) return '';
  return `<div class="lcm">${lcItems(t).map(i => `<span class="lcc ${i.state}${i.warn ? ' warn' : ''}" title="${esc(i.name + ' — ' + i.text)}">${LC_SHORT[i.k]} ${LC_MARK[i.state]}</span>`).join('')}</div>`;
}
function lcGate(t, seq){   // 내부결재(4)·대출실행(5) 단계를 완료하려 할 때 미완료 점검이 있으면 알리고 확인받는다
  if (!t || t.task_type !== 'loan' || (seq !== 4 && seq !== 5)) return true;
  const p = lcPending(t); if (!p.length) return true;
  return confirm(`취급 점검이 끝나지 않은 항목이 있어요.\n\n${p.map(i => `• ${i.name}: ${i.state === 'ask' ? '필요 여부 미판단' : i.text}`).join('\n')}\n\n그래도 이 단계를 완료할까요?`);
}

// ---------- 상세 화면 ----------
function lcHtml(t, dropped){
  const items = lcItems(t), can = canAct(t) && !dropped, done = items.filter(i => i.state === 'done' || i.state === 'na').length;
  const calcOk = (k) => k === 'rti' ? (typeof rtiCan === 'function' && rtiCan()) : (typeof depCan === 'function' && depCan());
  const rows = items.map(i => {
    const B = (d, label, cls = '') => `<button type="button" class="btn small ${cls}" data-d="lc:${d}">${label}</button>`;
    let act = '';
    if (can){
      if (i.state === 'ask') act = B(`mode:${i.k}:need`, '필요', 'primary') + B(`mode:${i.k}:none`, '해당 없음');
      else if (i.state === 'na') act = B(`mode:${i.k}:ask`, '다시 판단');
      else {
        if (i.k === 'fire') act = B('fire', i.calc ? '📝 판단 수정·인쇄' : '📝 판단 입력', 'primary');
        else if (i.calc) act = B(`open:${i.k}:${i.calc.id}`, '계산 열기') + (calcOk(i.k) ? B(`unlink:${i.k}:${i.calc.id}`, '연결 해제') : '');
        else if (lcPick && lcPick.id === t.id && lcPick.kind === i.k){
          const list = (i.k === 'rti' ? rtiCalcs : depCalcs).filter(c => !c.loan_task_id);
          act = `<select id="lcSel" style="max-width:260px;min-height:34px;padding:4px 8px">${list.map(c => `<option value="${c.id}">${esc(c.title)} (${esc(String(c.updated_at).slice(0, 10))})</option>`).join('') || '<option value="">연결할 수 있는 계산이 없어요</option>'}</select>` + B(`link:${i.k}`, '연결', 'primary') + B('pickx', '취소');
        } else act = calcOk(i.k) ? B(`new:${i.k}`, '＋ 새로 계산', 'primary') + B(`pick:${i.k}`, '기존 계산 연결') : '<span class="muted">감정평가 권한자가 계산해요</span>';
        act += B(`mode:${i.k}:ask`, '판단 취소');
      }
    } else if (i.state === 'done' && i.calc && i.k !== 'fire') act = B(`open:${i.k}:${i.calc.id}`, '계산 열기');
    else if (i.k === 'fire' && i.calc) act = B('fire', '판단 보기');
    const st = { ask: '판단 전', na: '해당 없음', todo: '필요 · 미완료', done: '완료' }[i.state];
    return `<div class="lcr ${i.state}${i.warn ? ' warn' : ''}"><div class="lch"><b>${i.name}</b><span class="lcst">${st}</span></div><div class="lct">${esc(i.text)}</div>${act ? `<div class="lca">${act}</div>` : ''}</div>`;
  }).join('');
  return `<div class="kv"><div class="k">취급 점검 <span class="muted" style="font-weight:600">${done}/3</span></div><div class="v lcv"><div class="lcsub">내부결재·대출실행 전에 RTI, 임차보증금 차감, 화재보험 가입여부를 판단해 연결해주세요</div>${rows}</div></div>`;
}

// ---------- 클릭 처리 ----------
async function lcAct(t, full){
  const [, op, k, arg] = full.split(':'), K = LC_KIND[k];
  if (op === 'mode'){
    const patch = {}; let reason = null;
    if (arg === 'none'){ reason = prompt(`${K.name} — 해당 없음 사유 (선택, 예: 신용대출 / 임대 아님)`, ''); if (reason === null) return; }
    patch[K.mode] = arg === 'ask' ? null : arg; patch[K.why] = arg === 'none' && reason.trim() ? reason.trim() : null;
    const { error } = await sb.from('work_tasks').update(patch).eq('id', t.id); if (error) return alert(error.message);
    await loadTasks(); return;
  }
  if (op === 'pickx'){ lcPick = null; return renderDetail(t); }
  if (op === 'pick'){ lcPick = { id: t.id, kind: k }; return renderDetail(t); }
  if (op === 'link' || op === 'unlink'){
    const id = op === 'link' ? +($('lcSel') || {}).value : +arg; if (!id) return;
    const { error } = await sb.from(k === 'rti' ? 'rti_calcs' : 'deposit_calcs').update({ loan_task_id: op === 'link' ? t.id : null }).eq('id', id);
    if (error) return alert(error.message);
    lcPick = null; toast(op === 'link' ? '🔗 계산을 이 대출 건에 연결했어요' : '연결을 해제했어요');
    if (k === 'rti' && typeof loadRti === 'function') await loadRti(); if (k === 'dep' && typeof loadDep === 'function') await loadDep(); return;
  }
  if (op === 'open' || op === 'new') return goAppraisal(() => {   // 감정평가 화면의 해당 탭에서 열기
    const tab = document.querySelector(`#apTabs [data-t="${K.tab}"]`); if (tab && typeof apTab !== 'undefined' && apTab !== K.tab) tab.click();
    setTimeout(() => {
      if (op === 'open') return k === 'rti' ? rtiOpen(+arg) : depOpen(+arg);
      if (k === 'rti'){ rtiNew(); if (rtiDraft){ rtiDraft.title = t.title; rtiDraft.loan = t.id; renderRtiEditor(); } }
      else { depNew(); if (depDraft){ depDraft.title = t.title; depDraft.loan = t.id; renderDepEditor(); } }
    }, 120);
  });
  if (op === 'fire') return lcOpenFire(t);
}

// ---------- 화재보험 가입여부 판단 (수기 입력) ----------
function lcOpenFire(t){
  const old = lcFire.get(t.id), won = t.loan_amount != null ? Number(t.loan_amount) * 1e6 : 0, can = canAct(t) && !isDropped(t);
  lcFd = old ? { ...old } : { loan_task_id: t.id, debtor_name: t.title || '', loan_amount: won, collateral_type: t.collateral || '', net_amount: won, senior_amount: 0, land_amount: 0, exempt: null, min_amount: null, pledge_amount: null, ins_start: '', ins_end: '', insurer: '', confirm_no: '', confirm_date: '', memo: '' };
  if (!$('lcFireOv')){
    const d = document.createElement('div');
    d.innerHTML = `<div class="ov" id="lcFireOv"><div class="panel" style="max-width:700px" id="lcFirePanel"></div></div>`; document.body.appendChild(d);
    $('lcFireOv').addEventListener('click', (e) => { if (e.target === $('lcFireOv')) lcCloseFire(); });
    $('lcFirePanel').addEventListener('input', (e) => { const x = e.target; if (x.classList.contains('lfn')){ x.value = lcComma(x.value); } lcFireLive(); });
    $('lcFirePanel').addEventListener('click', (e) => { const b = e.target.closest('[data-lf]'); if (!b) return; if (b.dataset.lf === 'close') lcCloseFire(); else if (b.dataset.lf === 'save') lcSaveFire(b); else if (b.dataset.lf === 'print') lcPrintFire(); });
  }
  const f = lcFd, dis = can ? '' : 'disabled', N = (id, v, ph = '') => `<input class="lfn" id="${id}" inputmode="numeric" value="${v == null || v === 0 && id !== 'lfA' && id !== 'lfB' && id !== 'lfC' ? '' : lcComma(v)}" placeholder="${ph}" ${dis} />`;
  $('lcFirePanel').innerHTML = `<div class="ph"><h2>🔥 담보물 화재보험 가입여부 판단</h2><button class="x" data-lf="close">✕</button></div>
    <div class="pfsub">단위: 원 · 수기 입력. 요보험가입금액 = 순대출액(A) + 선순위설정액(B) − 토지감정평가액(C)</div>
    <div class="lfg"><div><label>채무자</label><input id="lfDebtor" maxlength="100" value="${esc(f.debtor_name)}" ${dis} /></div><div><label>대출금액 (신규취급 합산금액)</label>${N('lfLoan', f.loan_amount)}</div><div><label>담보물 종류</label><input id="lfColl" maxlength="100" value="${esc(f.collateral_type || '')}" placeholder="예: 토지, 건물" ${dis} /></div></div>
    <div class="lfg"><div><label>순대출액 (A)</label>${N('lfA', f.net_amount)}</div><div><label>선순위설정액 (B)</label>${N('lfB', f.senior_amount)}</div><div><label>토지감정평가액 (C)</label>${N('lfC', f.land_amount)}</div></div>
    <label>생략 가능 담보물 <span class="muted" style="font-weight:400">(해당하면 선택)</span></label>
    <div class="checks"><label><input type="radio" name="lfEx" value="" ${!f.exempt ? 'checked' : ''} ${dis}/> 해당 없음</label><label><input type="radio" name="lfEx" value="house" ${f.exempt === 'house' ? 'checked' : ''} ${dis}/> 전용주택</label><label><input type="radio" name="lfEx" value="officetel" ${f.exempt === 'officetel' ? 'checked' : ''} ${dis}/> 아파트 단지 내 주거용 오피스텔</label></div>
    <div class="lfres" id="lfRes"></div>
    <div id="lfIns"><div class="lfh">화재보험 가입 시 작성</div>
      <div class="lfg"><div><label>요보험가입금액 (최소금액)</label>${N('lfMin', f.min_amount)}</div><div><label>질권설정액</label>${N('lfPledge', f.pledge_amount)}</div><div><label>보험회사</label><input id="lfIns2" maxlength="100" value="${esc(f.insurer || '')}" ${dis} /></div></div>
      <div class="lfg"><div><label>보험시작일자</label><input type="date" id="lfS" value="${esc(f.ins_start || '')}" ${dis} /></div><div><label>보험종료일자</label><input type="date" id="lfE" value="${esc(f.ins_end || '')}" ${dis} /></div><div></div></div>
      <div class="lfg"><div><label>확정일자 부여번호</label><input id="lfNo" maxlength="100" value="${esc(f.confirm_no || '')}" ${dis} /></div><div><label>확정일자 부여일</label><input type="date" id="lfDate" value="${esc(f.confirm_date || '')}" ${dis} /></div><div></div></div></div>
    <label>메모 <span class="muted" style="font-weight:400">(선택)</span></label><input id="lfMemo" maxlength="500" value="${esc(f.memo || '')}" ${dis} />
    <div class="acts" style="margin-top:16px">${can ? '<button class="btn primary" data-lf="save" style="min-height:44px;padding:8px 26px">저장</button>' : ''}<button class="btn" data-lf="print" style="min-height:44px">🖨 계산내역 인쇄</button><button class="btn" data-lf="close" style="min-height:44px">닫기</button></div>`;
  $('lcFireOv').style.display = 'block'; document.body.style.overflow = 'hidden'; lcFireLive();
}
function lcCloseFire(){ $('lcFireOv').style.display = 'none'; document.body.style.overflow = ''; const t = byId(openId); if (t && $('detailOv').style.display === 'block') renderDetail(t); }
function lcFireRead(){   // 화면 입력값 → lcFd
  const f = lcFd, g = (id) => $(id) ? $(id).value : '';
  Object.assign(f, { debtor_name: g('lfDebtor').trim(), loan_amount: lcNum(g('lfLoan')), collateral_type: g('lfColl').trim(), net_amount: lcNum(g('lfA')), senior_amount: lcNum(g('lfB')), land_amount: lcNum(g('lfC')),
    exempt: (document.querySelector('input[name=lfEx]:checked') || {}).value || null, min_amount: g('lfMin') ? lcNum(g('lfMin')) : null, pledge_amount: g('lfPledge') ? lcNum(g('lfPledge')) : null,
    insurer: g('lfIns2').trim(), ins_start: g('lfS'), ins_end: g('lfE'), confirm_no: g('lfNo').trim(), confirm_date: g('lfDate'), memo: g('lfMemo').trim() });
  return f;
}
function lcFireLive(){
  const f = lcFireRead(), c = lcFireCalc(f);
  $('lfRes').className = 'lfres ' + c.target; $('lfRes').innerHTML = `<span>요보험가입금액 (D = A + B − C)</span><b>${lcW(c.D)}원</b><span class="lfv">${c.target === 'Y' ? '🔥 화재보험 가입 대상' : c.target === 'EX' ? '✅ 가입 생략 가능 (면제 담보물)' : '✅ 가입 생략 가능 (5천만원 이하)'}</span>`;
  $('lfIns').style.opacity = c.target === 'Y' ? '' : '.5';
  if (c.target === 'Y' && !f.min_amount && $('lfMin') && !$('lfMin').value && document.activeElement !== $('lfMin')) $('lfMin').placeholder = lcW(c.D);
}
async function lcSaveFire(btn){
  const t = byId(openId); if (!t || !canAct(t)) return;
  const f = lcFireRead(), c = lcFireCalc(f);
  const row = { loan_task_id: t.id, debtor_name: f.debtor_name, loan_amount: f.loan_amount, collateral_type: f.collateral_type || null, net_amount: f.net_amount, senior_amount: f.senior_amount, land_amount: f.land_amount, exempt: f.exempt || null,
    required_amount: c.D, target: c.target, min_amount: c.target === 'Y' ? (f.min_amount != null ? f.min_amount : c.D) : null, pledge_amount: c.target === 'Y' ? f.pledge_amount : null,
    ins_start: c.target === 'Y' && f.ins_start ? f.ins_start : null, ins_end: c.target === 'Y' && f.ins_end ? f.ins_end : null, insurer: c.target === 'Y' ? f.insurer || null : null,
    confirm_no: c.target === 'Y' ? f.confirm_no || null : null, confirm_date: c.target === 'Y' && f.confirm_date ? f.confirm_date : null, checker: nameOf(me), memo: f.memo || null, updated_at: new Date().toISOString() };
  if (row.ins_start && row.ins_end && row.ins_end < row.ins_start) return alert('보험종료일자가 시작일자보다 빠릅니다.');
  btn.disabled = true;
  const { error } = await sb.from('fire_judgments').upsert(row, { onConflict: 'loan_task_id' });
  btn.disabled = false; if (error) return alert(error.message);
  if (t.chk_fire !== 'need'){ const r = await sb.from('work_tasks').update({ chk_fire: 'need', chk_fire_reason: null }).eq('id', t.id); if (!r.error) await loadTasks(); }   // 판단을 입력하면 '필요'로 기록
  toast('🔥 화재보험 판단을 저장했어요'); await loadLc(); lcCloseFire();
}
function lcPrintFire(){   // 담보물 화재보험 가입여부 계산내역 양식 (A4 세로)
  const f = lcFireRead(), c = lcFireCalc(f), d = kstToday(), [y, m, dd] = d.split('-');
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '', org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const w = (n) => n ? lcW(n) : '-', ex = { house: '전용주택', officetel: '아파트 단지 내 주거용 오피스텔' }[f.exempt] || '';
  const css = `@page{size:A4;margin:14mm 15mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;font-size:12px}.org{font-size:14px;font-weight:700;letter-spacing:4px;color:#444}h1{text-align:center;font-size:24px;margin:14px 0 4px;text-decoration:underline;letter-spacing:2px}.u{text-align:right;font-size:11px;margin:6px 0}
  table{width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #777;padding:7px 4px;text-align:center;font-size:11.5px;word-break:keep-all;overflow-wrap:anywhere}td.r{padding-right:6px}th{background:#c6e0b4;font-weight:700}.y th{background:#ffe699}td.r{text-align:right}.big td{height:38px}.tg{font-size:15px;font-weight:800}.note{font-size:11px;margin:4px 0 12px}.sg{text-align:right;margin-top:24px;font-size:13px;line-height:2}`;
  const html = `<html><head><meta charset="utf-8">${link}<style>${css}</style></head><body><div class="org">${esc(org)}</div><h1>담보물 화재보험 가입여부 계산내역</h1><div class="u">(단위 : 원)</div>
  <table class="big"><tr><th style="width:25%">채무자</th><th style="width:30%">대출금액</th><th>담보물종류</th></tr><tr><td>${esc(f.debtor_name)}</td><td class="r">${w(f.loan_amount)}</td><td>${esc(f.collateral_type || '')}</td></tr></table>
  <table class="big"><tr><th>순대출액<br>(A)</th><th>선순위설정액<br>(B)</th><th>토지감정평가액<br>(C)</th><th>요보험가입금액<br>(D=A+B−C)</th><th>가입대상판별<br>(자동계산)</th></tr>
    <tr><td class="r">${w(f.net_amount)}</td><td class="r">${w(f.senior_amount)}</td><td class="r">${w(f.land_amount)}</td><td class="r">${w(c.D)}</td><td class="tg">${c.target === 'Y' ? 'Y' : 'N'}</td></tr></table>
  <div class="note">* 요보험가입금액이 5천만원 이하이거나 전용주택·아파트 단지 내 주거용 오피스텔은 가입 생략 가능${ex ? ` (이 건: ${esc(ex)})` : ''}</div>
  <div class="note"><b>* 화재보험 가입시 작성</b></div>
  <table class="y big"><tr><th>요보험가입금액<br>(최소금액)</th><th>질권설정액</th><th>보험시작일자<br>보험종료일자</th><th>보험회사</th><th>확정일자 부여번호<br>부여일</th></tr>
    <tr><td class="r">${w(c.target === 'Y' ? (f.min_amount != null ? f.min_amount : c.D) : 0)}</td><td class="r">${w(f.pledge_amount)}</td><td>${esc(f.ins_start || '')}<br>${esc(f.ins_end || '')}</td><td>${esc(f.insurer || '')}</td><td>${esc(f.confirm_no || '')}<br>${esc(f.confirm_date || '')}</td></tr></table>
  <div class="note">* 대출금액은 신규취급 합산금액</div>
  <div class="sg">${+y}년 ${+m}월 ${+dd}일<br>확인자 : ${esc(f.checker || nameOf(me))} (인)</div></body></html>`;
  if (typeof apPreview === 'function') apPreview(html, '담보물 화재보험 가입여부 계산내역', `화재보험판단_${f.debtor_name || ''}`);
}

(function(){
  const st = document.createElement('style'); st.textContent = `
  .lcv{ display:flex; flex-direction:column; gap:8px; } .lcsub{ font-size:12.5px; color:var(--muted); margin-bottom:2px; }
  .lcm{ display:flex; gap:3px; flex:none; } .lcc{ font-size:11px; font-weight:800; padding:1px 6px; border-radius:99px; background:#eef0f5; color:#7a8294; white-space:nowrap; letter-spacing:0; }
  .lcc.done{ background:#d9f0de; color:#1d6b32; } .lcc.todo{ background:#fbd5cc; color:#a33a24; } .lcc.ask{ background:#fde8b8; color:#8a5a00; } .lcc.na{ background:#eef0f5; color:#a4aab8; } .lcc.warn{ box-shadow:inset 0 0 0 1.5px #e8a04a; }
  .lcr{ border:1px solid #e3e6ee; border-radius:12px; padding:10px 12px; background:#fff; } .lcr.ask{ border-color:#f2d48a; background:#fffaf0; } .lcr.todo{ border-color:#f0b8aa; background:#fff6f3; } .lcr.done{ border-color:#bfe3c7; background:#f5fbf6; } .lcr.na{ background:#f6f6f8; } .lcr.warn{ border-color:#e8a04a; }
  .lch{ display:flex; align-items:center; gap:8px; font-size:14px; } .lcst{ font-size:11.5px; font-weight:800; padding:1px 8px; border-radius:999px; background:#eef0f5; color:#5a6172; } .lcr.ask .lcst{ background:#fde8b8; color:#8a5a00; } .lcr.todo .lcst{ background:#fbd5cc; color:#a33a24; } .lcr.done .lcst{ background:#cdeed4; color:#1d6b32; }
  .lct{ margin-top:4px; font-size:13px; color:#44546f; word-break:keep-all; } .lcr.warn .lct{ color:#b45f06; font-weight:700; } .lca{ margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  #lcFireOv .lfg{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; } #lcFireOv .lfg input{ text-align:left; } #lcFireOv .lfn{ text-align:right !important; } #lcFireOv .lfh{ margin:16px 0 4px; font-size:13.5px; font-weight:800; color:#7a5b00; }
  #lcFireOv .lfres{ margin-top:14px; padding:12px 14px; border-radius:14px; display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; font-size:13.5px; background:#eef6ee; } #lcFireOv .lfres.Y{ background:#fdeee9; } #lcFireOv .lfres b{ font-size:18px; font-weight:800; } #lcFireOv .lfv{ font-weight:800; margin-left:auto; }
  #lcFireOv .checks input{ width:20px; height:20px; min-height:0; -webkit-appearance:auto; appearance:auto; }
  @media (max-width:600px){ #lcFireOv .lfg{ grid-template-columns:1fr; } }`;
  document.head.appendChild(st);
})();
