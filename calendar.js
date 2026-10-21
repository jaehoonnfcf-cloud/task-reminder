// 달력(주요일정) — 일~토 2주. 같은 코드로 두 개를 만든다.
//  · 조합일정(#cal, calendar_events): 여신·수신/기타 화면 맨 위. 관리자만 등록/수정/삭제, 팀원은 보기만.
//  · 개인일정(#pcal, personal_events): 개인업무 화면 맨 위. 본인만 보고 본인만 등록/수정/삭제 (조합 공휴일은 같이 보임).
// index.html 의 전역(sb, $, esc, me, isAdmin, kstToday, toast)을 함께 쓴다.

const CAL_KINDS = { '조합행사': '#7c3aed', '휴가': '#e08a00', '출장': '#0f9d8a', '외부행사': '#3b6cf5', '공휴일': '#e5484d', '기타': '#8a90a0' };
const PCAL_KINDS = { '개인': '#7c3aed', '약속': '#3b6cf5', '휴가': '#e08a00', '출장': '#0f9d8a', '기타': '#8a90a0' };
const CAL_DOW = ['일', '월', '화', '수', '목', '금', '토'];

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #cal,#pcal{ min-width:0; }
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
})();

// 이번 주 일요일부터 14일
function calDays(){
  const t = new Date(kstToday() + 'T12:00:00Z'), start = new Date(t.getTime() - t.getUTCDay() * 864e5);
  return Array.from({ length: 14 }, (_, i) => { const d = new Date(start.getTime() + i * 864e5); return { iso: d.toISOString().slice(0, 10), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() }; });
}
const calOn = (e, iso) => e.start_date <= iso && (e.end_date || e.start_date) >= iso;

function makeCal(cfg){
  const p = cfg.p, S = { events: [], editId: null, timer: null };
  const colors = { ...CAL_KINDS, ...cfg.kinds };
  const I = (x) => $(p + x);
  let fold = (() => { try { return localStorage.getItem(cfg.foldKey) === '1'; } catch (e) { return false; } })();
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="${p}Ov"><div class="panel" style="max-width:460px" id="${p}Panel"></div></div>`;
  document.body.appendChild(d);
  I('Ov').addEventListener('click', (e) => { if (e.target === I('Ov')) close(); });

  async function load(){
    const days = calDays(), first = days[0].iso, last = days[13].iso;
    const back = new Date(new Date(first + 'T12:00:00Z').getTime() - 60 * 864e5).toISOString().slice(0, 10);   // 며칠씩 이어지는 일정까지 포함
    const q = (table) => sb.from(table).select('*').gte('start_date', back).lte('start_date', last).order('start_date').order('event_time', { nullsFirst: true }).order('id');
    const [r, h] = await Promise.all([q(cfg.table), cfg.holidays ? q('calendar_events').eq('kind', '공휴일') : Promise.resolve({ data: [] })]);
    if (r.error){ console.warn(cfg.title + ' 불러오기 실패', r.error.message); return; }
    const hol = (h.data || []).map(e => ({ ...e, _ro: true }));
    S.events = [...(r.data || []), ...hol].filter(e => (e.end_date || e.start_date) >= first);
    render();
  }
  function schedule(){ clearTimeout(S.timer); S.timer = setTimeout(() => { if (me) load(); }, 400); }
  function label(e, iso){
    const tm = e.event_time ? `<span class="tm">${esc(e.event_time.slice(0, 5))}</span>` : '';
    let sfx = '';
    if (e.end_date && e.end_date > e.start_date && iso === e.start_date){
      const [, em, ed] = e.end_date.split('-'), [, sm] = e.start_date.split('-');
      sfx = ` (~${em === sm ? +ed : `${+em}/${+ed}`})`;
    }
    return `<div class="cev" ${e._ro ? '' : `data-ev="${e.id}"`} title="${esc(e.title)}"><i style="background:${colors[e.kind] || colors['기타']}"></i><span>${tm}${esc(e.title)}${sfx}</span></div>`;
  }
  function render(){
    const el = I(''); if (!el) return;
    const adm = cfg.canEdit(), days = calDays(), today = kstToday();
    const cell = (dd) => {
      const evs = S.events.filter(e => calOn(e, dd.iso)).sort((a, b) => String(a.event_time || '').localeCompare(String(b.event_time || '')) || (a._ro ? 1 : 0) - (b._ro ? 1 : 0) || a.id - b.id);
      return `<div class="calc dow${dd.dow} ${evs.some(e => e.kind === '공휴일') ? 'hol' : ''} ${dd.iso === today ? 'today' : ''} ${evs.length ? '' : 'empty'} ${adm ? 'adm' : ''}" data-d="${dd.iso}">
        <div class="cd"><span class="${dd.iso === today ? 't' : ''}">${dd.m}. ${dd.d}</span><small>${CAL_DOW[dd.dow]}</small></div>
        <div class="cl">${evs.map(e => label(e, dd.iso)).join('')}</div></div>`;
    };
    const none = !days.some(dd => S.events.some(e => calOn(e, dd.iso)));
    el.innerHTML = `<div class="calcard">
      <div class="calh"><b>${cfg.icon} ${cfg.title}</b><span class="muted">이번 주 · 다음 주</span><span class="sp"></span>
        ${adm ? `<button class="btn small primary" id="${p}Add">＋ 일정 추가</button>` : ''}
        <button class="btn small" id="${p}Fold">${fold ? '펼치기 ▾' : '접기 ▴'}</button></div>
      ${fold ? '' : `<div class="calgrid">${days.map(cell).join('')}</div>${none ? '<div class="calnone">이번 주·다음 주 등록된 일정이 없어요.</div>' : ''}`}</div>`;
    I('Fold').onclick = () => { fold = !fold; try { localStorage.setItem(cfg.foldKey, fold ? '1' : '0'); } catch (e) {} render(); };
    if (adm){
      I('Add').onclick = () => open(null, today);
      el.querySelectorAll('.calc').forEach(c => c.onclick = (ev) => {
        const e = ev.target.closest('[data-ev]');
        if (e) return open(+e.dataset.ev);
        open(null, c.dataset.d);
      });
    }
  }
  function open(id, date){
    if (!cfg.canEdit()) return;
    S.editId = id || null;
    const e = id ? S.events.find(x => x.id === id && !x._ro) : null; if (id && !e) return;
    const kinds = Object.keys(cfg.kinds);
    I('Panel').innerHTML = `<div class="ph"><h2>${e ? '일정 수정' : '일정 추가'}</h2><button class="x" data-c="close">✕</button></div>
      <label>제목 <span style="color:var(--danger)">*</span></label><input id="${p}Title" maxlength="100" placeholder="${esc(cfg.placeholder)}" />
      <label>종류</label><div class="checks" id="${p}Kind">${kinds.map(k => `<label><input type="radio" name="${p}KindR" value="${k}" ${(e ? e.kind : cfg.defKind) === k ? 'checked' : ''}/> <i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colors[k]}"></i> ${k}</label>`).join('')}</div>
      <div class="row"><div><label>시작일 <span style="color:var(--danger)">*</span></label><input id="${p}Start" type="date" /></div><div><label>종료일 (여러 날일 때)</label><input id="${p}End" type="date" /></div></div>
      <label>시간 (선택)</label><input id="${p}Time" type="time" style="max-width:180px" />
      <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px"><button class="btn primary" data-c="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-c="close" style="min-height:44px">취소</button></div>${e ? '<button class="btn danger" data-c="del">삭제</button>' : ''}</div>`;
    I('Title').value = e ? e.title : ''; I('Start').value = e ? e.start_date : (date || kstToday()); I('End').value = e && e.end_date ? e.end_date : ''; I('Time').value = e && e.event_time ? e.event_time.slice(0, 5) : '';
    I('Ov').style.display = 'block'; document.body.style.overflow = 'hidden';
    setTimeout(() => { try { I('Title').focus(); } catch (x) {} }, 50);
  }
  function close(){ I('Ov').style.display = 'none'; S.editId = null; document.body.style.overflow = ''; }
  I('Panel').addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-c]'); if (!b) return;
    if (b.dataset.c === 'close') return close();
    if (b.dataset.c === 'del'){
      if (!confirm('이 일정을 삭제할까요?')) return;
      const { error } = await sb.from(cfg.table).delete().eq('id', S.editId);
      if (error) return alert(error.message);
      close(); return load();
    }
    if (b.dataset.c === 'save'){
      const title = I('Title').value.trim(), start = I('Start').value, end = I('End').value, time = I('Time').value;
      if (!title) return alert('제목을 입력해주세요.');
      if (!start) return alert('시작일을 선택해주세요.');
      if (end && end < start) return alert('종료일이 시작일보다 앞이에요.');
      const row = { title, kind: (document.querySelector(`input[name=${p}KindR]:checked`) || {}).value || cfg.defKind, start_date: start, end_date: end && end !== start ? end : null, event_time: time || null };
      b.disabled = true;
      const { error } = S.editId ? await sb.from(cfg.table).update(row).eq('id', S.editId) : await sb.from(cfg.table).insert(row);
      b.disabled = false;
      if (error) return alert(error.message);
      close(); toast('📅 일정을 저장했어요'); await load();
    }
  });
  return { load, schedule, render, open, close, state: S };
}

const calMain = makeCal({ p: 'cal', table: 'calendar_events', icon: '📅', title: '조합일정', kinds: CAL_KINDS, defKind: '조합행사', foldKey: 'calFold', placeholder: '예: 이사회 / 휴가 : 최정훈 / 오전반가 : 곽선화', canEdit: () => isAdmin() });
const calPers = makeCal({ p: 'pcal', table: 'personal_events', icon: '🗓', title: '개인일정', kinds: PCAL_KINDS, defKind: '개인', foldKey: 'pcalFold', placeholder: '예: 치과 예약 / 아이 학부모 상담', holidays: true, canEdit: () => !!me });
// index.html 에서 쓰는 이름
const loadCal = () => calMain.load(), scheduleCal = () => calMain.schedule(), renderCal = () => calMain.render(), calOpen = (id, date) => calMain.open(id, date);
const loadPcal = () => calPers.load(), schedulePcal = () => calPers.schedule();
