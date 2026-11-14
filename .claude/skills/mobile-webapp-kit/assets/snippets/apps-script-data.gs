/* Apps Script: 공공데이터 호출·오류 판별, 기상청 파고(육지 격자 보정), 조석예보, 지오코딩, 게시판 긁기 — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
function geo_(place) {
  place = String(place || '').replace(/[\[\]_]/g, ' ').trim(); if (!place) return null;
  const P = PropertiesService.getScriptProperties(), key = 'geo:' + place.slice(0, 60), hit = P.getProperty(key);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  // 찾는 순서: 통째로 → 괄호 밖 글자를 뒤에서부터 줄여 가며 → 괄호 안 글자 (예: '파이텍(안양)' → '파이텍 안양', '파이텍', '안양')
  const out0 = place.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(), w = place.replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  const Q = [out0]; for (let n = w.length; n >= 1; n--) Q.push(w.slice(0, n).join(' '));
  (place.match(/\(([^)]+)\)/g) || []).forEach(x => Q.push(x.slice(1, -1)));
  for (const q of Q.filter((x, i) => x.length >= 2 && Q.indexOf(x) === i)) {
    try {
      const r = Maps.newGeocoder().setLanguage('ko').setRegion('kr').geocode(q);
      const g = r && r.status === 'OK' && r.results[0]; if (!g) continue;
      const c = g.address_components || [], pick = t => (c.find(a => a.types.indexOf(t) >= 0) || {}).long_name || '';
      const L = g.geometry.location; if (L.lat < 32 || L.lat > 39 || L.lng < 124 || L.lng > 132) continue;
      const out = { lat: +L.lat.toFixed(4), lon: +L.lng.toFixed(4), at: [pick('administrative_area_level_1'), pick('locality') || pick('sublocality_level_1')].filter(Boolean).join(' ').replace(/특별자치시|특별자치도|광역시|특별시/g, '') };
      P.setProperty(key, JSON.stringify(out)); return out;
    } catch (e) { return null; }   // 지오코더 오류(할당량 등)는 기억하지 않고 다음에 다시 시도
  }
  P.setProperty(key, '-'); return null;
}
function kimst_(page) {
  const r = UrlFetchApp.fetch((prop_('KIMST_URL') || 'https://www.kimst.re.kr/u/news/inform_01/pjtAnuc.do') + (page > 1 ? '?page=' + page : ''), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('KIMST HTTP ' + r.getResponseCode());
  const h = r.getContentText('UTF-8'), body = (h.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '', out = [];
  const txt = x => String(x || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  (body.match(/<tr[\s\S]*?<\/tr>/g) || []).forEach(tr => {
    const td = tr.match(/<td[\s\S]*?<\/td>/g) || []; if (td.length < 4) return;
    const no = txt(td[0]), title = txt(td[1]), href = ((td[1].match(/href="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
    const per = txt(td[3]).match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    if (!no || !title) return;
    out.push({ id: 'K' + no, kind: 'R&D공고', no, title: clip_(title, 200), org: '해양수산과학기술진흥원', demand: '해양수산부', budget: 0, ofcl: '', tel: '',
      posted: txt(td[2]).slice(0, 10), close: per ? per[2] : txt(td[2]).slice(0, 10), closeTime: '', url: /^https:\/\/www\.iris\.go\.kr\//.test(href) ? href : '', kw: 'KIMST,R&D' });
  });
  return out;
}
function weatherOne_(s, c) {
  if (!s) return;
  c = c || weatherCtx_();
  const wx = { at: now_() };
  if (!c.key) { wx.err = '서버에 공공데이터 인증키(DATA_GO_KR_KEY)가 없어요'; return update_('지점', s._row, { wx: JSON.stringify(wx) }); }
  try {
    const g = grid_(Number(s.lat), Number(s.lon));
    let T = fcstAt_(c, g.x, g.y);
    if (!T.length) throw new Error('예보 자료가 비어 있어요(격자 ' + g.x + ',' + g.y + ')');
    // 파고는 바다 격자에만 있다. 육지 격자는 파고를 '0'으로 돌려준다(빈 값이 아님) → 3일 내내 0이면 육지로 보고 가까운 바다 격자를 찾는다.
    // 찾은 바다 격자는 기억해 두어 다음부터는 한 번만 부른다. 끝내 못 찾으면 0 대신 '자료 없음'으로 둔다
    if (!T.some(x => x.WAV > 0)) {
      const P = PropertiesService.getScriptProperties(), memo = 'seaGrid:' + g.x + ',' + g.y, hit = P.getProperty(memo);
      const ring = [];
      for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) if (dx || dy) ring.push([dx, dy]);
      ring.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
      const tryAt = (dx, dy) => { const W = fcstAt_(c, g.x + dx, g.y + dy); return W.some(x => x.WAV > 0) ? W : null; };
      let W = null, d = null;
      if (hit && hit !== 'none') { d = JSON.parse(hit); W = tryAt(d[0], d[1]); }
      for (let i = 0; !W && hit !== 'none' && i < ring.length && i < 24; i++) { W = tryAt(ring[i][0], ring[i][1]); if (W) d = ring[i]; }
      if (W) {
        P.setProperty(memo, JSON.stringify(d));
        const m = {}; W.forEach(x => m[x.d + x.t] = x.WAV); T.forEach(x => { x.WAV = m[x.d + x.t] != null ? m[x.d + x.t] : null; });
        wx.waveFrom = '가까운 바다 격자 (약 ' + Math.round(Math.sqrt(d[0] * d[0] + d[1] * d[1]) * 5) + 'km)';
      } else { if (!hit) P.setProperty(memo, 'none'); T.forEach(x => { x.WAV = null; }); wx.waveNote = '지점이 육지라 파고 예보가 없어요 · 지점을 바다 쪽으로 옮겨 주세요'; }
    }
    const first = T.find(x => x.WAV != null || x.WSD != null);
    wx.now = { wave: first.WAV != null ? first.WAV : null, wind: first.WSD != null ? first.WSD : null };
    const half = {}; T.forEach(x => { const ap = Number(x.t) < 1200 ? '오전' : '오후', k = x.d + ap; const h = half[k] = half[k] || { d: x.d.slice(0, 4) + '-' + x.d.slice(4, 6) + '-' + x.d.slice(6), ap, wave: null, wind: null };
      if (x.WAV != null) h.wave = Math.max(h.wave || 0, x.WAV); if (x.WSD != null) h.wind = Math.max(h.wind || 0, x.WSD); });
    wx.fc = Object.keys(half).sort().slice(0, 6).map(k => half[k]);
    // 시간별 3일치 (그래프·지도 시간 막대용): [MMDDHH, 파고, 풍속]
    wx.ts = T.slice(0, 78).map(x => [x.d.slice(4) + x.t.slice(0, 2), x.WAV != null ? x.WAV : null, x.WSD != null ? x.WSD : null]);
  } catch (e) { wx.err = '기상청 예보: ' + clip_(e.message, 150); console.warn('예보', s.name, e.message); }
  if (s.sea && c.warnText.indexOf(s.sea) >= 0) { const m = c.warnText.match(/(풍랑|폭풍해일|태풍)(주의보|경보)/); wx.warn = m ? m[0] : '특보 발효'; }
  if (s.obsCode) {
    try {
      // 오늘·내일 이틀치를 받아 곡선이 자정 앞뒤로 끊기지 않게 한다. extrSe 1·3 = 고조, 2·4 = 저조 / predcDt '2026-11-14 05:32' / predcTdlvVl = 조위(cm)
      const day = n => Utilities.formatDate(new Date(Date.now() + n * 864e5), TZ, 'yyyyMMdd'), all = [];
      [0, 1].forEach(n => { const r = fetchJson_(c.prop.getProperty('EP_TIDE') || ENDPOINT.TIDE, { serviceKey: prop_('KHOA_KEY') || c.key, type: 'json', numOfRows: 10, pageNo: 1, obsCode: s.obsCode, reqDate: day(n) });
        items_(r).forEach(x => { const dt = String(x.predcDt || ''); if (dt.length >= 16) all.push({ d: dt.slice(0, 10), t: dt.slice(11, 16), hl: Number(x.extrSe) % 2 === 1 ? '고' : '저', h: Number(x.predcTdlvVl) }); }); });
      all.sort((p, q) => (p.d + p.t).localeCompare(q.d + q.t));
      const td = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      wx.tideAll = all; wx.tides = all.filter(x => x.d === td).map(x => ({ hl: x.hl, t: x.t, h: x.h }));
      if (!all.length) wx.tideErr = '물때 자료가 비어 있어요 (예보지점 ' + s.obsCode + ')';
    } catch (e) { wx.tideErr = clip_(e.message, 100); console.warn('조석', s.name, e.message); }
  }
  update_('지점', s._row, { wx: JSON.stringify(wx) });
}
function fetchJson_(url, params) {
  const q = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const r = UrlFetchApp.fetch(url + '?' + q, { muteHttpExceptions: true });
  const t = r.getContentText();
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode() + ' ' + t.slice(0, 120));
  // 인증키 오류 등은 JSON 대신 XML로 온다 → 이유를 꺼내 보여 준다
  if (/^\s*</.test(t)) { const m = t.match(/<(returnAuthMsg|resultMsg|errMsg)>([^<]*)</); throw new Error(m ? m[2] : 'XML 응답: ' + t.slice(0, 120)); }
  const j = JSON.parse(t), h = j && (j.response || j).header;
  // 인증키 문제는 JSON이어도 OpenAPI_ServiceResponse.cmmMsgHeader 로 온다 (예: 활용신청 안 한 API → '등록되지 않은 서비스키')
  const g = j && j.OpenAPI_ServiceResponse && j.OpenAPI_ServiceResponse.cmmMsgHeader;
  if (g) throw new Error((g.returnAuthMsg || g.errMsg || '인증 오류') + (g.returnReasonCode ? ' (' + g.returnReasonCode + ')' : ''));
  if (h && h.resultCode && !/^0?0$|^0?3$/.test(String(h.resultCode))) throw new Error(h.resultCode + ' ' + (h.resultMsg || ''));
  return j;
}
function items_(j) { const b = j && (j.response || j).body; const it = b && b.items; return !it ? [] : Array.isArray(it) ? it : Array.isArray(it.item) ? it.item : it.item ? [it.item] : []; }
