/* ═══ app-kit.js — 모바일 웹앱 공통 동작 ═══
   AppKit.fixViewport()            화면 높이 보정 (아이폰 홈 화면 앱 위아래 공백 제거)
   AppKit.bootDone()               첫 로딩 화면 걷기
   AppKit.track(promise, opts)     진행 막대 + 알약 + 누른 버튼 스피너
   AppKit.wrap(fn, skip)           API 함수를 감싸 "방금 누른 동작"만 자동으로 진행 표시
   AppKit.spin(el, promise)        새로고침 아이콘 돌리기 (배경 새로고침용)
   AppKit.toast(msg)               짧은 알림
   AppKit.swipe(el, {onNext,onPrev})  좌우 스와이프 (탭·날짜 넘기기)
   AppKit.tabs({...})              탭바 + 스와이프 + 넘김 애니메이션
   AppKit.sheet(el)                바텀시트 열기/닫기 + 끌어내려 닫기
   AppKit.autoUpdate(build)        version.txt 가 바뀌면 새 버전으로 다시 열기
   AppKit.env()                    진단 문구 (버전·홈 화면 앱 여부·화면 크기)
   AppKit.store('앱접두어')         localStorage 를 안전하게 (get/set/del)
   AppKit.esc / num / krw / signed / kstDate / addDays / hhmm   글자·숫자·날짜
   AppKit.poll(fn, ms, busy)       화면이 보일 때만 자동 새로고침 + 돌아오면 즉시
   AppKit.editing(view)            입력 중인지 (배경 새로고침이 입력값을 지우지 않게)
   AppKit.sequence()               늦게 온 예전 응답 버리기
   AppKit.showErrors(build)        앱 오류를 화면에 표시
   AppKit.sure(btn)                두 번 눌러야 지워지는 버튼
   AppKit.copy(text) / buzz()      복사 · 진동
   AppKit.toJpeg(file, maxSide)    사진 줄여서 올리기
   AppKit.device()                 접속 기록용 기기·방식 */
const AppKit = (() => {
  const $ = s => typeof s === 'string' ? document.querySelector(s) : s;
  const root = document.documentElement;
  const standalone = () => !!navigator.standalone || matchMedia('(display-mode: standalone)').matches;

  /* ── 1. 화면 높이 ──
     아이폰 홈 화면 앱은 웹 화면(innerHeight)을 실제 화면보다 짧게 잡을 때가 있다.
     그 차이(gap)만큼 문서 높이를 늘려 맨 아래 빈 띠를 없앤다. 가로 모드·브라우저에서는 보정하지 않는다. */
  let gap = 0;
  function fixViewport() {
    const set = () => {
      const portraitH = Math.max(screen.height, screen.width);
      const raw = innerHeight < innerWidth ? 0 : portraitH - innerHeight;
      gap = standalone() && raw > 0 && raw < 160 ? raw : 0;
      root.style.setProperty('--app-h', (innerHeight + gap) + 'px');
      root.classList.toggle('standalone', standalone());
    };
    set();
    addEventListener('resize', set);
    addEventListener('orientationchange', () => setTimeout(set, 300));
  }

  /* ── 2. 로딩 ── */
  function bootDone() { const b = $('.ak-boot'); if (!b) return; b.classList.add('out'); setTimeout(() => b.remove(), 300); }

  let tapAt = 0, tapEl = null, busyN = 0, pillTm = 0, busyLabel = '잠깐만요, 처리 중이에요', busyEmoji = '⏳';
  ['pointerdown', 'change'].forEach(t => document.addEventListener(t, e => {
    tapAt = Date.now();
    if (t === 'pointerdown') tapEl = e.target.closest?.('button,label,.btn,[role=button]') || null;
  }, true));
  function busyUI(on, label) {
    let bar = $('.ak-bar'), pill = $('.ak-pill');
    if (on) {
      if (!bar) { bar = document.createElement('div'); bar.className = 'ak-bar'; document.body.appendChild(bar); }
      if (!pill) { pill = document.createElement('div'); pill.className = 'ak-pill'; pill.setAttribute('role', 'status'); document.body.appendChild(pill); }
      pill.innerHTML = `<span class="e">${busyEmoji}</span><span></span><span class="d"><i></i><i></i><i></i></span>`;
      pill.children[1].textContent = label || busyLabel;
      pill.classList.toggle('top', !!$('.ak-sheet.on'));           // 시트가 열려 있으면 버튼을 가리지 않게 위로
      requestAnimationFrame(() => bar.classList.add('on'));
      clearTimeout(pillTm); pillTm = setTimeout(() => pill.classList.add('on'), 350);   // 금방 끝나면 알약은 안 띄움
    } else {
      clearTimeout(pillTm); bar?.classList.remove('on'); pill?.classList.remove('on');
      document.querySelectorAll('.is-busy').forEach(x => x.classList.remove('is-busy'));
    }
  }
  function track(p, { el, label } = {}) {
    busyN++; const b = $(el) || tapEl; if (b && document.contains(b)) b.classList.add('is-busy'); busyUI(true, label);
    const done = () => { if (--busyN <= 0) { busyN = 0; busyUI(false); } };
    p.then(done, done); return p;
  }
  /* 사용자가 누른 지 1.5초 안에 시작된 요청만 표시한다. 배경 새로고침은 조용히. */
  function wrap(fn, skip) {
    return function (...a) {
      const p = fn.apply(this, a);
      if (Date.now() - tapAt > 1500 || (skip && skip(...a))) return p;
      return track(p);
    };
  }
  function spin(el, p) { el = $(el); el?.classList.add('ak-spin'); const off = () => el?.classList.remove('ak-spin'); p.then(off, off); return p; }
  function setBusy({ label, emoji } = {}) { if (label) busyLabel = label; if (emoji) busyEmoji = emoji; }

  let toastTm = 0;
  function toast(msg, ms = 2400) {
    let t = $('.ak-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ak-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = msg; requestAnimationFrame(() => t.classList.add('on'));
    clearTimeout(toastTm); toastTm = setTimeout(() => t.classList.remove('on'), ms);
  }

  /* ── 3. 스와이프 ──
     · 세로 스크롤과 헷갈리지 않게: 가로 이동이 세로의 1.5배 이상, 60px 이상, 0.7초 이내일 때만.
     · 가로로 스크롤되는 영역·입력칸·지도·[data-noswipe] 안에서 시작하면 무시.
     · 화면 왼쪽 끝 24px 에서 시작하면 무시 (사파리 뒤로 가기 동작과 겹침). */
  function hScrollable(n, stop) {
    for (; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
      if (n.matches('[data-noswipe],input,textarea,select,.ak-hscroll,.leaflet-container,canvas')) return true;
      if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    }
    return false;
  }
  function swipe(el, { onNext, onPrev, min = 60 } = {}) {
    el = $(el); let x0 = null, y0 = 0, t0 = 0;
    el.addEventListener('touchstart', e => {
      x0 = null; if (e.touches.length !== 1) return;
      const t = e.touches[0]; if (t.clientX < 24 || hScrollable(e.target, el)) return;
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 == null) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
      if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 700) return;
      (dx < 0 ? onNext : onPrev)?.();
    }, { passive: true });
    el.addEventListener('touchcancel', () => { x0 = null; }, { passive: true });
  }
  /* 탭바(.ak-tabs button[data-tab]) + 내용(render) + 스와이프를 한 번에 연결 */
  function tabs({ bar = '.ak-tabs', view = '#sc', ids, start, render, remember = 'ak-tab' }) {
    bar = $(bar); view = $(view);
    let cur = start || ids[0];
    try { const s = localStorage.getItem(remember); if (remember && ids.includes(s)) cur = s; } catch (e) {}
    function go(id, dir) {
      if (!ids.includes(id)) return;
      if (dir == null) dir = Math.sign(ids.indexOf(id) - ids.indexOf(cur));
      cur = id; try { remember && localStorage.setItem(remember, id); } catch (e) {}
      bar?.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
      render(id); view.scrollTop = 0;
      view.classList.remove('ak-in-l', 'ak-in-r');
      if (dir) { void view.offsetWidth; view.classList.add(dir > 0 ? 'ak-in-l' : 'ak-in-r'); }
    }
    bar?.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
    swipe(view, {
      onNext: () => { const i = ids.indexOf(cur); if (i < ids.length - 1) go(ids[i + 1], 1); },
      onPrev: () => { const i = ids.indexOf(cur); if (i > 0) go(ids[i - 1], -1); },
    });
    go(cur, 0);
    return { go, get current() { return cur; } };
  }

  /* ── 4. 바텀시트 ── 손잡이(.ak-grab)를 끌어내리거나 바깥을 누르면 닫힌다 */
  function sheet(el) {
    el = $(el);
    let scrim = el.previousElementSibling?.classList.contains('ak-scrim') ? el.previousElementSibling : null;
    if (!scrim) { scrim = document.createElement('div'); scrim.className = 'ak-scrim'; el.before(scrim); }
    const open = () => { el.style.transform = ''; el.classList.add('on'); scrim.classList.add('on'); };
    const close = () => { el.style.transform = ''; el.classList.remove('on'); scrim.classList.remove('on'); };
    scrim.addEventListener('click', close);
    const g = el.querySelector('.ak-grab');
    if (g) {
      let y0 = null, moved = 0, t0 = 0;
      g.addEventListener('pointerdown', e => { y0 = e.clientY; t0 = Date.now(); moved = 0; el.classList.add('dragging'); g.setPointerCapture(e.pointerId); });
      g.addEventListener('pointermove', e => { if (y0 == null) return; moved = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${moved}px)`; });
      const up = () => {
        if (y0 == null) return; y0 = null; el.classList.remove('dragging');
        const v = moved / Math.max(1, Date.now() - t0);
        if (moved > el.offsetHeight * .3 || v > .5) close(); else el.style.transform = '';
      };
      g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    }
    return { open, close, get isOpen() { return el.classList.contains('on'); } };
  }

  /* ── 5. 새 버전 자동 열기 ──
     휴대폰이 예전 화면을 붙잡고 있을 때: version.txt 숫자가 이 페이지의 build 와 다르면 ?v=숫자 로 다시 연다.
     같은 버전으로 두 번 되돌지 않게 sessionStorage 에 기록한다. */
  function autoUpdate(build, url = 'version.txt') {
    const chk = () => fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(v => {
      v = (v || '').trim(); if (!/^[0-9]+$/.test(v) || v === String(build)) return;
      try { if (sessionStorage.getItem('ak-up') === v) return; sessionStorage.setItem('ak-up', v); } catch (e) {}
      location.replace(location.pathname + '?v=' + v + location.hash);
    }).catch(() => {});
    chk(); document.addEventListener('visibilitychange', () => { if (!document.hidden) chk(); });
  }

  /* ── 6. 진단 ── 화면 문제를 볼 때 설정 화면 맨 아래에 작게 보여 준다 */
  function env(build) {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:env(safe-area-inset-top);height:env(safe-area-inset-bottom);visibility:hidden';
    document.body.appendChild(p); const cs = getComputedStyle(p), st = cs.top, sb = cs.height; p.remove();
    return `버전 ${build ?? '-'} · ${standalone() ? '홈 화면 앱' : '브라우저'} · 화면 ${screen.width}×${screen.height} · 웹뷰 ${innerWidth}×${innerHeight} · 안전영역 위 ${st} 아래 ${sb} · 보정 ${gap}px`;
  }

  /* ── 7. 저장·글자·숫자 ── */
  /* 저장소: 앱마다 접두어를 붙이고(같은 github.io 주소를 여러 앱이 함께 쓴다), 막혀 있어도 앱이 죽지 않게 try 로 감싼다 */
  function store(prefix) {
    const k = n => prefix + '.' + n;
    return {
      get(n, d) { try { const v = localStorage.getItem(k(n)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(n, v) { try { localStorage.setItem(k(n), JSON.stringify(v)); } catch (e) {} },
      del(n) { try { localStorage.removeItem(k(n)); } catch (e) {} },
    };
  }
  /* 서버·사용자 글자를 innerHTML 에 넣을 때는 반드시 esc() */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const num = n => Math.round(n).toLocaleString('ko-KR');
  const krw = n => (n < 0 ? '−' : '') + num(Math.abs(n)) + '원';
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n));
  /* 날짜는 휴대폰 시간대와 상관없이 한국 시간 기준 YYYY-MM-DD */
  const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const hhmm = (d = new Date()) => pad(d.getHours()) + ':' + pad(d.getMinutes());

  /* ── 8. 자동 새로고침 ──
     화면이 보일 때만 ms 마다 fn 을 부르고, 다른 앱에 갔다 돌아오면 바로 한 번 부른다.
     ms 를 함수로 주면 매번 간격을 다시 정한다(예: 장중 15초, 마감 뒤 2분). busy() 가 참이면 건너뛴다. */
  function poll(fn, ms, busy) {
    let tm = 0;
    const next = () => { clearTimeout(tm); if (!document.hidden) tm = setTimeout(tick, typeof ms === 'function' ? ms() : ms); };
    const tick = async () => { if (!document.hidden && !(busy && busy())) { try { await fn(); } catch (e) {} } next(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(tm); else tick(); });
    next();
    return { now: tick, stop: () => clearTimeout(tm) };
  }
  /* 사용자가 입력 중이거나 저장 안 한 값이 있으면 참 → 배경 새로고침이 화면을 다시 그려 입력값을 지우지 않게 */
  function editing(view = '#sc') {
    const v = $(view); if (!v) return false; const a = document.activeElement;
    if (a && v.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
    return [...v.querySelectorAll('input,textarea')].some(i =>
      i.type === 'checkbox' || i.type === 'radio' ? i.checked !== i.defaultChecked : i.type !== 'file' && i.value !== i.defaultValue);
  }
  /* 늦게 온 예전 응답 버리기:  const mine = seq.next();  …await…  if (!seq.is(mine)) return; */
  function sequence() { let n = 0; return { next: () => ++n, is: v => v === n }; }

  /* ── 9. 오류·확인 ── */
  /* 앱 오류를 화면에 보여 준다(사용자가 캡처해서 알려 줄 수 있게). 다른 주소 스크립트의 'Script error.'(줄 번호 없음)는 무시 */
  function showErrors(build) {
    addEventListener('error', e => {
      if (!e.lineno) return;
      let b = $('.ak-err'); if (!b) { b = document.createElement('div'); b.className = 'ak-err'; document.body.prepend(b); }
      b.textContent = `앱 오류: ${e.message || '알 수 없음'} (줄 ${e.lineno}${build ? ' · 버전 ' + build : ''})`;
    });
  }
  /* 지우기처럼 되돌릴 수 없는 버튼: 처음 누르면 글자가 "정말 삭제"로 바뀌고, 한 번 더 눌러야 참 */
  function sure(btn, label = '정말 삭제') {
    if (btn.dataset.sure) return true;
    const old = btn.textContent; btn.dataset.sure = '1'; btn.textContent = label;
    setTimeout(() => { if (document.contains(btn)) { delete btn.dataset.sure; btn.textContent = old; } }, 3000);
    return false;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
    catch (e) { toast(text, 5000); }
  }
  const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch (e) {} };

  /* ── 10. 사진 줄이기 ── 올리기 전에 긴 변 maxSide 로 줄인 JPEG(data URL). Apps Script·시트에 큰 사진을 그대로 보내지 않는다 */
  async function toJpeg(file, maxSide = 1100, quality = .82) {
    let img; try { img = await createImageBitmap(file); } catch (e) {
      img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
    }
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight, s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }

  /* ── 11. 접속 정보 ── 서버 접속 기록용: 어떤 기기에서 어떤 방식으로 열었는지 */
  function device() {
    const u = navigator.userAgent || ''; let dev = '기타';
    if (/iPhone/.test(u)) dev = 'iPhone'; else if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) dev = 'iPad';
    else if (/Android/.test(u)) dev = 'Android'; else if (/Macintosh/.test(u)) dev = 'Mac'; else if (/Windows/.test(u)) dev = 'Windows';
    const v = (u.match(/OS (\d+)[_.]/) || [])[1]; if (v && /iP/.test(dev)) dev += ' iOS ' + v;
    let via = '브라우저';
    try { if (new URLSearchParams(location.search).get('via') === 'widget') via = '위젯'; else if (standalone()) via = '홈화면 앱'; } catch (e) {}
    return { dev, via };
  }

  return { fixViewport, bootDone, track, wrap, spin, setBusy, toast, swipe, tabs, sheet, autoUpdate, env, standalone,
    store, esc, pad, num, krw, signed, kstDate, addDays, hhmm, poll, editing, sequence, showErrors, sure, copy, buzz, toJpeg, device };
})();
