// 사후관리 > 연체채권관리 — 「연체채권 사후관리대장」 보고서 출력 (A4)
// 1) 대장 요약표(전 건 한눈에)  2) 채무자별 상세(기본정보 + 연락·방문 이력 전체 + 다음 조치)  — 둘 중 선택 / 둘 다.
// debt.js 의 전역(debtCases, dbDays, dbLogs, dbNext, nameOf, esc, kstToday, DEBT_ICON)과 appraisal.js 의 apPreview / apSettings / AP_FONT 를 함께 쓴다.

const dbrNum = (n) => n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('ko-KR');
const dbrDow = (d) => d ? ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T12:00:00Z').getUTCDay()] : '';
const dbrDate = (d) => d ? `${d} (${dbrDow(d)})` : '-';
const dbrNo = (c) => `채권-${String(c.id).padStart(4, '0')}`;
const dbrDays = (c) => c.status === '종결' ? '-' : dbDays(c) < 0 ? `D${dbDays(c)}` : `${dbDays(c).toLocaleString('ko-KR')}일`;

// opt: { status: 'active'|'closed'|'all', scope: 'all'|'본점'|'지점', summary: bool, detail: bool, from: '', to: '', ids: [id] | null }
function dbrReportHtml(opt){
  const today = kstToday();
  let cases = debtCases.filter(c => (opt.ids ? opt.ids.includes(c.id) : (opt.status === 'all' || (opt.status === 'closed' ? c.status === '종결' : c.status !== '종결')) && (opt.scope === 'all' || c.scope === opt.scope)));
  cases = [...cases].sort((a, b) => (a.status === '종결') - (b.status === '종결') || dbDays(b) - dbDays(a) || a.id - b.id);
  const org = (typeof apSettings !== 'undefined' && apSettings['본점'] && apSettings['본점'].org_name) || '춘천시산림조합';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const inRange = (l) => (!opt.from || l.log_date >= opt.from) && (!opt.to || l.log_date <= opt.to);
  const logsOf = (c) => dbLogs(c).filter(inRange).reverse();   // 대장은 오래된 것부터 시간순
  const condTxt = opt.ids ? '선택 건' : `${opt.status === 'all' ? '진행중·종결 전체' : opt.status === 'closed' ? '종결' : '진행중'} / ${opt.scope === 'all' ? '본점·지점' : opt.scope}`;
  const periodTxt = opt.detail && (opt.from || opt.to) ? ` · 이력 기간 ${opt.from || '처음'} ~ ${opt.to || '현재'}` : '';

  const head = (title, sub) => `<div class="top"><div class="org">${esc(org)}</div>
    <table class="sign"><tr><th>담당</th><th>과장</th><th>상무</th><th>전무</th><th>조합장</th></tr><tr><td></td><td></td><td></td><td></td><td></td></tr></table></div>
    <div class="title"><h1>${title}</h1><div class="sub">${sub}</div></div>`;

  // ---- 1) 대장 요약표 ----
  let summary = '';
  if (opt.summary){
    const act = cases.filter(c => c.status !== '종결');
    const sum = act.reduce((s, c) => s + Number(c.principal || 0), 0);
    const n30 = act.filter(c => dbDays(c) >= 30).length, n90 = act.filter(c => dbDays(c) >= 90).length;
    const late = act.filter(c => c.next_action_date && c.next_action_date < today).length;
    const rows = cases.map((c, i) => {
      const lg = dbLogs(c)[0], nx = c.status === '종결' ? null : c.next_action_date;
      return `<tr class="${c.status === '종결' ? 'end' : ''}"><td class="c">${i + 1}</td><td class="c">${esc(c.scope)}</td><td class="nm">${esc(c.debtor_name)}</td><td class="c">${esc(c.overdue_since)}</td><td class="r">${esc(dbrDays(c))}</td><td class="r">${esc(dbrNum(c.principal))}</td><td class="c">${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')}</td>
        <td>${lg ? `<b>${esc(lg.log_date.slice(5).replace('-', '/'))}</b> ${esc(lg.kind)}<div class="sm">${esc(lg.body)}</div>` : '<span class="mu">-</span>'}</td>
        <td>${c.status === '종결' ? `<span class="mu">종결${c.closed_at ? ' ' + esc(String(c.closed_at).slice(0, 10)) : ''}</span>` : nx ? `<b${nx < today ? ' class="lt"' : ''}>${esc(nx.slice(5).replace('-', '/'))}</b>${nx < today ? ' (지연)' : ''}${c.next_action_note ? `<div class="sm">${esc(c.next_action_note)}</div>` : ''}` : '<span class="mu">미정</span>'}</td></tr>`;
    }).join('');
    summary = `<div class="page">${head('연체채권 사후관리대장', `기준일 ${esc(today)} (${dbrDow(today)}) · ${esc(condTxt)}`)}
      <div class="sumbar"><span>대상 <b>${cases.length}건</b></span><span>진행중 <b>${act.length}건</b></span><span>연체원금 합계 <b>${esc(dbrNum(sum))}원</b></span><span>30일 이상 <b>${n30}건</b></span><span>90일 이상 <b>${n90}건</b></span><span>조치 지연 <b>${late}건</b></span></div>
      <table class="t led"><thead><tr><th style="width:5.5%;white-space:nowrap">번호</th><th style="width:6%">구분</th><th style="width:12%">채무자</th><th style="width:11%">연체기준일</th><th style="width:9%;white-space:nowrap">연체일수</th><th style="width:13%">연체원금(원)</th><th style="width:8%">담당자</th><th style="width:18%">최근 연락·방문</th><th style="width:17.5%">다음 조치 예정</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="c">해당하는 채권이 없습니다.</td></tr>'}</tbody></table>
      <div class="foot">※ 연체일수는 기준일(${esc(today)}) 현재 자동 계산한 값입니다. 상세 이력은 채무자별 상세 면을 참고하세요.</div></div>`;
  }

  // ---- 2) 채무자별 상세 ----
  let detail = '';
  if (opt.detail){
    detail = cases.map(c => {
      const logs = logsOf(c), closed = c.status === '종결', nx = closed ? null : dbNext(c);
      const lrows = logs.map((l, i) => `<tr><td class="c">${i + 1}</td><td class="c" style="white-space:nowrap">${esc(l.log_date)} (${dbrDow(l.log_date)})</td><td class="c">${esc(l.kind)}</td><td class="bd">${esc(l.body)}</td><td class="c">${esc(nameOf(l.created_by))}</td></tr>`).join('');
      return `<div class="page brk">${head('연체채권 사후관리 기록', `관리번호 <b>${esc(dbrNo(c))}</b> · 기준일 ${esc(today)} (${dbrDow(today)})`)}
        <div class="cust"><div><div class="l">채무자</div><div class="n">${esc(c.debtor_name)}</div></div><div class="tag">${esc(c.scope)} · ${closed ? '종결' : '진행중'}</div></div>
        <h2>기본 사항</h2>
        <table class="t"><tr><td class="k">연체기준일</td><td>${esc(dbrDate(c.overdue_since))}</td><td class="k">연체일수</td><td>${esc(dbrDays(c))}</td></tr>
          <tr><td class="k">연체 원금</td><td>${c.principal === null ? '-' : `${esc(dbrNum(c.principal))}원`}</td><td class="k">담당자</td><td>${esc(c.assignee_email ? nameOf(c.assignee_email) : '-')}</td></tr>
          <tr><td class="k">등록</td><td>${esc(nameOf(c.created_by))} · ${esc(String(c.created_at).slice(0, 10))}</td><td class="k">${closed ? '종결일' : '다음 조치 예정'}</td><td>${closed ? esc(c.closed_at ? String(c.closed_at).slice(0, 10) : '-') : c.next_action_date ? `${esc(dbrDate(c.next_action_date))}${nx && nx.d < 0 ? ` <b class="lt">(${nx.txt})</b>` : ''}${c.next_action_note ? `<div class="sm">${esc(c.next_action_note)}</div>` : ''}` : '미정'}</td></tr></table>
        ${c.memo ? `<h2>메모</h2><div class="memo">${esc(c.memo)}</div>` : ''}
        <h2>연락·방문 이력 <span class="cnt">(${logs.length}건${periodTxt ? ' · ' + (opt.from || '처음') + ' ~ ' + (opt.to || '현재') : ''})</span></h2>
        <table class="t log"><thead><tr><th style="width:6%">번호</th><th style="width:17%">일자</th><th style="width:9%">구분</th><th>내용</th><th style="width:11%">작성자</th></tr></thead>
        <tbody>${lrows || '<tr><td colspan="5" class="c" style="padding:14px">기록된 이력이 없습니다.</td></tr>'}</tbody></table>
        <div class="foot">출력일 ${esc(today)} · 출력자 ${esc(nameOf(me))}</div></div>`;
    }).join('');
  }

  const css = `@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;font-size:12px;line-height:1.4}
  .brk,.page+.page{page-break-before:always}
  .top{display:flex;justify-content:space-between;align-items:flex-start}.org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444;padding-top:4px}
  .sign{border-collapse:collapse;width:300px;table-layout:fixed}.sign td,.sign th{border:1px solid #333;text-align:center;font-size:11px;padding:0}.sign th{height:20px;background:#f3f3f3}.sign td{height:44px}
  .title{margin-top:14px;border-top:5px solid #111;border-bottom:1px solid #111;padding:12px 0 9px;text-align:center}
  .title h1{font-size:25px;margin:0;letter-spacing:4px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  .sumbar{display:flex;flex-wrap:wrap;gap:4px 18px;margin:10px 0 8px;padding:7px 12px;border:1px solid #444;background:#f7f7f7;font-size:12px}.sumbar b{font-size:13px}
  table.t{width:100%;border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:4px 7px;vertical-align:middle}
  table.t th{background:#eee;text-align:center;font-weight:700;font-size:11.5px}table.t td.k{background:#f3f3f3;font-weight:700;text-align:center;white-space:nowrap;width:15%;font-size:12px}
  table.led td{font-size:11.5px}table.led td.nm{font-weight:700}.c{text-align:center}.r{text-align:right}tr{page-break-inside:avoid}thead{display:table-header-group}
  tr.end td{background:#f4f4f4;color:#666}.sm{font-size:10.5px;color:#444;margin-top:1px;word-break:break-all}.mu{color:#888}.lt{color:#b42318}
  .cust{margin-top:12px;border:2px solid #111;padding:10px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .cust .l{font-size:12px;color:#555;margin-bottom:3px}.cust .n{font-size:23px;font-weight:800;letter-spacing:1px;word-break:keep-all}
  .cust .tag{border:1.5px solid #111;border-radius:99px;padding:3px 14px;font-weight:700;font-size:13px;white-space:nowrap}
  h2{font-size:13.5px;margin:13px 0 5px;padding-left:9px;border-left:5px solid #111}h2 .cnt{font-size:11.5px;font-weight:500;color:#555}
  .memo{border:1px solid #444;padding:6px 10px;white-space:pre-wrap;min-height:26px}
  table.log td.bd{white-space:pre-wrap;word-break:break-all}
  .foot{margin-top:10px;font-size:11px;color:#666;text-align:center}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>연체채권 사후관리대장</title>${link}<style>${css}</style></head><body>${summary}${detail}</body></html>`;
}

function dbrPrint(opt){
  const html = dbrReportHtml(opt);
  apPreview(html, opt.ids ? '연체채권 사후관리 기록' : '연체채권 사후관리대장', opt.ids ? `사후관리_${(debtCases.find(c => c.id === opt.ids[0]) || {}).debtor_name || ''}` : `사후관리대장_${kstToday()}`);
}

// ---------- 출력 옵션 창 ----------
function dbrOpenDialog(){
  let ov = document.getElementById('dbrOv');
  if (!ov){
    ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'dbrOv'; ov.style.zIndex = '35';
    ov.innerHTML = `<div class="panel" style="max-width:480px"><div class="ph"><h2>🖨 사후관리대장 출력</h2><button class="x" data-r="close">✕</button></div>
      <label>대상</label><div class="checks"><label><input type="radio" name="dbrSt" value="active" checked /> 진행중</label><label><input type="radio" name="dbrSt" value="closed" /> 종결</label><label><input type="radio" name="dbrSt" value="all" /> 전체</label></div>
      <label style="margin-top:10px">구분</label><div class="checks"><label><input type="radio" name="dbrSc" value="all" checked /> 본점·지점</label><label><input type="radio" name="dbrSc" value="본점" /> 본점</label><label><input type="radio" name="dbrSc" value="지점" /> 지점</label></div>
      <label style="margin-top:10px">출력 내용</label><div class="checks"><label><input type="checkbox" id="dbrSum" checked /> 대장 요약표</label><label><input type="checkbox" id="dbrDet" checked /> 채무자별 상세 (연락·방문 이력)</label></div>
      <label style="margin-top:10px">이력 기간 <span class="muted" style="font-weight:400">(비우면 전체)</span></label><div style="display:flex;gap:8px;align-items:center"><input type="date" id="dbrFrom" /> ~ <input type="date" id="dbrTo" /></div>
      <div class="muted" id="dbrCnt" style="margin-top:10px;font-size:13px"></div>
      <div class="acts" style="margin-top:14px"><button class="btn" data-r="close">취소</button><button class="btn primary" data-r="go">보고서 보기</button></div></div>`;
    document.body.appendChild(ov);
    const cnt = () => {
      const st = ov.querySelector('[name=dbrSt]:checked').value, sc = ov.querySelector('[name=dbrSc]:checked').value;
      const n = debtCases.filter(c => (st === 'all' || (st === 'closed' ? c.status === '종결' : c.status !== '종결')) && (sc === 'all' || c.scope === sc)).length;
      ov.querySelector('#dbrCnt').textContent = `출력 대상 ${n}건`;
    };
    ov.addEventListener('change', cnt); ov._cnt = cnt;
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-r=close]')) return ov.style.display = 'none';
      if (!e.target.closest('[data-r=go]')) return;
      const q = (s) => ov.querySelector(s);
      const opt = { status: q('[name=dbrSt]:checked').value, scope: q('[name=dbrSc]:checked').value, summary: q('#dbrSum').checked, detail: q('#dbrDet').checked, from: q('#dbrFrom').value, to: q('#dbrTo').value, ids: null };
      if (!opt.summary && !opt.detail) return alert('출력할 내용을 하나 이상 선택해주세요.');
      if (opt.from && opt.to && opt.from > opt.to) return alert('이력 기간의 시작일이 종료일보다 늦어요.');
      if (!debtCases.some(c => (opt.status === 'all' || (opt.status === 'closed' ? c.status === '종결' : c.status !== '종결')) && (opt.scope === 'all' || c.scope === opt.scope))) return alert('출력할 채권이 없어요.');
      ov.style.display = 'none'; dbrPrint(opt);
    });
  }
  ov.style.display = 'block'; ov._cnt();
}
