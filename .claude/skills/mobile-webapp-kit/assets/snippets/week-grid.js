/* 사람 × 평일 한눈에 보기 표 + 칸 눌러 말풍선 — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
function absMon(off) { const t = today(), w = new Date(t + 'T00:00:00Z').getUTCDay(); return AppKit.addDays(t, (w === 0 ? 1 : w === 6 ? 2 : 1 - w) + 7 * off); }
function absCell(L) {
  if (!L.length) return '';
  const a = L.find(x => x.type === '출장') || L.find(x => x.type === '휴가') || L[0];
  if (a.type === '출장') return `<div class="ac t">출장</div>`;
  if (a.type === '휴가') return `<div class="ac v">${esc(((a.label || '연차').split(' ')[0].replace(/^(.{2,})휴가$/, '$1')).slice(0, 4))}</div>`;
  const m = (a.when || '').match(/(\d{1,2}):\d{2}~(\d{1,2}):\d{2}/);
  if (m) { const s = +m[1], e = +m[2], l = Math.max(0, (s - 8) / 11 * 100), w = Math.max(8, (e - s) / 11 * 100);
    return `<div class="ac p" style="--l:${l.toFixed(0)}%;--w:${Math.min(w, 100 - l).toFixed(0)}%"><span>${s}~${e}시</span></div>`; }
  const am = a.when === '오전', pm = a.when === '오후';
  return `<div class="ac p" style="--l:${pm ? 50 : 0}%;--w:${am || pm ? 50 : 100}%"><span>${am ? '오전반' : pm ? '오후반' : a.type}</span></div>`;
}
function absPop(td) {
  sb.querySelector('.apop')?.remove(); sb.querySelectorAll('td.pick').forEach(x => x.classList.remove('pick'));
  const [name, date] = td.dataset.absCell.split('|'), p = S.absP?.[name]; if (!p) return;
  const L = p.d[date] || [], a0 = L[0] || {};
  const row = (k, v) => v ? `<div class="apr"><span>${k}</span>${esc(v)}</div>` : '';
  const items = L.map(a => `<div class="apt">${ABS_IC[a.type] || ''} <b>${esc(a.type === '휴가' ? a.label || '휴가' : a.type === '출장' ? '출장' : (a.when && !/~/.test(a.when) ? a.when + ' ' : '') + a.type)}</b>${/~/.test(a.when) ? ` <small>${esc(a.when)}</small>` : ''}</div>
    ${a.type === '출장' ? row('장소', a.place) + row('목적', a.note) + row('지역', a.at) : row('사유', a.note)}`).join('');
  const box = document.createElement('div'); box.className = 'apop';
  const old = L.length && !('note' in a0);   // 예전 서버는 장소·목적·사유를 보내지 않는다
  box.innerHTML = `<button class="apx" aria-label="닫기">×</button><div class="aph"><b>${esc(name)}</b> <span>${esc([a0.team, a0.rank].filter(Boolean).join(' '))} · ${md(date)}</span></div>${items}${old ? '<div class="apr" style="color:var(--stop)">장소·목적·사유는 서버(Code.gs)를 새 버전으로 배포하면 보여요</div>' : ''}`;
  sb.appendChild(box); td.classList.add('pick');
  const r = td.getBoundingClientRect(), R = sb.getBoundingClientRect(), W = Math.min(R.width - 24, 330);
  const left = Math.max(12, Math.min(R.width - W - 12, r.left - R.left + r.width / 2 - W / 2));
  box.style.width = W + 'px'; box.style.left = left + 'px'; box.style.top = (r.bottom - R.top + sb.scrollTop + 8) + 'px';
  box.style.setProperty('--ax', (r.left - R.left + r.width / 2 - left) + 'px');
  box.querySelector('.apx').onclick = e => { e.stopPropagation(); box.remove(); td.classList.remove('pick'); };
}
