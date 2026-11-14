/* 비밀번호 6자리 자동 로그인·관리자 할 일 배지·초대 링크·% 표시 — 올포오션(badapan)에서 실제 쓰는 코드 그대로. 앱에 맞게 S·esc·AppKit 이름만 맞춰 붙인다 */
let gBusy = false, gLast = '';
function pinAuto(e) {
  if (e.target.id !== 'gpin') return;
  const el = e.target, v = el.value.replace(/\D/g, '').slice(0, 6); if (v !== el.value) el.value = v;
  if (v.length < 6) { gLast = ''; return; }
  if (gBusy || v === gLast) return;
  const b = gate.querySelector('[data-g="login"],[data-g="unlock"]'); if (!b) return;
  if (b.dataset.g === 'login' && !(document.getElementById('gname')?.value || '').trim()) return document.getElementById('gname')?.focus();
  gLast = v; el.blur(); gateAct(b.dataset.g);
}
['input', 'keyup', 'change'].forEach(t => gate.addEventListener(t, pinAuto));
gate.addEventListener('paste', e => setTimeout(() => pinAuto(e), 0));
function adminTodo() { const a = S.data?.admin; return a ? (a.pending?.length || 0) + (a.feedbackNew || 0) : 0; }   // 관리자: 가입 승인 대기 + 새 건의
function newsUnread() { const seen = LS.get('newsSeen', ''); return (S.data?.news || []).filter(n => !n.mine && n.at > seen).length + adminTodo(); }
function inviteText() {
  const url = location.origin + location.pathname.replace(/index\.html$/, '') + '?join';
  return { url, text: `[올포오션] 해양사업본부 공용 앱 초대예요 (${S.data?.me?.name || ''})
입찰 공고·현장 날씨·사업 현황·휴가·출장을 한곳에서 봐요.

1) 아래 주소를 아이폰은 Safari, 안드로이드는 Chrome으로 열기
2) 홈 화면에 추가 (아이폰: 공유 버튼 → 홈 화면에 추가 / 안드로이드: ⋮ → 홈 화면에 추가)
3) 홈 화면 아이콘으로 열고 이름·회사·팀·숫자 6자리 비밀번호로 가입 신청
4) 관리자가 승인하면 바로 써요

${url}` };
}
async function invite(copyOnly) {
  const { url, text } = inviteText();
  if (!copyOnly && navigator.share) { try { await navigator.share({ title: '올포오션 초대', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); AppKit.toast('초대 문구를 복사했어요. 카톡에 붙여 넣으세요'); }
  catch (e) { prompt('아래 문구를 복사해 보내세요', url); }
}
const bidPct = v => { if (v == null || v === '') return '-'; const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); if (!isFinite(n)) return esc(String(v)); return pct(n <= 1.5 ? n * 100 : n); };
