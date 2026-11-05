// 사후관리 > 자금운영관리 — 기존 엑셀(자금운영현황)의 7개 항목을 기준일자별로 입력·보관하고, 합계·연동값을 자동 계산한다.
// 1 자금조달 및 운영 · 2 중앙회 자금현황 · 3 법인자금현황 · 4 대외예치금현황 · 5 대출 실행예정현황 · 6 자금집행 예정내역 · 7 기타사항
// 기준일자마다 한 건(fund_days.data JSON)으로 저장하고, 새 날짜는 직전 기록을 복사해서 시작한다. 사후관리 권한자(perm_debt)·관리자만 조회·입력.
// 전역(sb, $, esc, me, kstToday, toast, debtCan)과 appraisal.js 의 apPreview / apSettings / AP_FONT 를 함께 쓴다.

let fdDays = new Map(), fdDay = '', fdDraft = null, fdDirty = false, fdLoaded = false;
const fdN = (x) => Number(x) || 0;
const fdW = (n) => fdN(n).toLocaleString('ko-KR');
const fdMon = (s) => { const t = String(s ?? '').trim(), neg = t.startsWith('-'), d = t.replace(/[^0-9]/g, ''); return d ? (neg ? -Number(d) : Number(d)) : 0; };
const fdComma = (s) => { const t = String(s ?? '').trim(), neg = t.startsWith('-'), d = t.replace(/[^0-9]/g, ''); return d ? (neg ? '-' : '') + Number(d).toLocaleString('ko-KR') : (neg ? '-' : ''); };
const fdDow = (iso) => ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T12:00:00Z').getUTCDay()];
const fdShift = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const fdClone = (o) => JSON.parse(JSON.stringify(o));
const fdGet = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const fdSet = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const FD_TERMS = ['1개월', '3개월', '6개월', '12개월', '24개월'], FD_TERM_OPTS = [...FD_TERMS, '36개월'];
// 중앙회 금리표: 기준일자(적용 시작일)별로 입력해 두면, 자금운영 기준일에 맞는 가장 최근 금리표가 적용된다
const FD_RATE_COLS = [['lump', '일시자금'], ['m1', '정기 1개월'], ['m3', '3개월'], ['m6', '6개월'], ['m12', '12개월'], ['m24', '24개월'], ['m36', '36개월'], ['hwan', '환담보예치금'], ['reserve', '상환준비금']];
const FD_TERM_KEY = { '1개월': 'm1', '3개월': 'm3', '6개월': 'm6', '12개월': 'm12', '24개월': 'm24', '36개월': 'm36' };
let fdRates = [], fdRateForm = { eff: '', v: {} };
const fdRateFor = (day) => fdRates.find(r => r.eff_date <= day) || null;   // fdRates 는 기준일자 내림차순
// 금리표 머리글: 정기예탁금 아래에 1~36개월이 묶여 보이는 2단 표
const FD_RATE_HEAD = (right, extra = '') => `<tr><th rowspan="2" style="vertical-align:bottom">기준일자</th><th rowspan="2" style="${right}vertical-align:bottom">일시자금</th><th colspan="6" style="text-align:center;border-bottom:1px solid var(--line)">정기예탁금</th><th rowspan="2" style="${right}vertical-align:bottom">환담보예치금</th><th rowspan="2" style="${right}vertical-align:bottom">상환준비금</th>${extra}</tr>
  <tr>${['1개월', '3개월', '6개월', '12개월', '24개월', '36개월'].map(n => `<th style="${right}">${n}</th>`).join('')}</tr>`;
const fdPct = (v) => v === null || v === undefined || v === '' ? '-' : `${Number(v)}%`;
const FD_LOANKINDS = ['일반대출', '예탁금대출', '주택담보대출', '기타'];
const FD_S1 = {   // 자금조달·운영 행: auto = 다른 항목에서 가져오는 연동값 (기본 모드가 manual 인 행은 엑셀처럼 직접 입력, 연동값은 참고로 표시)
  src: [{ key: 'central', label: '중앙회일시자금', def: 'auto' }, { key: 'ext', label: '대외예치금(농협-요구불)', def: 'manual' }, { key: 'term1', label: '정기예탁금(1개월)', def: 'manual' }, { key: 'recv', label: '사업미수금', def: 'manual', noAuto: true }],
  ops: [{ key: 'loan', label: '대출', def: 'auto' }, { key: 'min', label: '민관협력과', def: 'auto' }, { key: 'corp', label: '법인자금지출', def: 'auto' }],
};

function fdBlank(){
  return {
    s1: { mode: {}, amt: {}, due: {}, note: {} },
    s2: { lump: [{ name: '중앙회일시자금', amt: 0, rate: '' }, { name: '환일시자금', amt: 0, rate: '' }], term: FD_TERMS.map(m => ({ months: m, amt: 0, due: '', rate: '' })), loanIn: 0 },
    s3: { groups: [{ name: '춘천시산림조합', rows: [{ kind: '요구불', acct: '', amt: 0, memo: '' }] }], sched: [] },
    s4: { rows: [{ scope: '본점', kind: '요구불', acct: '', amt: 0, due: '', note: '' }, { scope: '지점', kind: '요구불', acct: '', amt: 0, due: '', note: '' }] },
    s5: { rows: [{ scope: '본점', name: '', kind: '일반대출', amt: 0, date: '', tbd: false, note: '' }] },
    s6: { loanMode: 'auto', loanAmt: 0, rows: [{ tag: 'min', kind: '법인자금', name: '민간협력과', amt: 0, note: '' }, { kind: '법인자금', name: '강원지역본부 지출', amt: 0, note: '' }, { kind: '법인자금', name: '장비대금외(일반사업)', amt: 0, note: '' }, { kind: '법인자금', name: '북부사업소', amt: 0, note: '' }] },
    memo: '',
  };
}
function fdNewRow(path){
  if (path === 's2.lump') return { name: '', amt: 0, rate: '' };
  if (path === 's2.term') return { months: '12개월', amt: 0, due: '', rate: '' };
  if (path.endsWith('.rows') && path.startsWith('s3.groups')) return { kind: '요구불', acct: '', amt: 0, memo: '' };
  if (path === 's3.groups') return { name: '', rows: [{ kind: '요구불', acct: '', amt: 0, memo: '' }] };
  if (path === 's3.sched') return { date: '', amt: 0, memo: '' };
  if (path === 's4.rows') return { scope: '본점', kind: '요구불', acct: '', amt: 0, due: '', note: '' };
  if (path === 's5.rows') return { scope: '본점', name: '', kind: '일반대출', amt: 0, date: '', tbd: false, note: '' };
  if (path === 's6.rows') return { kind: '법인자금', name: '', amt: 0, note: '' };
  return {};
}

// ---------- 계산 (화면·요약·인쇄 공통) ----------
function fdCalc(d, day){
  const lump = d.s2.lump.reduce((a, r) => a + fdN(r.amt), 0), termBy = {};
  d.s2.term.forEach(r => { termBy[r.months] = (termBy[r.months] || 0) + fdN(r.amt); });
  const term = d.s2.term.reduce((a, r) => a + fdN(r.amt), 0), s2 = { lump, termBy, term, total: lump + term };
  const s3g = d.s3.groups.map(g => g.rows.reduce((a, r) => a + fdN(r.amt), 0)), s3 = { g: s3g, total: s3g.reduce((a, b) => a + b, 0), sched: d.s3.sched.reduce((a, r) => a + fdN(r.amt), 0) };
  const s4 = { 본점: 0, 지점: 0, total: 0 }; d.s4.rows.forEach(r => { s4[r.scope] = (s4[r.scope] || 0) + fdN(r.amt); s4.total += fdN(r.amt); });
  const s5 = { by: { 본점: { n: 0, sum: 0 }, 지점: { n: 0, sum: 0 } }, n: 0, total: 0, month: 0, monthN: 0, tbd: 0, tbdN: 0, past: 0 }, ym = (day || '').slice(0, 7);
  d.s5.rows.forEach(r => {
    const a = fdN(r.amt), b = (s5.by[r.scope] ||= { n: 0, sum: 0 }); if (!a && !r.name) return;
    b.n++; b.sum += a; s5.n++; s5.total += a;
    if (r.tbd || !r.date){ s5.tbd += a; s5.tbdN++; } else { if (r.date.slice(0, 7) === ym){ s5.month += a; s5.monthN++; } if (day && r.date < day) s5.past++; }
  });
  const corp = d.s6.rows.reduce((a, r) => a + fdN(r.amt), 0), min = d.s6.rows.filter(r => r.tag === 'min').reduce((a, r) => a + fdN(r.amt), 0);
  const loan = d.s6.loanMode === 'manual' ? fdN(d.s6.loanAmt) : s5.month, s6 = { loan, corp, min, total: loan + corp };
  const auto = { central: lump, ext: s4.total, term1: termBy['1개월'] || 0, loan, min, corp: corp - min }, mode = (key, def) => d.s1.mode[key] || def;
  const val = (row) => (mode(row.key, row.def) === 'auto' && !row.noAuto ? auto[row.key] : fdN(d.s1.amt[row.key]));
  const srcSum = FD_S1.src.reduce((a, r) => a + val(r), 0), opsSum = FD_S1.ops.reduce((a, r) => a + val(r), 0);
  return { s2, s3, s4, s5, s6, s1: { auto, val, mode, srcSum, opsSum, diff: srcSum - opsSum } };
}

(function(){
  const st = document.createElement('style');
  st.textContent = `
  #fund{ display:none; flex-direction:column; gap:12px; min-width:0; }
  .fdbar{ display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center; background:#fff; border-radius:22px; box-shadow:var(--sh); padding:12px 16px; }
  .fdbar input[type=date]{ width:auto; min-width:150px; font-weight:700; }
  .fdchips{ display:flex; flex-wrap:wrap; gap:6px; } .fdchips button{ border:0; cursor:pointer; font:inherit; font-size:12.5px; font-weight:700; padding:5px 11px; border-radius:99px; background:#eef1f6; color:#44546f; } .fdchips button.on{ background:#16181d; color:#fff; }
  .fdsum{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; } .fdsum > div{ background:#fff; border-radius:18px; box-shadow:var(--sh); padding:12px 14px; min-width:0; } .fdsum .k{ font-size:12px; color:var(--muted); font-weight:700; } .fdsum .v{ font-size:17px; font-weight:800; margin-top:3px; word-break:break-all; letter-spacing:-.02em; } .fdsum .neg{ color:var(--danger); } .fdsum .pos{ color:var(--green); }
  .fdsec{ background:#fff; border-radius:22px; box-shadow:var(--sh); padding:16px 18px; min-width:0; } .fdsec > h3{ margin:0 0 10px; font-size:16.5px; letter-spacing:-.02em; display:flex; align-items:center; gap:8px; flex-wrap:wrap; } .fdsec > h3 small{ font-size:12px; font-weight:500; color:var(--muted); }
  .fdsc{ overflow-x:auto; } .fdt{ width:100%; border-collapse:collapse; font-size:13.5px; min-width:560px; } .fdt th{ font-size:12px; color:var(--muted); font-weight:700; text-align:left; padding:4px 6px; white-space:nowrap; } .fdt td{ padding:4px 5px; border-top:1px solid var(--line); vertical-align:middle; }
  .fdt input,.fdt select{ width:100%; min-width:70px; padding:7px 9px; font-size:14px; min-height:38px; } .fdt input.fdm{ text-align:right; min-width:120px; } .fdt .tot td{ font-weight:800; background:#f6f7fb; } .fdt .sub td{ font-weight:700; background:#fafbfd; }
  .fdt td.num{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:700; } .fdt td.lab{ font-weight:700; white-space:nowrap; } .fdt .past input{ background:#fff0f0; }
  .fdx{ border:0; background:transparent; cursor:pointer; color:var(--muted); font-size:15px; padding:4px 6px; }
  .fdlink{ font-size:12px; color:var(--accent); cursor:pointer; border:0; background:transparent; font-weight:700; padding:2px 4px; } .fdauto{ font-size:11.5px; font-weight:700; color:#5b21b6; background:#ede9fe; border-radius:99px; padding:2px 8px; cursor:pointer; border:0; }
  .fdhint{ font-size:12px; color:var(--muted); margin-top:4px; } .fdwarn{ background:#fff3c4; color:#7a5200; border-radius:14px; padding:10px 14px; font-size:13.5px; font-weight:700; }
  .fdtwo{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; } .fdhist{ width:100%; border-collapse:collapse; font-size:13px; min-width:640px; } .fdhist th{ font-size:12px; color:var(--muted); text-align:right; padding:5px 8px; } .fdhist td{ text-align:right; padding:6px 8px; border-top:1px solid var(--line); cursor:pointer; font-variant-numeric:tabular-nums; } .fdhist th:first-child,.fdhist td:first-child{ text-align:left; font-weight:700; } .fdhist tr.on td{ background:#fff3c4; }
  @media (max-width:980px){ .fdsum{ grid-template-columns:repeat(2,minmax(0,1fr)); } .fdtwo{ grid-template-columns:1fr; } }`;
  document.head.appendChild(st);
})();

// ---------- 불러오기 ----------
async function loadFund(){
  if (!debtCan()){ fdDays = new Map(); return; }
  const [{ data, error }, rr] = await Promise.all([sb.from('fund_days').select('day, data, updated_at, updated_by').order('day', { ascending: false }).limit(400), sb.from('fund_rates').select('*').order('eff_date', { ascending: false })]);
  if (error){ console.warn('자금운영 불러오기 실패', error.message); return; }
  if (!rr.error) fdRates = rr.data || [];
  fdDays = new Map((data || []).map(r => [r.day, r])); fdLoaded = true;
  if (typeof divn !== 'undefined' && divn === 'debt' && typeof dbTab !== 'undefined' && dbTab === 'fund'){
    if (!fdDirty){ fdPick(fdDay || '', true); renderFund(); } else fdRefreshHist();
  }
}
// 기준일을 고른다: 저장된 기록이 있으면 그 내용, 없으면 빈 양식
function fdPick(day, keep){
  if (!day) day = fdDay || (fdDays.size ? [...fdDays.keys()][0] : kstToday());
  fdDay = day; const rec = fdDays.get(day);
  const base = fdBlank(); fdDraft = rec ? Object.assign(base, fdClone(rec.data)) : base;
  ['s1', 's2', 's3', 's4', 's5', 's6'].forEach(k => { if (!fdDraft[k]) fdDraft[k] = fdBlank()[k]; });
  if (!keep) fdDirty = false;
}
const fdPrevSaved = (day) => [...fdDays.keys()].filter(k => k < day).sort().pop();

// ---------- 화면 ----------
function renderFund(){
  const el = $('fund'); if (!el) return;
  if (!fdLoaded && debtCan()) loadFund();
  if (!fdDraft) fdPick('');
  if (!el.dataset.ready){ el.dataset.ready = '1'; fdWire(el); }
  const d = fdDraft, day = fdDay, saved = fdDays.has(day), prev = fdPrevSaved(day), recent = [...fdDays.keys()].slice(0, 8);
  const M = (p, v) => `<input class="fdm" data-p="${p}" data-t="money" inputmode="numeric" value="${v ? fdComma(v) : ''}" />`;
  const T = (p, v, ph = '') => `<input data-p="${p}" data-t="text" value="${esc(v ?? '')}" placeholder="${esc(ph)}" />`;
  const D_ = (p, v) => `<input type="date" data-p="${p}" data-t="date" value="${esc(v || '')}" />`;
  const S = (p, v, opts) => `<select data-p="${p}" data-t="text">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const X = (p, i, extra = '') => `<button class="fdx" type="button" data-act="del" data-p="${p}" data-i="${i}" title="이 행 삭제">✕</button>`;
  const A = (p, label = '＋ 행 추가') => `<button class="btn small" type="button" data-act="add" data-p="${p}" style="margin-top:8px">${label}</button>`;
  const o = (k) => `<span data-o="${k}"></span>`;
  const s1row = (r) => `<tr><td class="lab">${esc(r.label)}</td><td style="min-width:200px">${r.noAuto ? M(`s1.amt.${r.key}`, d.s1.amt[r.key]) : `<div data-o="s1m.${r.key}"></div>`}</td><td>${T(`s1.due.${r.key}`, d.s1.due[r.key], '만기일')}</td><td>${T(`s1.note.${r.key}`, d.s1.note[r.key], '비고')}</td></tr>`;
  el.innerHTML = `<div class="fdbar"><button class="btn small" data-n="-1">◀</button><input type="date" id="fdDate" value="${esc(day)}" /><button class="btn small" data-n="1">▶</button><button class="btn small" data-n="0">오늘</button>
      <span class="fdchips">${recent.map(k => `<button data-day="${k}" class="${k === day ? 'on' : ''}" title="저장된 기준일">${k.slice(5).replace('-', '/')}(${fdDow(k)})</button>`).join('')}</span><span style="flex:1"></span>
      <span class="muted" id="fdState" style="font-size:12.5px"></span>${prev ? `<button class="btn small" data-act="copy" title="${prev} 기록을 지금 화면으로 불러와요">📋 전일자 불러오기 <span class="muted" style="font-weight:500">(${prev.slice(5).replace('-', '/')})</span></button>` : ''}<button class="btn small" data-act="print">🖨 인쇄</button>${saved ? '<button class="btn small danger" data-act="delday">이 날짜 삭제</button>' : ''}<button class="btn small primary" data-act="save">💾 저장</button></div>
    ${!saved ? `<div class="fdwarn">${esc(day)} (${fdDow(day)}) 은(는) 아직 저장된 기록이 없어요. ${prev ? `<button class="btn small" data-act="copy" style="margin-left:6px">직전 기록(${prev.slice(5).replace('-', '/')}) 복사해서 시작</button>` : '아래에 입력하고 저장하세요.'}</div>` : ''}
    <div class="fdsum"><div><div class="k">조달 소계</div><div class="v" data-o="sum.src"></div></div><div><div class="k">운영 소계</div><div class="v" data-o="sum.ops"></div></div><div><div class="k">차액 (조달−운영)</div><div class="v" data-o="sum.diff"></div></div>
      <div><div class="k">중앙회 자금 합계</div><div class="v" data-o="sum.s2"></div></div><div><div class="k">법인자금 합계</div><div class="v" data-o="sum.s3"></div></div><div><div class="k">대출 실행예정 합계</div><div class="v" data-o="sum.s5"></div></div></div>

    <div class="fdsec"><h3>1. 자금조달 및 운영 <small>(단위 : 원) · 연동값은 아래 항목에서 자동으로 가져와요</small></h3><div class="fdsc"><table class="fdt"><thead><tr><th>구분</th><th>금액</th><th>만기일</th><th>비고</th></tr></thead><tbody>
      <tr class="sub"><td colspan="4">조달</td></tr>${FD_S1.src.map(s1row).join('')}<tr class="tot"><td class="lab">소 계</td><td class="num" data-o="s1.src"></td><td></td><td></td></tr>
      <tr class="sub"><td colspan="4">운영</td></tr>${FD_S1.ops.map(s1row).join('')}<tr class="tot"><td class="lab">소 계</td><td class="num" data-o="s1.ops"></td><td></td><td></td></tr>
      <tr class="tot"><td class="lab">차 액</td><td class="num" data-o="s1.diff"></td><td></td><td></td></tr></tbody></table></div></div>

    <div class="fdsec"><h3>2. 중앙회 자금현황 <small>(수신)</small> <button class="btn small" type="button" data-act="applyrate" style="margin-left:auto" title="아래 중앙회 금리표에서 이 기준일에 적용되는 금리를 빈 금리 칸에 채워요">금리표 적용</button></h3><div class="fdsc"><table class="fdt"><thead><tr><th>계정과목</th><th>금액</th><th>만기일</th><th>금리</th><th></th></tr></thead><tbody>
      ${d.s2.lump.map((r, i) => `<tr><td>${T(`s2.lump.${i}.name`, r.name, '계정과목')}</td><td>${M(`s2.lump.${i}.amt`, r.amt)}</td><td></td><td>${T(`s2.lump.${i}.rate`, r.rate, '예: 1.8%')}</td><td>${d.s2.lump.length > 1 ? X('s2.lump', i) : ''}</td></tr>`).join('')}
      <tr class="sub"><td class="lab">소 계 (일시자금)</td><td class="num" data-o="s2.lump"></td><td></td><td></td><td></td></tr>
      ${d.s2.term.map((r, i) => `<tr><td>${S(`s2.term.${i}.months`, r.months, FD_TERM_OPTS).replace('<select', '<select style="min-width:110px"')}<span class="muted" style="font-size:12px"> 정기예탁금</span></td><td>${M(`s2.term.${i}.amt`, r.amt)}</td><td>${T(`s2.term.${i}.due`, r.due, '2026-11-13 또는 2027-01-02~')}</td><td>${T(`s2.term.${i}.rate`, r.rate, '2.83~2.93%')}</td><td>${d.s2.term.length > 1 ? X('s2.term', i) : ''}</td></tr>`).join('')}
      <tr class="sub"><td class="lab">소 계 (정기예탁금)</td><td class="num" data-o="s2.term"></td><td colspan="3" class="muted" style="font-size:12px" data-o="s2.termBy"></td></tr>
      <tr class="tot"><td class="lab">합 계</td><td class="num" data-o="s2.total"></td><td></td><td></td><td></td></tr>
      <tr><td class="lab">여신 · 정기예탁금범위내대출</td><td>${M('s2.loanIn', d.s2.loanIn)}</td><td></td><td></td><td></td></tr></tbody></table></div>
      <button class="btn small" type="button" data-act="add" data-p="s2.lump" style="margin-top:8px">＋ 일시자금 행</button> <button class="btn small" type="button" data-act="add" data-p="s2.term" style="margin-top:8px">＋ 정기예탁금 행</button></div>

    <div class="fdsec"><h3>3. 법인자금현황 <small>(기관별 계좌 잔액)</small></h3>
      ${d.s3.groups.map((g, gi) => `<div style="margin-bottom:12px"><div class="dbline" style="margin-bottom:4px"><input data-p="s3.groups.${gi}.name" data-t="text" value="${esc(g.name)}" placeholder="기관명 (예: 춘천시산림조합)" style="max-width:320px;font-weight:700" />${d.s3.groups.length > 1 ? X('s3.groups', gi) : ''}</div>
        <div class="fdsc"><table class="fdt"><thead><tr><th>내역</th><th>계좌</th><th>금액</th><th>적요</th><th></th></tr></thead><tbody>
        ${g.rows.map((r, i) => `<tr><td>${T(`s3.groups.${gi}.rows.${i}.kind`, r.kind, '요구불')}</td><td>${T(`s3.groups.${gi}.rows.${i}.acct`, r.acct, '계좌번호')}</td><td>${M(`s3.groups.${gi}.rows.${i}.amt`, r.amt)}</td><td>${T(`s3.groups.${gi}.rows.${i}.memo`, r.memo, '적요')}</td><td>${g.rows.length > 1 ? X(`s3.groups.${gi}.rows`, i) : ''}</td></tr>`).join('')}
        <tr class="sub"><td class="lab">소 계</td><td></td><td class="num" data-o="s3.g.${gi}"></td><td></td><td></td></tr></tbody></table></div>${A(`s3.groups.${gi}.rows`, '＋ 계좌 추가')}</div>`).join('')}
      ${A('s3.groups', '＋ 기관 추가')}<div style="margin-top:10px;font-weight:800">합 계 <span data-o="s3.total"></span> 원</div>
      <div style="margin-top:14px"><b>민관협력과 지출 일정</b> <span class="muted" style="font-size:12px">(일자별 지출 예정 — 월별 합계가 아래에 나와요)</span>
        <div class="fdsc"><table class="fdt"><thead><tr><th>일자</th><th>금액</th><th>메모</th><th></th></tr></thead><tbody>${d.s3.sched.map((r, i) => `<tr><td>${D_(`s3.sched.${i}.date`, r.date)}</td><td>${M(`s3.sched.${i}.amt`, r.amt)}</td><td>${T(`s3.sched.${i}.memo`, r.memo, '메모')}</td><td>${X('s3.sched', i)}</td></tr>`).join('')}</tbody></table></div>${A('s3.sched', '＋ 일정 추가')}<div class="fdhint" data-o="s3.schedBy"></div></div></div>

    <div class="fdsec"><h3>4. 대외예치금 현황 <small>(본점·지점)</small></h3><div class="fdsc"><table class="fdt"><thead><tr><th>구분</th><th>내역</th><th>계좌</th><th>금액</th><th>만기일</th><th>비고</th><th></th></tr></thead><tbody>
      ${d.s4.rows.map((r, i) => `<tr><td style="width:96px">${S(`s4.rows.${i}.scope`, r.scope, ['본점', '지점'])}</td><td>${T(`s4.rows.${i}.kind`, r.kind, '요구불')}</td><td>${T(`s4.rows.${i}.acct`, r.acct, '계좌번호')}</td><td>${M(`s4.rows.${i}.amt`, r.amt)}</td><td>${T(`s4.rows.${i}.due`, r.due, '만기일')}</td><td>${T(`s4.rows.${i}.note`, r.note, '예: 농협')}</td><td>${d.s4.rows.length > 1 ? X('s4.rows', i) : ''}</td></tr>`).join('')}
      <tr class="tot"><td class="lab">합 계</td><td colspan="2" class="muted" style="font-size:12px" data-o="s4.by"></td><td class="num" data-o="s4.total"></td><td colspan="3"></td></tr></tbody></table></div>${A('s4.rows')}</div>

    <div class="fdsec"><h3>5. 대출 실행예정 현황 <small>(실행예정일이 지난 행은 붉게 표시 — 실행했다면 ✕로 지우세요)</small></h3><div class="fdsc"><table class="fdt"><thead><tr><th>구분</th><th>성명</th><th>과목</th><th>금액</th><th>실행예정일</th><th>미정</th><th>비고</th><th></th></tr></thead><tbody>
      ${d.s5.rows.map((r, i) => `<tr class="${!r.tbd && r.date && r.date < day ? 'past' : ''}"><td style="width:96px">${S(`s5.rows.${i}.scope`, r.scope, ['본점', '지점'])}</td><td>${T(`s5.rows.${i}.name`, r.name, '성명')}</td><td>${S(`s5.rows.${i}.kind`, r.kind, FD_LOANKINDS).replace('<select', '<select style="min-width:120px"')}</td><td>${M(`s5.rows.${i}.amt`, r.amt)}</td><td>${D_(`s5.rows.${i}.date`, r.date)}</td><td style="text-align:center"><input type="checkbox" data-p="s5.rows.${i}.tbd" data-t="check" ${r.tbd ? 'checked' : ''} style="width:20px;min-height:0;-webkit-appearance:auto;appearance:auto" /></td><td>${T(`s5.rows.${i}.note`, r.note, '비고')}</td><td>${d.s5.rows.length > 1 ? X('s5.rows', i) : ''}</td></tr>`).join('')}
      <tr class="tot"><td class="lab">합 계</td><td colspan="2" data-o="s5.cnt"></td><td class="num" data-o="s5.total"></td><td colspan="4" class="muted" style="font-size:12px" data-o="s5.by"></td></tr></tbody></table></div>${A('s5.rows', '＋ 대출 추가')}<div class="fdhint" data-o="s5.hint"></div></div>

    <div class="fdsec"><h3>6. 자금집행 예정내역 <small>(대출실행은 5번에서 기준일이 속한 달의 예정분을 자동 합산 · 미정 제외)</small></h3><div class="fdsc"><table class="fdt"><thead><tr><th>구분</th><th>내역</th><th>금액</th><th>비고</th><th></th></tr></thead><tbody>
      <tr><td class="lab">대출실행</td><td data-o="s6.loanLabel"></td><td style="min-width:200px" data-o="s6.loanCell"></td><td>${T('s6.loanNote', d.s6.loanNote, '비고')}</td><td></td></tr>
      ${d.s6.rows.map((r, i) => `<tr><td>${T(`s6.rows.${i}.kind`, r.kind, '법인자금')}</td><td>${T(`s6.rows.${i}.name`, r.name, '내역')}</td><td>${M(`s6.rows.${i}.amt`, r.amt)}</td><td>${T(`s6.rows.${i}.note`, r.note, '비고')}</td><td>${d.s6.rows.length > 1 ? X('s6.rows', i) : ''}</td></tr>`).join('')}
      <tr class="tot"><td class="lab">합 계</td><td></td><td class="num" data-o="s6.total"></td><td></td><td></td></tr></tbody></table></div>${A('s6.rows')}</div>

    <div class="fdsec"><h3>7. 기타사항</h3><textarea data-p="memo" data-t="text" rows="4" placeholder="특이사항·메모">${esc(d.memo || '')}</textarea></div>
    ${fdRateSection(day)}
    <div class="fdsec"><h3>일자별 요약 <small>(저장된 기준일 · 눌러서 열기)</small></h3><div class="fdsc" id="fdHist"></div></div>`;
  fdRefresh(); fdRefreshHist();
}

// ---------- 입력 반영·재계산 (입력칸을 다시 그리지 않고 계산 결과만 갱신) ----------
// 연동/수동 칸: 입력 중에는 칸을 다시 그리지 않도록, 모드나 연동값이 바뀔 때만 새로 그린다
function fdCell(k, sig, htmlFn){
  document.querySelectorAll(`#fund [data-o="${k}"]`).forEach(x => { if (x.dataset.sig === sig) return; if (x.contains(document.activeElement) && x.dataset.sig && x.dataset.sig.split('|')[0] === sig.split('|')[0] && sig.split('|')[0] === 'manual') return; x.dataset.sig = sig; x.innerHTML = htmlFn(); });
}
function fdRefresh(){
  const d = fdDraft, c = fdCalc(d, fdDay), set = (k, v) => document.querySelectorAll(`#fund [data-o="${k}"]`).forEach(x => { x.textContent = v; }), html = (k, v) => document.querySelectorAll(`#fund [data-o="${k}"]`).forEach(x => { x.innerHTML = v; });
  const w = (n) => fdW(n);
  [...FD_S1.src, ...FD_S1.ops].forEach(r => {
    if (r.noAuto) return;
    const m = c.s1.mode(r.key, r.def), auto = c.s1.auto[r.key];
    fdCell(`s1m.${r.key}`, `${m}|${auto}`, () => m === 'auto'
      ? `<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end"><b style="font-variant-numeric:tabular-nums">${w(auto)}</b><button class="fdauto" type="button" data-act="mode" data-k="${r.key}" data-m="manual" title="직접 입력으로 바꾸기">연동</button></div>`
      : `<div style="display:flex;gap:6px;align-items:center"><input class="fdm" data-p="s1.amt.${r.key}" data-t="money" inputmode="numeric" value="${fdN(d.s1.amt[r.key]) ? fdComma(d.s1.amt[r.key]) : ''}" />${auto ? `<button class="fdlink" type="button" data-act="mode" data-k="${r.key}" data-m="auto" title="연동값 ${w(auto)}원으로 바꾸기">연동 ${w(auto)}</button>` : ''}</div>`);
  });
  set('s1.src', w(c.s1.srcSum)); set('s1.ops', w(c.s1.opsSum)); set('s1.diff', w(c.s1.diff));
  set('sum.src', w(c.s1.srcSum) + '원'); set('sum.ops', w(c.s1.opsSum) + '원'); set('sum.diff', w(c.s1.diff) + '원'); set('sum.s2', w(c.s2.total) + '원'); set('sum.s3', w(c.s3.total) + '원'); set('sum.s5', `${w(c.s5.total)}원 (${c.s5.n}건)`);
  document.querySelectorAll('#fund [data-o="sum.diff"]').forEach(x => { x.classList.toggle('neg', c.s1.diff < 0); x.classList.toggle('pos', c.s1.diff > 0); });
  set('s2.lump', w(c.s2.lump)); set('s2.term', w(c.s2.term)); set('s2.total', w(c.s2.total)); set('s2.termBy', FD_TERM_OPTS.filter(m => c.s2.termBy[m]).map(m => `${m} ${w(c.s2.termBy[m])}`).join(' · '));
  c.s3.g.forEach((v, i) => set(`s3.g.${i}`, w(v))); set('s3.total', w(c.s3.total));
  const bm = {}; d.s3.sched.forEach(r => { if (r.date) bm[r.date.slice(0, 7)] = (bm[r.date.slice(0, 7)] || 0) + fdN(r.amt); }); set('s3.schedBy', Object.keys(bm).sort().map(k => `${+k.slice(5)}월 ${w(bm[k])}원`).join(' · ') + (c.s3.sched ? ` · 합계 ${w(c.s3.sched)}원` : ''));
  set('s4.total', w(c.s4.total)); set('s4.by', `본점 ${w(c.s4.본점)} · 지점 ${w(c.s4.지점)}`);
  set('s5.cnt', `${c.s5.n}건`); set('s5.total', w(c.s5.total)); set('s5.by', `본점 ${c.s5.by.본점.n}건 ${w(c.s5.by.본점.sum)} · 지점 ${c.s5.by.지점.n}건 ${w(c.s5.by.지점.sum)}`);
  set('s5.hint', `${fdDay.slice(5, 7).replace(/^0/, '')}월 실행예정 ${c.s5.monthN}건 ${w(c.s5.month)}원 · 미정 ${c.s5.tbdN}건 ${w(c.s5.tbd)}원${c.s5.past ? ` · ⚠ 예정일이 지난 ${c.s5.past}건` : ''}`);
  set('s6.loanLabel', `${+fdDay.slice(5, 7)}월분 (미정분 미포함)`);
  fdCell('s6.loanCell', `${d.s6.loanMode}|${c.s5.month}|${c.s6.loan}`, () => d.s6.loanMode === 'manual'
    ? `<div style="display:flex;gap:6px;align-items:center"><input class="fdm" data-p="s6.loanAmt" data-t="money" inputmode="numeric" value="${fdN(d.s6.loanAmt) ? fdComma(d.s6.loanAmt) : ''}" /><button class="fdlink" type="button" data-act="loanmode" data-m="auto" title="5번 합계로 되돌리기">연동 ${w(c.s5.month)}</button></div>`
    : `<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end"><b style="font-variant-numeric:tabular-nums">${w(c.s6.loan)}</b><button class="fdauto" type="button" data-act="loanmode" data-m="manual" title="직접 입력으로 바꾸기">연동</button></div>`);
  set('s6.total', w(c.s6.total));
  const st = $('fdState'); if (st) st.textContent = fdDirty ? '● 저장 안 된 변경이 있어요' : (fdDays.has(fdDay) ? `저장됨 ${String((fdDays.get(fdDay) || {}).updated_at || '').slice(0, 16).replace('T', ' ')}` : '새 기록');
}
function fdRefreshHist(){
  const box = $('fdHist'); if (!box) return;
  const days = [...fdDays.keys()].slice(0, 30), w = fdW;
  box.innerHTML = days.length ? `<table class="fdhist"><thead><tr><th>기준일</th><th>조달 소계</th><th>운영 소계</th><th>차액</th><th>중앙회 합계</th><th>법인자금 합계</th><th>대출 실행예정</th></tr></thead><tbody>${days.map(k => {
    const rec = fdDays.get(k), d = Object.assign(fdBlank(), rec.data), c = fdCalc(d, k);
    return `<tr data-day="${k}" class="${k === fdDay ? 'on' : ''}"><td>${k} (${fdDow(k)})</td><td>${w(c.s1.srcSum)}</td><td>${w(c.s1.opsSum)}</td><td style="color:${c.s1.diff < 0 ? 'var(--danger)' : 'inherit'}">${w(c.s1.diff)}</td><td>${w(c.s2.total)}</td><td>${w(c.s3.total)}</td><td>${c.s5.n}건 ${w(c.s5.total)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="muted" style="font-size:13.5px">저장된 기록이 없어요. 위에서 입력하고 저장하면 일자별로 쌓여요.</div>';
}

function fdRateSection(day){
  const app = fdRateFor(day), f = fdRateForm, inp = (k) => `<input data-rf="v.${k}" inputmode="decimal" value="${esc(f.v[k] ?? '')}" placeholder="%" style="min-width:64px;text-align:right" />`;
  return `<div class="fdsec"><h3>중앙회 금리표 <small>(기준일자별로 입력해 두면 위 기준일에 맞는 금리표가 적용돼요)</small></h3>
    ${app ? `<div class="fdwarn" style="background:#e8f4ff;color:#14407d;margin-bottom:10px">${esc(day)} 적용 금리표 (기준일자 ${esc(app.eff_date)}) — ${FD_RATE_COLS.map(([k, n]) => `${n} <b>${fdPct(app[k])}</b>`).join(' · ')}</div>` : '<div class="fdwarn" style="margin-bottom:10px">이 기준일에 적용되는 금리표가 없어요. 아래에 기준일자와 금리를 입력하세요.</div>'}
    <div class="fdsc"><table class="fdt" style="min-width:760px"><thead>${FD_RATE_HEAD('text-align:right;', '<th rowspan="2"></th>')}</thead><tbody>
      <tr><td><input type="date" data-rf="eff" value="${esc(f.eff)}" /></td>${FD_RATE_COLS.map(([k]) => `<td>${inp(k)}</td>`).join('')}<td style="white-space:nowrap"><button class="btn small primary" type="button" data-act="ratesave">${fdRates.some(r => r.eff_date === f.eff) ? '수정 저장' : '저장'}</button> <button class="btn small" type="button" data-act="ratenew" title="입력칸 비우기">비우기</button></td></tr>
      ${fdRates.map(r => `<tr class="${app && app.eff_date === r.eff_date ? 'sub' : ''}"><td class="lab">${esc(r.eff_date)}${app && app.eff_date === r.eff_date ? ' <span class="fdauto">적용중</span>' : ''}</td>${FD_RATE_COLS.map(([k]) => `<td class="num">${fdPct(r[k])}</td>`).join('')}<td style="white-space:nowrap"><button class="fdlink" type="button" data-act="rateedit" data-d="${r.eff_date}">수정</button><button class="fdx" type="button" data-act="ratedel" data-d="${r.eff_date}" title="삭제">✕</button></td></tr>`).join('')}</tbody></table></div>
    ${fdRates.length ? '' : '<div class="fdhint">아직 입력된 금리표가 없어요. 위 입력줄에 기준일자(적용 시작일)와 금리(%)를 넣고 저장하세요.</div>'}
    <div class="fdhint">1달 단위로 금리가 바뀌면 새 기준일자로 한 줄 추가하세요. 지난 기준일의 자금운영 기록은 그 시점의 금리표를 따라가요. 2번의 ‘금리표 적용’ 버튼으로 금리 칸을 채울 수 있어요.</div></div>`;
}
function fdGo(day, force){
  if (fdDirty && !force && !confirm('저장하지 않은 변경이 있어요. 버리고 이동할까요?')){ const i = $('fdDate'); if (i) i.value = fdDay; return; }
  fdPick(day); renderFund();
}
function fdWire(el){
  el.addEventListener('click', async (e) => {
    const n = e.target.closest('[data-n]'); if (n){ const k = +n.dataset.n; return fdGo(k === 0 ? kstToday() : fdShift(fdDay, k)); }
    const dd = e.target.closest('[data-day]'); if (dd) return fdGo(dd.dataset.day);
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, d = fdDraft;
    if (act === 'add'){ const arr = fdGet(d, a.dataset.p); arr.push(fdNewRow(a.dataset.p)); fdDirty = true; return fdRerender(); }
    if (act === 'del'){ const arr = fdGet(d, a.dataset.p); arr.splice(+a.dataset.i, 1); fdDirty = true; return fdRerender(); }
    if (act === 'mode'){ d.s1.mode[a.dataset.k] = a.dataset.m; fdDirty = true; return fdRefresh(); }
    if (act === 'loanmode'){ d.s6.loanMode = a.dataset.m; if (a.dataset.m === 'manual' && !fdN(d.s6.loanAmt)) d.s6.loanAmt = fdCalc(d, fdDay).s5.month; fdDirty = true; return fdRefresh(); }
    if (act === 'copy'){
      const p = fdPrevSaved(fdDay); if (!p) return alert('불러올 이전 기록이 없어요.');
      if ((fdDays.has(fdDay) || fdDirty) && !confirm(`지금 화면의 ${fdDays.has(fdDay) ? '저장된 ' : ''}내용을 ${p} (${fdDow(p)}) 기록으로 바꿀까요?\n(저장 전까지는 원래 기록이 그대로 남아 있어요)`)) return;
      fdDraft = Object.assign(fdBlank(), fdClone(fdDays.get(p).data)); fdDirty = true; toast(`📋 ${p} 기록을 불러왔어요. 바뀐 금액만 고쳐서 저장하세요`); return renderFund();
    }
    if (act === 'applyrate'){
      const r = fdRateFor(fdDay); if (!r) return alert('적용할 금리표가 없어요. 아래 중앙회 금리표에 먼저 입력하세요.');
      let n = 0; const txt = (v) => `${Number(v)}%`;
      if (!d.s2.lump[0].rate && r.lump != null){ d.s2.lump[0].rate = txt(r.lump); n++; }
      d.s2.term.forEach(t => { const k = FD_TERM_KEY[t.months]; if (k && r[k] != null && !t.rate){ t.rate = txt(r[k]); n++; } });
      if (!n) return toast('채울 빈 금리 칸이 없어요 (이미 입력된 금리는 그대로 둬요)');
      fdDirty = true; toast(`${r.eff_date} 금리표로 ${n}칸을 채웠어요`); return fdRerender();
    }
    if (act === 'ratenew'){ fdRateForm = { eff: '', v: {} }; return fdRerender(); }
    if (act === 'rateedit'){ const r = fdRates.find(x => x.eff_date === a.dataset.d); if (!r) return; fdRateForm = { eff: r.eff_date, v: Object.fromEntries(FD_RATE_COLS.map(([k]) => [k, r[k] == null ? '' : String(Number(r[k]))])) }; fdRerender(); const i = document.querySelector('#fund [data-rf="eff"]'); if (i) i.scrollIntoView({ block: 'center' }); return; }
    if (act === 'ratedel'){ if (!confirm(`${a.dataset.d} 기준 금리표를 삭제할까요?`)) return; const { error } = await sb.from('fund_rates').delete().eq('eff_date', a.dataset.d); if (error) return alert(error.message); toast('삭제했어요'); await loadFund(); return fdRerender(); }
    if (act === 'ratesave'){
      const f = fdRateForm; if (!f.eff) return alert('기준일자를 선택해주세요.');
      const row = { eff_date: f.eff, updated_by: me, updated_at: new Date().toISOString() };
      for (const [k, n] of FD_RATE_COLS){ const t = String(f.v[k] ?? '').replace(/[^0-9.\-]/g, ''); if (t === '') { row[k] = null; continue; } const v = parseFloat(t); if (!isFinite(v) || v < 0 || v > 30) return alert(`${n} 금리를 확인해주세요 (0~30%).`); row[k] = Math.round(v * 1000) / 1000; }
      if (FD_RATE_COLS.every(([k]) => row[k] === null)) return alert('금리를 하나 이상 입력해주세요.');
      a.disabled = true; const { error } = await sb.from('fund_rates').upsert(row, { onConflict: 'eff_date' }); a.disabled = false;
      if (error) return alert('저장하지 못했어요: ' + error.message);
      toast('💾 금리표를 저장했어요'); fdRateForm = { eff: '', v: {} }; await loadFund(); return fdRerender();
    }
    if (act === 'save') return fdSave(a);
    if (act === 'delday'){ if (!confirm(`${fdDay} 기록을 삭제할까요?`)) return; const { error } = await sb.from('fund_days').delete().eq('day', fdDay); if (error) return alert(error.message); toast('삭제했어요'); fdDirty = false; await loadFund(); return renderFund(); }
    if (act === 'print') return fdPrint();
  });
  el.addEventListener('input', (e) => {
    const t = e.target, rf = t.dataset && t.dataset.rf;
    if (rf){ if (rf === 'eff') fdRateForm.eff = t.value; else fdRateForm.v[rf.slice(2)] = t.value; return; }
    const p = t.dataset && t.dataset.p; if (!p || !fdDraft) return;
    const ty = t.dataset.t; let v;
    if (ty === 'money'){ t.value = fdComma(t.value); v = fdMon(t.value); } else if (ty === 'check') v = t.checked; else v = t.value;
    fdSet(fdDraft, p, v); fdDirty = true;
    if (ty === 'check' || ty === 'date' || (t.tagName === 'SELECT')) { if (p.startsWith('s5.rows')) return fdRerender(); }
    fdRefresh();
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.rf){ fdRateForm.eff = e.target.dataset.rf === 'eff' ? e.target.value : fdRateForm.eff; return; }
    if (e.target.id === 'fdDate'){ const v = e.target.value; if (v) fdGo(v); return; }
    const t = e.target; if (t.dataset && t.dataset.p && (t.dataset.t === 'date' || t.tagName === 'SELECT' || t.dataset.t === 'check')){ if (t.dataset.p.startsWith('s5.rows')) fdRerender(); else fdRefresh(); }
  });
}
function fdRerender(){   // 구조가 바뀔 때만 다시 그림 (스크롤 위치 유지)
  const y = window.scrollY; renderFund(); window.scrollTo(0, y);
}
async function fdSave(btn){
  if (!debtCan()) return;
  btn.disabled = true;
  const row = { day: fdDay, data: fdDraft, updated_by: me, updated_at: new Date().toISOString() };
  const { error } = await sb.from('fund_days').upsert(row, { onConflict: 'day' });
  btn.disabled = false; if (error) return alert('저장하지 못했어요: ' + error.message);
  fdDirty = false; toast('💾 저장했어요'); await loadFund(); renderFund();
}

// ---------- 인쇄 (엑셀 자금운영현황 서식) ----------
function fdPrint(){
  const d = fdDraft, day = fdDay, c = fdCalc(d, day), w = fdW;
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif", link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const css = `@page{size:A4;margin:12mm 13mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:${font};color:#111;margin:0;padding:0 1px;font-size:11.5px;line-height:1.4}
  .org{font-size:13px;font-weight:700;letter-spacing:6px;color:#444}.title{margin-top:8px;border-top:5px solid #111;border-bottom:1px solid #111;padding:10px 0 7px;text-align:center}.title h1{font-size:22px;margin:0;letter-spacing:4px}.title .sub{margin-top:5px;color:#555;font-size:12px}
  h2{font-size:13px;margin:12px 0 4px;padding-left:8px;border-left:5px solid #111;page-break-after:avoid}h2 small{font-weight:500;color:#555;font-size:11px;margin-left:6px}
  table.t{width:calc(100% - 1px);border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:3px 6px;vertical-align:middle}table.t th{background:#eee;font-size:11px}
  .r{text-align:right}.c{text-align:center}.nw{white-space:nowrap}tr{page-break-inside:avoid}.tot td{font-weight:800;background:#f3f3f3}.sub td{font-weight:700;background:#fafafa}.past td{color:#b42318}.memo{border:1px solid #444;padding:6px 9px;white-space:pre-wrap;min-height:28px}`;
  const R = (n) => (n ? w(n) : '-'), txt = (s) => esc(s || '');
  const s1r = (r) => `<tr><td>${esc(r.label)}</td><td class="r nw">${R(c.s1.val(r))}</td><td class="c">${txt(d.s1.due[r.key])}</td><td>${txt(d.s1.note[r.key])}</td></tr>`;
  const s5rows = (scope) => d.s5.rows.filter(r => r.scope === scope && (r.name || fdN(r.amt))).sort((a, b) => (a.tbd || !a.date ? '9' : a.date).localeCompare(b.tbd || !b.date ? '9' : b.date));
  const s5tr = (r) => `<tr class="${!r.tbd && r.date && r.date < day ? 'past' : ''}"><td>${txt(r.name)}</td><td class="c">${txt(r.kind)}</td><td class="r nw">${R(fdN(r.amt))}</td><td class="c nw">${r.tbd || !r.date ? '미정' : esc(r.date)}</td><td>${txt(r.note)}</td></tr>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>자금운영현황</title>${link}<style>${css}</style></head><body>
  <div class="org">${esc(org)}</div><div class="title"><h1>자 금 운 영 현 황</h1><div class="sub">기준일자 : ${esc(day.slice(0, 4))}년 ${+day.slice(5, 7)}월 ${+day.slice(8, 10)}일 (${fdDow(day)})</div></div>
  <h2>1. 자금조달 및 운영 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:36%">계정과목</th><th style="width:22%">금 액</th><th style="width:16%">만기일</th><th>비 고</th></tr></thead><tbody>
    <tr class="sub"><td colspan="4">조달</td></tr>${FD_S1.src.map(s1r).join('')}<tr class="tot"><td>소 계</td><td class="r">${w(c.s1.srcSum)}</td><td></td><td></td></tr>
    <tr class="sub"><td colspan="4">운영</td></tr>${FD_S1.ops.map(s1r).join('')}<tr class="tot"><td>소 계</td><td class="r">${w(c.s1.opsSum)}</td><td></td><td></td></tr><tr class="tot"><td>차 액</td><td class="r">${w(c.s1.diff)}</td><td></td><td></td></tr></tbody></table>
  <h2>2. 중앙회 자금현황 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:36%">계정과목</th><th style="width:22%">금 액</th><th style="width:16%">만기일</th><th>금 리</th></tr></thead><tbody>
    ${d.s2.lump.map(r => `<tr><td>${txt(r.name)}</td><td class="r nw">${R(fdN(r.amt))}</td><td></td><td class="c">${txt(r.rate)}</td></tr>`).join('')}<tr class="sub"><td>소 계</td><td class="r">${w(c.s2.lump)}</td><td></td><td></td></tr>
    ${d.s2.term.filter(r => fdN(r.amt) || r.due).map(r => `<tr><td>정기예탁금(${esc(r.months)})</td><td class="r nw">${R(fdN(r.amt))}</td><td class="c nw">${txt(r.due)}</td><td class="c">${txt(r.rate)}</td></tr>`).join('')}<tr class="sub"><td>소 계 (정기예탁금)</td><td class="r">${w(c.s2.term)}</td><td></td><td></td></tr>
    <tr class="tot"><td>합 계</td><td class="r">${w(c.s2.total)}</td><td></td><td></td></tr><tr><td>여신 · 정기예탁금범위내대출</td><td class="r">${R(fdN(d.s2.loanIn))}</td><td></td><td></td></tr></tbody></table>
  <h2>3. 법인자금현황 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:22%">기 관</th><th style="width:14%">내 역</th><th style="width:22%">계 좌</th><th style="width:18%">금 액</th><th>적 요</th></tr></thead><tbody>
    ${d.s3.groups.map((g, gi) => g.rows.map((r, i) => `<tr><td>${i === 0 ? esc(g.name) : ''}</td><td class="c">${txt(r.kind)}</td><td class="c nw">${txt(r.acct)}</td><td class="r nw">${R(fdN(r.amt))}</td><td>${txt(r.memo)}</td></tr>`).join('') + `<tr class="sub"><td colspan="3">${esc(g.name)} 소 계</td><td class="r">${w(c.s3.g[gi])}</td><td></td></tr>`).join('')}
    <tr class="tot"><td colspan="3">합 계</td><td class="r">${w(c.s3.total)}</td><td></td></tr></tbody></table>
  ${d.s3.sched.filter(r => r.date || fdN(r.amt)).length ? `<div class="sub" style="margin-top:6px;font-weight:700">민관협력과 지출 일정</div><table class="t"><thead><tr><th style="width:24%">일 자</th><th style="width:24%">금 액</th><th>메 모</th></tr></thead><tbody>${d.s3.sched.filter(r => r.date || fdN(r.amt)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).map(r => `<tr><td class="c">${txt(r.date)}</td><td class="r">${R(fdN(r.amt))}</td><td>${txt(r.memo)}</td></tr>`).join('')}</tbody></table>` : ''}
  <h2>4. 대외예치금 현황 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:12%">구 분</th><th style="width:14%">내 역</th><th style="width:24%">계 좌</th><th style="width:18%">금 액</th><th style="width:14%">만기일</th><th>비 고</th></tr></thead><tbody>
    ${d.s4.rows.map(r => `<tr><td class="c">${txt(r.scope)}</td><td class="c">${txt(r.kind)}</td><td class="c nw">${txt(r.acct)}</td><td class="r nw">${R(fdN(r.amt))}</td><td class="c">${txt(r.due)}</td><td>${txt(r.note)}</td></tr>`).join('')}<tr class="tot"><td colspan="3">합 계</td><td class="r">${w(c.s4.total)}</td><td></td><td></td></tr></tbody></table>
  <h2>5. 대출 실행예정 현황 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:18%">성 명</th><th style="width:16%">과 목</th><th style="width:18%">금 액</th><th style="width:16%">실행예정일자</th><th>비 고</th></tr></thead><tbody>
    ${['본점', '지점'].map(sc => `<tr class="sub"><td colspan="5">${sc}</td></tr>${s5rows(sc).map(s5tr).join('')}<tr class="sub"><td>소 계</td><td class="c">${c.s5.by[sc].n}건</td><td class="r">${w(c.s5.by[sc].sum)}</td><td></td><td></td></tr>`).join('')}
    <tr class="tot"><td>합 계</td><td class="c">${c.s5.n}건</td><td class="r">${w(c.s5.total)}</td><td></td><td></td></tr></tbody></table>
  <h2>6. 자금집행 예정내역 <small>(단위 : 원)</small></h2><table class="t"><thead><tr><th style="width:18%">구 분</th><th style="width:34%">내 역</th><th style="width:20%">금 액</th><th>비 고</th></tr></thead><tbody>
    <tr><td>대출실행</td><td>${+day.slice(5, 7)}월분(미정분 미포함)</td><td class="r">${R(c.s6.loan)}</td><td>${txt(d.s6.loanNote)}</td></tr>
    ${d.s6.rows.filter(r => r.name || fdN(r.amt)).map(r => `<tr><td>${txt(r.kind)}</td><td>${txt(r.name)}</td><td class="r">${R(fdN(r.amt))}</td><td>${txt(r.note)}</td></tr>`).join('')}<tr class="tot"><td colspan="2">합 계</td><td class="r">${w(c.s6.total)}</td><td></td></tr></tbody></table>
  ${d.memo ? `<h2>7. 기타사항</h2><div class="memo">${esc(d.memo)}</div>` : ''}
  ${fdRates.filter(r => r.eff_date <= day).length ? `<h2>중앙회 금리표 <small>(기준일자별 · %)</small></h2><table class="t"><thead>${FD_RATE_HEAD('', '').replace(/border-bottom:1px solid var\(--line\)/, 'border-bottom:1px solid #444')}</thead><tbody>${fdRates.filter(r => r.eff_date <= day).slice(0, 4).map((r, i) => `<tr class="${i === 0 ? 'tot' : ''}"><td class="c nw">${esc(r.eff_date)}</td>${FD_RATE_COLS.map(([k]) => `<td class="c">${fdPct(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}</body></html>`;
  apPreview(html, '자금운영현황', `자금운영현황_${day}`);
}
