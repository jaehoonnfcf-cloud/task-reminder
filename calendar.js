// 조합 주요일정 — 여신·수신 화면 맨 위, 일~토 2주. 관리자만 등록/수정/삭제, 팀원은 보기만 한다.
// index.html 의 전역(sb, $, esc, isAdmin, kstToday, toast)을 함께 쓴다.

const CAL_KINDS = { '조합행사': '#7c3aed', '휴가': '#e08a00', '출장': '#0f9d8a', '외부행사': '#3b6cf5', '공휴일': '#e5484d', '기타': '#8a90a0' };
const CAL_DOW = ['일', '월', '화', '수', '목', '금', '토'];
let calEvents = [], calEditId = null, calTimer = null;
let calFold = (() => { try { return localStorage.getItem('calFold') === '1'; } catch (e) { return false; } })();

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #cal{ min-width:0; }
  .calcard{ background:#fff; border-radius:24px; box-shadow:var(--sh); padding:16px 18px 18px; }
  .calh{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .calh b{ font-size:16px; letter-spacing:-.02em; } .calh .sp{ flex:1; }
  .calgrid{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; margin-top:12px; }
  .calc{ background:var(--field); border-radius:16px; padding:8px 8px 10px; min-height:84px; min-width:0; }
  .calc.adm{ cursor:pointer; } .calc.adm:hover{ background:#eceef5; }
  .calc.today{ background:var(--accent-soft); }
  .cd{ font-size:12.5px; font-weight:800; color:#3b4252; margin-bottom:6px; white-space:nowrap; }
  .cd small{ font-weight:600; color:var(--muted); margin-left:3px; font-size:11.5px; }
  .calc.dow0 .cd, .calc.hol .cd{ color:#e5484d; } .calc.dow6 .cd{ color:#3b6cf5; }
  .calc.today .cd span.t{ background:var(--accent); color:#fff; padding:1px 7px; border-radius:99px; }
  .cev{ display:flex; gap:5px; align-items:flex-start; font-size:12px; line-height:1.35; padding:3px 0; font-weight:600; word-break:keep-all; overflow-wrap:anywhere; }
  .cev i{ flex:none; width:7px; height:7px; border-radius:50%; margin-top:5px; }
  .cev .tm{ color:var(--muted); font-weight:700; margin-right:3px; white-space:nowrap; }
  .calc.adm .cev:hover{ text-decoration:underline; }
  .calnone{ display:none; color:var(--muted); font-size:13px; padding:10px 2px 0; }
  .calrow2{ margin-top:8px; }
  @media (max-width:760px){
    .calcard{ padding:14px; border-radius:20px; }
    .calh .muted{ display:none; }
    .calgrid{ grid-template-columns:1fr; gap:6px; }
    .calc{ min-height:0; display:flex; gap:10px; align-items:flex-start; padding:9px 12px; }
    .calc.empty:not(.today){ display:none; }
    .calc .cd{ margin:0; width:74px; flex:none; font-size:13px; } .calc .cl{ flex:1; min-width:0; }
    .cev{ font-size:13px; } .calnone{ display:block; }
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="calOv"><div class="panel" style="max-width:460px" id="calPanel"></div></div>`;
  document.body.appendChild(d);
  $('calOv').addEventListener('click', (e) => { if (e.target === $('calOv')) calClose(); });
})();

// 이번 주 일요일부터 14일
function calDays(){
  const t = new Date(kstToday() + 'T12:00:00Z'), start = new Date(t.getTime() - t.getUTCDay() * 864e5);
  return Array.from({ length: 14 }, (_, i) => { const d = new Date(start.getTime() + i * 864e5); return { iso: d.toISOString().slice(0, 10), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }; });
}
async function loadCal(){
  const days = calDays(), first = days[0].iso, last = days[13].iso;
  const back = new Date(new Date(first + 'T12:00:00Z').getTime() - 60 * 864e5).toISOString().slice(0, 10);   // 며칠씩 이어지는 일정까지 포함
  const { data, error } = await sb.from('calendar_events').select('*').gte('start_date', back).lte('start_date', last).order('start_date').order('event_time', { nullsFirst: true }).order('id');
  if (error){ console.warn('주요일정 불러오기 실패', error.message); return; }
  calEvents = (data || []).filter(e => (e.end_date || e.start_date) >= first);
  renderCal();
}
function scheduleCal(){ clearTimeout(calTimer); calTimer = setTimeout(() => { if (me) loadCal(); }, 400); }
const calOn = (e, iso) => e.start_date <= iso && (e.end_date || e.start_date) >= iso;
function calLabel(e, iso){
  const tm = e.event_time ? `<span class="tm">${esc(e.event_time.slice(0, 5))}</span>` : '';
  let sfx = '';
  if (e.end_date && e.end_date > e.start_date && iso === e.start_date){
    const [, em, ed] = e.end_date.split('-'), [, sm] = e.start_date.split('-');
    sfx = ` (~${em === sm ? +ed : `${+em}/${+ed}`})`;
  }
  return `<div class="cev" data-ev="${e.id}" title="${esc(e.title)}"><i style="background:${CAL_KINDS[e.kind] || CAL_KINDS['기타']}"></i><span>${tm}${esc(e.title)}${sfx}</span></div>`;
}
function renderCal(){
  const el = $('cal'); if (!el) return;
  const adm = isAdmin(), days = calDays(), today = kstToday();
  const cell = (d) => {
    const evs = calEvents.filter(e => calOn(e, d.iso)).sort((a, b) => String(a.event_time || '').localeCompare(String(b.event_time || '')) || a.id - b.id);
    return `<div class="calc dow${d.dow} ${evs.some(e => e.kind === '공휴일') ? 'hol' : ''} ${d.iso === today ? 'today' : ''} ${evs.length ? '' : 'empty'} ${adm ? 'adm' : ''}" data-d="${d.iso}">
      <div class="cd"><span class="${d.iso === today ? 't' : ''}">${d.m}. ${d.d}</span><small>${CAL_DOW[d.dow]}</small></div>
      <div class="cl">${evs.map(e => calLabel(e, d.iso)).join('')}</div></div>`;
  };
  const none = !days.some(d => calEvents.some(e => calOn(e, d.iso)));
  el.innerHTML = `<div class="calcard">
    <div class="calh"><b>📅 주요일정</b><span class="muted">이번 주 · 다음 주</span><span class="sp"></span>
      ${adm ? '<button class="btn small primary" id="calAdd">＋ 일정 추가</button>' : ''}
      <button class="btn small" id="calFold">${calFold ? '펼치기 ▾' : '접기 ▴'}</button></div>
    ${calFold ? '' : `<div class="calgrid">${days.map(cell).join('')}</div>${none ? '<div class="calnone">이번 주·다음 주 등록된 일정이 없어요.</div>' : ''}`}</div>`;
  $('calFold').onclick = () => { calFold = !calFold; try { localStorage.setItem('calFold', calFold ? '1' : '0'); } catch (e) {} renderCal(); };
  if (adm){
    $('calAdd').onclick = () => calOpen(null, today);
    el.querySelectorAll('.calc').forEach(c => c.onclick = (ev) => {
      const e = ev.target.closest('[data-ev]');
      if (e) return calOpen(+e.dataset.ev);
      calOpen(null, c.dataset.d);
    });
  }
}
function calOpen(id, date){
  if (!isAdmin()) return;
  calEditId = id || null;
  const e = id ? calEvents.find(x => x.id === id) : null; if (id && !e) return;
  $('calPanel').innerHTML = `<div class="ph"><h2>${e ? '일정 수정' : '일정 추가'}</h2><button class="x" data-c="close">✕</button></div>
    <label>제목 <span style="color:var(--danger)">*</span></label><input id="calTitle" maxlength="100" placeholder="예: 이사회 / 휴가 : 최정훈 / 오전반가 : 곽선화" />
    <label>종류</label><div class="checks" id="calKind">${Object.keys(CAL_KINDS).map(k => `<label><input type="radio" name="calKindR" value="${k}" ${(e ? e.kind : '조합행사') === k ? 'checked' : ''}/> <i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${CAL_KINDS[k]}"></i> ${k}</label>`).join('')}</div>
    <div class="row"><div><label>시작일 <span style="color:var(--danger)">*</span></label><input id="calStart" type="date" /></div><div><label>종료일 (여러 날일 때)</label><input id="calEnd" type="date" /></div></div>
    <label>시간 (선택)</label><input id="calTime" type="time" style="max-width:180px" />
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px"><button class="btn primary" data-c="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-c="close" style="min-height:44px">취소</button></div>${e ? '<button class="btn danger" data-c="del">삭제</button>' : ''}</div>`;
  $('calTitle').value = e ? e.title : ''; $('calStart').value = e ? e.start_date : (date || kstToday()); $('calEnd').value = e && e.end_date ? e.end_date : ''; $('calTime').value = e && e.event_time ? e.event_time.slice(0, 5) : '';
  $('calOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('calTitle').focus(); } catch (x) {} }, 50);
}
function calClose(){ $('calOv').style.display = 'none'; calEditId = null; document.body.style.overflow = ''; }
$('calPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-c]'); if (!b) return;
  if (b.dataset.c === 'close') return calClose();
  if (b.dataset.c === 'del'){
    if (!confirm('이 일정을 삭제할까요?')) return;
    const { error } = await sb.from('calendar_events').delete().eq('id', calEditId);
    if (error) return alert(error.message);
    calClose(); return loadCal();
  }
  if (b.dataset.c === 'save'){
    const title = $('calTitle').value.trim(), start = $('calStart').value, end = $('calEnd').value, time = $('calTime').value;
    if (!title) return alert('제목을 입력해주세요.');
    if (!start) return alert('시작일을 선택해주세요.');
    if (end && end < start) return alert('종료일이 시작일보다 앞이에요.');
    const row = { title, kind: (document.querySelector('input[name=calKindR]:checked') || {}).value || '조합행사', start_date: start, end_date: end && end !== start ? end : null, event_time: time || null };
    b.disabled = true;
    const { error } = calEditId ? await sb.from('calendar_events').update(row).eq('id', calEditId) : await sb.from('calendar_events').insert(row);
    b.disabled = false;
    if (error) return alert(error.message);
    calClose(); toast('📅 일정을 저장했어요'); await loadCal();
  }
});
