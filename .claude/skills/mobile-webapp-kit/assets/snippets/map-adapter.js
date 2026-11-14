/* 지도 어댑터: 카카오맵(JS 키) 우선, 안 되면 Leaflet+OSM — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
const MK = (() => {
  const L_ = window.L;
  const BASES = {
    kakao: { name: '카카오', kakao: 'ROADMAP' },
    sky: { name: '위성', kakao: 'HYBRID' },
    sea: { name: '해도', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', o: { maxNativeZoom: 13, attribution: 'Esri, GEBCO, NOAA' },
      over: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}' },
    std: { name: 'OSM', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', o: { maxNativeZoom: 19, attribution: '© OpenStreetMap' } },
  };
  const SEAMARK = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
  const views = {}, live = new Set();
  const KOREA = [[33.0, 124.6], [38.7, 131.0]];
  let kakaoState = KAKAO_KEY ? 'idle' : 'off', kakaoWait = [];
  const wanted = () => { const b = LS.get('mapBase', 'kakao'); return BASES[b] ? b : 'kakao'; };
  const base = () => { const b = wanted(); return BASES[b].kakao && kakaoState === 'off' ? 'std' : b; };
  const marks = () => LS.get('seamark', false);
  const z2lv = z => Math.max(1, Math.min(14, Math.round(20 - z)));   // Leaflet 확대 단계 ↔ 카카오 레벨
  const lv2z = lv => 20 - lv;

  /* 카카오 지도 SDK는 처음 필요할 때 한 번만 불러온다. 8초 안에 안 뜨면 Leaflet 으로 바꾼다 */
  function loadKakao() {
    return new Promise(ok => {
      if (kakaoState === 'ready') return ok(true);
      if (kakaoState === 'off') return ok(false);
      kakaoWait.push(ok);
      if (kakaoState === 'loading') return;
      kakaoState = 'loading';
      const done = v => { kakaoState = v ? 'ready' : 'off'; const w = kakaoWait; kakaoWait = []; w.forEach(f => f(v)); if (!v) AppKit.toast('카카오지도를 불러오지 못해 기본 지도로 보여 줘요'); };
      const t = setTimeout(() => done(false), 8000);
      const sc = document.createElement('script');
      sc.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
      sc.referrerPolicy = 'origin';
      sc.onload = () => { try { kakao.maps.load(() => { clearTimeout(t); done(true); }); } catch (e) { clearTimeout(t); done(false); } };
      sc.onerror = () => { clearTimeout(t); done(false); };
      document.head.append(sc);
    });
  }

  /* 지도 칸 하나 만들기. ready(h) 는 지도가 준비되면 불린다 (카카오는 처음 한 번 비동기) */
  function make(el, opts, ready) {
    el.innerHTML = '<div class="mk-canvas"></div>';
    const canvas = el.firstChild;
    const b = base();
    if (BASES[b].kakao) {
      el.classList.add('mk-wait');
      loadKakao().then(ok => { el.classList.remove('mk-wait'); if (!el.isConnected) return; if (!ok) return make(el, opts, ready); ready(kakaoMap(el, canvas, opts, b)); });
      return;
    }
    if (!L_) { el.innerHTML = '<div class="nomap">지도를 불러오지 못했어요</div>'; return; }
    ready(leafletMap(el, canvas, opts, b));
  }
  function startView(h, { key, fit, pts = [], zoom = 12, center }) {
    if (center) h.view(center[0], center[1], zoom);
    else if (pts.length > 1) h.fit(pts, fit || 11);
    else if (pts.length === 1) h.view(pts[0][0], pts[0][1], 9);
    else h.view(36.0, 127.6, 6.5);   // 지점이 없으면 우리나라 전체
  }

  function leafletMap(el, canvas, o, b) {
    const it = o.interactive !== false;
    const m = L_.map(canvas, { zoomControl: false, attributionControl: true, zoomSnap: .5, minZoom: 5, maxZoom: 18, maxBounds: [[28, 118], [44, 138]],
      dragging: it, scrollWheelZoom: it, touchZoom: it, doubleClickZoom: it, boxZoom: it, keyboard: it });
    m.attributionControl.setPrefix(false);
    const B = BASES[b];
    L_.tileLayer(B.url, { maxZoom: 18, ...B.o }).addTo(m);
    if (B.over) L_.tileLayer(B.over, { maxZoom: 18, maxNativeZoom: 13, opacity: .9 }).addTo(m);
    if (marks()) L_.tileLayer(SEAMARK, { minZoom: 9, maxZoom: 18, opacity: .95 }).addTo(m);
    const h = {
      el, kind: 'leaflet',
      add(lat, lon, html, { onClick, z = 0 } = {}) {
        const mk = L_.marker([lat, lon], { icon: L_.divIcon({ html, className: 'mk', iconSize: [0, 0] }), interactive: !!onClick, zIndexOffset: z }).addTo(m);
        if (onClick) mk.on('click', onClick);
        return { set: (a, c) => mk.setLatLng([a, c]), remove: () => mk.remove() };
      },
      draggable(lat, lon, onEnd) {
        const mk = L_.marker([lat, lon], { draggable: true, icon: L_.divIcon({ html: '<div class="mpin pick"><i></i></div>', className: 'mk', iconSize: [0, 0] }) }).addTo(m);
        mk.on('dragend', () => { const p = mk.getLatLng(); onEnd(p.lat, p.lng); });
        return { set: (a, c) => mk.setLatLng([a, c]), remove: () => mk.remove() };
      },
      onClick(fn) { m.on('click', e => fn(e.latlng.lat, e.latlng.lng)); },
      view(lat, lon, z) { m.setView([lat, lon], z, { animate: false }); },
      zoom: () => m.getZoom(), zoomBy: d => d > 0 ? m.zoomIn() : m.zoomOut(),
      fit(pts, maxZ = 11) { m.fitBounds(L_.latLngBounds(pts), { padding: [20, 20], maxZoom: maxZ, animate: false }); m.setZoom(m.getZoom() - 1, { animate: false }); },
      relayout() { m.invalidateSize(); }, destroy() { m.remove(); },
    };
    startView(h, o);
    setTimeout(() => { if (!el.isConnected || el.dataset.touched || (o.key && views[o.key])) return; m.invalidateSize(); startView(h, o); }, 400);
    if (o.key) { let touched = false; el.addEventListener('pointerdown', () => { touched = true; el.dataset.touched = 1; }); m.on('moveend', () => { if (!touched) return; const c = m.getCenter(); views[o.key] = { lat: c.lat, lon: c.lng, z: m.getZoom() }; }); }
    finish(h, o);
    return h;
  }

  function kakaoMap(el, canvas, o, b) {
    const K = kakao.maps, it = o.interactive !== false;
    const m = new K.Map(canvas, { center: new K.LatLng(36, 127.8), level: 12, draggable: it, scrollwheel: it, disableDoubleClickZoom: !it });
    m.setMapTypeId(K.MapTypeId[BASES[b].kakao]);
    if (!it) m.setZoomable(false);
    m.setMinLevel?.(1); m.setMaxLevel?.(14);
    const overlay = (lat, lon, html, onClick, z) => {
      const box = document.createElement('div'); box.className = 'mk'; box.style.cssText = 'position:relative;width:0;height:0'; box.innerHTML = html;
      if (onClick) { box.style.cursor = 'pointer'; box.firstElementChild?.addEventListener('click', e => { e.stopPropagation(); onClick(); }); }
      else box.firstElementChild && (box.firstElementChild.style.pointerEvents = 'none');
      const ov = new K.CustomOverlay({ position: new K.LatLng(lat, lon), content: box, xAnchor: 0, yAnchor: 0, zIndex: 3 + (z || 0) / 100, clickable: !!onClick });
      ov.setMap(m);
      return { set: (a, c) => ov.setPosition(new K.LatLng(a, c)), remove: () => ov.setMap(null) };
    };
    const PICK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="11" fill="#007ab5" stroke="#fff" stroke-width="4"/></svg>');
    const h = {
      el, kind: 'kakao',
      add(lat, lon, html, { onClick, z = 0 } = {}) { return overlay(lat, lon, html, onClick, z); },
      draggable(lat, lon, onEnd) {
        const mk = new K.Marker({ position: new K.LatLng(lat, lon), draggable: true, image: new K.MarkerImage(PICK, new K.Size(30, 30), { offset: new K.Point(15, 15) }) });
        mk.setMap(m);
        K.event.addListener(mk, 'dragend', () => { const p = mk.getPosition(); onEnd(p.getLat(), p.getLng()); });
        return { set: (a, c) => mk.setPosition(new K.LatLng(a, c)), remove: () => mk.setMap(null) };
      },
      onClick(fn) { K.event.addListener(m, 'click', e => fn(e.latLng.getLat(), e.latLng.getLng())); },
      view(lat, lon, z) { m.setLevel(z2lv(z)); m.setCenter(new K.LatLng(lat, lon)); },
      zoom: () => lv2z(m.getLevel()), zoomBy: d => m.setLevel(m.getLevel() - d, { animate: true }),
      // 모든 지점이 들어오게 맞춘 뒤 한 단계 더 넓게, 가운데는 지점들의 한가운데로 (한쪽으로 쏠리지 않게)
      fit(pts) { const bd = new K.LatLngBounds(); pts.forEach(p => bd.extend(new K.LatLng(p[0], p[1]))); m.setBounds(bd, 20, 20, 20, 20);
        m.setLevel(Math.min(14, m.getLevel() + 1)); m.setCenter(new K.LatLng((Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2, (Math.min(...pts.map(p => p[1])) + Math.max(...pts.map(p => p[1]))) / 2)); },
      relayout() { const c = m.getCenter(); m.relayout(); m.setCenter(c); }, destroy() {},
    };
    startView(h, o);
    setTimeout(() => { if (!el.isConnected || el.dataset.touched || (o.key && views[o.key])) return; m.relayout(); startView(h, o); }, 400);
    if (o.key) { let touched = false; el.addEventListener('pointerdown', () => { touched = true; el.dataset.touched = 1; }); K.event.addListener(m, 'idle', () => { if (!touched) return; const c = m.getCenter(); views[o.key] = { lat: c.getLat(), lon: c.getLng(), z: lv2z(m.getLevel()) }; }); }
    finish(h, o);
    return h;
  }

  /* 오른쪽 위 버튼: 확대·축소 · 전체 보기 · 내 위치 · 바탕 바꾸기 (두 지도 공통) */
  function finish(h, o) {
    live.add(h);
    if (o.controls === false) return;
    const d = document.createElement('div'); d.className = 'mk-tools';
    d.innerHTML = `<button type="button" data-mk="plus" aria-label="확대">＋</button><button type="button" data-mk="minus" aria-label="축소">－</button>
      <button type="button" data-mk="all" aria-label="전체 보기"><svg class="ak-ic" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      <button type="button" data-mk="me" aria-label="내 위치"><svg class="ak-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg></button>
      <button type="button" data-mk="base" class="txt">${BASES[base()].name}</button>`;
    d.addEventListener('click', e => {
      const k = e.target.closest('[data-mk]')?.dataset.mk; if (!k) return; e.stopPropagation();
      if (k === 'plus') h.zoomBy(1); if (k === 'minus') h.zoomBy(-1);
      if (k === 'all') { if (o.key) delete views[o.key]; delete h.el.dataset.touched; const p = o.pts || []; p.length > 1 ? h.fit(p) : p.length ? h.view(p[0][0], p[0][1], 9) : h.view(35.9, 127.8, 6.5); }
      if (k === 'me') myPos().then(p => { h.view(p[0], p[1], Math.max(h.zoom(), 12)); h.add(p[0], p[1], '<div class="medot"></div>'); }, err => AppKit.toast(err));
      if (k === 'base') { const ks = Object.keys(BASES), n = ks[(ks.indexOf(base()) + 1) % ks.length]; LS.set('mapBase', n); AppKit.toast(BASES[n].name + ' 지도로 바꿨어요'); remount(); }
    });
    h.el.append(d);
  }
  /* 내 위치: 화면에서 지도를 옮기는 데만 쓰고 서버에는 보내지 않는다 */
  const myPos = () => new Promise((ok, no) => {
    if (!navigator.geolocation) return no('이 기기에서는 위치를 쓸 수 없어요');
    navigator.geolocation.getCurrentPosition(p => ok([p.coords.latitude, p.coords.longitude]), () => no('위치 권한을 허용해 주세요'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
  function clear(root) { live.forEach(h => { if (!root || root.contains(h.el)) { h.destroy(); live.delete(h); } }); }
  const inside = root => [...live].filter(h => root.contains(h.el));
  let remount = () => {};
  return { make, clear, inside, myPos, setRemount: f => remount = f, BASES, get base() { return wanted(); }, views };
})();
