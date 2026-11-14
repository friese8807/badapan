/* 시간 막대·3일 그래프(시각 비례 가로축)·물때 곡선(코사인 보간) — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
const tsHour = k => Date.UTC(2000, +k.slice(0, 2) - 1, +k.slice(2, 4), +k.slice(4, 6)) / 36e5;
function daySegs(h0, hN, span, wide) {
  const out = [], min = wide ? .08 : .13;
  for (let a = h0; a < hN; ) { const b = Math.min(hN, (Math.floor(a / 24) + 1) * 24), w = (b - a) / span;
    const d = new Date(a * 36e5).getUTCDate();
    if (w >= min) out.push(`<span style="left:${(((a + b) / 2 - h0) / span * 100).toFixed(1)}%">${a === h0 && wide ? '오늘 ' : ''}${d}일</span>`); a = b; }
  return out.join('');
}
const strip = (s, wide) => {
  if (!s.ts?.length) return '';
  // 칸 너비와 눈금 위치를 실제 시각 간격으로 계산 (예보 간격이 1시간이 아니어도 날짜 눈금이 맞게)
  const T = s.ts, h0 = tsHour(T[0][0]), hN = tsHour(T[T.length - 1][0]) + 1, span = Math.max(1, hN - h0);
  const cells = T.map((r, i) => { const w = (i < T.length - 1 ? tsHour(T[i + 1][0]) : hN) - tsHour(r[0]); return `<i class="${judge(s, r[1], r[2])}" style="flex:${Math.max(.2, w)}"></i>`; }).join('');
  const days = []; for (let h = Math.ceil(h0 / 24) * 24; h < hN; h += 24) if (h > h0) days.push(h);
  const d2 = h => new Date(h * 36e5).getUTCDate();
  const cur = s.at ? Math.min(100, Math.max(0, (tsHour(s.at) - h0) / span * 100)) : 0;
  return `<div class="hstrip" aria-hidden="true">${cells}<b class="cur" style="left:${cur.toFixed(1)}%"></b></div>
    <div class="htk">${days.map(h => `<i style="left:${((h - h0) / span * 100).toFixed(1)}%"></i>`).join('')}</div>
    <div class="hticks">${daySegs(h0, hN, span, wide)}</div>`;
};

function tsChart(s, key, unit, limit) {
  // 가로축은 실제 시각 비례 (예보 끝부분은 3시간 간격이라 칸 수로 나누면 휘어 보인다)
  const col = key === 'w' ? 1 : 2, V = s.ts.map(r => r[col]), W = 340, H = 120, P = { l: 30, r: 8, t: 10, b: 20 };
  const max = Math.max(limit * 1.15, ...V.filter(v => v != null)) || 1;
  const hs = s.ts.map(r => tsHour(r[0])), h0 = hs[0], hN = hs[hs.length - 1], span = Math.max(1, hN - h0);
  const xh = h => P.l + (W - P.l - P.r) * ((h - h0) / span), x = i => xh(hs[i]), y = v => P.t + (H - P.t - P.b) * (1 - v / max);
  let path = '', on = false; V.forEach((v, i) => { if (v == null) { on = false; return; } path += (on ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); on = true; });
  // 자정 세로선 + 날짜 글자는 그날 구간 가운데 (좁은 첫날·끝날은 글자 생략 → 겹치거나 잘리지 않게)
  const mids = []; for (let h = Math.ceil(h0 / 24) * 24; h <= hN; h += 24) if (h > h0) mids.push(h);
  const edges = [h0, ...mids, hN], labels = [];
  for (let k = 0; k < edges.length - 1; k++) { const a = edges[k], b = edges[k + 1]; if ((b - a) / span < .12) continue;
    labels.push(`<text x="${xh((a + b) / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${new Date(a * 36e5).getUTCDate()}일</text>`); }
  const ticks = [0, max / 2, max].map(v => `<text x="${P.l - 4}" y="${y(v) + 4}" text-anchor="end">${(Math.round(v * 10) / 10)}</text><line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="gr"/>`).join('');
  const bw = i => Math.max(1, (i < hs.length - 1 ? x(i + 1) : x(i)) - x(i));
  return `<figure class="tsc" data-ts="${esc(s.id)}" data-k="${key}"><figcaption>${key === 'w' ? '파고' : '풍속'} <span class="sub">(${unit} · 점선 = 기준 ${limit}${unit}, 80% ${Math.round(limit * 8) / 10}${unit})</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${key === 'w' ? '파고' : '풍속'} 3일 예보">
      ${s.ts.map((r, i) => { const c = judge(s, r[1], r[2]); return c === 'go' || c === 'none' ? '' : `<rect x="${x(i).toFixed(1)}" y="${P.t}" width="${(bw(i) + .5).toFixed(1)}" height="${H - P.t - P.b}" class="bg ${c}"/>`; }).join('')}
      ${ticks}
      ${mids.map(h => `<line x1="${xh(h).toFixed(1)}" x2="${xh(h).toFixed(1)}" y1="${P.t}" y2="${H - P.b}" class="dl"/>`).join('')}${labels.join('')}
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(limit)}" y2="${y(limit)}" class="lim stop"/><line x1="${P.l}" x2="${W - P.r}" y1="${y(limit * .8)}" y2="${y(limit * .8)}" class="lim warn"/>
      <path d="${path}" class="ln ${key}"/>
      <line class="xh" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" style="display:none"/><circle class="xd ${key}" r="4" style="display:none"/>
    </svg><div class="tip"></div></figure>`;
}
function tsHover(e) {
  const f = e.target.closest?.('.tsc'); if (!f) return;
  const s = S.data.sites.find(x => x.id === f.dataset.ts); if (!s?.ts?.length) return;
  const svg = f.querySelector('svg'), r = svg.getBoundingClientRect(), W = 340, P = { l: 30, r: 8 }, n = s.ts.length;
  const hs = s.ts.map(q => tsHour(q[0])), h0 = hs[0], span = Math.max(1, hs[n - 1] - h0);
  const px = (e.clientX - r.left) / r.width * W, ht = h0 + (px - P.l) / (W - P.l - P.r) * span;
  let i = 0; hs.forEach((h, k) => { if (Math.abs(h - ht) < Math.abs(hs[i] - ht)) i = k; });
  const row = s.ts[i], col = f.dataset.k === 'w' ? 1 : 2, v = row[col];
  const xx = P.l + (W - P.l - P.r) * ((hs[i] - h0) / span); const xh = svg.querySelector('.xh'), xd = svg.querySelector('.xd');
  xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.style.display = '';
  const lim = f.dataset.k === 'w' ? s.maxWave : s.maxWind, V = s.ts.map(q => q[col]), max = Math.max(lim * 1.15, ...V.filter(q => q != null)) || 1;
  if (v != null) { xd.setAttribute('cx', xx); xd.setAttribute('cy', 10 + 90 * (1 - v / max)); xd.style.display = ''; }
  const c = judge(s, row[1], row[2]);
  f.querySelector('.tip').innerHTML = `<b>${tsLabel(row[0])}</b> · 파고 ${nv(row[1])}m · 풍속 ${nv(row[2])}m/s · <span class="sig ${c}">${SIG_TXT[c]}</span>`;
}
function tideChart(s) {
  const t0 = today(), L0 = (s.tideAll?.length ? s.tideAll : (s.tides || []).map(x => ({ ...x, d: t0 })));
  const E = L0.map(x => ({ hr: (Date.parse(x.d + 'T00:00:00Z') - Date.parse(t0 + 'T00:00:00Z')) / 36e5 + (+x.t.slice(0, 2)) + (+x.t.slice(3, 5)) / 60, h: +x.h, hl: x.hl, t: x.t, d: x.d }))
    .filter(x => isFinite(x.hr) && isFinite(x.h)).sort((a, b) => a.hr - b.hr);
  if (E.length < 2) return '';
  // 처음·끝 바깥은 반주기만큼 반대쪽 높이를 가정해 이어 붙인다
  const P = [{ hr: E[0].hr - (E[1].hr - E[0].hr), h: E[1].h }, ...E, { hr: E[E.length - 1].hr + (E[E.length - 1].hr - E[E.length - 2].hr), h: E[E.length - 2].h }];
  const at = hr => { let i = 0; while (i < P.length - 2 && P[i + 1].hr < hr) i++; const a = P[i], b = P[i + 1], f = Math.min(1, Math.max(0, (hr - a.hr) / (b.hr - a.hr)));
    return (a.h + b.h) / 2 + (a.h - b.h) / 2 * Math.cos(Math.PI * f); };
  const W = 340, H = 165, M = { l: 30, r: 8, t: 26, b: 22 }, lo = Math.min(...E.map(e => e.h)), hi = Math.max(...E.map(e => e.h)), pad = Math.max(10, (hi - lo) * .12);
  // 아래 여백을 넉넉히: 간조 글자가 시각 눈금과 겹치지 않게
  const y0 = lo - pad * 2.6, y1 = hi + pad, X = hr => M.l + (W - M.l - M.r) * hr / 24, Y = h => M.t + (H - M.t - M.b) * (1 - (h - y0) / (y1 - y0));
  let d = ''; for (let m = 0; m <= 24 * 60; m += 10) { const hr = m / 60; d += (m ? 'L' : 'M') + X(hr).toFixed(1) + ',' + Y(at(hr)).toFixed(1); }
  const area = d + `L${X(24).toFixed(1)},${H - M.b}L${X(0).toFixed(1)},${H - M.b}Z`;
  const nowD = new Date(Date.now() + 9 * 36e5), nowH = nowD.getUTCHours() + nowD.getUTCMinutes() / 60, nowV = at(nowH);
  const rising = at(nowH + .2) > nowV;
  const marks = E.filter(e => e.hr >= 0 && e.hr <= 24).map(e => { const hiP = e.hl === '고', x = X(e.hr), yy = Y(e.h), anc = x < M.l + 30 ? 'start' : x > W - M.r - 30 ? 'end' : 'middle';
    return `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="3.5" class="tdot ${hiP ? 'hi' : 'lo'}"/><text x="${x.toFixed(1)}" y="${(hiP ? yy - 9 : yy + 16).toFixed(1)}" text-anchor="${anc}" class="tlb ${hiP ? 'hi' : 'lo'}">${hiP ? '만조' : '간조'} ${e.t} · ${Math.round(e.h)}</text>`; }).join('');
  const grid = [0, 6, 12, 18, 24].map(h => `<line x1="${X(h)}" x2="${X(h)}" y1="${M.t - 8}" y2="${H - M.b}" class="gr"/><text x="${X(h)}" y="${H - 6}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}" class="ax">${h}시</text>`).join('');
  const yt = [lo, (lo + hi) / 2, hi].map(v => `<text x="${M.l - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${Math.round(v)}</text>`).join('');
  return `<figure class="tdc"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="오늘 물때 곡선">
    <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="tg1"/><stop offset="1" class="tg2"/></linearGradient></defs>
    ${grid}${yt}<path d="${area}" fill="url(#tg)"/><path d="${d}" class="tln"/>
    <line x1="${X(nowH).toFixed(1)}" x2="${X(nowH).toFixed(1)}" y1="${M.t - 8}" y2="${H - M.b}" class="tnow"/><circle cx="${X(nowH).toFixed(1)}" cy="${Y(nowV).toFixed(1)}" r="5" class="tnowd"/>
    ${marks}</svg>
    <figcaption>지금 <b>${Math.round(nowV)}cm</b> · ${rising ? '들물(물이 차는 중) ↗' : '날물(물이 빠지는 중) ↘'}<div class="sub" style="margin-top:2px">단위 cm · 만조·간조 사이는 곡선으로 이은 추정값</div></figcaption></figure>`;
}
