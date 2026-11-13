// 감정평가 > 평가기관 가격 회신 이미지·PDF 첨부
// 평가기관이 가격을 이미지(캡처·사진·팩스 스캔)나 PDF 로 회신하는 경우, 그 기관 칸에 파일을 올려 두고 나중에 다시 볼 수 있게 한다.
// 저장: Storage 버킷 'appraisal-replies'(비공개, 10MB) + 표 appraisal_reply_files. 조회는 팀원 전체, 올리기는 담보심사 권한자, 삭제는 올린 사람·관리자.
// 의존: appraisal.js (apCases, apOpenId, apCan, apFirmName, loadAppraisal, renderApDetail) · index.html ($, esc, sb, me, isAdmin, nameOf, toast)
const APR_BUCKET = 'appraisal-replies', APR_MAX = 10 * 1024 * 1024;
const aprUrls = new Map();   // path → { url, exp }
const aprFilesOf = (r) => [...(r.appraisal_reply_files || [])].sort((a, b) => a.id - b.id);
const aprIsImg = (f) => /^image\//.test(f.mime || '');
const aprIsPdf = (f) => (f.mime || '') === 'application/pdf';
const aprSize = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;

async function aprSign(paths){
  const need = [...new Set(paths)].filter(p => { const u = aprUrls.get(p); return !u || u.exp < Date.now(); });
  if (!need.length) return;
  const { data } = await sb.storage.from(APR_BUCKET).createSignedUrls(need, 3600);
  (data || []).forEach(d => { if (d && d.signedUrl) aprUrls.set(d.path, { url: d.signedUrl, exp: Date.now() + 3300e3 }); });
}
// 가격 표의 '회신 이미지' 칸 (기관별)
function aprCell(r, can){
  const files = aprFilesOf(r);
  const thumbs = files.map(f => `<button type="button" class="aprt" data-rf="open" data-r="${r.id}" data-f="${f.id}" title="${esc(f.name || '')}">${aprIsImg(f) ? `<img data-sp="${esc(f.path)}" alt="${esc(f.name || '회신 이미지')}" />` : `<span class="pdf">📄<small>${esc(((f.name || 'PDF').replace(/\.pdf$/i, '')).slice(0, 8))}</small></span>`}</button>`).join('');
  const add = can ? `<label class="aprAdd btn small">＋ 첨부<input type="file" class="rfin" data-r="${r.id}" multiple accept="image/*,application/pdf" hidden /></label>` : '';
  return `<div class="aprf">${thumbs}${add}</div>${files.length ? `<div class="muted" style="font-size:11.5px;margin-top:4px">${files.length}개 · 눌러서 크게 보기</div>` : (can ? '' : '<span class="muted">-</span>')}`;
}
async function aprHydrate(){   // 그려진 썸네일에 임시 주소를 채운다 (비공개 파일이라 서명된 주소가 필요)
  const imgs = [...document.querySelectorAll('#apDetailPanel img[data-sp]')]; if (!imgs.length) return;
  try { await aprSign(imgs.map(i => i.dataset.sp)); } catch (e) { return; }
  imgs.forEach(i => { const u = aprUrls.get(i.dataset.sp); if (u) i.src = u.url; });
}
// 큰 사진은 줄여서 올린다 (최대 2200px JPEG). HEIC·PDF 는 그대로.
async function aprShrink(file){
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .86));
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) { /* 줄이지 못하면 원본 */ }
  return file;
}
const aprExt = (m) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }[m] || 'bin');
async function aprUpload(input){
  const c = apCases.find(x => x.id === apOpenId), rid = +input.dataset.r, files = [...input.files]; input.value = '';
  if (!c || !files.length || !apCan()) return;
  const ok = files.filter(f => /^(image\/|application\/pdf)/.test(f.type) || /\.(heic|heif|pdf)$/i.test(f.name));
  if (ok.length < files.length) alert('이미지(JPG·PNG·HEIC 등)와 PDF만 올릴 수 있어요. 다른 형식은 건너뛰었어요.');
  let done = 0, fail = 0;
  toast(`📎 ${ok.length}개 올리는 중…`);
  for (const f0 of ok){
    const f = await aprShrink(f0), mime = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : 'image/heic');
    if (f.size > APR_MAX){ alert(`${f0.name}: 10MB를 넘어서 올릴 수 없어요. (${aprSize(f.size)})`); fail++; continue; }
    const path = `${c.id}/${rid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${aprExt(mime)}`;
    const up = await sb.storage.from(APR_BUCKET).upload(path, f, { contentType: mime, upsert: false });
    if (up.error){ alert(`${f0.name}: ${up.error.message}`); fail++; continue; }
    const ins = await sb.from('appraisal_reply_files').insert({ request_id: rid, path, name: f0.name, mime, size: f.size, created_by: me });
    if (ins.error){ await sb.storage.from(APR_BUCKET).remove([path]); alert(`${f0.name}: ${ins.error.message}`); fail++; continue; }
    done++;
  }
  if (done) toast(`📎 ${done}개 올렸어요${fail ? ` (실패 ${fail})` : ''}`);
  await loadAppraisal();
}

// ---------- 크게 보기 ----------
let aprLb = null;   // { rid, ids: [파일 id…], i }
(function(){
  const st = document.createElement('style'); st.textContent = `
  .aprf{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:center; }
  .aprt{ width:62px; height:62px; border:1.5px solid var(--line); border-radius:12px; background:#fff; padding:0; overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; } .aprt:hover{ border-color:var(--accent); }
  .aprt img{ width:100%; height:100%; object-fit:cover; } .aprt .pdf{ display:flex; flex-direction:column; align-items:center; font-size:22px; line-height:1.1; } .aprt .pdf small{ font-size:10px; color:var(--muted); max-width:56px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .aprAdd{ cursor:pointer; min-height:34px; }
  #aprLb{ position:fixed; inset:0; z-index:95; background:rgba(8,10,16,.92); display:none; flex-direction:column; }
  #aprLb .lh{ display:flex; align-items:center; gap:10px; padding:max(10px, env(safe-area-inset-top)) 14px 10px; color:#fff; font-size:13.5px; } #aprLb .lh b{ font-size:15px; } #aprLb .lh .sp{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #aprLb .lb{ flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:0 10px; position:relative; } #aprLb .lb img{ max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; background:#fff; touch-action:pinch-zoom; }
  #aprLb .lb .nv{ position:absolute; top:50%; transform:translateY(-50%); width:44px; height:64px; border:0; border-radius:12px; background:rgba(255,255,255,.16); color:#fff; font-size:22px; cursor:pointer; } #aprLb .lb .nv.p{ left:8px; } #aprLb .lb .nv.n{ right:8px; }
  #aprLb .lf{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; padding:12px 14px max(14px, env(safe-area-inset-bottom)); }
  #aprLb .lf a,#aprLb .lf button{ border:0; border-radius:99px; padding:10px 18px; font-size:14px; font-weight:700; background:rgba(255,255,255,.16); color:#fff; cursor:pointer; text-decoration:none; } #aprLb .lf .dl{ background:#fff; color:#16181d; } #aprLb .lf .del{ background:rgba(229,72,77,.9); }
  #aprLb .pdfbox{ color:#fff; text-align:center; font-size:15px; line-height:1.8; } #aprLb .pdfbox .big{ font-size:64px; }`;
  document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'aprLb'; d.innerHTML = `<div class="lh"><b id="aprLbT"></b><span class="sp" id="aprLbS"></span><button type="button" data-lb="close" style="border:0;background:rgba(255,255,255,.16);color:#fff;width:38px;height:38px;border-radius:50%;font-size:16px;cursor:pointer">✕</button></div><div class="lb" id="aprLbBody"></div><div class="lf" id="aprLbF"></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]'); if (!b) return; const a = b.dataset.lb;
    if (a === 'close' || e.target === d) return aprClose();
    if (a === 'prev') return aprShow(aprLb.i - 1); if (a === 'next') return aprShow(aprLb.i + 1);
    if (a === 'del') return aprDelete();
  });
  document.addEventListener('keydown', (e) => { if (!aprLb) return; if (e.key === 'Escape') aprClose(); else if (e.key === 'ArrowLeft') aprShow(aprLb.i - 1); else if (e.key === 'ArrowRight') aprShow(aprLb.i + 1); });
})();
function aprFindFile(id){ for (const c of apCases) for (const r of (c.appraisal_requests || [])){ const f = (r.appraisal_reply_files || []).find(x => x.id === id); if (f) return { f, r, c }; } return null; }
async function aprShow(i){
  if (!aprLb) return; const n = aprLb.ids.length; i = (i + n) % n; aprLb.i = i;
  const hit = aprFindFile(aprLb.ids[i]); if (!hit){ return aprClose(); }
  const { f, r } = hit, can = apCan() && (f.created_by === me || isAdmin());
  $('aprLbT').textContent = `${apFirmName(r.firm_id)} 회신`; $('aprLbS').textContent = `${i + 1}/${n} · ${f.name || ''} · ${nameOf(f.created_by)} · ${String(f.created_at).slice(0, 10)} · ${aprSize(f.size || 0)}`;
  await aprSign([f.path]); const u = (aprUrls.get(f.path) || {}).url || '';
  $('aprLbBody').innerHTML = `${n > 1 ? '<button type="button" class="nv p" data-lb="prev" aria-label="이전">◀</button><button type="button" class="nv n" data-lb="next" aria-label="다음">▶</button>' : ''}${aprIsImg(f) ? `<img src="${esc(u)}" alt="${esc(f.name || '회신 이미지')}" />` : `<div class="pdfbox"><div class="big">📄</div>${esc(f.name || 'PDF')}<br>PDF는 새 창에서 열어요</div>`}`;
  $('aprLbF').innerHTML = `${aprIsPdf(f) ? `<a class="dl" href="${esc(u)}" target="_blank" rel="noopener">새 창에서 열기</a>` : `<a class="dl" href="${esc(u)}" target="_blank" rel="noopener" download="${esc(f.name || 'reply')}">원본 열기·저장</a>`}${can ? '<button type="button" class="del" data-lb="del">🗑 삭제</button>' : ''}<button type="button" data-lb="close">닫기</button>`;
}
function aprOpen(rid, fid){
  const r = apCases.flatMap(c => c.appraisal_requests || []).find(x => x.id === rid); if (!r) return;
  const ids = aprFilesOf(r).map(f => f.id); aprLb = { rid, ids, i: Math.max(0, ids.indexOf(fid)) };
  $('aprLb').style.display = 'flex'; aprShow(aprLb.i);
}
function aprClose(){ aprLb = null; $('aprLb').style.display = 'none'; $('aprLbBody').innerHTML = ''; }
async function aprDelete(){
  const hit = aprFindFile(aprLb.ids[aprLb.i]); if (!hit) return; const { f } = hit;
  if (!confirm(`"${f.name || '이 파일'}"을(를) 삭제할까요?\n삭제하면 복구할 수 없어요.`)) return;
  const rm = await sb.storage.from(APR_BUCKET).remove([f.path]); if (rm.error) return alert(rm.error.message);
  const { error } = await sb.from('appraisal_reply_files').delete().eq('id', f.id); if (error) return alert(error.message);
  aprUrls.delete(f.path); toast('삭제했어요'); aprClose(); await loadAppraisal();
}
function aprClick(el){ if (el.dataset.rf === 'open') aprOpen(+el.dataset.r, +el.dataset.f); }
