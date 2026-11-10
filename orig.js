// 현황판 > 💰 신규대출 취급 현황 (주 단위 본점·지점 취급액, 연 누계)
// 저장 단위: 백만원 (perf_orig: 주 시작일=월요일 / perf_year.orig_hq_t·orig_br_t = 연 취급 목표). 입력은 관리자만, 조회는 팀원 전체.
// 의존: perf.js (perfYears, pfAlpha, pfNice, pfNm, pfSg, renderPerf), index.html ($, esc, sb, me, isAdmin, toast, kstToday)
let perfOrig = [], pfoYear = null, pfoTable = false;
const PFO_HQ = '#0f8f63', PFO_BR = '#7bd3b0', PFO_CUM = '#16181d';   // 본점 진한 청록 · 지점 연한 청록(여신 색 계열) · 누계 선은 잉크색
const pfoAdd = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const pfoMon = (iso) => pfoAdd(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));   // 그 날짜가 속한 주의 월요일
const pfoMD = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const pfoWk = (w) => `${pfoMD(w)}~${pfoMD(pfoAdd(w, 6))}`;
const pfoE = (n, dec = 1) => `${(Number(n) / 100).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: dec })}억원`;
const pfoNum = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d) : null; };
const pfoComma = (s) => { const d = String(s ?? '').replace(/[^0-9]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; };
function pfoWeeks(year){   // 그 해에 속하는 주(월요일이 그 해인 주). 예: 2026년 = 1/5(월) ~ 12/28(월)
  let w = pfoMon(`${year}-01-01`); if (w < `${year}-01-01`) w = pfoAdd(w, 7);
  const out = []; for (; w <= `${year}-12-31`; w = pfoAdd(w, 7)) out.push(w);
  return out;
}
const pfoThisWeek = () => pfoMon(kstToday());

async function loadOrig(){
  const r = await sb.from('perf_orig').select('*').order('week_start', { ascending: true });
  if (r.error){ console.warn('신규취급 불러오기 실패', r.error.message); return; }
  perfOrig = r.data || [];
}
// 한 해의 주별 값·누계·합계
function pfoYearData(year){
  const map = new Map(perfOrig.map(r => [r.week_start, r])), weeks = pfoWeeks(year);
  let cum = 0, last = -1;
  const rows = weeks.map((w, i) => { const r = map.get(w), hq = r ? Number(r.hq) : 0, br = r ? Number(r.br) : 0; cum += hq + br; if (r) last = i; return { w, i, has: !!r, hq, br, tot: hq + br, cum, memo: r && r.memo }; });
  const Y = perfYears[year] || {}, tHq = Y.orig_hq_t === null || Y.orig_hq_t === undefined ? null : Number(Y.orig_hq_t), tBr = Y.orig_br_t === null || Y.orig_br_t === undefined ? null : Number(Y.orig_br_t);
  return { year, rows, last, hq: rows.reduce((s, r) => s + r.hq, 0), br: rows.reduce((s, r) => s + r.br, 0), tHq, tBr, tgt: tHq !== null && tBr !== null ? tHq + tBr : (tHq ?? tBr), count: rows.filter(r => r.has).length };
}
const pfoMonthly = (d) => { const m = Array.from({ length: 12 }, () => ({ hq: 0, br: 0, n: 0 })); d.rows.forEach(r => { if (!r.has) return; const k = +r.w.slice(5, 7) - 1; m[k].hq += r.hq; m[k].br += r.br; m[k].n++; }); return m; };   // 월 = 주 시작일(월요일)이 속한 달

function pfOrigHtml(){
  if (!pfoYear) pfoYear = +kstToday().slice(0, 4);
  const adm = isAdmin(), D = pfoYearData(pfoYear), P = pfoYearData(pfoYear - 1), tot = D.hq + D.br;
  const chip = (l, v) => `<div class="pfchip"><span>${l}</span><b>${v}</b></div>`;
  let chips = '';
  if (!D.count){
    chips = `<div class="pfsub" style="font-size:13px;line-height:1.6">${adm ? `${pfoYear}년 주간 취급액이 아직 없어요. “📋 전체 입력”에서 올해 주차별 취급액을 한 번에 입력하거나, “＋ 주간 입력”으로 한 주씩 넣을 수 있어요.` : '아직 입력된 취급액이 없어요. 관리자가 입력하면 여기에 표시돼요.'}</div>`;
  } else {
    const lastR = D.rows[D.last], prevR = D.last > 0 ? D.rows[D.last - 1] : null, avg = tot / D.count;
    chips += chip(`${pfoYear}년 누계 <em class="pfem">${D.count}주</em>`, pfoE(tot)) + chip('본점', `<span style="color:${PFO_HQ}">${pfoE(D.hq)}</span>`) + chip('지점', pfoE(D.br));
    if (D.tgt !== null && D.tgt > 0) chip && (chips += chip(`연 목표 ${pfoE(D.tgt, 0)}`, `<span class="${tot >= D.tgt ? 'gd' : 'tg'}">${(tot / D.tgt * 100).toFixed(1)}%</span>`));
    chips += chip(`최근 주 <em class="pfem">${pfoWk(lastR.w)}</em>`, `${pfoE(lastR.tot)}${prevR && prevR.has ? ` <span class="${lastR.tot - prevR.tot >= 0 ? 'gd' : 'bd'}">(${lastR.tot - prevR.tot >= 0 ? '+' : '▲'}${pfoE(Math.abs(lastR.tot - prevR.tot))})</span>` : ''}`) + chip('주 평균', pfoE(avg));
    if (P.count){ const pc = P.rows[Math.min(D.last, P.rows.length - 1)].cum, df = D.rows[D.last].cum - pc; chips += chip(`${pfoYear - 1}년 같은 주까지`, `<span class="${df >= 0 ? 'gd' : 'bd'}">${df >= 0 ? '+' : '▲'}${pfoE(Math.abs(df))}</span> <em class="pfem">(${pfoE(pc)})</em>`); }
  }
  const mon = pfoMonthly(D), mrows = mon.map((m, i) => { let cum = 0; for (let k = 0; k <= i; k++) cum += mon[k].hq + mon[k].br; return `<tr><td class="l">${i + 1}월</td><td>${m.n ? pfoE(m.hq) : '-'}</td><td>${m.n ? pfoE(m.br) : '-'}</td><td><b>${m.n ? pfoE(m.hq + m.br) : '-'}</b></td><td>${m.n ? pfoE(cum) : '-'}</td></tr>`; }).join('');
  const wrows = [...D.rows].reverse().filter(r => r.has).map(r => `<tr><td class="l">${r.i + 1}주</td><td style="text-align:left">${pfoWk(r.w)}</td><td>${pfoE(r.hq)}</td><td>${pfoE(r.br)}</td><td><b>${pfoE(r.tot)}</b></td><td>${pfoE(r.cum)}</td></tr>`).join('');
  const tbl = pfoTable ? `<div class="pfm"><table class="pft" style="min-width:0"><thead><tr><th>월</th><th>본점</th><th>지점</th><th>합계</th><th>누계</th></tr></thead><tbody>${mrows}</tbody></table></div>
    <div class="pfnote">※ 월은 주 시작일(월요일)이 속한 달로 집계해요.</div>
    ${wrows ? `<div class="pfm"><table class="pft" style="min-width:0"><thead><tr><th>주차</th><th>기간</th><th>본점</th><th>지점</th><th>합계</th><th>누계</th></tr></thead><tbody>${wrows}</tbody></table></div>` : ''}` : '';
  return `<div class="pfcard" id="pfoCard" style="margin-top:14px">
    <div class="pfh"><b>💰 신규대출 취급 현황</b><span class="pftag">${pfoYear}년</span><span class="m" style="color:var(--muted);font-size:13px">단위: 억원 · 주 단위(월~일)</span><span class="sp"></span>
      <span class="pfnav"><button data-po="prev" title="이전 연도">◀</button><button data-po="next" title="다음 연도">▶</button></span>${adm ? '<button class="btn small primary" data-po="week">＋ 주간 입력</button><button class="btn small" data-po="all">📋 전체 입력</button>' : ''}</div>
    <div class="pfchips">${chips}</div>
    ${D.count || adm ? `<div class="pfolegend"><span><i style="background:${PFO_HQ}"></i>본점</span><span><i style="background:${PFO_BR}"></i>지점</span><span><i class="ln" style="background:${PFO_CUM}"></i>누계</span>${D.tgt ? '<span><i class="ln dash"></i>연 목표</span>' : ''}</div>` : ''}
    <div id="pfoChart" class="pfd-chart" style="min-height:${D.count ? 320 : 0}px"></div>
    ${D.count ? `<div style="margin-top:6px"><button class="btn small" data-po="table" style="min-height:30px;padding:3px 12px;font-size:12.5px">${pfoTable ? '표 닫기' : '표로 보기'}</button></div>${tbl}` : ''}</div>`;
}

// 주별 막대(본점+지점 쌓기) + 아래에 누계 선(+연 목표선, 전년 누계 옅은 선). 두 차트가 같은 가로축(주차)을 쓰고, 마우스를 올리면 같은 주를 함께 가리킨다
function pfOrigDraw(){
  const box = $('pfoChart'); if (!box) return;
  const D = pfoYearData(pfoYear); if (!D.count){ box.innerHTML = ''; return; }
  const P = pfoYearData(pfoYear - 1), W = Math.max(300, box.clientWidth || 700), n = D.rows.length, l = 54, r = 16, t = 14, b = 24, H1 = W < 520 ? 150 : 170, gap = 34, H2 = W < 520 ? 130 : 150, H = t + H1 + gap + H2 + b;
  const x0 = (i) => l + (W - l - r) * (i + .5) / n, bw = Math.max(2, (W - l - r) / n * .66);
  const mx1 = Math.max(...D.rows.map(q => q.tot), 1), n1 = pfNice(0, mx1 * 1.08, 3), y1 = (v) => t + H1 * (1 - v / n1.b);
  const cumMax = Math.max(D.rows[n - 1].cum, D.tgt || 0, P.count ? P.rows[n - 1 > P.rows.length - 1 ? P.rows.length - 1 : n - 1].cum : 0, 1), n2 = pfNice(0, cumMax * 1.06, 3), top2 = t + H1 + gap, y2 = (v) => top2 + H2 * (1 - v / n2.b);
  const fmtT = (v) => (v / 100).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  let g = '';
  n1.t.forEach(v => { g += `<line x1="${l}" x2="${W - r}" y1="${y1(v).toFixed(1)}" y2="${y1(v).toFixed(1)}" stroke="#edeff4"/><text x="${l - 8}" y="${(y1(v) + 4).toFixed(1)}" font-size="11" fill="#8a90a0" text-anchor="end">${fmtT(v)}</text>`; });
  n2.t.forEach(v => { g += `<line x1="${l}" x2="${W - r}" y1="${y2(v).toFixed(1)}" y2="${y2(v).toFixed(1)}" stroke="#edeff4"/><text x="${l - 8}" y="${(y2(v) + 4).toFixed(1)}" font-size="11" fill="#8a90a0" text-anchor="end">${fmtT(v)}</text>`; });
  g += `<text x="${l}" y="${t - 3}" font-size="11" font-weight="700" fill="#44546f">주별 취급액 (억원)</text><text x="${l}" y="${top2 - 6}" font-size="11" font-weight="700" fill="#44546f">연 누계 (억원)</text>`;
  D.rows.forEach(q => { if (!q.has) return; const hh = y1(0) - y1(q.hq), hb = y1(0) - y1(q.br); g += `<rect x="${(x0(q.i) - bw / 2).toFixed(1)}" y="${(y1(0) - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hh).toFixed(1)}" fill="${PFO_HQ}"/><rect x="${(x0(q.i) - bw / 2).toFixed(1)}" y="${(y1(0) - hh - hb).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, hb).toFixed(1)}" fill="${PFO_BR}"/>`; });
  // 월 눈금 (그 달 첫 주)
  let pm = -1; D.rows.forEach(q => { const m = +q.w.slice(5, 7); if (m !== pm){ pm = m; g += `<text x="${x0(q.i).toFixed(1)}" y="${H - 6}" font-size="11" fill="#8a90a0" text-anchor="middle">${m}월</text>`; } });
  if (P.count) { const pp = P.rows.slice(0, n).map((q, i) => `${x0(i).toFixed(1)},${y2(q.cum).toFixed(1)}`).join(' '); g += `<polyline points="${pp}" fill="none" stroke="#b9bfcc" stroke-width="1.5"/>`; }
  if (D.tgt) g += `<line x1="${l}" x2="${W - r}" y1="${y2(D.tgt).toFixed(1)}" y2="${y2(D.tgt).toFixed(1)}" stroke="#16181d" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - r}" y="${(y2(D.tgt) - 5).toFixed(1)}" font-size="11" font-weight="700" fill="#44546f" text-anchor="end">연 목표 ${fmtT(D.tgt)}억</text>`;
  const upto = D.rows.slice(0, D.last + 1), pts = upto.map(q => `${x0(q.i).toFixed(1)},${y2(q.cum).toFixed(1)}`).join(' ');
  if (upto.length > 1) g += `<polyline points="${pts}" fill="none" stroke="${PFO_CUM}" stroke-width="2.2" stroke-linejoin="round"/>`;
  const e = D.rows[D.last]; g += `<circle cx="${x0(e.i).toFixed(1)}" cy="${y2(e.cum).toFixed(1)}" r="6" fill="#fff"/><circle cx="${x0(e.i).toFixed(1)}" cy="${y2(e.cum).toFixed(1)}" r="4" fill="${PFO_CUM}"/><text x="${Math.min(W - r, x0(e.i) + 2).toFixed(1)}" y="${(y2(e.cum) - 11).toFixed(1)}" font-size="12.5" font-weight="800" fill="#16181d" text-anchor="${x0(e.i) > W - 90 ? 'end' : 'middle'}">${fmtT(e.cum)}억</text>`;
  g += `<g id="pfoXh" style="display:none"><line id="pfoXhL" y1="${t}" y2="${H - b}" stroke="#16181d" stroke-opacity=".25"/></g><rect id="pfoHit" x="${l}" y="0" width="${W - l - r}" height="${H - b + 4}" fill="transparent" tabindex="0" role="img" aria-label="주별 신규대출 취급액 — 좌우 방향키로 값을 확인해요" style="outline:none;cursor:crosshair"/>`;
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${g}</svg><div id="pfoTip" class="pftip" style="display:none"></div>`;
  const hit = $('pfoHit'), tip = $('pfoTip');
  const show = (i) => {
    i = Math.max(0, Math.min(n - 1, i)); const q = D.rows[i], px = x0(i);
    $('pfoXh').style.display = ''; $('pfoXhL').setAttribute('x1', px); $('pfoXhL').setAttribute('x2', px);
    tip.innerHTML = ''; const add = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; tip.appendChild(d); };
    add('pftd', `${i + 1}주 (${pfoWk(q.w)})`);
    if (q.has){ add('pftv', `합계 ${pfoE(q.tot)}`); add('pftd2', `본점 ${pfoE(q.hq)} · 지점 ${pfoE(q.br)}`); add('pftd2', `누계 ${pfoE(q.cum)}${q.memo ? ' · ' + q.memo : ''}`); } else add('pftd2', '입력 없음');
    tip.style.display = 'block'; const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(W - tw - 4, px - tw / 2)) + 'px'; tip.style.top = '4px'; hit._i = i;
  };
  const hide = () => { $('pfoXh').style.display = 'none'; tip.style.display = 'none'; };
  hit.addEventListener('pointermove', (ev) => { const bx = box.getBoundingClientRect(); show(Math.floor((ev.clientX - bx.left - l) / ((W - l - r) / n))); });
  hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide); hit.addEventListener('focus', () => show(D.last));
  hit.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight'){ ev.preventDefault(); show((hit._i ?? D.last) + (ev.key === 'ArrowRight' ? 1 : -1)); } });
}

(function(){
  const st = document.createElement('style'); st.textContent = `
  .pfolegend{ display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:12.5px; color:#5a6172; font-weight:600; } .pfolegend i{ display:inline-block; width:11px; height:11px; border-radius:3px; margin-right:5px; vertical-align:-1px; } .pfolegend i.ln{ height:3px; border-radius:2px; width:16px; vertical-align:3px; } .pfolegend i.dash{ background:repeating-linear-gradient(90deg,#16181d 0 5px,transparent 5px 9px); }
  .pfoGrid{ max-height:46vh; overflow:auto; border:1px solid var(--line); border-radius:14px; } .pfoGrid table{ width:100%; border-collapse:collapse; font-size:13.5px; font-variant-numeric:tabular-nums; } .pfoGrid th{ position:sticky; top:0; background:#f3f5fa; z-index:1; font-size:12px; color:#5a6172; padding:7px 8px; }
  .pfoGrid td{ padding:3px 6px; border-top:1px solid #eef0f5; } .pfoGrid td.k{ white-space:nowrap; color:#44546f; font-weight:700; } .pfoGrid input{ width:100%; min-width:70px; text-align:right; padding:6px 8px; font-size:13.5px; } .pfoGrid tr.cur td.k{ color:var(--accent); } .pfoGrid tr.future td{ opacity:.55; }`;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.innerHTML = `<div class="ov" id="pfOvOw"><div class="panel" style="max-width:480px" id="pfOwPanel"></div></div><div class="ov" id="pfOvOa"><div class="panel" style="max-width:640px" id="pfOaPanel"></div></div>`;
  document.body.appendChild(d);
  $('pfOvOw').addEventListener('click', (e) => { if (e.target === $('pfOvOw')) $('pfOvOw').style.display = 'none'; });
  $('pfOvOa').addEventListener('click', (e) => { if (e.target === $('pfOvOa')) $('pfOvOa').style.display = 'none'; });
  $('perf').addEventListener('click', (e) => {
    const b = e.target.closest('[data-po]'); if (!b) return; const a = b.dataset.po;
    if (a === 'prev'){ pfoYear--; renderPerf(); } else if (a === 'next'){ pfoYear++; renderPerf(); }
    else if (a === 'table'){ pfoTable = !pfoTable; renderPerf(); }
    else if (a === 'week') pfoOpenWeek(); else if (a === 'all') pfoOpenAll();
  });
})();
const pfoClose = (id) => { $(id).style.display = 'none'; document.body.style.overflow = ''; };

// ---------- 주간 입력: 한 주씩 ----------
function pfoOpenWeek(week){
  if (!isAdmin()) return;
  const y = pfoYear || +kstToday().slice(0, 4), weeks = pfoWeeks(y), map = new Map(perfOrig.map(r => [r.week_start, r]));
  // 기본 선택: 올해라면 아직 입력 안 된 가장 이른 지난 주(없으면 이번 주), 아니면 첫 주
  const thisW = pfoThisWeek(); let def = week || (weeks.find(w => w < thisW && !map.has(w)) || weeks.filter(w => w <= thisW).pop() || weeks[0]);
  $('pfOwPanel').innerHTML = `<div class="ph"><h2>＋ 주간 취급액 입력</h2><button class="x" data-o="close">✕</button></div>
    <div class="pfsub">단위: 백만원 · 본점/지점 각각 그 주의 신규대출 취급액이에요 (월~일 기준)</div>
    <label>주차 (${y}년)</label><select id="powWeek">${weeks.map((w, i) => `<option value="${w}" ${w === def ? 'selected' : ''}>${i + 1}주 · ${pfoWk(w)}${map.has(w) ? ' ✓입력됨' : ''}${w === thisW ? ' (이번 주)' : ''}</option>`).join('')}</select>
    <div class="pfform" style="margin-top:6px"><div><label>본점 (백만원)</label><input id="powHq" inputmode="numeric" placeholder="0" /></div><div><label>지점 (백만원)</label><input id="powBr" inputmode="numeric" placeholder="0" /></div></div>
    <label>메모 <span class="muted" style="font-weight:400">(선택)</span></label><input id="powMemo" maxlength="200" placeholder="예: 연휴 주간" style="text-align:left" />
    <div class="muted" id="powNote" style="font-size:12.5px;margin-top:8px"></div>
    <div class="acts" style="margin-top:18px"><button class="btn primary" data-o="save" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-o="close" style="min-height:44px">취소</button><span style="flex:1"></span><button class="btn danger small" data-o="del" id="powDel" style="display:none">이 주 삭제</button></div>`;
  const fill = () => { const r = map.get($('powWeek').value); $('powHq').value = r ? Number(r.hq).toLocaleString('ko-KR') : ''; $('powBr').value = r ? Number(r.br).toLocaleString('ko-KR') : ''; $('powMemo').value = r && r.memo ? r.memo : ''; $('powDel').style.display = r ? '' : 'none'; $('powNote').textContent = r ? `이미 입력된 주예요 (${String(r.updated_at).slice(0, 10)} · 수정하면 덮어써요)` : ''; };
  fill(); $('powWeek').onchange = fill; ['powHq', 'powBr'].forEach(id => { $(id).oninput = () => { $(id).value = pfoComma($(id).value); }; });
  $('pfOvOw').style.display = 'block'; document.body.style.overflow = 'hidden';
}
$('pfOwPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-o]'); if (!b) return;
  if (b.dataset.o === 'close') return pfoClose('pfOvOw');
  const w = $('powWeek').value;
  if (b.dataset.o === 'del'){
    if (!confirm(`${pfoWk(w)} 주 취급액을 삭제할까요?`)) return;
    const { error } = await sb.from('perf_orig').delete().eq('week_start', w); if (error) return alert(error.message);
    pfoClose('pfOvOw'); toast('삭제했어요'); return loadPerf();
  }
  const hq = pfoNum($('powHq').value), br = pfoNum($('powBr').value);
  if (hq === null && br === null) return alert('본점·지점 중 하나 이상 입력해주세요. (없으면 0)');
  b.disabled = true;
  const { error } = await sb.from('perf_orig').upsert({ week_start: w, hq: hq || 0, br: br || 0, memo: $('powMemo').value.trim() || null, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: 'week_start' });
  b.disabled = false; if (error) return alert(error.message);
  pfoClose('pfOvOw'); toast(`💰 ${pfoWk(w)} 취급액을 저장했어요`); await loadPerf();
});

// ---------- 전체 입력: 한 해 전체를 표로 (엑셀 붙여넣기 지원) ----------
function pfoOpenAll(){
  if (!isAdmin()) return;
  const y = pfoYear || +kstToday().slice(0, 4), weeks = pfoWeeks(y), map = new Map(perfOrig.map(r => [r.week_start, r])), thisW = pfoThisWeek();
  $('pfOaPanel').innerHTML = `<div class="ph"><h2>📋 ${y}년 취급액 전체 입력</h2><button class="x" data-o="close">✕</button></div>
    <div class="pfsub">단위: 백만원 · 주 시작일(월요일) 기준 ${weeks.length}주. 비워 두면 그 주는 입력 없음으로 둬요 (0을 입력하면 0으로 기록)</div>
    <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700;font-size:13.5px">📎 엑셀에서 복사해 붙여넣기</summary>
      <div class="pfsub" style="margin:6px 0">한 줄에 한 주: <b>날짜 &nbsp;본점 &nbsp;지점</b> (탭·쉼표·공백 구분). 날짜는 <b>2026-01-05</b>, <b>1/5</b>, <b>1.5</b> 형식 모두 가능하고 그 날짜가 속한 주에 들어가요. 날짜 없이 <b>본점 지점</b> 두 숫자만 붙이면 1주차부터 순서대로 채워요.</div>
      <textarea id="poaPaste" rows="5" placeholder="2026-01-05\t1,200\t800&#10;2026-01-12\t950\t610"></textarea><div class="dbline" style="margin-top:6px"><button class="btn small" data-o="apply">표에 채우기</button><span class="muted" id="poaMsg" style="font-size:12.5px"></span></div></details>
    <div class="pfoGrid" style="margin-top:10px"><table><thead><tr><th style="width:62px">주차</th><th>기간</th><th>본점</th><th>지점</th></tr></thead><tbody>${weeks.map((w, i) => { const r = map.get(w); return `<tr data-w="${w}" class="${w === thisW ? 'cur' : ''} ${w > thisW ? 'future' : ''}"><td class="k">${i + 1}주</td><td class="k">${pfoWk(w)}</td><td><input data-c="hq" inputmode="numeric" value="${r ? Number(r.hq).toLocaleString('ko-KR') : ''}" /></td><td><input data-c="br" inputmode="numeric" value="${r ? Number(r.br).toLocaleString('ko-KR') : ''}" /></td></tr>`; }).join('')}</tbody></table></div>
    <div class="acts" style="margin-top:14px"><button class="btn primary" data-o="saveall" style="min-height:44px;padding:8px 26px">저장</button><button class="btn" data-o="close" style="min-height:44px">취소</button><span class="muted" id="poaCnt" style="font-size:12.5px"></span></div>`;
  $('pfOaPanel').dataset.year = y;
  $('pfOvOa').style.display = 'block'; document.body.style.overflow = 'hidden'; pfoAllCount();
}
function pfoAllCount(){ const rows = [...document.querySelectorAll('#pfOaPanel tr[data-w]')], n = rows.filter(tr => tr.querySelector('[data-c=hq]').value.trim() || tr.querySelector('[data-c=br]').value.trim()).length; $('poaCnt').textContent = `입력된 주 ${n}개`; }
function pfoParsePaste(text, year){   // → [{ w: 월요일 ISO | null, hq, br }]
  const out = [];
  String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
    const tokens = (line.includes('\t') ? line.split('\t') : /\s/.test(line) ? line.split(/\s*,\s+|\s+/) : line.split(',')).map(x => x.trim()).filter(Boolean);
    const dm = tokens.length >= 3 && tokens[0].match(/^(?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})$/);
    let w = null, nums = tokens;
    if (dm){ const yy = dm[1] ? +dm[1] : year, d = `${yy}-${String(+dm[2]).padStart(2, '0')}-${String(+dm[3]).padStart(2, '0')}`; if (!isNaN(Date.parse(d))) w = pfoMon(d); nums = tokens.slice(1); }
    const v = nums.map(s => pfoNum(s)); if (v.length < 2 || v[0] === null || v[1] === null) return;
    out.push({ w, hq: v[0], br: v[1] });
  });
  return out;
}
$('pfOaPanel').addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.c){ t.value = pfoComma(t.value); pfoAllCount(); } });
$('pfOaPanel').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-o]'); if (!b) return;
  const year = +$('pfOaPanel').dataset.year;
  if (b.dataset.o === 'close') return pfoClose('pfOvOa');
  if (b.dataset.o === 'apply'){
    const list = pfoParsePaste($('poaPaste').value, year), trs = [...document.querySelectorAll('#pfOaPanel tr[data-w]')]; let n = 0, skip = 0, seq = 0;
    list.forEach(it => { const tr = it.w ? trs.find(x => x.dataset.w === it.w) : trs[seq++]; if (!tr){ skip++; return; } tr.querySelector('[data-c=hq]').value = Number(it.hq).toLocaleString('ko-KR'); tr.querySelector('[data-c=br]').value = Number(it.br).toLocaleString('ko-KR'); n++; });
    $('poaMsg').textContent = list.length ? `${n}주를 채웠어요${skip ? ` (${year}년에 없는 주 ${skip}줄 제외)` : ''}. 확인 후 저장을 눌러주세요.` : '읽을 수 있는 줄이 없어요. 형식을 확인해주세요.'; pfoAllCount(); return;
  }
  if (b.dataset.o === 'saveall'){
    const rows = [...document.querySelectorAll('#pfOaPanel tr[data-w]')].map(tr => ({ w: tr.dataset.w, hq: pfoNum(tr.querySelector('[data-c=hq]').value), br: pfoNum(tr.querySelector('[data-c=br]').value) })).filter(x => x.hq !== null || x.br !== null);
    if (!rows.length) return alert('입력된 값이 없어요.');
    b.disabled = true;
    const { error } = await sb.from('perf_orig').upsert(rows.map(x => ({ week_start: x.w, hq: x.hq || 0, br: x.br || 0, updated_by: me, updated_at: new Date().toISOString() })), { onConflict: 'week_start' });
    b.disabled = false; if (error) return alert(error.message);
    pfoClose('pfOvOa'); toast(`💰 ${year}년 ${rows.length}주 취급액을 저장했어요`); await loadPerf();
  }
});
