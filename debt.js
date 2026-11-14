// 사후관리 > 연체채권관리 — 연체 채무자별 연체일수 · 연락/방문 이력 · 다음 조치 예정일. 별도 권한(perm_debt) 또는 관리자만 보고 입력한다.
// index.html 의 전역(sb, $, esc, me, meRow, members, nameOf, kstToday, toast, divn)을 함께 쓴다.

const DEBT_KINDS = ['전화', '문자', '방문', '면담', '우편', '기타'];
// 연락 방향: 전화는 우리가 걸 때도, 걸려올 때도 있다 (문자·방문 등은 대부분 우리가 하지만 상대가 하는 경우도 구분)
const DEBT_DIR = { '전화': ['📞 발신 (우리가 걸었음)', '📲 수신 (걸려왔음)'], '문자': ['발신 (우리가 보냄)', '수신 (받음)'], '방문': ['우리가 방문', '채무자가 내방'], '면담': ['우리가 요청', '채무자가 요청'], '우편': ['발신', '수신'], '기타': ['당사 → 상대', '상대 → 당사'] };
const dbKindTxt = (l) => l.kind === '전화' ? `전화 ${l.direction === '수신' ? '수신' : '발신'}` : (l.direction === '수신' ? (l.kind === '방문' ? '방문(내방)' : `${l.kind} 수신`) : l.kind);
const dbHasAct = (l) => !!(l.action_note || l.action_date);
const DEBT_ICON = { '전화': '📞', '문자': '💬', '방문': '🚪', '면담': '🤝', '우편': '✉️', '기타': '📝' };
let dbLogEdit = null, dbLogEditShown = null;
let debtArchived = [], dbHist = {}, dbTrashLogs = false, dbHistOpen = new Set(), debtCases = [], debtOpenId = null, debtFormId = null, debtTimer = null;
let dbType = 'all', dbClassF = 'all', dbView = 'active', dbScope = 'all', dbMine = false, dbQ = '', dbSort = 'next';
const debtCan = () => !!(meRow && (meRow.is_admin || meRow.perm_debt));   // 등록·수정 권한 (없어도 팀원 누구나 보기만 가능)
const debtView = () => !!meRow;

const dbNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const dbComma = (s) => { const n = dbNum(s); return n === null ? '' : n.toLocaleString('ko-KR'); };
const dbWon = (n) => {
  if (n === null || n === undefined || n === '') return '-';
  n = Number(n); if (!n) return '0원';
  const e = Math.floor(n / 1e8), m = Math.floor(n % 1e8 / 1e4), r = n % 1e4;
  return [e && `${e}억`, m && `${m.toLocaleString('ko-KR')}만`, r && `${r.toLocaleString('ko-KR')}`].filter(Boolean).join(' ') + '원';
};
const dbDiff = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(kstToday() + 'T12:00:00Z')) / 864e5) + 0;   // -0 방지. 오늘 기준 (미래 +, 과거 −)
// 연체일수 = 오늘 − 내부연체기준일. 기준일이 없으면(특수채권·연체예정채권 등) 매우 작은 값으로 두어 정렬·집계에서 뒤로/제외되게 한다
// 특수채권: 연체·건전성·기한이익상실 관리가 필요 없고 '특수채권편입일자'만 관리한다
const dbSpecial = (c) => c.bond_type === '특수';
const dbHasSince = (c) => !dbSpecial(c) && !!c.overdue_since;
const dbDays = (c) => dbHasSince(c) ? 0 - dbDiff(c.overdue_since) : -99999;
// 기한이익상실일: 미래 날짜면 '상실 예정일'. d = 오늘 기준 남은 일수(+) / 지난 일수(−)
function dbAccel(c){
  if (dbSpecial(c) || !c.acceleration_date) return null;
  const n = dbDiff(c.acceleration_date);
  if (n > 0) return { cls: 'soon', txt: `상실 예정 D-${n}`, short: `예정 D-${n}`, d: n };
  if (n === 0) return { cls: 'today', txt: '오늘 기한이익상실', short: '오늘 상실', d: 0 };
  return { cls: 'done', txt: `기한이익상실 ${-n}일 경과`, short: `상실 ${-n}일 경과`, d: n };
}
// 자산건전성 5단계 + 고정이하분류일(예정일 기능: 미래면 예정 D-n, 지나면 경과)
const DB_CLASSES = ['정상', '요주의', '고정', '회수의문', '추정손실'];
const DB_CLASS_COLOR = { '정상': ['#dcfce7', '#166534'], '요주의': ['#fef3c7', '#92400e'], '고정': ['#ffedd5', '#c2410c'], '회수의문': ['#fee2e2', '#b91c1c'], '추정손실': ['#7f1d1d', '#ffffff'] };
const dbClassChip = (c) => dbSpecial(c) ? '<span class="dbcls" style="background:#ede9fe;color:#6d28d9">특수채권</span>' : c.asset_class ? `<span class="dbcls" style="background:${DB_CLASS_COLOR[c.asset_class][0]};color:${DB_CLASS_COLOR[c.asset_class][1]}">${esc(c.asset_class)}</span>` : '<span class="muted" style="font-size:12px;margin-left:6px;font-weight:500">건전성 미분류</span>';
function dbFixed(c){
  if (dbSpecial(c) || !c.fixed_below_date) return null;
  const n = dbDiff(c.fixed_below_date);
  if (n > 0) return { cls: 'soon', txt: `고정이하 분류 예정 D-${n}`, short: `예정 D-${n}`, d: n };
  if (n === 0) return { cls: 'today', txt: '오늘 고정이하 분류', short: '오늘 분류', d: 0 };
  return { cls: 'done', txt: `고정이하 분류 ${-n}일 경과`, short: `분류 ${-n}일 경과`, d: n };
}
function dbCaution(c){
  if (dbSpecial(c) || !c.caution_date) return null;
  const n = dbDiff(c.caution_date);
  if (n > 0) return { cls: 'soon', txt: `요주의 분류 예정 D-${n}`, short: `D-${n}`, d: n };
  if (n === 0) return { cls: 'today', txt: '오늘 요주의 분류', short: '오늘', d: 0 };
  return { cls: 'done', txt: `요주의 분류 ${-n}일 경과`, short: `${-n}일 경과`, d: n };
}
// 건전성 일정 3개: 요주의 → 고정이하 → 기한이익상실. 날짜가 지났다고 분류가 자동으로 바뀐 것은 아니므로(단계적으로 하향) 경과 일수만 보여준다
const DB_LOW = ['고정', '회수의문', '추정손실'];
// 건전성 기준일 = 내부연체기준일과 타행연체일자 중 빠른 날짜
const dbBaseSince = (c) => [c.overdue_since, c.other_bank_since].filter(Boolean).sort()[0] || '';
const dbOtherEarly = (c) => !!c.other_bank_since && (!c.overdue_since || c.other_bank_since < c.overdue_since);
const dbShortDate = (iso) => iso ? iso.slice(2).replace(/-/g, '.') : '';
function dbMiles(c){
  if (dbSpecial(c)) return [];
  const cls = c.asset_class || '', closed = c.status === '종결';
  const it = [
    { k: 'caution', label: '요주의', date: c.caution_date, st: dbCaution(c), col: '#b45309', bg: '#fef3c7' },
    { k: 'fixed', label: '고정이하', date: c.fixed_below_date, st: dbFixed(c), col: '#c2410c', bg: '#ffedd5' }];
  if (!closed){ let best = null; it.forEach(m => { if (m.st && m.st.d >= 0 && (!best || m.st.d < best.st.d)) best = m; }); if (best) best.nx = true; }
  return it;
}
const dbClsKey = (c) => { if (dbSpecial(c)) return 2e6; const a = dbMiles(c); return Math.min(dbSchedKey(a[0].st), dbSchedKey(a[1].st)); };
// 연체 · 기한이익상실 묶음 (건전성 분류와 별개의 관점)
function dbAccelHtml(c, big){
  const a = dbAccel(c), st = !a ? 'none' : a.d > 0 ? 'fut' : a.d === 0 ? 'today' : 'past';
  return `<div class="dbac ${st} ${big ? 'big' : ''}"><span class="l">기한이익상실${a && a.d >= 0 ? ' <i>예정</i>' : ''}</span><b>${a ? esc(dbShortDate(c.acceleration_date)) : '-'}</b><span class="bd">${a ? esc(a.d > 0 ? `D-${a.d}` : a.d === 0 ? '오늘 상실' : `상실 ${-a.d}일 경과`) : '미정'}</span></div>`;
}
function dbOverdueHtml(c){
  if (dbSpecial(c)) return dbDaysTag(c);
  return `${dbDaysTag(c)}<div class="dbl"><span>내부연체</span>${c.overdue_since ? `<b>${esc(dbShortDate(c.overdue_since))}</b>` : '<em>미입력</em>'}</div><div class="dbl ${dbOtherEarly(c) ? 'early' : ''}"><span>타행연체</span>${c.other_bank_since ? `<b>${esc(dbShortDate(c.other_bank_since))}</b>` : '<em>없음</em>'}</div>${dbAccelHtml(c)}`;
}
const dbSpDays = (c) => c.special_date ? -dbDiff(c.special_date) : null;
function dbMileHtml(c, big){
  if (dbSpecial(c)) return `<div class="dbsp ${big ? 'big' : ''}"><span class="l">특수채권편입일자</span><b>${c.special_date ? esc(c.special_date) : '<span class="muted">미입력</span>'}</b>${c.special_date && dbSpDays(c) >= 0 ? `<span class="bd">편입 ${dbSpDays(c).toLocaleString('ko-KR')}일 경과</span>` : ''}</div>`;
  return `<div class="dbms ${big ? 'big' : ''}">${dbMiles(c).map(m => {
    const st = m.st, state = !st ? 'none' : m.nx ? 'nx' : st.d >= 0 ? 'fut' : 'past';
    const badge = !st ? '미정' : st.d > 0 ? `D-${st.d}` : st.d === 0 ? '오늘' : `${-st.d}일 경과`;
    return `<div class="dbm ${state}" style="--mc:${m.col};--mb:${m.bg}"><span class="l">${m.label}${st && st.d >= 0 ? ' <i>예정</i>' : ''}</span><b>${st ? esc(dbShortDate(m.date)) : '-'}</b><span class="bd">${esc(badge)}</span></div>`;
  }).join('')}</div>`;
}
function dbNextMsg(c){
  if (c.status === '종결' || dbSpecial(c)) return '';
  const m = dbMiles(c);
  const nx = m.find(x => x.nx);
  return nx ? `<span class="dbnm">예정 · <b>${nx.label}</b> ${esc(dbShortDate(nx.date))} <b class="${nx.st.cls}">${nx.st.d === 0 ? '오늘' : 'D-' + nx.st.d}</b></span>` : '<span class="dbnm mu">건전성 변경 일정이 아직 없어요</span>';
}
const dbFind = (id) => debtCases.find(x => x.id === id) || debtArchived.find(x => x.id === id);
const dbDelLogs = (c) => (c.debt_logs || []).filter(l => l.deleted_at).sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
const dbLogs = (c) => [...(c.debt_logs || []).filter(l => !l.deleted_at)].sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)) || b.id - a.id);
const dbMd = (iso) => iso ? iso.slice(5).replace('-', '/') : '';
function dbDaysTag(c){
  const d = dbDays(c);
  if (c.status === '종결') return `<span class="dbd end">종결</span>`;
  if (dbSpecial(c)) return `<span class="dbd sp">특수채권</span>`;
  if (!dbHasSince(c)) return `<span class="dbd">연체일 미입력</span>`;
  if (d < 0) return `<span class="dbd">연체 전 D${d}</span>`;
  return `<span class="dbd ${d >= 90 ? 'r3' : d >= 30 ? 'r2' : 'r1'}">연체 ${d.toLocaleString('ko-KR')}일</span>`;
}
const dbSchedKey = (a) => !a ? 1e6 : a.d >= 0 ? a.d : 1e4 - a.d;
const dbAccelKey = (c) => dbSchedKey(dbAccel(c));
const dbFixedKey = (c) => dbSchedKey(dbFixed(c));   // 예정(가까운 순) → 이미 상실(최근 순) → 미정
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
  .dbhead,.dbrow{ display:grid; grid-template-columns:minmax(170px,1.1fr) 190px 250px minmax(150px,1.2fr) minmax(100px,.8fr); gap:10px; align-items:center; padding:0 22px; }
  .dbhead > *, .dbrow > *{ min-width:0; }
  .dbhead{ font-size:12px; font-weight:700; color:var(--muted); padding-top:10px; padding-bottom:8px; }
  .dbrow{ padding-top:15px; padding-bottom:15px; cursor:pointer; background:#fff; border-radius:22px; box-shadow:var(--sh); margin-bottom:12px; transition:box-shadow .15s, transform .15s; }
  .dbrow:hover{ box-shadow:var(--sh-hover); transform:translateY(-1px); }
  .dbrow .tt{ font-size:16.5px; letter-spacing:-.02em; font-weight:700; line-height:1.35; word-break:break-word; }
  .dbrow .ts{ font-size:12.5px; color:var(--muted); margin-top:2px; white-space:normal; line-height:1.4; }
  .dbrow.closed{ opacity:.65; }
  .dbd{ display:inline-block; font-size:13px; font-weight:800; padding:4px 11px; border-radius:99px; background:#eef1f6; color:#4b5563; white-space:nowrap; }
  .dbcls{ display:inline-block; font-size:12px; font-weight:800; padding:2px 9px; border-radius:99px; white-space:nowrap; margin-left:4px; vertical-align:1px; }
  .dbacc{ font-weight:700; }
  .dbdt{ font-size:12.5px; line-height:1.35; } .dbdt + .dbdt{ margin-top:6px; } .dbdt .l{ display:block; font-size:11.5px; color:var(--muted); font-weight:600; } .dbdt b{ font-weight:700; font-variant-numeric:tabular-nums; margin-right:4px; } .dbdt .dbacc{ white-space:nowrap; }
  .dbyd{ font-size:12px; color:var(--muted); margin-top:6px; line-height:1.35; } .dbyd b{ color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums; }
  .dbmg{ margin-top:5px; padding-top:5px; border-top:1px dashed var(--line); font-size:12.5px; color:#5b21b6; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; } .dbmg .m{ font-weight:700; margin-right:4px; } .dbacc.soon{ color:#b45309; } .dbacc.today{ color:var(--danger); } .dbacc.done{ color:var(--danger); }
  .dbob{ margin-top:2px; white-space:nowrap; } .dbob.early{ color:#d93b2b; } .dbob.early b{ color:#d93b2b; } .dbob i{ font-style:normal; font-size:10px; font-weight:800; background:#d93b2b; color:#fff; border-radius:99px; padding:0 6px; }
  .dbd.sp{ background:#ede9fe; color:#6d28d9; }
  .dbsp{ border:1.5px solid #d9ccf7; background:#f7f3ff; border-radius:12px; padding:8px 12px; display:flex; flex-direction:column; gap:1px; } .dbsp .l{ font-size:11.5px; font-weight:800; color:#6d28d9; } .dbsp b{ font-size:15px; font-weight:800; font-variant-numeric:tabular-nums; } .dbsp .bd{ font-size:12px; font-weight:700; color:var(--muted); } .dbsp.big{ padding:12px 16px; } .dbsp.big b{ font-size:19px; }
  .dbl{ display:flex; align-items:baseline; gap:6px; margin-top:5px; font-size:12.5px; white-space:nowrap; } .dbl span{ color:var(--muted); font-size:11.5px; min-width:4.2em; } .dbl b{ font-weight:700; font-variant-numeric:tabular-nums; } .dbl em{ font-style:normal; color:var(--muted); } .dbl.early b{ color:#d93b2b; }
  .dbac{ margin-top:7px; border:1.5px solid var(--line); border-radius:12px; padding:6px 10px 7px; display:flex; flex-wrap:wrap; align-items:baseline; gap:0 8px; line-height:1.35; background:#fff; } .dbac .l{ width:100%; font-size:11px; font-weight:800; color:#6d28d9; } .dbac .l i{ font-style:normal; font-size:10px; background:#6d28d9; color:#fff; border-radius:99px; padding:0 6px; margin-left:2px; } .dbac b{ font-size:13.5px; font-weight:800; font-variant-numeric:tabular-nums; } .dbac .bd{ font-size:11.5px; font-weight:700; color:var(--muted); white-space:nowrap; }
  .dbac.fut{ background:#f5f0ff; border-color:#6d28d9; } .dbac.fut .bd{ color:#6d28d9; } .dbac.today{ background:#fff0ee; border-color:#d93b2b; } .dbac.today .bd{ color:#d93b2b; } .dbac.past{ background:#f3eefc; border-color:#d9ccf7; } .dbac.past .bd{ color:#6d28d9; } .dbac.none{ border-style:dashed; background:transparent; } .dbac.big{ padding:10px 14px 11px; border-radius:16px; } .dbac.big b{ font-size:18px; } .dbac.big .l{ font-size:12.5px; } .dbac.big .bd{ font-size:13px; }
  .dbgrp{ margin-top:16px; } .dbgrp .gt{ font-size:13px; font-weight:800; color:#44546f; margin-bottom:8px; } .dbov2{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px 14px; align-items:start; } .dbov2 .k{ font-size:12px; color:var(--muted); font-weight:600; } .dbov2 .v{ font-size:15px; font-weight:600; margin-top:2px; }
  .dbms{ display:grid; grid-template-columns:repeat(2,1fr); gap:6px; }
  .dbm{ border:1.5px solid var(--line); border-radius:12px; padding:6px 8px 7px; background:#fff; min-width:0; display:flex; flex-direction:column; gap:1px; line-height:1.3; }
  .dbm .l{ font-size:11px; font-weight:800; color:var(--mc); white-space:nowrap; } .dbm .l i{ font-style:normal; font-size:10px; background:var(--mc); color:#fff; border-radius:99px; padding:0 6px; margin-left:2px; }
  .dbm b{ font-size:13.5px; font-weight:800; font-variant-numeric:tabular-nums; letter-spacing:-.01em; } .dbm .bd{ font-size:11.5px; font-weight:700; color:var(--muted); white-space:nowrap; }
  .dbm.none{ border-style:dashed; background:transparent; } .dbm.none b{ color:var(--muted); font-weight:600; }
  .dbm.fut .bd{ color:var(--mc); } .dbm.nx{ background:var(--mb); border-color:var(--mc); } .dbm.nx .bd{ color:var(--mc); font-size:12.5px; font-weight:800; }
  .dbm.past{ background:#f6f7fb; } .dbm.past b{ color:#5a6172; } .dbm.past .bd{ color:#5a6172; }
  .dbms.big{ gap:10px; } .dbms.big .dbm{ padding:10px 12px 11px; border-radius:16px; } .dbms.big .dbm b{ font-size:18px; } .dbms.big .dbm .l{ font-size:12.5px; } .dbms.big .dbm .bd{ font-size:13px; }
  .dbcur{ display:flex; align-items:center; gap:8px 14px; flex-wrap:wrap; margin-top:14px; } .dbcur .k{ font-size:12px; color:var(--muted); font-weight:600; } .dbcur .dbcls{ font-size:15px; padding:4px 14px; margin:0; }
  .dbnm{ font-size:13.5px; color:#44546f; } .dbnm b{ color:var(--ink); } .dbnm .soon,.dbnm .today{ color:var(--warn); } .dbnm.bad{ color:#d93b2b; font-weight:800; } .dbnm.mu{ color:var(--muted); }
  .dbfs{ margin-top:14px; padding:12px 14px 14px; border:1.5px solid var(--line); border-radius:16px; background:#fafbfd; } .dbfs .t{ font-size:13.5px; font-weight:800; margin-bottom:2px; } .dbfs .hint{ font-size:12px; color:var(--muted); line-height:1.45; margin-top:8px; }
  .dbd.r1{ background:var(--warn-soft); color:var(--warn); } .dbd.r2{ background:#ffe4cc; color:#c2570c; } .dbd.r3{ background:var(--danger-soft); color:var(--danger); } .dbd.end{ background:var(--green-soft); color:var(--green); }
  .dbpr{ font-size:17px; font-weight:800; letter-spacing:-.02em; margin-top:5px; font-variant-numeric:tabular-nums; } .dbpr .muted{ font-size:13px; font-weight:500; }
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
  .dbarch{ margin-top:12px; background:#fff0ee; border:1.5px solid #f4b9b0; color:#b42318; border-radius:14px; padding:10px 14px; font-size:13.5px; } .dbarch div{ margin-top:2px; color:#44546f; }
  .dblk{ border:0; background:transparent; color:var(--muted); font-size:12.5px; font-weight:700; cursor:pointer; padding:4px 0; text-decoration:underline; } .dbhist{ margin-top:4px; padding:8px 10px; background:#f6f7fb; border-radius:10px; font-size:13px; display:grid; gap:6px; } .dbtrash{ margin-top:8px; display:grid; gap:10px; } .dbtl{ border:1px dashed var(--line); border-radius:14px; padding:2px 12px 10px; }
  .dbact .dblk{ margin-left:8px; }
  .dbactin{ margin-top:8px; padding:8px 10px; border:1.5px dashed var(--line); border-radius:12px; } .dbactin .k{ font-size:12.5px; font-weight:800; color:#44546f; margin-bottom:5px; }
  .dbact{ margin-top:6px; padding:6px 10px; background:#fff7e0; border-radius:10px; font-size:13.5px; line-height:1.5; } .dbact .al{ font-weight:800; color:#b45309; } .dbact .as{ font-size:12px; font-weight:800; color:#b45309; margin-left:4px; } .dbact.late{ background:#fff0ee; } .dbact.late .al,.dbact.late .as{ color:#d93b2b; } .dbact.done{ background:#eef6ef; } .dbact.done .al,.dbact.done .as{ color:#2f8a52; } .dbact.done{ opacity:.8; }
  .dblog .del{ border:0; background:transparent; color:var(--muted); cursor:pointer; font-size:14px; align-self:flex-start; }
  @media (max-width:1000px){
    .dbhead{ display:none; }
    .dbrow{ grid-template-columns:1fr auto; gap:6px 10px; padding:14px 16px; border-radius:20px; }
    .dbrow > :nth-child(1){ grid-column:1 / 3; }
    .dbrow > :nth-child(2), .dbrow > :nth-child(3), .dbrow > :nth-child(4), .dbrow > :nth-child(5){ grid-column:1 / 3; }
    
  }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="dbDetailOv"><div class="panel dbPanel" id="dbDetailPanel"></div></div>
    <div class="ov" id="dbFormOv" style="z-index:30"><div class="panel" style="max-width:520px" id="dbFormPanel"></div></div>`;
  document.body.appendChild(d);
  $('dbDetailOv').addEventListener('click', (e) => { if (e.target === $('dbDetailOv')) dbCloseDetail(); });
  $('dbFormOv').addEventListener('click', (e) => { if (e.target === $('dbFormOv')) dbCloseForm(); });
})();

// 2단계 확인 팝업: 사유 입력 / 확인 문구 입력을 마쳐야 실행 버튼이 켜진다
function dbAsk({ title, html, reason, confirmText, okLabel, danger }){
  return new Promise((res) => {
    const ov = document.createElement('div'); ov.className = 'ov'; ov.style.cssText = 'display:block;z-index:80';
    ov.innerHTML = `<div class="panel" style="max-width:460px"><div class="ph"><h2>${title}</h2><button class="x" data-q="no">✕</button></div><div style="font-size:14.5px;line-height:1.55">${html}</div>
      ${reason ? `<label style="margin-top:12px">${reason}</label><input id="dqR" maxlength="200" autocomplete="off" />` : ''}
      ${confirmText ? `<label style="margin-top:12px">확인을 위해 <b>${esc(confirmText)}</b> 을(를) 그대로 입력하세요</label><input id="dqC" autocomplete="off" />` : ''}
      <div class="acts" style="margin-top:18px"><button class="btn" data-q="no">취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-q="ok" disabled>${okLabel}</button></div></div>`;
    document.body.appendChild(ov);
    const ok = ov.querySelector('[data-q=ok]'), r = ov.querySelector('#dqR'), cf = ov.querySelector('#dqC');
    const chk = () => { ok.disabled = !((!r || r.value.trim().length >= 2) && (!cf || cf.value.trim() === confirmText)); };
    ov.addEventListener('input', chk);
    const done = (v) => { ov.remove(); res(v); };
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; if (b.dataset.q === 'no') return done(null); if (!ok.disabled) done({ reason: r ? r.value.trim() : '' }); });
    setTimeout(() => { const f = r || cf; if (f) f.focus(); }, 50);
  });
}
const dbLogBox = (l) => `<div style="background:var(--field);border-radius:12px;padding:10px 12px;margin:10px 0;font-size:14px"><div class="muted" style="font-size:12.5px">${esc(l.log_date)} · ${esc(l.kind)} · ${esc(nameOf(l.created_by))}</div><div style="white-space:pre-wrap;margin-top:3px">${esc(l.body)}</div></div>`;
// ---------- 불러오기 ----------
async function loadDebt(){
  if (!debtView()){ debtCases = []; dbBadge(); return; }
  const { data, error } = await sb.from('debt_cases').select('*, debt_logs(*)').order('id', { ascending: false });
  if (error){ console.warn('채권관리 불러오기 실패', error.message); return; }
  debtCases = (data || []).filter(c => !c.deleted_at); debtArchived = (data || []).filter(c => c.deleted_at);
  { const h = await sb.from('debt_log_history').select('*').order('changed_at', { ascending: false }); dbHist = {}; if (!h.error) (h.data || []).forEach(x => (dbHist[x.log_id] = dbHist[x.log_id] || []).push(x)); }
  dbBadge();
  if (typeof loadSurvey === 'function') await loadSurvey();
  if (typeof loadFund === 'function') await loadFund();
  if (divn === 'debt') renderDebt();
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
document.getElementById('dbTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === dbTab) return;
  dbTab = b.dataset.t; try { localStorage.setItem('dbTab', dbTab); } catch (x) {}
  if (typeof render === 'function') render(); else renderDebt();
});
let dbTab = (() => { try { const t = localStorage.getItem('dbTab'); return t === 'survey' || t === 'fund' ? t : 'debt'; } catch (e) { return 'debt'; } })();
function renderDebt(){
  $('dbTabFund').style.display = debtCan() ? '' : 'none';   // 자금운영관리는 사후관리 권한자·관리자만
  if (dbTab === 'fund' && !debtCan()) dbTab = 'debt';
  document.querySelectorAll('#dbTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === dbTab));
  $('debtMain').style.display = dbTab === 'debt' ? '' : 'none'; $('survey').style.display = dbTab === 'survey' ? 'flex' : 'none'; $('fund').style.display = dbTab === 'fund' ? 'flex' : 'none';
  if (dbTab === 'fund') return typeof renderFund === 'function' ? renderFund() : undefined;
  if (dbTab === 'survey') return typeof renderSurvey === 'function' ? renderSurvey() : undefined;
  renderDebtMain();
}
// 사후관리 요약 위젯: 진행 현황 카드 + 건전성 분포 + 다음 조치 임박
function dbSummaryHtml(){
  const act = debtCases.filter(c => c.status !== '종결'), sum = act.reduce((s, c) => s + Number(c.principal || 0), 0);
  const late = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) < 0).length, tod = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) === 0).length;
  const soon = (fn) => act.filter(c => { const a = fn(c); return a && a.d >= 0 && a.d <= 30; }).length;
  const cards = [smCard('t2', '', '진행 중', '연체채권', act.length, sum ? `원금 합계 ${dbWon(sum)}` : ''), smCard(late ? 't4' : 't1', '', '조치 지연', '다음 조치일 경과', late, ''), smCard('t3', '', '오늘 조치', '오늘 해야 할 조치', tod, ''), smCard('t5', '', '기한이익상실 임박', '30일 이내 상실 예정', soon(dbAccel), `고정이하 분류 임박 ${soon(dbFixed)}건`)].join('');
  const CL = { '정상': '#6fbf88', '요주의': '#f2b44d', '고정': '#e8950f', '회수의문': '#e8856f', '추정손실': '#b3412c' };
  const regular = act.filter(c => !dbSpecial(c)), rows = DB_CLASSES.concat(['미분류']).map(k => { const a = regular.filter(c => (c.asset_class || '미분류') === k); return { k, n: a.length, p: a.reduce((s, c) => s + Number(c.principal || 0), 0) }; }).filter(x => x.n);
  const spc = act.filter(dbSpecial).length, mx = Math.max(1, ...rows.map(x => x.n));
  const cls = smWidget('건전성 분포', `일반채권 ${regular.length}건${spc ? ` · 특수 ${spc}건` : ''}`, smBars(rows.map(x => ({ l: x.k, r: `${x.n}건${x.p ? ' · ' + dbWon(x.p) : ''}`, p: x.n / mx * 100, c: CL[x.k] || '#c9c2b4' })), '진행중인 채권이 없어요.'));
  const nxt = act.filter(c => c.next_action_date).sort((a, b) => a.next_action_date.localeCompare(b.next_action_date)).slice(0, 5);
  const nx = smWidget('다음 조치 임박', '예정일 빠른 순', smList(nxt.map(c => { const d = dbDiff(c.next_action_date); return { c: d < 0 ? '#e5674f' : d === 0 ? '#f2b44d' : '#6a9fd0', t: `${c.debtor_name}`, m: d < 0 ? `${-d}일 지연` : d === 0 ? '오늘' : `D-${d}` }; }), '예정된 조치가 없어요.'));
  return `<div class="smx"><div class="smx-cards">${cards}</div><div class="smx-grid">${cls}${nx}</div></div>`;
}
function renderDebtMain(){
  const el = $('debtMain');
  if (!el.dataset.ready){
    el.dataset.ready = '1';
    el.innerHTML = `<div class="dbsecT">📞 연체채권관리</div><div id="dbBand"></div><div class="list-panel">
      <div class="toolbar">
        <div class="seg" id="dbViewSeg"><button data-v="active">진행중 <span id="dbNA"></span></button><button data-v="closed">종결 <span id="dbNB"></span></button><button data-v="trash">🗑 보관함 <span id="dbNT"></span></button></div>
        <select id="dbScope"><option value="all">본점·지점</option><option value="본점">본점</option><option value="지점">지점</option></select>
        <select id="dbType"><option value="all">일반·특수채권</option><option value="일반">일반채권</option><option value="특수">특수채권</option></select>
        <select id="dbClass"><option value="all">건전성 전체</option>${DB_CLASSES.map(k => `<option>${k}</option>`).join('')}<option value="none">미분류</option></select>
        <select id="dbSort"><option value="next">다음 조치 임박순</option><option value="days">연체일수 많은순</option><option value="cls">건전성 변경 임박순</option><option value="accel">기한이익상실 임박순</option><option value="new">최근 등록순</option></select>
        <label class="chk"><input type="checkbox" id="dbMine" /> 내 담당만</label>
        <input id="dbQ" class="search" type="search" placeholder="🔍 채무자 검색" />
        <button class="btn small" id="dbRpBtn" type="button" title="연체채권사후관리기록부 출력">🖨 사후관리기록부</button>
      </div>
      <div class="dbsum" id="dbSum"></div>
      <div class="dbhead"><span>채무자 · 연체원금</span><span>연체 · 기한이익상실</span><span>건전성 분류 <small style="font-weight:500">요주의 → 고정이하</small></span><span>최근 연락·방문 · 관리</span><span>다음 조치</span></div>
      <div id="dbList"></div></div>`;
    $('dbViewSeg').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; dbView = b.dataset.v; renderDebt(); };
    $('dbScope').onchange = () => { dbScope = $('dbScope').value; renderDebt(); };
    $('dbClass').onchange = () => { dbClassF = $('dbClass').value; renderDebt(); };
    $('dbType').onchange = () => { dbType = $('dbType').value; renderDebt(); };
    $('dbSort').onchange = () => { dbSort = $('dbSort').value; renderDebt(); };
    $('dbMine').onchange = () => { dbMine = $('dbMine').checked; renderDebt(); };
    $('dbQ').oninput = () => { dbQ = $('dbQ').value.trim().toLowerCase(); renderDebt(); };
    $('dbRpBtn').onclick = () => dbrOpenDialog();
    $('dbList').addEventListener('click', (e) => { const r = e.target.closest('[data-db]'); if (r) dbOpenDetail(+r.dataset.db); });
  }
  { const bd = $('dbBand'); if (bd) bd.innerHTML = dbSummaryHtml(); }
  const nEnd = debtCases.filter(c => c.status === '종결').length;
  $('dbNA').textContent = debtCases.length - nEnd; $('dbNB').textContent = nEnd; $('dbNT').textContent = debtArchived.length || '';
  document.querySelectorAll('#dbViewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === dbView));
  const shown = (dbView === 'trash' ? debtArchived : debtCases).filter(c => (dbView === 'trash' || (dbView === 'closed' ? c.status === '종결' : c.status !== '종결')) && (dbScope === 'all' || c.scope === dbScope) && (dbType === 'all' || (dbType === '특수') === dbSpecial(c)) && (dbClassF === 'all' || (!dbSpecial(c) && (dbClassF === 'none' ? !c.asset_class : c.asset_class === dbClassF)))
    && (!dbMine || c.assignee_email === me) && (!dbQ || (c.debtor_name || '').toLowerCase().includes(dbQ)));
  const nx = (c) => c.next_action_date || '9999-12-31';
  shown.sort(dbSort === 'days' ? (a, b) => dbDays(b) - dbDays(a) : dbSort === 'accel' ? (a, b) => dbAccelKey(a) - dbAccelKey(b) || dbDays(b) - dbDays(a) : dbSort === 'cls' ? (a, b) => dbClsKey(a) - dbClsKey(b) || dbDays(b) - dbDays(a) : dbSort === 'new' ? (a, b) => b.id - a.id : (a, b) => nx(a).localeCompare(nx(b)) || dbDays(b) - dbDays(a));
  const act = shown.filter(c => c.status !== '종결');
  const late = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) < 0).length, tod = act.filter(c => c.next_action_date && dbDiff(c.next_action_date) === 0).length;
  const sum = act.reduce((s, c) => s + Number(c.principal || 0), 0), accSoon = act.filter(c => { const a = dbAccel(c); return a && a.d >= 0 && a.d <= 30; }).length, fixSoon = act.filter(c => { const a = dbFixed(c); return a && a.d >= 0 && a.d <= 30; }).length, cauSoon = act.filter(c => { const a = dbCaution(c); return a && a.d >= 0 && a.d <= 30; }).length, lowN = act.filter(c => !dbSpecial(c) && ['고정', '회수의문', '추정손실'].includes(c.asset_class)).length;
  $('dbSum').innerHTML = `<span><b>${shown.length}건</b></span>${act.length && sum ? `<span>연체 원금 합계 <b>${dbWon(sum)}</b></span>` : ''}${late ? `<span class="r">조치 지연 ${late}건</span>` : ''}${tod ? `<span class="o">오늘 조치 ${tod}건</span>` : ''}${accSoon ? `<span class="o">기한이익상실 예정 ${accSoon}건 (30일 내)</span>` : ''}${cauSoon ? `<span class="o">요주의 분류 예정 ${cauSoon}건 (30일 내)</span>` : ''}${fixSoon ? `<span class="o">고정이하 분류 예정 ${fixSoon}건 (30일 내)</span>` : ''}${lowN ? `<span>고정이하 ${lowN}건</span>` : ''}`;
  $('dbList').innerHTML = shown.map(dbRowHtml).join('') || `<div class="blk-empty">${dbView === 'trash' ? '보관함이 비어 있어요.' : dbView === 'closed' ? '종결된 채권이 없어요.' : debtCases.length ? '조건에 맞는 채권이 없어요.' : '등록된 채권이 없어요. 오른쪽 위 “＋ 채권 등록”으로 시작해요.'}</div>`;
}
function dbRowHtml(c){
  const lg = dbLogs(c)[0], nx = dbNext(c);
  return `<div class="dbrow ${c.status === '종결' ? 'closed' : ''}" data-db="${c.id}">
    <div><div class="tt"><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)}${dbClassChip(c)}</div><div class="dbpr">${c.principal === null ? '<span class="muted">원금 -</span>' : dbWon(c.principal)}</div><div class="ts">담당 ${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')}</div></div>
    <div>${dbOverdueHtml(c)}</div>
    <div>${dbMileHtml(c)}</div>
    <div><div class="dblast">${lg ? ` <span class="m">${DEBT_ICON[lg.kind] || ''}${lg.direction === '수신' ? '↙' : ''} ${esc(dbMd(lg.log_date))}${lg.direction === '수신' ? ' 수신' : lg.kind === '전화' ? ' 발신' : ''}</span>${esc(lg.body)}` : '<span class="muted">연락·방문 이력 없음</span>'}</div>${c.manage_date || c.manage_note ? `<div class="dbmg"><span class="m">🗂 ${esc(dbMd(c.manage_date))}</span>${esc(c.manage_note || '')}</div>` : ''}</div>
    ${c.deleted_at ? `<div class="dbnx none">🗑 보관 ${esc(String(c.deleted_at).slice(0, 10))}<small>${esc(c.delete_reason || '')}</small></div></div>` : `<div class="dbnx ${c.status === '종결' ? 'none' : nx.cls}">${c.status === '종결' ? '-' : `${nx.txt}${c.next_action_date ? `<small>${esc(dbMd(c.next_action_date))}${c.next_action_note ? ' · ' + esc(c.next_action_note) : ''}</small>` : ''}`}</div>`}</div>`;
}

// ---------- 상세 ----------
// 이력에 붙은 조치 예정 (댓글처럼 이력 아래에 누적). 완료 처리하면 현재 조치 예정에서 빠진다
function dbActHtml(l, can){
  const done = !!l.action_done_at, n = l.action_date ? dbDiff(l.action_date) : null;
  const st = done ? `✓ 완료 ${String(l.action_done_at).slice(0, 10)}` : n === null ? '' : n > 0 ? `D-${n}` : n === 0 ? '오늘' : `${-n}일 지연`;
  return `<div class="dbact ${done ? 'done' : n !== null && n < 0 ? 'late' : ''}"><span class="al">📌 조치 예정</span> ${l.action_date ? `<b>${esc(l.action_date)}</b>` : ''} ${l.action_note ? esc(l.action_note) : ''} ${st ? `<span class="as">${esc(st)}</span>` : ''}${can ? (done ? `<button class="dblk" data-aundo="${l.id}">되돌리기</button>` : `<button class="dblk" data-adone="${l.id}">✓ 조치 완료</button>`) : ''}</div>`;
}
// 이력의 조치 예정 → 채권의 '현재 조치 예정'(목록·정렬·지연 집계에 쓰임)으로 동기화: 완료되지 않은 가장 최근 이력의 조치
async function dbAfterLogChange(caseId){
  const r = await sb.from('debt_logs').select('*').eq('case_id', caseId).is('deleted_at', null);
  if (!r.error){
    const logs = r.data || [], hadAny = logs.some(dbHasAct), pend = logs.filter(l => dbHasAct(l) && !l.action_done_at).sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)) || b.id - a.id)[0];
    if (pend) await sb.from('debt_cases').update({ next_action_date: pend.action_date || null, next_action_note: pend.action_note || null }).eq('id', caseId);
    else if (hadAny) await sb.from('debt_cases').update({ next_action_date: null, next_action_note: null }).eq('id', caseId);
  }
  await loadDebt();
}
function dbOpenDetail(id){ debtOpenId = id; dbLogEdit = null; renderDbDetail(); $('dbDetailOv').style.display = 'block'; document.body.style.overflow = 'hidden'; }
function dbCloseDetail(){ debtOpenId = null; dbLogEdit = null; $('dbDetailOv').style.display = 'none'; document.body.style.overflow = $('dbFormOv').style.display === 'block' ? 'hidden' : ''; }
function renderDbDetail(){
  const c = dbFind(debtOpenId);
  if (!c){ if (debtOpenId) dbCloseDetail(); return; }
  const logs = dbLogs(c), closed = c.status === '종결', arch = !!c.deleted_at, ro = !debtCan() || arch, adm = isAdmin();
  const editing = dbLogEdit ? logs.find(l => l.id === dbLogEdit) : null; if (dbLogEdit && !editing) dbLogEdit = null;
  const fresh = !!editing && dbLogEditShown !== dbLogEdit; dbLogEditShown = dbLogEdit;
  const cur = document.querySelector('input[name=dbLogKindR]:checked');
  // 작성 중인 이력은 다시 그려도 유지 (수정을 막 시작한 때만 기존 값으로 채움)
  const curDir = document.querySelector('input[name=dbLogDirR]:checked');
  const keep = fresh ? { d: editing.body, date: editing.log_date, kind: editing.kind, dir: editing.direction || '발신', an: editing.action_note || '', ad: editing.action_date || '' } : { d: ($('dbLogBody') || {}).value || '', date: ($('dbLogDate') || {}).value || kstToday(), kind: cur ? cur.value : '전화', dir: curDir ? curDir.value : '발신', an: ($('dbLogAN') || {}).value || '', ad: ($('dbLogAD') || {}).value || '' };
  $('dbDetailPanel').innerHTML = `<div class="ph"><h2><span class="chip sc-${esc(c.scope)}">${esc(c.scope)}</span> ${esc(c.debtor_name)} ${dbDaysTag(c)}</h2><button class="x" data-d="close">✕</button></div>
    ${arch ? `<div class="dbarch">🗑 <b>보관된 채권</b>이에요 — ${esc(String(c.deleted_at).slice(0, 10))} · ${esc(nameOf(c.deleted_by))}<div>사유: ${esc(c.delete_reason || '-')}</div></div>` : ''}
    ${dbSpecial(c) ? `<div class="dbcur"><span class="k">채권구분</span>${dbClassChip(c)}</div><div style="margin-top:10px">${dbMileHtml(c, true)}</div>` : `
    <div class="dbgrp"><div class="gt">⏱ 연체 · 기한이익상실</div><div class="dbov2">
      <div><div class="k">내부연체기준일</div><div class="v">${c.overdue_since ? esc(c.overdue_since) : '<span class="muted">미입력</span>'}</div></div>
      <div><div class="k">타행연체일자</div><div class="v">${c.other_bank_since ? `${esc(c.other_bank_since)}${dbOtherEarly(c) ? '<div class="dbacc done" style="font-size:13px">내부연체기준일보다 빠름 — 건전성 기준일</div>' : ''}` : '<span class="muted">없음</span>'}</div></div>
      <div><div class="k">연체일수</div><div class="v">${closed || !dbHasSince(c) ? '-' : dbDays(c) < 0 ? `연체 전 (D${dbDays(c)})` : `${dbDays(c).toLocaleString('ko-KR')}일`}</div></div>
      <div>${dbAccelHtml(c, true)}</div></div></div>
    <div class="dbgrp"><div class="gt">🏷 건전성 분류</div><div class="dbcur" style="margin-top:0"><span class="k">현재</span>${dbClassChip(c)}${dbNextMsg(c)}</div><div style="margin-top:10px">${dbMileHtml(c, true)}</div></div>`}
    <div class="dbinfo">
      <div><div class="k">연체 원금</div><div class="v">${c.principal === null ? '-' : dbWon(c.principal)}</div></div>
      <div><div class="k">담당자</div><div class="v">${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')}</div></div>
      <div><div class="k">등록</div><div class="v">${esc(nameOf(c.created_by))} · ${esc(String(c.created_at).slice(0, 10))}</div></div>
      ${closed && c.closed_at ? `<div><div class="k">종결일</div><div class="v">${esc(String(c.closed_at).slice(0, 10))}</div></div>` : ''}
    </div>
    ${c.manage_date || c.manage_note ? `<div class="dbsec"><div class="k">🗂 관리일자 · 관리내역</div><div style="font-size:14.5px;line-height:1.5"><b>${c.manage_date ? esc(c.manage_date) : '-'}</b>${c.manage_note ? `<div style="white-space:pre-wrap;margin-top:3px">${esc(c.manage_note)}</div>` : ''}</div></div>` : ''}
    ${c.memo ? `<div class="dbsec"><div class="k">메모</div><div style="white-space:pre-wrap;font-size:14.5px;line-height:1.5">${esc(c.memo)}</div></div>` : ''}
    ${c.next_action_date || c.next_action_note ? `<div class="dbsec"><div class="k">📌 현재 조치 예정 <span class="muted" style="font-weight:500">(이력에 적은 조치 예정 중 가장 최근 것)</span></div><div style="font-size:14.5px">${c.next_action_date ? `<b>${esc(c.next_action_date)}</b> <span class="dbnx ${dbNext(c).cls}" style="display:inline">${esc(dbNext(c).txt)}</span>` : ''} ${esc(c.next_action_note || '')}${!ro && !closed && !(c.debt_logs || []).some(l => !l.deleted_at && dbHasAct(l)) ? ' <button class="btn small" data-d="clearnext">비우기</button>' : ''}</div></div>` : ''}
    <div class="dbsec"><div class="k">연락·방문 이력 <span class="muted">(${logs.length}건)</span></div>
      ${ro ? '' : `      <div class="checks" id="dbLogKind">${DEBT_KINDS.map((k, i) => `<label><input type="radio" name="dbLogKindR" value="${k}" ${keep.kind === k ? 'checked' : ''}/> ${DEBT_ICON[k]} ${k}</label>`).join('')}</div>
      <div class="checks" id="dbLogDir" style="margin-top:6px">${DEBT_DIR[keep.kind].map((t, i) => `<label><input type="radio" name="dbLogDirR" value="${i ? '수신' : '발신'}" ${(keep.dir === '수신') === !!i ? 'checked' : ''}/> ${t}</label>`).join('')}</div>
      <div class="dbline" style="margin-top:8px"><input type="date" id="dbLogDate" value="${esc(keep.date)}" /></div>
      <textarea id="dbLogBody" rows="3" maxlength="1000" placeholder="통화·방문 내용, 채무자 반응, 약속한 사항 등" style="margin-top:8px">${esc(keep.d)}</textarea>
      ${editing ? `<div class="muted" style="font-size:13px;margin-top:8px">✏️ ${esc(editing.log_date)} 이력을 수정하는 중이에요</div>` : ''}
      <div class="dbactin"><div class="k">📌 조치 예정 <span class="muted" style="font-weight:500">(선택 · 이 연락에 따른 후속 조치. 없으면 비워두세요)</span></div>
        <div class="dbline"><input type="date" id="dbLogAD" value="${esc(keep.ad)}" /><input class="grow" id="dbLogAN" maxlength="200" placeholder="예: 내용증명 발송 / 담보물 재감정 / 자택 방문" value="${esc(keep.an)}" /></div></div>
      <div class="dbline" style="margin-top:8px"><span style="flex:1"></span>${editing ? '<button class="btn" data-d="canceledit">취소</button>' : ''}<button class="btn primary" data-d="addlog">${editing ? '수정 저장' : '이력 추가'}</button></div>
`}
      <div style="margin-top:10px">${logs.map(l => `<div class="dblog"><div class="ic">${DEBT_ICON[l.kind] || '📝'}</div><div class="bd"><div class="hd">${esc(l.log_date)} · ${esc(dbKindTxt(l))}${l.direction === '수신' ? '' : ''} · ${esc(nameOf(l.created_by))}</div><div class="tx">${esc(l.body)}</div>${dbHasAct(l) ? dbActHtml(l, !ro) : ''}${(dbHist[l.id] || []).length ? `<button class="dblk" data-lhist="${l.id}">✏️ 수정됨 ${(dbHist[l.id] || []).length}회 · 이전 내용 ${dbHistOpen.has(l.id) ? '접기' : '보기'}</button>${dbHistOpen.has(l.id) ? `<div class="dbhist">${(dbHist[l.id] || []).map(h => `<div><span class="muted">${esc(String(h.changed_at).slice(0, 16).replace('T', ' '))} · ${esc(nameOf(h.changed_by))} 수정 전</span><div>${esc(h.old_log_date)} · ${esc(h.old_kind)} · ${esc(h.old_body)}</div></div>`).join('')}</div>` : ''}` : ''}</div>${!ro && (l.created_by === me || adm) ? `<button class="del" data-ledit="${l.id}" title="이 이력 수정">✏️</button><button class="del" data-ldel="${l.id}" title="이 이력 삭제(보관)">🗑</button>` : ''}</div>`).join('') || '<div class="muted" style="padding:6px 2px">아직 이력이 없어요.</div>'}</div>
      ${dbDelLogs(c).length ? `<div style="margin-top:12px"><button class="dblk" data-d="trashlogs">🗑 삭제(보관)된 이력 ${dbDelLogs(c).length}건 ${dbTrashLogs ? '접기' : '보기'}</button>${dbTrashLogs ? `<div class="dbtrash">${dbDelLogs(c).map(l => `<div class="dbtl">${dbLogBox(l)}<div class="muted" style="font-size:12.5px">🗑 ${esc(String(l.deleted_at).slice(0, 16).replace('T', ' '))} · ${esc(nameOf(l.deleted_by))} · 사유: ${esc(l.delete_reason || '-')}</div><div class="dbline" style="margin-top:6px">${!arch && debtCan() && (l.created_by === me || adm) ? `<button class="btn small" data-lrestore="${l.id}">↩ 복원</button>` : ''}${adm ? `<button class="btn danger small" data-lpurge="${l.id}">영구 삭제</button>` : ''}</div></div>`).join('')}</div>` : ''}</div>` : ''}</div>
    <div class="acts" style="margin-top:20px;justify-content:space-between"><div style="display:flex;gap:8px;flex-wrap:wrap">${ro ? '' : '<button class="btn" data-d="edit">수정</button>'}${arch ? '' : '<button class="btn" data-d="print">🖨 기록 출력</button>'}${ro ? '' : `<button class="btn" data-d="${closed ? 'reopen' : 'close2'}">${closed ? '↩ 진행중으로 되돌리기' : '✅ 종결 처리'}</button>`}</div>${arch ? (adm ? '<div style="display:flex;gap:8px"><button class="btn" data-d="restore">↩ 복원</button><button class="btn danger" data-d="purge">영구 삭제</button></div>' : '') : !ro && adm ? '<button class="btn danger" data-d="del">🗑 삭제</button>' : ''}</div>`;
}
$('dbDetailPanel').addEventListener('change', (ev) => { if (ev.target.name === 'dbLogKindR') renderDbDetail(); });
$('dbDetailPanel').addEventListener('click', async (ev) => {
  const c = dbFind(debtOpenId); if (!c) return;
  const le = ev.target.closest('[data-ledit]');
  if (le){ dbLogEdit = +le.dataset.ledit; renderDbDetail(); const t = $('dbLogBody'); if (t){ t.scrollIntoView({ block: 'center' }); t.focus(); } return; }
  const ld = ev.target.closest('[data-ldel]');
  if (ld){
    const l = (c.debt_logs || []).find(x => x.id === +ld.dataset.ldel); if (!l) return;
    const r = await dbAsk({ title: '🗑 이력 삭제', html: `이 이력을 삭제할까요?${dbLogBox(l)}<span class="muted">완전히 지워지지 않고 <b>보관</b>돼요. 필요하면 “삭제된 이력”에서 복원할 수 있어요.</span>`, reason: '삭제 사유 (필수)', okLabel: '삭제(보관)', danger: true });
    if (!r) return;
    const { error } = await sb.from('debt_logs').update({ deleted_at: new Date().toISOString(), delete_reason: r.reason }).eq('id', l.id);
    if (error) return alert(error.message);
    toast('🗑 이력을 보관했어요'); return dbAfterLogChange(c.id);
  }
  const lh = ev.target.closest('[data-lhist]');
  if (lh){ const id = +lh.dataset.lhist; dbHistOpen.has(id) ? dbHistOpen.delete(id) : dbHistOpen.add(id); return renderDbDetail(); }
  const ad = ev.target.closest('[data-adone],[data-aundo]');
  if (ad){ const id = +(ad.dataset.adone || ad.dataset.aundo), done = !!ad.dataset.adone; const { error } = await sb.rpc('debt_log_action_done', { p_id: id, p_done: done }); if (error) return alert(error.message); toast(done ? '✓ 조치를 완료 처리했어요' : '조치를 다시 예정으로 되돌렸어요'); return dbAfterLogChange(c.id); }
  const lr = ev.target.closest('[data-lrestore]');
  if (lr){ const { error } = await sb.from('debt_logs').update({ deleted_at: null }).eq('id', +lr.dataset.lrestore); if (error) return alert(error.message); toast('↩ 이력을 복원했어요'); return dbAfterLogChange(c.id); }
  const lp = ev.target.closest('[data-lpurge]');
  if (lp){
    const l = (c.debt_logs || []).find(x => x.id === +lp.dataset.lpurge); if (!l) return;
    const r = await dbAsk({ title: '⚠ 이력 영구 삭제', html: `<b style="color:var(--danger)">되돌릴 수 없어요.</b> 이 이력과 수정 이력이 완전히 지워지고, 누가 지웠는지만 감사 기록에 남아요.${dbLogBox(l)}`, confirmText: '영구삭제', okLabel: '영구 삭제', danger: true });
    if (!r) return;
    const { error } = await sb.rpc('debt_purge_log', { p_id: l.id });
    if (error) return alert(error.message);
    toast('영구 삭제했어요'); return loadDebt();
  }
  const b = ev.target.closest('[data-d]'); if (!b) return;
  const act = b.dataset.d;
  if (act === 'close') return dbCloseDetail();
  if (act === 'trashlogs'){ dbTrashLogs = !dbTrashLogs; return renderDbDetail(); }
  if (act === 'edit') return dbOpenForm(c.id);
  if (act === 'print') return dbrPrint({ status: 'all', scope: 'all', summary: false, detail: true, from: '', to: '', ids: [c.id] });
  const upd = async (patch, msg) => { const { error } = await sb.from('debt_cases').update(patch).eq('id', c.id); if (error) return alert(error.message); if (msg) toast(msg); await loadDebt(); };
  if (act === 'savenext') return upd({ next_action_date: $('dbNxD').value || null, next_action_note: $('dbNxN').value.trim() || null }, '📅 다음 조치를 저장했어요');
  if (act === 'clearnext') return upd({ next_action_date: null, next_action_note: null }, '다음 조치를 비웠어요');
  if (act === 'close2'){ if (!confirm('종결 처리할까요? (종결 탭으로 이동해요)')) return; return upd({ status: '종결', closed_at: new Date().toISOString(), next_action_date: null, next_action_note: null }, '✅ 종결 처리했어요'); }
  if (act === 'reopen') return upd({ status: '진행중', closed_at: null }, '진행중으로 되돌렸어요');
  if (act === 'del'){
    const n = dbLogs(c).length;
    const r = await dbAsk({ title: '🗑 채권 삭제', html: `<b>${esc(c.debtor_name)}</b> 채권을 삭제할까요?<br><span class="muted">이력 ${n}건을 포함해 <b>보관함</b>으로 옮겨지고, 목록·보고서에서는 보이지 않아요. 보관함에서 복원할 수 있어요.</span>`, reason: '삭제 사유 (필수)', confirmText: c.debtor_name, okLabel: '삭제(보관)', danger: true });
    if (!r) return;
    const { error } = await sb.from('debt_cases').update({ deleted_at: new Date().toISOString(), delete_reason: r.reason }).eq('id', c.id);
    if (error) return alert(error.message);
    dbCloseDetail(); toast('🗑 보관함으로 옮겼어요'); return loadDebt();
  }
  if (act === 'restore'){ const { error } = await sb.from('debt_cases').update({ deleted_at: null }).eq('id', c.id); if (error) return alert(error.message); dbCloseDetail(); toast('↩ 복원했어요'); return loadDebt(); }
  if (act === 'purge'){
    const r = await dbAsk({ title: '⚠ 채권 영구 삭제', html: `<b style="color:var(--danger)">되돌릴 수 없어요.</b><br><b>${esc(c.debtor_name)}</b> 채권과 이력 ${(c.debt_logs || []).length}건(보관된 이력 포함)이 완전히 지워지고, 누가 지웠는지만 감사 기록에 남아요.`, confirmText: c.debtor_name, okLabel: '영구 삭제', danger: true });
    if (!r) return;
    const { error } = await sb.rpc('debt_purge_case', { p_id: c.id });
    if (error) return alert(error.message);
    dbCloseDetail(); toast('영구 삭제했어요'); return loadDebt();
  }
  if (act === 'canceledit'){ dbLogEdit = null; $('dbLogBody').value = ''; $('dbLogAN').value = ''; $('dbLogAD').value = ''; return renderDbDetail(); }
  if (act === 'addlog'){
    const body = $('dbLogBody').value.trim(), date = $('dbLogDate').value;
    if (!date) return alert('날짜를 선택해주세요.');
    if (!body) return alert('내용을 입력해주세요.');
    const kind = (document.querySelector('input[name=dbLogKindR]:checked') || {}).value || '전화', direction = (document.querySelector('input[name=dbLogDirR]:checked') || {}).value === '수신' ? '수신' : '발신';
    const actN = ($('dbLogAN').value || '').trim() || null, actD = $('dbLogAD').value || null, act = { action_note: actN, action_date: actD };
    b.disabled = true;
    if (dbLogEdit){
      const old = (c.debt_logs || []).find(x => x.id === dbLogEdit), changed = !old || old.action_note !== actN || old.action_date !== actD;
      const r0 = await sb.from('debt_logs').update({ log_date: date, kind, body, direction, ...act, ...(changed ? { action_done_at: null } : {}) }).eq('id', dbLogEdit);
      b.disabled = false; if (r0.error) return alert(r0.error.message);
      dbLogEdit = null; $('dbLogBody').value = ''; $('dbLogAN').value = ''; $('dbLogAD').value = ''; toast('✏️ 이력을 수정했어요'); return dbAfterLogChange(c.id);
    }
    const r1 = await sb.from('debt_logs').insert({ case_id: c.id, log_date: date, kind, body, direction, ...act });
    if (r1.error){ b.disabled = false; return alert(r1.error.message); }
    b.disabled = false; $('dbLogBody').value = ''; $('dbLogAN').value = ''; $('dbLogAD').value = ''; { const d0 = document.querySelector('input[name=dbLogDirR][value=발신]'); if (d0) d0.checked = true; }
    toast('📝 이력을 추가했어요'); await dbAfterLogChange(c.id);
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
    <label>채권구분</label><div class="checks"><label><input type="radio" name="dfTypeR" value="일반" ${!c || !dbSpecial(c) ? 'checked' : ''}/> 일반채권</label><label><input type="radio" name="dfTypeR" value="특수" ${c && dbSpecial(c) ? 'checked' : ''}/> 특수채권</label></div>
    <div id="dfSpBox" class="dbfs" style="display:none"><div class="t">🏷 특수채권</div><label>특수채권편입일자 <span style="color:var(--danger)">*</span></label><input id="dfSpD" type="date" /><div class="hint">특수채권은 연체일자·건전성·기한이익상실 관리가 필요 없어요. 편입일자만 입력하면 끝이에요.</div></div>
    <div class="row"><div><label>연체 원금 (원)</label><input id="dfAmt" inputmode="numeric" placeholder="예: 35,000,000" /></div><div></div></div>
    <div id="dfGenBox">
    <div class="dbfs"><div class="t">⏱ 연체 · 기한이익상실 <span class="muted" style="font-weight:400">(기한이익상실일은 미래 날짜 = 예정일)</span></div>
      <div class="row"><div><label>내부연체기준일 <span class="muted" style="font-weight:400">(비워도 돼요)</span></label><input id="dfSince" type="date" /></div><div><label>타행연체일자 <span class="muted" style="font-weight:400">(빠르면 건전성에 영향)</span></label><input id="dfOb" type="date" /></div></div>
      <div class="row"><div><label>기한이익상실일</label><input id="dfAccel" type="date" /></div><div></div></div></div>
    <div class="dbfs"><div class="t">🏷 건전성 분류 <span class="muted" style="font-weight:400">(분류일은 미래 날짜 = 예정일)</span></div>
      <div class="row"><div><label>현재 자산건전성</label><select id="dfCls"><option value="">(미분류)</option>${DB_CLASSES.map(k => `<option>${k}</option>`).join('')}</select></div><div></div></div>
      <div class="row"><div><label>요주의 분류일 <span class="muted" style="font-weight:400">(예정)</span></label><input id="dfCau" type="date" /></div><div><label>고정이하 분류일 <span class="muted" style="font-weight:400">(예정)</span></label><input id="dfFix" type="date" /></div></div>
      <button type="button" class="btn small" id="dfAuto" style="margin-top:10px">⚡ 연체기준일로 자동 계산</button>
      <div class="hint">내부연체기준일과 타행연체일자 중 빠른 날짜를 기준으로 요주의 +1개월, 고정이하 +3개월을 채워요. 참고용이니 조합 기준에 맞게 고쳐서 쓰세요.</div></div>
    </div>
    <div class="row"><div><label>담당자</label><select id="dfAsg"><option value="">(지정 안 함)</option>${staff.map(m => `<option value="${esc(m.email)}" ${m.email === asg ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}</select></div><div></div></div>
    <label>관리내역</label><textarea id="dfMgN" rows="2" maxlength="500" placeholder="예: 담보물 재감정 의뢰, 채무자 면담 결과 등"></textarea>
    <label>메모</label><textarea id="dfMemo" rows="3" maxlength="1000"></textarea>
    <div class="acts" style="margin-top:20px"><button class="btn primary" data-f="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-f="close" style="min-height:44px">취소</button></div>`;
  $('dfName').value = c ? c.debtor_name : ''; $('dfSince').value = c ? (c.overdue_since || '') : kstToday(); $('dfAccel').value = c && c.acceleration_date ? c.acceleration_date : ''; $('dfCls').value = c ? (c.asset_class || '') : '정상'; $('dfFix').value = c && c.fixed_below_date ? c.fixed_below_date : ''; $('dfOb').value = c && c.other_bank_since ? c.other_bank_since : ''; $('dfCau').value = c && c.caution_date ? c.caution_date : ''; $('dfMgN').value = c && c.manage_note ? c.manage_note : '';
  $('dfAmt').value = c && c.principal !== null ? Number(c.principal).toLocaleString('ko-KR') : '';
  $('dfSpD').value = c && c.special_date ? c.special_date : '';
  const dfTog = () => { const sp = (document.querySelector('input[name=dfTypeR]:checked') || {}).value === '특수'; $('dfSpBox').style.display = sp ? '' : 'none'; $('dfGenBox').style.display = sp ? 'none' : ''; };
  document.querySelectorAll('input[name=dfTypeR]').forEach(r => r.onchange = dfTog); dfTog();
  $('dfAuto').onclick = () => {
    const sn = [$('dfSince').value, $('dfOb').value].filter(Boolean).sort()[0]; if (!sn) return alert('내부연체기준일이나 타행연체일자를 먼저 입력해주세요.');
    const add = (n) => { const d = new Date(sn + 'T12:00:00Z'); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
    if (($('dfCau').value || $('dfFix').value) && !confirm('이미 입력된 요주의·고정이하 분류일을 덮어쓸까요?')) return;
    $('dfCau').value = add(1); $('dfFix').value = add(3); toast('요주의 ' + $('dfCau').value + ' · 고정이하 ' + $('dfFix').value);
  };
  $('dfAmt').oninput = () => { $('dfAmt').value = dbComma($('dfAmt').value); };
  $('dfMemo').value = c && c.memo ? c.memo : '';
  $('dbFormOv').style.display = 'block'; document.body.style.overflow = 'hidden';
  setTimeout(() => { try { $('dfName').focus(); } catch (x) {} }, 50);
}
function dbCloseForm(){ $('dbFormOv').style.display = 'none'; debtFormId = null; document.body.style.overflow = $('dbDetailOv').style.display === 'block' ? 'hidden' : ''; }
$('dbFormPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'close') return dbCloseForm();
  const name = $('dfName').value.trim(), since = $('dfSince').value;
  if (!name) return alert('채무자를 입력해주세요.');
  const sp = (document.querySelector('input[name=dfTypeR]:checked') || {}).value === '특수', spd = $('dfSpD').value || null;
  if (sp && !spd) return alert('특수채권편입일자를 입력해주세요.');
  const accel = sp ? null : ($('dfAccel').value || null);
  if (!sp && accel && since && accel < since && !confirm('기한이익상실일이 내부연체기준일보다 빨라요. 그대로 저장할까요?')) return;
  const cau = sp ? null : ($('dfCau').value || null), fix = sp ? null : ($('dfFix').value || null);
  if (!sp && cau && fix && fix < cau && !confirm('고정이하 분류일이 요주의 분류일보다 빨라요. 그대로 저장할까요?')) return;
  const row = { debtor_name: name, scope: (document.querySelector('input[name=dfScopeR]:checked') || {}).value || '본점', bond_type: sp ? '특수' : '일반', special_date: sp ? spd : null, overdue_since: sp ? null : (since || null), other_bank_since: sp ? null : ($('dfOb').value || null), acceleration_date: accel, asset_class: sp ? null : ($('dfCls').value || null), fixed_below_date: fix, caution_date: cau, manage_note: $('dfMgN').value.trim() || null, principal: dbNum($('dfAmt').value),
    assignee_email: $('dfAsg').value || null, memo: $('dfMemo').value.trim() || null };
  b.disabled = true; const wasNew = !debtFormId;
  const { data, error } = debtFormId ? await sb.from('debt_cases').update(row).eq('id', debtFormId).select() : await sb.from('debt_cases').insert(row).select();
  b.disabled = false;
  if (error) return alert(error.message);
  const id = debtFormId || (data && data[0] && data[0].id);
  dbCloseForm(); toast('💾 저장했어요'); await loadDebt();
  if (wasNew && id) dbOpenDetail(id);
});
