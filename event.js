// 이벤트 — 건강검진·연차·반차(오전/오후)를 달력에서 직원들이 직접 고르고, "그날 누가 무엇인지" 한눈에 보는 화면.
// 팀원 누구나 조회·본인 일정 등록·본인 일정 삭제(관리자는 다른 사람 대신 등록·삭제). 건강검진은 같은 날 다른 사람이 있으면 확인 후 등록.
// 전역(sb, $, esc, me, members, nameOf, kstToday, toast, isAdmin, divn)을 함께 쓴다.

const EV_KINDS = {
  '건강검진': { icon: '🩺', short: '검진', color: '#0f9d8a', bg: '#d9f3ef' },
  '연차': { icon: '🏖', short: '연차', color: '#3b6cf5', bg: '#dfe8ff' },
  '반차(오전)': { icon: '🌅', short: '오전반차', color: '#e08a00', bg: '#ffecc7' },
  '반차(오후)': { icon: '🌇', short: '오후반차', color: '#c2410c', bg: '#ffe0cf' },
};
let evRows = [], evStart = '', evFilter = 'all', evDay = null, evHol = new Set();
const evDow = ['일', '월', '화', '수', '목', '금', '토'];
const evIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const evMonthShift = (ym, n) => { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #event{ display:none; flex-direction:column; gap:12px; min-width:0; }
  .evtop{ display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; }
  .evleg{ display:flex; flex-wrap:wrap; gap:6px; } .evleg button{ border:0; cursor:pointer; font:inherit; font-size:13px; font-weight:700; padding:6px 12px; border-radius:99px; }
  .evleg button.off{ opacity:.35; }
  .evmonths{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; align-items:start; }
  .evmon{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:14px 12px 12px; min-width:0; }
  .evmon h3{ margin:0 0 8px 6px; font-size:18px; letter-spacing:-.03em; }
  .evgrid{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:4px; }
  .evdh{ text-align:center; font-size:12px; font-weight:700; color:var(--muted); padding:2px 0; } .evdh.d0{ color:#e5484d; } .evdh.d6{ color:#3b6cf5; }
  .evd{ min-height:96px; border-radius:12px; background:var(--field); padding:5px 4px 4px; cursor:pointer; min-width:0; overflow:hidden; border:2px solid transparent; }
  .evd:hover{ border-color:#c9d3ea; } .evd.emp{ visibility:hidden; cursor:default; } .evd.today{ border-color:#16181d; }
  .evd .n{ font-size:12.5px; font-weight:800; color:#44546f; margin-bottom:2px; } .evd.d0 .n,.evd.hol .n{ color:#e5484d; } .evd.d6 .n{ color:#3b6cf5; }
  .evd.past{ opacity:.6; } .evd.hasck{ background:#eaf8f5; }
  .evc{ display:block; font-size:11.5px; font-weight:700; border-radius:6px; padding:1px 5px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .evc.me{ outline:2px solid #16181d; outline-offset:-1px; }
  .evmore{ font-size:11px; color:var(--muted); font-weight:700; margin-top:2px; }
  .evppl{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:14px 18px; }
  .evppl h3{ margin:0 0 8px; font-size:15.5px; } .evppl table{ width:100%; border-collapse:collapse; font-size:13.5px; } .evppl td{ padding:6px 4px; border-top:1px solid var(--line); vertical-align:top; } .evppl td:first-child{ font-weight:700; white-space:nowrap; width:78px; }
  .evtag{ display:inline-block; font-size:12px; font-weight:700; border-radius:6px; padding:1px 7px; margin:2px 4px 2px 0; }
  .evrow{ display:flex; align-items:center; gap:8px; padding:9px 2px; border-bottom:1px solid var(--line); } .evrow:last-child{ border-bottom:0; } .evrow .who{ font-weight:700; flex:1; min-width:0; }
  .evkinds{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:8px; } .evkinds label{ display:flex; align-items:center; gap:6px; padding:10px 12px; border-radius:12px; background:var(--field); font-weight:700; cursor:pointer; margin:0; }
  @media (max-width:900px){ .evmonths{ grid-template-columns:1fr; } }
  @media (max-width:560px){ .evc .ico{ display:none; } .evc{ text-align:center; } .evd{ min-height:74px; padding:4px 2px 3px; } .evc{ font-size:10.5px; padding:1px 3px; } .evmon{ padding:12px 8px; } .evgrid{ gap:3px; } }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="evOv" style="z-index:30"><div class="panel" style="max-width:480px" id="evPanel"></div></div>`;
  document.body.appendChild(d);
  $('evOv').addEventListener('click', (e) => { if (e.target === $('evOv')) evClose(); });
})();
function evClose(){ $('evOv').style.display = 'none'; evDay = null; document.body.style.overflow = ''; }

// ---------- 불러오기 ----------
async function loadEvent(){
  if (!me) return;
  const [r, h] = await Promise.all([sb.from('event_bookings').select('*').order('event_date').order('id'), sb.from('calendar_events').select('start_date, end_date').eq('kind', '공휴일')]);
  if (r.error){ console.warn('이벤트 불러오기 실패', r.error.message); return; }
  evRows = r.data || [];
  evHol = new Set(); (h.data || []).forEach(x => { for (let t = Date.parse(x.start_date + 'T12:00:00Z'), e = Date.parse((x.end_date || x.start_date) + 'T12:00:00Z'); t <= e; t += 864e5) evHol.add(new Date(t).toISOString().slice(0, 10)); });
  if (typeof divn !== 'undefined' && divn === 'event'){ renderEvent(); if (evDay) evRenderDay(); }
}
let evTimer = null; const scheduleEvent = () => { clearTimeout(evTimer); evTimer = setTimeout(() => { if (me) loadEvent(); }, 400); };

// ---------- 달력 ----------
function renderEvent(){
  const el = $('event'); if (!el) return;
  if (!evStart) evStart = kstToday().slice(0, 7);
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-n]'); if (nav){ evStart = nav.dataset.n === 'today' ? kstToday().slice(0, 7) : evMonthShift(evStart, +nav.dataset.n); return renderEvent(); }
      const f = e.target.closest('[data-f]'); if (f){ evFilter = evFilter === f.dataset.f ? 'all' : f.dataset.f; return renderEvent(); }
      const d = e.target.closest('[data-d]'); if (d) evOpenDay(d.dataset.d);
    });
  }
  const months = [evStart, evMonthShift(evStart, 1)], today = kstToday(), rows = evRows.filter(r => evFilter === 'all' || r.kind === evFilter);
  const byDay = new Map(); rows.forEach(r => (byDay.get(r.event_date) || byDay.set(r.event_date, []).get(r.event_date)).push(r));
  const cnt = (k) => evRows.filter(r => r.kind === k && months.some(m => r.event_date.startsWith(m))).length;
  const mon = (ym) => {
    const [y, m] = ym.split('-').map(Number), first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = '<div class="evdh d0">일</div><div class="evdh">월</div><div class="evdh">화</div><div class="evdh">수</div><div class="evdh">목</div><div class="evdh">금</div><div class="evdh d6">토</div>';
    for (let i = 0; i < first; i++) cells += '<div class="evd emp"></div>';
    for (let d = 1; d <= last; d++){
      const iso = evIso(y, m, d), dow = (first + d - 1) % 7, bs = byDay.get(iso) || [], hasCk = evRows.some(r => r.event_date === iso && r.kind === '건강검진');
      cells += `<div class="evd d${dow} ${evHol.has(iso) ? 'hol' : ''} ${iso === today ? 'today' : ''} ${iso < today ? 'past' : ''} ${hasCk ? 'hasck' : ''}" data-d="${iso}"><div class="n">${d}</div>
        ${bs.slice(0, 4).map(r => { const k = EV_KINDS[r.kind]; return `<span class="evc ${r.person_email === me ? 'me' : ''}" style="background:${k.bg};color:${k.color}" title="${esc(nameOf(r.person_email))} · ${esc(r.kind)}"><span class="ico">${k.icon} </span>${esc(nameOf(r.person_email))}</span>`; }).join('')}${bs.length > 4 ? `<div class="evmore">+${bs.length - 4}명 더</div>` : ''}</div>`;
    }
    return `<div class="evmon"><h3>${y}년 ${m}월</h3><div class="evgrid">${cells}</div></div>`;
  };
  // 사람별: 표시 중인 두 달 동안 누가 언제 무엇
  const per = new Map(); evRows.filter(r => months.some(m => r.event_date.startsWith(m))).forEach(r => (per.get(r.person_email) || per.set(r.person_email, []).get(r.person_email)).push(r));
  el.innerHTML = `<div class="evtop"><div class="seg"><button data-n="-1">◀ 이전</button><button data-n="today">이번 달</button><button data-n="1">다음 ▶</button></div>
      <div class="evleg">${Object.entries(EV_KINDS).map(([k, v]) => `<button data-f="${esc(k)}" class="${evFilter !== 'all' && evFilter !== k ? 'off' : ''}" style="background:${v.bg};color:${v.color}">${v.icon} ${esc(k)} ${cnt(k)}</button>`).join('')}</div>
      <span class="muted" style="font-size:12.5px">날짜를 눌러 내 일정을 고르세요 · 위 버튼을 누르면 그 항목만 모아 봐요</span></div>
    <div class="evmonths">${months.map(mon).join('')}</div>
    <div class="evppl"><h3>사람별 보기 <span class="muted" style="font-size:12.5px;font-weight:500">(${months[0].replace('-', '년 ')}월 ~ ${months[1].replace('-', '년 ')}월)</span></h3>
      ${per.size ? `<table>${[...per.entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0]), 'ko')).map(([em, rs]) => `<tr><td>${esc(nameOf(em))}</td><td>${rs.sort((a, b) => a.event_date.localeCompare(b.event_date)).map(r => { const k = EV_KINDS[r.kind]; return `<span class="evtag" style="background:${k.bg};color:${k.color}">${esc(r.event_date.slice(5).replace('-', '/'))}(${evDow[new Date(r.event_date + 'T12:00:00Z').getUTCDay()]}) ${k.icon}${esc(r.kind)}</span>`; }).join('')}</td></tr>`).join('')}</table>` : '<div class="muted" style="font-size:13.5px">아직 등록된 일정이 없어요. 달력에서 날짜를 눌러 등록하세요.</div>'}</div>`;
}

// ---------- 날짜별 보기·등록 ----------
function evOpenDay(iso){ evDay = iso; evRenderDay(); $('evOv').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function evRenderDay(){
  const iso = evDay, d = new Date(iso + 'T12:00:00Z'), bs = evRows.filter(r => r.event_date === iso), admin = isAdmin(), mineKinds = new Set(bs.filter(r => r.person_email === me).map(r => r.kind));
  const prevWho = (document.querySelector('#evPanel #evWho') || {}).value;
  $('evPanel').innerHTML = `<div class="ph"><h2>${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${evDow[d.getUTCDay()]})${evHol.has(iso) ? ' 🎌' : ''}</h2><button class="x" data-e="close">✕</button></div>
    <div>${bs.length ? bs.map(r => { const k = EV_KINDS[r.kind], can = r.person_email === me || r.created_by === me || admin;
      return `<div class="evrow"><span class="evtag" style="background:${k.bg};color:${k.color}">${k.icon} ${esc(r.kind)}</span><span class="who">${esc(nameOf(r.person_email))}${r.note ? ` <span class="muted" style="font-weight:500">· ${esc(r.note)}</span>` : ''}</span>${can ? `<button class="btn small" data-e="del" data-id="${r.id}">삭제</button>` : ''}</div>`; }).join('') : '<div class="muted" style="padding:8px 2px">이 날은 아직 아무도 없어요.</div>'}</div>
    <div class="dbsec" style="margin-top:14px"><div class="k">${admin ? '일정 추가' : '내 일정 추가'}</div>
      ${admin ? `<label style="margin-top:4px">대상 직원</label><select id="evWho">${members.map(m => `<option value="${esc(m.email)}" ${(prevWho || me) === m.email ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}</select>` : ''}
      <div class="evkinds">${Object.entries(EV_KINDS).map(([k, v], i) => `<label style="${mineKinds.has(k) && !admin ? 'opacity:.4' : ''}"><input type="radio" name="evKind" value="${esc(k)}" ${i === 0 ? 'checked' : ''} /> ${v.icon} ${esc(k)}</label>`).join('')}</div>
      <label style="margin-top:10px">메모 (선택)</label><input id="evNote" maxlength="100" placeholder="예: 오후 2시 검진" />
      <div class="acts" style="margin-top:12px"><button class="btn primary" data-e="add">등록</button></div></div>`;
}
$('evPanel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-e]'); if (!b) return;
  if (b.dataset.e === 'close') return evClose();
  if (b.dataset.e === 'del'){
    const r = evRows.find(x => x.id === +b.dataset.id); if (!r || !confirm(`${nameOf(r.person_email)}님의 ${r.kind} 일정을 삭제할까요?`)) return;
    const { error } = await sb.from('event_bookings').delete().eq('id', r.id); if (error) return alert(error.message);
    toast('삭제했어요'); return loadEvent();
  }
  if (b.dataset.e === 'add'){
    const kind = (document.querySelector('input[name=evKind]:checked') || {}).value, who = $('evWho') ? $('evWho').value : me, note = $('evNote').value.trim() || null;
    if (!kind) return;
    if (evRows.some(r => r.event_date === evDay && r.person_email === who && r.kind === kind)) return alert('이미 같은 일정이 있어요.');
    if (kind === '건강검진'){
      const others = evRows.filter(r => r.event_date === evDay && r.kind === '건강검진' && r.person_email !== who);
      if (others.length && !confirm(`이 날은 이미 ${others.map(r => nameOf(r.person_email)).join(', ')}님이 건강검진을 예약했어요.\n일자가 겹치는데 그래도 등록할까요?`)) return;
    }
    b.disabled = true;
    const { error } = await sb.from('event_bookings').insert({ event_date: evDay, kind, person_email: who, note, created_by: me });
    b.disabled = false; if (error) return alert(error.code === '23505' ? '이미 같은 일정이 있어요.' : error.message);
    toast(`${EV_KINDS[kind].icon} ${nameOf(who)}님 ${kind} 등록`); await loadEvent(); evClose();
  }
});
