// 대출 미진행 건 — 서류 보관용 커버페이지 (A4 한 장). 개인정보 동의서·대출신청서 스캔본을 자체 보관할 때 맨 앞에 끼우는 표지.
// index.html 의 전역(esc, nameOf, stepsOf)과 appraisal.js 의 apPreview / apSettings / AP_FONT 를 함께 쓴다.

const cvDay = (iso) => iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : '';
const cvDow = (d) => d ? ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T12:00:00Z').getUTCDay()] : '';
const cvDate = (iso) => { const d = cvDay(iso); return d ? `${d} (${cvDow(d)})` : '-'; };

function loanCoverHtml(t){
  const steps = stepsOf(t), ds = steps.find(s => s.seq === t.dropped_step);
  const org = (typeof apSettings !== 'undefined' && apSettings[t.scope] && apSettings[t.scope].org_name) || '춘천시산림조합';
  const year = (cvDay(t.dropped_at) || cvDay(t.created_at) || '').slice(0, 4);
  const no = `미진행-${year}-${String(t.id).padStart(4, '0')}`;
  const asg = t.work_task_assignees.map(a => nameOf(a.email)).join(', ') || '-';
  const font = typeof AP_FONT !== 'undefined' ? AP_FONT : "'Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const link = typeof AP_FONT_LINK !== 'undefined' ? AP_FONT_LINK : '';
  const stepRows = steps.map(s => {
    const stop = s.seq === t.dropped_step, done = !!s.done_at;
    return `<tr class="${stop ? 'stop' : ''}"><td class="c">${s.seq}</td><td>${esc(s.name)}</td><td class="c">${stop ? '⛔ 미진행' : done ? '완료' : '-'}</td><td class="c">${stop ? esc(cvDay(t.dropped_at)) : done ? esc(cvDay(s.done_at)) : ''}</td><td class="c">${stop ? esc(nameOf(t.dropped_by)) : done && s.done_by ? esc(nameOf(s.done_by)) : ''}</td></tr>`;
  }).join('');
  const css = `@page{size:A4;margin:14mm 14mm}*{box-sizing:border-box}body{font-family:${font};color:#111;margin:0;font-size:12.5px;line-height:1.4}
  .top{display:flex;justify-content:space-between;align-items:flex-start}.org{font-size:14px;font-weight:700;letter-spacing:6px;color:#444;padding-top:4px}
  .sign{border-collapse:collapse;width:190px;table-layout:fixed}.sign td,.sign th{border:1px solid #333;text-align:center;font-size:11px;padding:0}.sign th{height:20px;background:#f3f3f3}.sign td{height:46px}
  .title{margin-top:16px;border-top:5px solid #111;border-bottom:1px solid #111;padding:14px 0 11px;text-align:center}
  .title h1{font-size:27px;margin:0;letter-spacing:5px}.title .sub{margin-top:6px;color:#555;font-size:12px}
  .no{display:flex;justify-content:space-between;align-items:center;margin-top:9px;font-size:12px;color:#444}.no b{font-size:14px;color:#111;letter-spacing:1px}
  .cust{margin-top:12px;border:2px solid #111;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .cust .l{font-size:12px;color:#555;margin-bottom:4px}.cust .nm{font-size:24px;font-weight:800;letter-spacing:1px;word-break:keep-all}
  .cust .tag{display:inline-block;border:1.5px solid #111;border-radius:99px;padding:3px 14px;font-weight:700;font-size:13px;white-space:nowrap}
  h2{font-size:13.5px;margin:13px 0 5px;padding-left:9px;border-left:5px solid #111}
  table.t{width:100%;border-collapse:collapse}table.t th,table.t td{border:1px solid #444;padding:4px 9px;vertical-align:middle}
  table.t th{background:#eee;text-align:center;font-weight:700;font-size:12px}table.t td.k{background:#f3f3f3;font-weight:700;text-align:center;white-space:nowrap;width:15%;font-size:12px}
  .c{text-align:center}tr.stop td{background:#fdecec;font-weight:700}tr{page-break-inside:avoid}
  .reason{border:2px solid #b42318;padding:9px 13px;min-height:50px}.reason .st{font-weight:800;color:#b42318;margin-bottom:5px}.reason .tx{white-space:pre-wrap;font-size:13.5px}
  .memo{border:1px solid #444;padding:6px 10px;white-space:pre-wrap;min-height:28px}
  .chk{display:flex;flex-wrap:wrap;gap:6px 26px;border:1px solid #444;padding:9px 14px}.chk span{white-space:nowrap}.box{display:inline-block;width:14px;height:14px;border:1.6px solid #111;vertical-align:-2px;margin-right:6px}
  .keep td{height:30px}.keep td.k{width:15%}
  .foot{margin-top:10px;font-size:11px;color:#666;text-align:center}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>대출 미진행 서류 보관 표지 - ${esc(t.title)}</title>${link}<style>${css}</style></head><body>
  <div class="top"><div class="org">${esc(org)}</div>
    <table class="sign"><tr><th>담당</th><th>과장</th><th>상무</th></tr><tr><td></td><td></td><td></td></tr></table></div>
  <div class="title"><h1>대출 미진행 서류 보관 표지</h1><div class="sub">개인정보 동의서 · 대출신청서 등 스캔 서류 보관용 (자체 보관 · 웹 업로드 안 함)</div></div>
  <div class="no"><span>보관번호 <b>${esc(no)}</b></span><span>구분 ${esc(t.scope || '-')}</span></div>
  <div class="cust"><div><div class="l">고객 / 대출 건명</div><div class="nm">${esc(t.title)}</div></div><div class="tag">${esc(t.scope || '-')}</div></div>
  <h2>접수 내역</h2>
  <table class="t"><tr><td class="k">신청일자</td><td>${esc(cvDate(t.created_at))}</td><td class="k">요청자</td><td>${esc(t.directed_by || '-')}</td></tr>
    <tr><td class="k">담당자</td><td>${esc(asg)}</td><td class="k">등록자</td><td>${esc(nameOf(t.created_by))}</td></tr>
    <tr><td class="k">처리 기한</td><td>${esc(t.due_date ? `${t.due_date} (${cvDow(t.due_date)})` : '-')}</td><td class="k">미진행 처리일</td><td>${esc(cvDate(t.dropped_at))}</td></tr></table>
  <h2>미진행 사유</h2>
  <div class="reason"><div class="st">⛔ ${esc(ds ? ds.name : '-')} 단계에서 미진행 · 처리자 ${esc(nameOf(t.dropped_by))}</div><div class="tx">${esc(t.drop_reason || '(사유 미기재)')}</div></div>
  <h2>진행 경과</h2>
  <table class="t"><tr><th style="width:8%">순서</th><th>단계</th><th style="width:16%">상태</th><th style="width:20%">처리일</th><th style="width:18%">처리자</th></tr>${stepRows || '<tr><td colspan="5" class="c">-</td></tr>'}</table>
  ${t.detail ? `<h2>상세 메모</h2><div class="memo">${esc(t.detail)}</div>` : ''}
  <h2>보관 서류</h2>
  <div class="chk"><span><i class="box"></i>개인정보 수집·이용·제공 동의서</span><span><i class="box"></i>대출신청서</span><span><i class="box"></i>신분증 사본</span><span><i class="box"></i>기타 (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></div>
  <table class="t keep" style="margin-top:8px"><tr><td class="k">보관 위치</td><td></td><td class="k">보존 기간</td><td style="width:20%"></td><td class="k">폐기 예정</td><td style="width:18%"></td></tr></table>
  <div class="foot">이 표지 뒤에 개인정보 동의서와 대출신청서를 철하여 보관합니다.</div>
  </body></html>`;
}
function loanCoverPrint(t){ apPreview(loanCoverHtml(t), '미진행 서류 보관 표지', `미진행표지_${t.title}`); }
