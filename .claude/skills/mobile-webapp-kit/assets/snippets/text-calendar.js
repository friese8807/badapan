/* 보고서 글 속 날짜를 뽑아 달력으로 (11/09~13, 11.24, 11월 11일, (~11.18) …) — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
const PC_K = { event: ['행사', 'e'], next: ['계획', 'n'], done: ['실적', 'd'], issue: ['이슈', 'i'], end: ['준공', 'x'] };
function pDates(p) {
  const base = p.reported || today(), by = +base.slice(0, 4), bm = +base.slice(5, 7), out = [];
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const ok = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const yr = m => { let y = by; if (m - bm > 6) y--; else if (bm - m > 6) y++; return y; };
  const RX = /(?:(20\d{2}|\d{2})[.\-/]\s?)?(\d{1,2})\s*(?:[/.]|월\s*)(\d{1,2})(?![\d%])\s*일?(?:\s*\([월화수목금토일]\))?(?:\s*~\s*(?:(\d{1,2})\s*(?:[/.]|월\s*))?(\d{1,2})(?![\d%.])\s*일?)?/g;
  ['event', 'next', 'done', 'issue'].forEach(k => bullets(p[k]).forEach(line => {
    if (/주간(업무)?보고/.test(line)) return;   // 보고서 자체 날짜는 일정이 아님
    let m; RX.lastIndex = 0;
    while ((m = RX.exec(line))) {
      const before = line[m.index - 1] || '', after = line.slice(RX.lastIndex, RX.lastIndex + 1);
      if (/[\d.v]/i.test(before) || /^[%.]\d?/.test(after) && !/^\.\s|^\.$/.test(after)) continue;   // 91.6%, v3.0, 3.5.1 같은 것 거르기
      const M = +m[2], D = +m[3]; if (!ok(M, D)) continue;
      const Y = m[1] ? (m[1].length === 2 ? 2000 + +m[1] : +m[1]) : yr(M);
      let end = '';
      if (m[5]) { const M2 = m[4] ? +m[4] : M, D2 = +m[5]; if (ok(M2, D2)) { const e = ymd(M2 < M ? Y + 1 : Y, M2, D2); if (e > ymd(Y, M, D)) end = e; } }
      out.push({ k, d: ymd(Y, M, D), e: end, t: line });
    }
  }));
  if (p.end) out.push({ k: 'end', d: p.end.slice(0, 10), e: '', t: '준공' });
  const seen = new Set(); return out.filter(x => { const key = x.k + x.d + x.t; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.d.localeCompare(b.d));
}
const pcD = x => { const a = x.d.slice(5).split('-').map(Number), b = x.e ? x.e.slice(5).split('-').map(Number) : null, w = WD[new Date(x.d + 'T00:00:00Z').getUTCDay()];
  return `${a[0]}.${a[1]}${b ? '~' + (b[0] === a[0] ? '' : b[0] + '.') + b[1] : `(${w})`}`; };
function pCal(p) {
  const E = pDates(p); if (!E.length) return '';
  const t = today(), on = (x, d) => d >= x.d && d <= (x.e || x.d);
  // 오늘 기준 앞뒤로 일정이 있는 달만 (최대 3달)
  const mk = d => d.slice(0, 7), months = [...new Set(E.map(x => mk(x.d)))].filter(m => m >= mk(AppKit.addDays(t, -45)) && m <= mk(AppKit.addDays(t, 120))).slice(0, 3);
  if (!months.length) months.push(mk(t));
  const grid = ym => { const [Y, M] = ym.split('-').map(Number), first = new Date(Date.UTC(Y, M - 1, 1)), n = new Date(Date.UTC(Y, M, 0)).getUTCDate(), pad = first.getUTCDay();
    let h = `<div class="pcm"><div class="pcmh">${Y}년 ${M}월</div><div class="pcg">${[...WD].map((w, i) => `<span class="pcw ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}${'<span></span>'.repeat(pad)}`;
    for (let d = 1; d <= n; d++) { const ds = `${ym}-${String(d).padStart(2, '0')}`, wd = (pad + d - 1) % 7, L = E.filter(x => on(x, ds));
      const rng = L.find(x => x.e), cls = [ds === t ? 'today' : '', ds < t ? 'past' : '', wd === 0 ? 'sun' : wd === 6 ? 'sat' : '', L.length ? 'has' : '', rng ? 'rng' : '', rng && ds === rng.d ? 'rs' : '', rng && ds === rng.e ? 're' : ''].filter(Boolean).join(' ');
      h += `<button class="pcd ${cls}" ${L.length ? `data-pcd="${ds}"` : 'disabled'}><b>${d}</b><i>${[...new Set(L.map(x => PC_K[x.k][1]))].slice(0, 3).map(c => `<u class="${c}"></u>`).join('')}</i></button>`; }
    return h + '</div></div>'; };
  const list = E.filter(x => months.includes(mk(x.d)) || (x.e && months.includes(mk(x.e)))).map(x => `<li class="${(x.e || x.d) < t ? 'past' : ''}" data-pcl="${x.d}|${x.e || x.d}"><span class="pcdt">${pcD(x)}</span><span class="pck ${PC_K[x.k][1]}">${PC_K[x.k][0]}</span><span class="pct">${esc(x.t)}</span></li>`).join('');
  return `<div class="psec pcal s-ev"><h3>일정 달력 <small>보고서 속 날짜를 모았어요 · 날짜를 누르면 그날만</small></h3>${months.map(grid).join('')}
    <div class="pclg">${Object.values(PC_K).map(([n, c]) => `<span><u class="${c}"></u>${n}</span>`).join('')}</div><ul class="pcl">${list}</ul></div>`;
}
function pcPick(btn) {
  const box = btn.closest('.pcal'), d = btn.dataset.pcd, was = btn.classList.contains('sel');
  box.querySelectorAll('.pcd.sel').forEach(x => x.classList.remove('sel'));
  box.querySelectorAll('[data-pcl]').forEach(li => { const [a, b] = li.dataset.pcl.split('|'); li.hidden = !was && !(d >= a && d <= b); });
  if (!was) btn.classList.add('sel');
}
