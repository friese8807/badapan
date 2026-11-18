/**
 * 올포오션 서버 (Google Apps Script 웹 앱) — 예전 이름 바다판
 * 올포랜드·엘티메트릭 해양사업본부 공용 — 입찰 레이더 · 현장 날씨판 · 사업 일정 · 오늘판
 *
 * 보안 원칙
 *  - 비밀번호(6자리)는 저장하지 않는다. 사람마다 다른 소금값 + 서버 비밀값(PEPPER)으로 여러 번 HMAC 한 값만 남긴다.
 *  - 로그인하면 무작위 토큰을 주고, 시트에는 토큰의 해시만 남긴다(시트가 새어도 토큰을 쓸 수 없게). 30일 지나면 끝.
 *  - 비밀번호 5번 틀리면 15분 잠금(이름별 + 전체). 실패도 접속 기록에 남긴다.
 *  - 모든 요청에서 토큰을 확인하고, 역할(팀원/팀장/본부장/관리자)은 서버에서 확인한다. 화면에서 버튼을 숨기는 것만 믿지 않는다.
 *  - 공공데이터 인증키는 스크립트 속성에만 둔다(화면 코드·시트에 넣지 않는다).
 *  - 휴가·출장은 이름과 구분만 내보낸다(사유·장소 세부는 내보내지 않음).
 *  - 사용자가 넣은 글자는 길이를 자르고, 시트 수식으로 해석되지 않게 앞에 ' 를 붙인다(=,+,-,@ 로 시작할 때).
 *
 * 처음 설정
 *  1) 본부 공용 구글 계정으로 script.google.com 에서 새 프로젝트를 만들고 이 파일을 붙여 넣는다.
 *  2) setup() 을 한 번 실행 → 시트가 만들어지고, 첫 관리자 계정을 넣으라는 안내가 실행 로그에 나온다.
 *     createAdmin('이름', '올포랜드', '해양SI 1팀', '123456') 을 고쳐서 한 번 실행한다(실행 뒤 그 줄은 지운다).
 *  3) 프로젝트 설정 → 스크립트 속성에 DATA_GO_KR_KEY(공공데이터포털 일반 인증키, 디코딩 값)를 넣는다.
 *     본부 휴가·출장 캘린더를 쓰려면 ABSENCE_CALENDAR_ID, 연차 사업 이력·사업 현황을 쓰려면 ARCHIVE_ID(아카이브 시트 ID),
 *     그룹웨어 주간보고를 붙이려면 WEEKLY_ID('올포오션 사업 주간보고 (자동 수집)' 시트 ID)도 넣는다.
 *  4) 배포 → 새 배포 → 웹 앱: 실행 "나", 액세스 "모든 사용자". 나온 …/exec 주소를 index.html 의 API_URL 에 넣는다.
 *  5) installTriggers() 를 한 번 실행 → 공고 수집(매시), 날씨 수집(3시간마다), 아침 메일(8시), 정리(매일 새벽)가 걸린다.
 */

const TZ = 'Asia/Seoul';
const SESSION_DAYS = 30;
const MAX_FAIL = 5, LOCK_MIN = 15;
const ROLES = ['member', 'lead', 'head', 'admin'];
const SHEETS = {
  회원: ['id', 'name', 'company', 'team', 'role', 'email', 'digest', 'salt', 'hash', 'status', 'createdAt', 'lastAt', 'device', 'notify'],
  세션: ['id', 'userId', 'tokenHash', 'device', 'createdAt', 'lastAt', 'expiresAt'],
  공고: ['id', 'kind', 'no', 'title', 'org', 'demand', 'budget', 'posted', 'close', 'closeTime', 'url', 'kw', 'owner', 'collectedAt', 'hist', 'ofcl', 'tel'],
  관심: ['bidId', 'userId'],
  투표: ['bidId', 'userId', 'vote', 'at'],
  의견: ['id', 'bidId', 'userId', 'who', 'text', 'at'],
  지점: ['id', 'name', 'proj', 'lat', 'lon', 'sea', 'obsCode', 'obsName', 'maxWave', 'maxWind', 'createdBy', 'wx'],
  사업: ['id', 'name', 'company', 'client', 'pm', 'progress', 'end', 'warranty', 'miles', 'issue', 'updatedBy', 'updatedAt', 'lat', 'lon', 'place'],
  설정: ['key', 'value'],
  소식: ['id', 'at', 'type', 'bidId', 'userId', 'who', 'text'],
  건의: ['id', 'at', 'userId', 'who', 'text', 'status', 'reply', 'repliedAt'],
  접속: ['at', 'name', 'action', 'device', 'via', 'fail'],
};
/* 공공데이터 주소 — 공공데이터포털에서 활용 신청한 서비스의 "요청주소"가 다르면 스크립트 속성에서 바꿀 수 있게 했다 */
const SCHEMA = '4';   // 시트 칸이 늘면 올린다 → 다음 요청 때 머리줄을 저절로 맞춘다
const ENDPOINT = {
  BID: 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch',          // 나라장터 입찰공고(용역)
  PRE: 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch',  // 나라장터 사전규격(용역)
  FCST: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',                        // 기상청 단기예보 (WAV 파고, WSD 풍속)
  WRN: 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus',                                 // 기상청 특보 현황
  TIDE: 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService',                       // 국립해양조사원 조석예보(고·저조) — 공공데이터포털 15156018 (예전 khoa.go.kr 주소는 2026년 폐지)
  CNTRCT: 'https://apis.data.go.kr/1230000/ao/CntrctInfoService/getCntrctInfoListServc',                   // 나라장터 계약정보(용역) — 공동수급 구성사
};
/* ── 공고 거르기 규칙 (해양·GIS 업무) ──
   1) 빼는 단어가 제목에 있으면 무조건 뺀다 (관리자 목록 + 아래 기본 목록)
   2) 분야 단어(연안·항만·전자해도·공간정보·GIS …)가 제목에 있으면 넣는다
   3) '해양·바다·수산·어항·어촌'처럼 넓은 단어나 관심 발주처는, 제목에 정보화·조사 성격의 단어가 함께 있을 때만 넣는다 */
const GENERIC = ['해양', '바다', '수산', '어항', '어촌', '어업', '해운', '연안', '항만', '해상', '선박', '갯벌', '항로', '해안'];
/* 올포랜드 수행실적(나라장터 해양공고 아카이브) 사업명에서 뽑은 단어 — 2026-11 반영
   · ALF_STRONG: 해양·GIS 업무 고유 단어 → 제목에 있으면 바로 넣음
   · ALF_COND: 바다·수산 관련이지만 정보화가 아닐 수도 있는 단어 → 정보화·조사 단어와 함께 있을 때만
   · ALF_PLACE / ALF_COMMON: 지명·일반 업무 단어 → 목록에는 두되, 이것만으로는 공고를 넣지 않음(엉뚱한 공고 방지) */
const ALF_STRONG = ['해수욕장 이용환경', '위성영상', '해상 디지털', 'EEZ', 'GIS', 'ISP', 'S-102', 'S-100', 'e-Navigation', '공간정보', '공간정보시스템', '국가어항', '국가어항시설물', '국가해양공간정보', '국가해양기본조사', '국립해양조사원', '대축척', '디지털트윈', '바다로드뷰', '바다봄', '바다지도', '비디지털자료', '소나', '사이드스캔', '소형선용', '수로', '수로도서지', '수로측량', '수중부', '어항정보', '연안관리정보시스템', '연안재해취약성', '연안침식', '연안해역정밀조사', '연안해역조사', '원격조사', '위성영상', '이안류', '장기관측', '장기조류관측', '장기조석관측', '정밀수로측량', '정밀해저지형조사', '조류정보', '조석', '조석조류', '지도서비스', '지형도면', '천부지층', '초해상화', '측량', '항계안전', '항만해역', '항만해역정밀수로측량', '항해용', '해도', '해도제작', '해수유동', '해안선변화조사', '해양공간', '해양공간계획', '해양공간계획체계', '해양공간계획체제', '해양공간관리계획', '해양공간정보DB', '해양관할구역', '해양기본조사', '해양기상', '해양수산정보', '해양안전', '해양안전정보', '해양안전지도', '해양영토', '해양예보', '해양예보방송', '해양예보정보', '해양예측정보', '해양위성', '해양정보', '해양조사', '해양조사자료', '해양지도', '해양환경정보', '해양활동', '해양관측', '해양빅데이터', '해양데이터', '해저', '해저관측기지', '해저면', '해저지형조사', '해저지형표면', '환경관리해역', '관할해역', '무인도서', '관측자료', '수심', '지리정보', 'VTS'];
const ALF_COND = ['해수욕장', '인공어초', '바다숲', '남해바다숲', '동해바다숲', '바다정원화', '방조제', '토목조사', '전복산업', '농림수산식품', '투자정보', '지하시설물', '해양수산', '해양수산분야', '해양환경', '생태분야', '이용실태', '사후영향조사', '시설상태조사', '적지조사', '조성해역', '조성지', '설치예정지', '해역', '해역별', '외해역', '주요해역', '특정해역', '주요연안', '서해연안', '남해역', '서남해역', '북부해역'];
const ALF_PLACE = ['가거도서부', '강원', '강화도', '거제부근', '경기만', '경북해역', '경인항', '고성', '군산외항', '남해안', '동해안', '동해안EEZ해역', '목포항', '보령', '보령항', '부산항', '부안군', '새만금', '서해', '서해안', '여수', '여수동부', '여수산단', '연도항', '완도군', '울릉도남부', '울산', '울진동부해역', '인니', '인천', '인천항', '임자도', '전남', '전북', '제부도부근', '제주', '제주도', '제주도동부', '제주서부', '추자도부근', '충남해역', '치르본', '태안', '태안부근', '태안서부', '태안항', '흑산도서부', '상태도'];
const ALF_COMMON = ['DB', 'DB구축', 'R&D', 'SW', '가시화', '가용성', '감시', '감시예측', '감시체계', '개발', '개방', '개방전략', '개방체계', '개선', '개선방안', '검증', '계획', '고도화', '고시', '공동활용', '공동활용체계', '관리', '관리계획', '관리시스템', '관리유형', '관리활용시스템', '구축', '국가', '기능', '기반', '기반구축', '기반마련', '기초데이터', '데이터', '도구', '도면제작', '디지털', '마련', '맞춤형', '보완', '분석', '비교검증', '사용자', '사전', '산업육성', '산업화', '서비스', '선진화', '설치', '수립', '수록', '수집관리체계', '시범', '시범구축', '시설물', '시스템', '실시간', '연계', '연계분석', '연구', '영상', '영상정보', '예방', '운영', '유지관리', '유지보수', '융복합', '융합서비스', '의사결정', '이용환경', '이행평가', '인프라', '자료분석', '전환기반', '정보', '정보관리시스템', '정보시스템', '정보시스템구축', '정확도', '제고', '제공시스템', '제작', '조사', '조성관리', '종합분석', '주기적', '중점개방', '지능형', '지역', '지원', '지원사업', '지원체계', '채널', '체계', '체계적', '통신', '통합관리', '통합관리체계', '특화', '평가체계', '표준', '표출', '프로토타입', '플랫폼', '현행화', '현황', '현황도', '현황조사', '확대', '활성화', '활용', '활용도', '활용시스템', '활용체계', '획정', '정밀조사'];
/* 정보화·GIS 성격 단어 — '해양·수산' 같은 넓은 단어는 이 단어가 함께 있을 때만 넣는다.
   (2026-11 좁힘) '구축·고도화·조사·분석·AI·스마트'는 산업 육성·R&D 공고에도 흔해서 뺐다 */
const TECH = ['시스템', '플랫폼', '정보화', '정보시스템', '데이터', 'DB', '데이터베이스', 'GIS', '지리정보', '공간정보', '지도', '디지털트윈',
  '유지관리', '유지보수', '관측', '모니터링', '측량', '전산', '소프트웨어', 'SW', '빅데이터', '클라우드', '통합관제', '관제', '예측', '공동활용', '통합관리'];
/* 현장 조사 성격이라 '조사'만 함께 있어도 넣는 단어 (바다숲 사후영향조사, 해수욕장 현황조사 …) */
const SURVEY_OK = ['해수욕장', '인공어초', '바다숲', '남해바다숲', '동해바다숲', '바다정원화', '방조제', '토목조사', '이용실태', '사후영향조사', '시설상태조사', '적지조사', '조성해역', '조성지', '설치예정지'];
/* 바다·GIS 맥락이 있어야 하는 단어 — 농업용 수로, 지적측량, 아무 기관의 ISP 같은 육상 공고를 막는다 */
const NEED_CTX = ['측량', '수로', 'ISP', '수심', '대축척', '지형도면', '관측자료', '장기관측', '원격조사', '초해상화', '지도서비스', '위성영상', '소나', '조석',
  // (2026-11) 육상 GIS 공고가 너무 많아, GIS·공간정보·디지털트윈도 바다 맥락이 있을 때만
  'GIS', '공간정보', '공간정보시스템', '지리정보', '디지털트윈', '해저'];
const CTX = ['해도', '해양', '바다', '연안', '항만', '항로', '항구', '해역', '어항', '어촌', '어업', '수산', '해안', '해수', '갯벌', '해상', '방조제', '해수욕장', 'EEZ', '선박', '해운', '무인도', '섬', '도서지역', '수로'];
const BUILTIN_EXCLUDE = ['홍보', '홍보영상', '동영상', '영상제작', '영상 제작', '유튜브', 'SNS', '행사', '축제', '박람회', '전시', '인쇄', '출판', '청소', '경비', '급식', '방역', '보험', '임차', '렌탈',
  '차량', '물품', '구매', '공사', '준설', '축조', '조경', '건축설계', '교육운영', '연수', '채용', '번역', '실시설계', '정비사업', '보수공사', '정책 수립', '정책수립', '연구용역 위탁 기관 선정',
  // (2026-11 추가) 해양쓰레기·감리·R&D 기획/관리·산업 지원 공고 — 해양 단어가 있어도 우리 업무가 아님
  '쓰레기', '폐기물', '수거', '정화활동', '감리', '기획연구', '기획 연구', '위탁정산', '정산', '경진대회', '대행', '퇴직연금', '진로상담', '구매상담', '포럼',
  '상용화', '사업화', '투자활성화', '투자유치', '창업', '수출', '성과분석', '성과조사', '실적조사', '통계생산', '기술이전', '기술료', '수준평가', '기관평가', '산업벨트', '레저', '관광', '양식', '수산물', '어선 건조', '연료전지',
  // (2026-11) 육상·기타 공고
  '도서관', '인플루엔자', '하수', '상수도', '생활용수', '공업용수', '산업단지', '승강기', '소방', '교육청', '위해상품', '중량물', '기관실', '사설항로표지', '전기차',
  '설비', '물성계측', '전화장비', '시설관리', '시설방호', '임직원', '질서유지', '탄소중립'];
/* 관심 단어 불러오기 — 예전 설정이면 새 기본 단어를 한 번 합쳐 저장한다 */
function kw_() {
  const k = getSetting_('keywords', DEFAULT_KW);
  if (k.v !== 4) {
    const u = (a, b) => (a || []).concat(b || []).filter((x, i, arr) => x && arr.indexOf(x) === i);
    const m = { v: 4, words: u(k.words, DEFAULT_KW.words), orgs: u(k.orgs, DEFAULT_KW.orgs), exclude: (k.exclude || []).filter(x => BUILTIN_EXCLUDE.indexOf(x) < 0) };
    try { setSetting_('keywords', m); } catch (e) {}
    return m;
  }
  return k;
}
function relevant_(title, org, kw) {
  title = String(title || ''); org = String(org || '');
  const has = w => w && title.indexOf(w) >= 0;
  if ((kw.exclude || []).concat(BUILTIN_EXCLUDE).some(has)) return null;
  const tech = TECH.some(has), survey = tech || has('조사');
  const ctx = CTX.some(has) || ALF_PLACE.some(has) || /해양|수산|항만|해수|조사원/.test(org) || (kw.orgs || []).some(o => org.indexOf(o) >= 0);
  // 1) 해양·GIS 고유 단어 — 육상에도 쓰이는 단어(측량·수로·ISP …)는 바다·GIS 맥락이 있을 때만
  //    (후보 단어 목록은 관심 단어가 같으면 한 번만 만든다 — 공고 수백 건을 거를 때 수십 배 빨라짐)
  if (relevant_.kw !== kw) { const cond = GENERIC.concat(ALF_COND), quiet = ALF_PLACE.concat(ALF_COMMON);
    relevant_.kw = kw; relevant_.cand = (kw.words || []).filter((w, i, a) => w && a.indexOf(w) === i && cond.indexOf(w) < 0 && quiet.indexOf(w) < 0); }
  const strong = relevant_.cand.filter(w => has(w) && (NEED_CTX.indexOf(w) < 0 || ctx));
  if (strong.length) return strong.slice(0, 4);
  // 2) 바다숲·해수욕장·인공어초 같은 단어는 정보화 단어나 '조사'가 함께 있을 때, 해양·수산 같은 넓은 단어는 정보화 단어가 함께 있을 때만
  const soft = ALF_COND.concat((kw.words || []).filter(w => ALF_COND.indexOf(w) >= 0)).filter((w, i, a) => has(w) && a.indexOf(w) === i);
  if (soft.length && (tech || (survey && soft.some(w => SURVEY_OK.indexOf(w) >= 0)))) return soft.slice(0, 2).concat(TECH.concat('조사').filter(has).slice(0, 2));
  const wide = GENERIC.filter(has);
  if (wide.length && tech) return wide.slice(0, 2).concat(TECH.filter(has).slice(0, 2));
  if ((kw.orgs || []).some(o => org.indexOf(o) >= 0) && tech) return TECH.filter(has).slice(0, 2);
  return null;
}
const DEFAULT_KW = {
  words: ['해양공간', '해양정보', '해양조사', '해양관측', '해양안전', '해양환경', '해양빅데이터', '해양데이터', '연안', '항만', '전자해도', '해도', '수로', '조석', '해저', '수심',
    '갯벌', '해상', '선박', 'VTS', '디지털트윈', '공간정보', '지리정보', 'GIS', '측량', '해양'].concat(ALF_STRONG, ALF_COND, ALF_PLACE, ALF_COMMON),
  orgs: ['해양수산부', '해양경찰청', '국립해양조사원', '해양환경공단', '한국해양과학기술원', '해양수산과학기술진흥원', '국립수산과학원', '국립해양측위정보원', '한국해양조사협회', '항만공사', '지방해양수산청'],
  exclude: [],
};

/* ══════════ 입구 ══════════ */
function doGet() {
  // 주소로 직접 들어온 사람에게는 아무 자료도 주지 않는다
  return ContentService.createTextOutput('올포오션 서버예요. 앱에서 열어 주세요.');
}
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out_({ ok: false, message: '요청을 읽지 못했어요.' }); }
  const meta = req.meta || {};
  try {
    const a = String(req.action || '');
    if (a === 'signup') return out_({ ok: true, data: signup_(req, meta) });
    if (a === 'login') return out_({ ok: true, data: login_(req, meta) });
    upgrade_();
    const me = auth_(req.token);                       // 여기부터는 로그인한 사람만
    if (a === 'unlock') { checkPin_(me.user, req.pin, meta, 'unlock'); return out_({ ok: true, data: {} }); }
    const fn = ACTIONS[a];
    if (!fn) return out_({ ok: false, message: '모르는 요청이에요.' });
    if (fn.role && ROLES.indexOf(me.user.role) < ROLES.indexOf(fn.role)) return out_({ ok: false, code: 'perm', message: '권한이 없어요.' });
    if (a !== 'load') log_(me.user.name, a, meta);
    return out_({ ok: true, data: fn.run(me, req, meta) });
  } catch (x) {
    if (x.code) return out_({ ok: false, code: x.code, message: x.message });
    console.error(x);
    return out_({ ok: false, message: '서버에서 처리하지 못했어요. 잠시 후 다시 해주세요.' });
  }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(message, code) { const e = new Error(message); e.code = code || 'bad'; throw e; }

/* ══════════ 시트 ══════════ */
/* 한 번의 요청(실행) 안에서는 스프레드시트·시트를 한 번만 열고, 같은 시트를 여러 번 읽으면 처음 읽은 값을 다시 쓴다.
   시트에 쓰면(append_/update_/del_/rowsDirty_) 그 시트의 읽은 값을 버린다. 받은 행은 복사본이라 고쳐도 캐시에 영향이 없다 */
let ss0_ = null, sh0_ = {}, rows0_ = {};
function ss_() {
  if (ss0_) return ss0_;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) fail_('서버 설정이 끝나지 않았어요(setup).');
  return (ss0_ = SpreadsheetApp.openById(id));
}
function sh_(name) { return sh0_[name] || (sh0_[name] = ss_().getSheetByName(name)); }
function rowsDirty_(name) { if (name) delete rows0_[name]; else rows0_ = {}; }
function rows_(name) {
  if (!rows0_[name]) {
    const s = sh_(name), v = s.getDataRange().getValues(), h = v.shift();
    rows0_[name] = v.filter(r => r[0] !== '').map((r, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => o[k] = r[j]); return o; });
  }
  return rows0_[name].map(o => Object.assign({}, o));
}
function append_(name, o) { rowsDirty_(name); sh_(name).appendRow(SHEETS[name].map(k => safe_(o[k]))); }
function update_(name, row, o) {
  rowsDirty_(name);
  const s = sh_(name), h = SHEETS[name], cur = s.getRange(row, 1, 1, h.length).getValues()[0];
  h.forEach((k, j) => { if (k in o) cur[j] = safe_(o[k]); });
  s.getRange(row, 1, 1, h.length).setValues([cur]);
}
function del_(name, row) { rowsDirty_(name); sh_(name).deleteRow(row); }
/* 시트 수식 주입 막기: 사용자가 넣은 글자가 =,+,-,@ 로 시작하면 글자로 저장 */
function safe_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v == null ? '' : v; }
function clip_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function uid_() { return 'i' + Utilities.getUuid().replace(/-/g, '').slice(0, 15); }   // 글자로 시작 → 시트가 숫자로 바꾸지 않게
function getSetting_(k, d) { const r = rows_('설정').find(x => x.key === k); try { return r ? JSON.parse(r.value) : d; } catch (e) { return d; } }
function setSetting_(k, v) { const r = rows_('설정').find(x => x.key === k); const val = JSON.stringify(v); if (r) update_('설정', r._row, { value: val }); else append_('설정', { key: k, value: val }); }

/* ══════════ 비밀번호·토큰 ══════════ */
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function hex_(bytes) { return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function hashPin_(pin, salt) {
  // 서버 비밀값은 한 번만 읽는다(예전에는 2000번 읽어 느리고 하루 사용량을 빨리 썼다). 계산 결과는 예전과 같다.
  const pepper = prop_('PEPPER'), key = Utilities.newBlob(String(salt) + pepper).getBytes();
  let h = Utilities.computeHmacSha256Signature(String(salt) + ':' + pin, pepper);
  for (let i = 0; i < 2000; i++) h = Utilities.computeHmacSha256Signature(h, key);
  return hex_(h);
}
/* 이름 비교: 앞뒤 공백·보이지 않는 글자·한글 조합 방식(NFC/NFD) 차이를 없앤다 */
function nm_(s) { return String(s == null ? '' : s).normalize('NFC').replace(/[\s\u200b-\u200d\ufeff]/g, ''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)); }
function token_() { return sha_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random()); }
function eq_(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function weakPin_(p) { return !/^\d{6}$/.test(p) || /^(\d)\1{5}$/.test(p) || '01234567890'.indexOf(p) >= 0 || '98765432109'.indexOf(p) >= 0; }

/* 틀린 횟수: 이름별 + 전체(여러 이름으로 마구 시도하는 경우) */
function failCount_(key) { return Number(CacheService.getScriptCache().get('f:' + key) || 0); }
function addFail_(key) { const c = CacheService.getScriptCache(); c.put('f:' + key, String(failCount_(key) + 1), LOCK_MIN * 60); }
function clearFail_(key) { CacheService.getScriptCache().remove('f:' + key); }

function signup_(req, meta) {
  const name = nm_(clip_(req.name, 20)), team = clip_(req.team, 20), company = ['올포랜드', '엘티메트릭'].indexOf(req.company) >= 0 ? req.company : '';
  const email = clip_(req.email, 60), pin = String(req.pin || '');
  if (!name || !team || !company) fail_('이름·회사·팀을 확인해 주세요.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('메일 주소를 확인해 주세요.');
  if (weakPin_(pin)) fail_('너무 쉬운 비밀번호예요. 다른 숫자 6자리로 해주세요.');
  if (failCount_('signup') > 30) fail_('신청이 너무 많아요. 잠시 후 다시 해주세요.');
  addFail_('signup');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (rows_('회원').some(u => nm_(u.name) === nm_(name) && u.status !== 'rejected')) fail_('같은 이름이 이미 있어요. 관리자에게 알려 주세요.');
    const salt = 's' + token_().slice(0, 31);   // 글자로 시작 → 시트가 숫자로 바꾸지 않게
    const nid = uid_();
    append_('회원', { id: nid, name, company, team, role: 'member', email, digest: '', salt, hash: hashPin_(pin, salt), status: 'pending', createdAt: now_(), lastAt: '', device: clip_(meta.dev, 40) });
    memberNote_('signup', nid, name, `${name}님(${company} ${team})이 가입을 신청했어요`);
  } finally { lock.releaseLock(); }
  log_(name, '가입 신청', meta);
  // 관리자에게 승인 요청 메일 (앱을 열기 전에도 알 수 있게)
  try { const to = rows_('회원').filter(u => u.status === 'active' && u.role === 'admin' && u.email).map(u => u.email);
    if (to.length) MailApp.sendEmail({ bcc: to.join(','), to: Session.getEffectiveUser().getEmail(), subject: '[올포오션] 가입 승인 요청 · ' + name,
      body: `${name}님(${company} ${team})이 가입을 신청했어요.\n\n앱 → 종 아이콘 → '관리자 할 일'에서 승인하거나 거절해 주세요.` });
  } catch (e) { console.warn('가입 메일', e); }
  return {};
}
function checkPin_(user, pin, meta, action) {
  const key = 'u:' + user.id;
  if (failCount_(key) >= MAX_FAIL || failCount_('all') >= 60) fail_(`비밀번호를 여러 번 틀려서 ${LOCK_MIN}분 동안 잠겼어요.`, 'locked');
  if (!eq_(hashPin_(String(pin || ''), user.salt), user.hash)) {
    addFail_(key); addFail_('all'); log_(user.name, action, meta, true);
    const left = MAX_FAIL - failCount_(key);
    fail_(left > 0 ? `비밀번호가 맞지 않아요. (${left}번 남음)` : `${LOCK_MIN}분 동안 잠겼어요.`, 'pin');
  }
  clearFail_(key);
}
function login_(req, meta) {
  const name = clip_(req.name, 20);
  const user = rows_('회원').find(u => nm_(u.name) === nm_(name) && u.status !== 'rejected');
  // 화면에는 같은 문구를 보이고(이름이 있는지 알려 주지 않기), 접속 기록에는 이유를 남긴다(관리자만 봄)
  if (!user) { addFail_('all'); log_(name || '알 수 없음', '로그인-이름없음', meta, true); fail_('이름 또는 비밀번호가 맞지 않아요.', 'pin'); }
  checkPin_(user, String(req.pin || '').trim(), meta, '로그인');
  if (user.status === 'pending') fail_('관리자 승인을 기다리는 중이에요.', 'pending');
  if (user.status !== 'active') fail_('사용할 수 없는 계정이에요. 관리자에게 문의해 주세요.', 'pending');
  const token = token_(), at = now_();
  append_('세션', { id: uid_(), userId: user.id, tokenHash: sha_(token), device: clip_(meta.dev, 40) + ' · ' + clip_(meta.via, 10),
    createdAt: at, lastAt: at, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
  update_('회원', user._row, { lastAt: at });
  log_(user.name, '로그인', meta);
  return { token, name: user.name };
}
function auth_(token) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) fail_('다시 로그인해 주세요.', 'auth');
  const th = sha_(token);
  const s = rows_('세션').find(x => eq_(String(x.tokenHash), th));
  if (!s || new Date(s.expiresAt) < new Date()) fail_('로그인 기간이 끝났어요. 다시 로그인해 주세요.', 'auth');
  const user = rows_('회원').find(u => u.id === s.userId);
  if (!user || user.status !== 'active') fail_('사용할 수 없는 계정이에요.', 'auth');
  // 마지막 사용 시각은 10분에 한 번만 적는다(시트 쓰기 줄이기)
  if (Date.now() - new Date(s.lastAt).getTime() > 10 * 6e4) update_('세션', s._row, { lastAt: now_() });
  return { user, session: s };
}

/* ══════════ 요청 처리 ══════════ */
const ACTIONS = {
  load: { run: load_ },
  logout: { run: me => { del_('세션', me.session._row); return {}; } },
  logoutAll: { run: me => { dropSessions_(me.user.id); return {}; } },
  sessionOut: { run: (me, r) => { const s = rows_('세션').find(x => x.id === r.id && x.userId === me.user.id); if (s) del_('세션', s._row); return sessions_(me); } },
  changePin: { run: (me, r, meta) => {
    checkPin_(me.user, r.pin, meta, '비밀번호 변경');
    if (weakPin_(String(r.newPin || ''))) fail_('너무 쉬운 비밀번호예요.');
    const salt = 's' + token_().slice(0, 31);   // 글자로 시작 → 시트가 숫자로 바꾸지 않게
    update_('회원', me.user._row, { salt, hash: hashPin_(String(r.newPin), salt) });
    rows_('세션').filter(s => s.userId === me.user.id && s.id !== me.session.id).reverse().forEach(s => del_('세션', s._row));
    return {};
  } },
  prefs: { run: (me, r) => {
    const o = {};
    if ('digest' in r) o.digest = r.digest && me.user.email ? 'Y' : '';
    if ('notify' in r) o.notify = r.notify && me.user.email ? 'Y' : '';
    update_('회원', me.user._row, o); return {};
  } },
  news: { run: me => news_(me) },
  /* 건의함: 누구나 보내고, 관리자가 보고 상태·답을 단다 */
  feedbackAdd: { run: (me, r) => {
    const text = clip_(r.text, 1000); if (text.length < 2) fail_('내용을 적어 주세요.');
    if (rows_('건의').filter(x => x.userId === me.user.id && String(x.at) > new Date(Date.now() - 864e5).toISOString()).length >= 10) fail_('하루에 10건까지 보낼 수 있어요.');
    append_('건의', { id: uid_(), at: now_(), userId: me.user.id, who: me.user.name, text, status: '접수', reply: '', repliedAt: '' });
    const to = rows_('회원').filter(u => u.status === 'active' && u.role === 'admin' && u.email && u.id !== me.user.id).map(u => u.email);
    if (to.length) try { MailApp.sendEmail({ bcc: to.join(','), to: Session.getEffectiveUser().getEmail(), subject: '[올포오션] 새 건의 · ' + me.user.name, body: text + '\n\n앱 → 더보기 → 관리자 → 건의함에서 확인해 주세요.' }); } catch (e) { console.warn('건의 메일', e); }
    return feedbackOf_(me, false);
  } },
  feedbackMine: { run: me => feedbackOf_(me, false) },
  feedbackAll: { role: 'admin', run: me => feedbackOf_(me, true) },
  feedbackSet: { role: 'admin', run: (me, r) => {
    const f = rows_('건의').find(x => x.id === r.id); if (!f) fail_('건의를 찾지 못했어요.');
    const st = ['접수', '검토 중', '반영 예정', '반영 완료', '보류'].indexOf(r.status) >= 0 ? r.status : f.status;
    const reply = clip_(r.reply, 500);
    update_('건의', f._row, { status: st, reply, repliedAt: reply !== f.reply || st !== f.status ? now_() : f.repliedAt });
    return feedbackOf_(me, true);
  } },
  setEmail: { run: (me, r) => {
    const e = clip_(r.email, 80).toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail_('메일 주소 형식을 확인해 주세요.');
    update_('회원', me.user._row, e ? { email: e } : { email: '', digest: '', notify: '' });
    return { email: mask_(e) };
  } },

  bidStar: { run: (me, r) => {
    const L = rows_('관심').filter(x => x.bidId === r.id && x.userId === me.user.id);
    if (r.on && !L.length) append_('관심', { bidId: clip_(r.id, 40), userId: me.user.id });
    if (!r.on) L.reverse().forEach(x => del_('관심', x._row));
    return {};
  } },
  bidOwner: { run: (me, r) => {
    const b = rows_('공고').find(x => x.id === r.id); if (!b) fail_('공고를 찾지 못했어요.');
    const owner = clip_(r.owner, 20);
    // 팀원은 비어 있는 공고를 자기 이름으로만 맡을 수 있다
    if (ROLES.indexOf(me.user.role) < 1 && !(owner === me.user.name && !b.owner)) fail_('담당 지정은 팀장 이상만 할 수 있어요.', 'perm');
    if (owner && !rows_('회원').some(u => u.name === owner && u.status === 'active')) fail_('회원이 아닌 이름이에요.');
    update_('공고', b._row, { owner });
    if (owner && owner !== b.owner) note_(me, 'owner', b, owner === me.user.name ? `${me.user.name}님이 담당을 맡았어요` : `${me.user.name}님이 ${owner}님을 담당으로 정했어요`);
    return {};
  } },
  bidVote: { run: (me, r) => {
    if (['참여', '보류', '불참'].indexOf(r.vote) < 0) fail_('잘못된 선택이에요.');
    const L = rows_('투표').filter(x => x.bidId === r.id && x.userId === me.user.id);
    const same = L.length && L[0].vote === r.vote;
    L.reverse().forEach(x => del_('투표', x._row));
    if (!same) append_('투표', { bidId: clip_(r.id, 40), userId: me.user.id, vote: r.vote, at: now_() });
    // '참여'를 누르면 본부 전체에 알린다 (앱 소식 + 알림 메일을 켠 사람에게 메일)
    if (!same && r.vote === '참여') {
      const b = rows_('공고').find(x => x.id === r.id);
      if (b) { note_(me, 'join', b, `${me.user.name}님이 참여 의사를 밝혔어요`); joinMail_(me, b); }
    }
    if (same && r.vote === '참여') { const b = rows_('공고').find(x => x.id === r.id); if (b) note_(me, 'unjoin', b, `${me.user.name}님이 참여를 취소했어요`); }
    const V = rows_('투표').filter(x => x.bidId === r.id), votes = {};
    V.forEach(x => votes[x.vote] = (votes[x.vote] || 0) + 1);
    return { votes, myVote: same ? '' : r.vote, joiners: joiners_(V, r.id) };
  } },
  bidComment: { run: (me, r) => {
    const text = clip_(r.text, 500); if (!text) fail_('의견을 적어 주세요.');
    if (!rows_('공고').some(x => x.id === r.id)) fail_('공고를 찾지 못했어요.');
    append_('의견', { id: uid_(), bidId: r.id, userId: me.user.id, who: me.user.name, text, at: now_() });
    note_(me, 'comment', rows_('공고').find(x => x.id === r.id), `${me.user.name}: ${text.slice(0, 60)}`);
    return { comments: comments_(me, r.id) };
  } },
  bidCommentDel: { run: (me, r) => {
    const c = rows_('의견').find(x => x.id === r.cid && x.bidId === r.id);
    if (c && (c.userId === me.user.id || me.user.role === 'admin')) del_('의견', c._row);
    return { comments: comments_(me, r.id) };
  } },

  siteAdd: { run: (me, r) => {
    const s = r.site || {}, lat = Number(s.lat), lon = Number(s.lon);
    if (!(lat > 32 && lat < 39.5 && lon > 124 && lon < 132)) fail_('우리나라 바다 좌표를 넣어 주세요.');
    if (rows_('지점').length >= 60) fail_('지점은 60곳까지 등록할 수 있어요.');
    if (!clip_(s.name, 40)) fail_('지점 이름을 넣어 주세요.');
    append_('지점', { id: uid_(), name: clip_(s.name, 40), proj: clip_(s.proj, 60), lat: round_(lat), lon: round_(lon), sea: clip_(s.sea, 30),
      obsCode: /^[A-Z]{2}_\d{4}$/.test(s.obsCode || '') ? s.obsCode : '', obsName: clip_(s.obsName, 20),
      maxWave: num_(s.maxWave, 1.5, 0.1, 10), maxWind: num_(s.maxWind, 10, 1, 40), createdBy: me.user.id, wx: '' });
    weatherOne_(rows_('지점').slice(-1)[0]);   // 3시간 기다리지 않고 바로 받는다
    return sites_(me);
  } },
  siteSave: { run: (me, r) => {
    const s = rows_('지점').find(x => x.id === r.id); if (!s) fail_('지점을 찾지 못했어요.');
    const o = { maxWave: num_(r.maxWave, s.maxWave, 0.1, 10), maxWind: num_(r.maxWind, s.maxWind, 1, 40) };
    // 위치·이름 고치기는 만든 사람이나 팀장 이상만
    if (r.site && (s.createdBy === me.user.id || ROLES.indexOf(me.user.role) >= 1)) {
      const n = r.site, lat = Number(n.lat), lon = Number(n.lon);
      if (!(lat > 32 && lat < 39.5 && lon > 124 && lon < 132)) fail_('우리나라 바다 좌표를 넣어 주세요.');
      Object.assign(o, { name: clip_(n.name, 40) || s.name, proj: clip_(n.proj, 60), lat: round_(lat), lon: round_(lon), sea: clip_(n.sea, 30),
        obsCode: /^[A-Z]{2}_\d{4}$/.test(n.obsCode || '') ? n.obsCode : '', obsName: clip_(n.obsName, 20) });
      if (o.lat !== Number(s.lat) || o.lon !== Number(s.lon) || o.obsCode !== s.obsCode) o.wx = '';   // 위치가 바뀌면 날씨를 새로 받는다
    }
    update_('지점', s._row, o);
    if (o.wx === '') weatherOne_(rows_('지점').find(x => x.id === r.id));
    return sites_(me);
  } },
  weatherNow: { run: me => {
    // 누구나 누를 수 있지만 10분에 한 번만 (공공데이터 호출 수 아끼기)
    const c = CacheService.getScriptCache();
    if (c.get('wxNow')) fail_('방금 받았어요. 10분 뒤에 다시 해 주세요.');
    c.put('wxNow', '1', 600); collectWeather(); return { sites: sites_(me), weatherAt: getSetting_('weatherAt', '') };
  } },
  siteDel: { run: (me, r) => {
    const s = rows_('지점').find(x => x.id === r.id); if (!s) return sites_(me);
    if (s.createdBy !== me.user.id && ROLES.indexOf(me.user.role) < 1) fail_('만든 사람이나 팀장 이상만 지울 수 있어요.', 'perm');
    del_('지점', s._row); return sites_(me);
  } },

  projSave: { role: 'lead', run: (me, r) => {
    const p = r.p || {}, miles = (p.miles || []).slice(0, 20).filter(m => /^\d{4}-\d{2}-\d{2}$/.test(m.date)).map(m => ({ date: m.date, label: clip_(m.label, 40) }));
    const o = { name: clip_(p.name, 80), company: ['올포랜드', '엘티메트릭'].indexOf(p.company) >= 0 ? p.company : '올포랜드', client: clip_(p.client, 40),
      pm: clip_(p.pm, 20), progress: num_(p.progress, 0, 0, 100), end: date_(p.end), warranty: date_(p.warranty), miles: JSON.stringify(miles), updatedBy: me.user.name, updatedAt: now_(),
      lat: '', lon: '', place: clip_(p.place, 30) };
    const la = Number(p.lat), lo = Number(p.lon);
    if (p.lat !== '' && p.lat != null && la > 32 && la < 39.5 && lo > 124 && lo < 132) { o.lat = round_(la); o.lon = round_(lo); }
    if (!o.name) fail_('사업명을 넣어 주세요.');
    const cur = p.id && rows_('사업').find(x => x.id === p.id);
    if (cur) update_('사업', cur._row, o); else append_('사업', Object.assign({ id: uid_(), issue: '' }, o));
    return projects_();
  } },
  projDel: { role: 'lead', run: (me, r) => { const p = rows_('사업').find(x => x.id === r.id); if (p) del_('사업', p._row); return projects_(); } },

  approve: { role: 'admin', run: (me, r) => { const u = rows_('회원').find(x => x.id === r.id); if (u) { update_('회원', u._row, { status: 'active' }); memberNote_('approve', me.user.id, me.user.name, `${me.user.name}님이 ${u.name}님(${u.company} ${u.team}) 가입을 승인했어요`); } return admin_(); } },
  reject: { role: 'admin', run: (me, r) => { const u = rows_('회원').find(x => x.id === r.id && x.status === 'pending'); if (u) { del_('회원', u._row); memberNote_('reject', me.user.id, me.user.name, `${me.user.name}님이 ${u.name}님 가입 신청을 거절했어요`); } return admin_(); } },
  members: { role: 'admin', run: () => rows_('회원').filter(u => u.status === 'active').map(u => ({ id: u.id, name: u.name, company: u.company, team: u.team, role: u.role, email: u.email, last: u.lastAt, digest: on_(u.digest), notify: on_(u.notify) })) },
  // 관리자가 사람마다 메일 받기를 켜고 끈다 (아침 메일 digest / 참여 알림 notify). 메일 주소가 없으면 켤 수 없다
  memberMail: { role: 'admin', run: (me, r) => {
    const u = rows_('회원').find(x => x.id === r.id && x.status === 'active'); if (!u) fail_('회원을 찾지 못했어요.');
    const o = {}; ['digest', 'notify'].forEach(k => { if (k in r) { if (r[k] && !u.email) fail_(u.name + '님은 메일 주소가 없어요. 본인이 더보기 → 알림에서 먼저 넣어야 해요.'); o[k] = r[k] ? 'Y' : ''; } });
    update_('회원', u._row, o); return { digest: 'digest' in o ? !!o.digest : on_(u.digest), notify: 'notify' in o ? !!o.notify : on_(u.notify) };
  } },
  memberRole: { role: 'admin', run: (me, r) => {
    if (ROLES.indexOf(r.role) < 0) fail_('잘못된 역할이에요.');
    const u = rows_('회원').find(x => x.id === r.id); if (!u) fail_('회원을 찾지 못했어요.');
    if (u.id === me.user.id && r.role !== 'admin') fail_('자기 관리자 권한은 뺄 수 없어요. 다른 관리자에게 부탁해 주세요.');
    update_('회원', u._row, { role: r.role }); return {};
  } },
  memberDel: { role: 'admin', run: (me, r) => {
    if (r.id === me.user.id) fail_('자기 계정은 지울 수 없어요.');
    const u = rows_('회원').find(x => x.id === r.id); if (!u) return {};
    dropSessions_(u.id);
    ['관심', '투표'].forEach(n => rows_(n).filter(x => x.userId === u.id).reverse().forEach(x => del_(n, x._row)));
    del_('회원', rows_('회원').find(x => x.id === r.id)._row);
    return {};
  } },
  keywords: { role: 'admin', run: (me, r) => {
    const L = (a, n) => (Array.isArray(a) ? a : []).map(s => clip_(s, 20)).filter(Boolean).slice(0, n);
    const k = { words: L(r.words, 600), orgs: L(r.orgs, 40), exclude: L(r.exclude, 30) };
    k.v = 4; setSetting_('keywords', k); return k;
  } },
  access: { role: 'admin', run: () => rows_('접속').slice(-80).reverse().map(x => ({ at: x.at, name: x.name, action: x.action, device: x.device, via: x.via, fail: !!x.fail })) },
};
function on_(v) { return v === true || v === 'Y' || v === 'TRUE'; }   // 시트에 저장된 켜짐 값
/* 메일 주소는 화면에 가려서 보낸다: fr***@gmail.com */
function mask_(e) { e = String(e || ''); const i = e.indexOf('@'); return i < 1 ? '' : e.slice(0, Math.min(2, i)) + '***' + e.slice(i); }
function round_(v) { return Math.round(Number(v) * 1e5) / 1e5; }        // 좌표는 소수 5자리(약 1m)까지만
function histOf_(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
let memberNames_ = null;   // 한 번의 요청 안에서 회원 시트를 한 번만 읽는다 (공고마다 읽으면 수백 번 → 불러오기가 수십 초)
function joiners_(votes, id) {
  const U = memberNames_ || (memberNames_ = (() => { const m = {}; rows_('회원').forEach(u => m[u.id] = u.name); return m; })());
  return votes.filter(x => x.bidId === id && x.vote === '참여').map(x => U[x.userId]).filter(Boolean);
}

/* ══════════ 본부 소식 (참여·담당·의견) ══════════ */
function note_(me, type, b, text) {
  if (!b) return;
  try {
    append_('소식', { id: uid_(), at: now_(), type, bidId: b.id, userId: me.user.id, who: me.user.name, text: clip_(text, 120) });
  } catch (e) { console.warn('소식', e); }
}
/* 회원 소식(가입 신청·승인·거절) — 신청·거절은 관리자에게만, 승인(새 식구)은 모두에게 보인다 */
function memberNote_(type, userId, who, text) {
  try { append_('소식', { id: uid_(), at: now_(), type, bidId: '', userId, who, text: clip_(text, 120) }); } catch (e) { console.warn('소식', e); }
}
function feedbackOf_(me, all) {
  return rows_('건의').filter(x => all || x.userId === me.user.id).reverse().slice(0, 100)
    .map(x => ({ id: x.id, at: x.at, who: all ? x.who : '', text: x.text, status: x.status, reply: x.reply, repliedAt: x.repliedAt, mine: x.userId === me.user.id }));
}
function news_(me) {
  const from = new Date(Date.now() - 30 * 864e5).toISOString(), T = {};
  rows_('공고').forEach(b => T[b.id] = { title: b.title, close: str_(b.close), org: b.org });
  const adminOnly = { signup: 1, reject: 1 };
  return rows_('소식').filter(n => String(n.at) >= from && (!adminOnly[n.type] || me.user.role === 'admin')).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-60).reverse()
    .map(n => ({ id: n.id, at: n.at, type: n.type, bidId: n.bidId, who: n.who, text: n.text, mine: n.userId === me.user.id, bid: T[n.bidId] || null }));
}
/* '참여' 알림 메일 — 메일을 등록하고 '참여 알림'을 켠 사람에게만, 누른 본인은 빼고 */
function joinMail_(me, b) {
  const to = rows_('회원').filter(u => u.status === 'active' && on_(u.notify) && u.email && u.id !== me.user.id).map(u => u.email);
  if (!to.length) return;
  const body = [`${me.user.name}님이 아래 공고에 '참여' 의사를 밝혔어요.`, '', `· ${b.title}`, `· ${b.org} · 마감 ${str_(b.close)} ${hm_(b.closeTime)}`,
    '', '올포오션 앱 → 입찰에서 의견을 남겨 주세요. (알림 끄기: 앱 → 더보기 → 알림)'].join('\n');
  try { MailApp.sendEmail({ bcc: to.join(','), to: Session.getEffectiveUser().getEmail(), subject: `[올포오션] 참여 · ${String(b.title).slice(0, 40)}`, body }); } catch (e) { console.warn('참여 메일', e); }
}

/* 시트 머리줄 맞추기 — 칸이 늘어난 새 버전을 배포하면 첫 요청 때 한 번만 실행된다 */
function upgrade_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('SCHEMA') === SCHEMA) return;
  rowsDirty_(); sh0_ = {};   // 머리줄을 고치므로 읽어 둔 시트 값을 버린다
  const lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    if (p.getProperty('SCHEMA') === SCHEMA) return;
    const ss = ss_();
    Object.keys(SHEETS).forEach(n => {
      let sh = ss.getSheetByName(n); if (!sh) sh = ss.insertSheet(n);
      sh.getRange(1, 1, sh.getMaxRows(), SHEETS[n].length).setNumberFormat('@');
      sh.getRange(1, 1, 1, SHEETS[n].length).setValues([SHEETS[n]]).setFontWeight('bold'); sh.setFrozenRows(1);
    });
    p.setProperty('SCHEMA', SCHEMA);
  } finally { lock.releaseLock(); }
}
function num_(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
function date_(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; }
function dropSessions_(userId) { rows_('세션').filter(s => s.userId === userId).reverse().forEach(s => del_('세션', s._row)); }
function str_(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : String(d || ''); }

/* ══════════ 화면에 줄 자료 ══════════ */
/* 한 부분(캘린더·아카이브·외부 자료)이 실패해도 앱 전체가 '불러오지 못했어요'가 되지 않게 부분마다 감싼다 */
function part_(errs, name, fn, dflt) { try { return fn(); } catch (e) { console.warn('load ' + name, e); errs.push(name + ': ' + clip_(e.message, 80)); return dflt; } }
function load_(me) {
  const u = me.user, kw = kw_(), E = [];
  const members = rows_('회원').filter(x => x.status === 'active');
  return {
    today: today_(),
    me: { name: u.name, company: u.company, team: u.team, role: u.role, email: mask_(u.email), digest: on_(u.digest), notify: on_(u.notify) },
    members: members.map(x => x.name),
    keywords: kw.words,
    collectedAt: getSetting_('collectedAt', ''), weatherAt: getSetting_('weatherAt', ''),
    bids: part_(E, '공고', () => bids_(me), []), sites: part_(E, '현장', () => sites_(me), []), projects: getSetting_('projAuto', []), projAt: getSetting_('projAt', ''),
    absence: part_(E, '휴가·출장', () => absFor_(absence_(), u.role), { on: false, list: [] }), sessions: part_(E, '기기', () => sessions_(me), []),
    news: part_(E, '소식', () => news_(me), []), myFeedback: part_(E, '건의', () => feedbackOf_(me, false).slice(0, 20), []), upcoming: getSetting_('upcoming', []), kimstUp: getSetting_('kimstUp', null), historyAt: getSetting_('historyAt', ''),
    admin: u.role === 'admin' ? part_(E, '관리자', () => admin_(), null) : null,
    loadErr: E,
  };
}
function bids_(me) {
  const from = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), TZ, 'yyyy-MM-dd');
  const stars = rows_('관심'), votes = rows_('투표'), cms = rows_('의견');
  const kw = kw_();
  const touched = id => b => b.bidId === id;
  const fromRnd = Utilities.formatDate(new Date(Date.now() - 120 * 864e5), TZ, 'yyyy-MM-dd');   // R&D공고는 1년에 몇 번뿐이라 지난 것도 넉 달까지 보여 준다
  // 관심(별)·참여 공고는 마감이 지나도 개찰 결과가 나올 때까지 남긴다 (개찰 여부는 syncHistory가 아카이브 '개찰 결과'로 기록)
  const opened = {}; getSetting_('opened', []).forEach(n => opened[n] = 1);
  const isOpen = b => !!opened[String(b.no || '').split('-')[0]];
  return rows_('공고').filter(b => str_(b.close) >= (b.kind === 'R&D공고' ? fromRnd : from) || (b.kind !== 'R&D공고' && (stars.some(touched(b.id)) || votes.some(x => x.bidId === b.id && x.vote === '참여')) && !isOpen(b)))
    .filter(b => b.owner || b.kind === 'R&D공고' || relevant_(b.title, b.org + ' ' + b.demand, kw) || stars.some(touched(b.id)) || votes.some(touched(b.id)) || cms.some(touched(b.id)))
    .map(b => {
    const v = {}; let my = '';
    votes.filter(x => x.bidId === b.id).forEach(x => { v[x.vote] = (v[x.vote] || 0) + 1; if (x.userId === me.user.id) my = x.vote; });
    return { id: b.id, kind: b.kind, no: b.no, title: b.title, org: b.org, demand: b.demand, budget: Number(b.budget) || 0,
      ofcl: b.ofcl || '', tel: /^[\d\-() ]{7,20}$/.test(String(b.tel || '')) ? String(b.tel) : '',
      posted: str_(b.posted), close: str_(b.close), closeTime: hm_(b.closeTime), url: /^https:\/\/([\w.-]*g2b\.go\.kr|www\.iris\.go\.kr)\//.test(b.url) ? b.url : '',
      kw: String(b.kw || '').split(',').filter(Boolean), owner: b.owner, votes: v, myVote: my, joiners: joiners_(votes, b.id), hist: histOf_(b.hist),
      mine: stars.some(x => x.bidId === b.id && x.userId === me.user.id), opened: isOpen(b),
      comments: commentsFrom_(cms, me, b.id) };
  });
}
function commentsFrom_(cms, me, id) { return cms.filter(c => c.bidId === id).map(c => ({ id: c.id, who: c.who, text: c.text, at: c.at, mine: c.userId === me.user.id })); }
function comments_(me, id) { return commentsFrom_(rows_('의견'), me, id); }
function sites_(me) {
  return rows_('지점').map(s => {
    let wx = {}; try { wx = JSON.parse(s.wx || '{}'); } catch (e) {}
    return { id: s.id, name: s.name, proj: s.proj, sea: s.sea, obsCode: s.obsCode, obsName: s.obsName, lat: Number(s.lat), lon: Number(s.lon), maxWave: Number(s.maxWave), maxWind: Number(s.maxWind),
      now: wx.now || null, fc: wx.fc || [], tides: wx.tides || [], tideAll: wx.tideAll || [], warn: wx.warn || '', moon: '', mine: s.createdBy === me.user.id,
      wxAt: wx.at || '', wxErr: wx.err || '', waveFrom: wx.waveFrom || '', waveNote: wx.waveNote || '', tideErr: wx.tideErr ? String(wx.tideErr).replace(/<[^>]*>/g, '').slice(0, 80) : '', ts: wx.ts || [] };
  });
}
function projects_() {
  return rows_('사업').map(p => { let m = []; try { m = JSON.parse(p.miles || '[]'); } catch (e) {}
    return { id: p.id, name: p.name, company: p.company, client: p.client, pm: p.pm, progress: Number(p.progress) || 0, end: str_(p.end), warranty: str_(p.warranty), miles: m, issue: p.issue,
      lat: p.lat === '' ? null : Number(p.lat), lon: p.lon === '' ? null : Number(p.lon), place: p.place || '' }; });
}
function sessions_(me) {
  return rows_('세션').filter(s => s.userId === me.user.id && new Date(s.expiresAt) > new Date())
    .map(s => ({ id: s.id, device: s.device, last: s.lastAt, expires: String(s.expiresAt).slice(0, 10), current: s.id === me.session.id }));
}
function admin_() {
  const U = rows_('회원');
  return { pending: U.filter(u => u.status === 'pending').map(u => ({ id: u.id, name: u.name, company: u.company, team: u.team, at: u.createdAt, device: u.device })),
    memberCount: U.filter(u => u.status === 'active').length, keywords: kw_(), feedbackNew: rows_('건의').filter(x => x.status === '접수').length };
}
/* 본부 휴가·출장 캘린더 '해양사업본부(휴가&출장)' — 하루에 일정 하나, 제목은 "[연차] 윤세준, 이나래 [반차] 나화진 [출장] 양인권" 꼴.
   설명 줄 "해양SI 1팀/(차장) 윤세준 : 연차_사유"에서 팀과 시간(오전·오후, 반반차 시간)만 꺼내고, 사유·출장 장소는 내보내지 않는다. 오늘부터 14일 */
/* 출장자 위치(좌표·지역)와 출장 장소·목적은 관리자·본부장·팀장에게만 보낸다 — 팀원에게는 '출장'만 */
function absFor_(A, role) {
  if (role === 'admin' || role === 'head' || role === 'lead') return A;
  // 팀원에게는 출장 장소·목적도 보내지 않고 '출장'만 (빈 값으로 두어 앱이 예전 서버로 오해하지 않게)
  return Object.assign({}, A, { list: (A.list || []).map(a => { const x = Object.assign({}, a); delete x.lat; delete x.lon; delete x.at; if (x.type === '출장') { x.place = ''; x.note = ''; } return x; }) });
}
function absence_() {
  const id = prop_('ABSENCE_CALENDAR_ID'); if (!id) return { on: false, list: [] };
  const cache = CacheService.getScriptCache(), hit = cache.get('absence4'); if (hit) return JSON.parse(hit);
  const cal = CalendarApp.getCalendarById(id); if (!cal) return { on: false, list: [], err: '캘린더를 열 수 없어요(공유 확인)' };
  const td = new Date(today_() + 'T00:00:00+09:00'), wd = (td.getUTCDay() + (td.getUTCHours() >= 15 ? 1 : 0)) % 7;   // 한국 요일
  const t0 = new Date(td.getTime() - ((wd + 6) % 7) * 864e5), t1 = new Date(t0.getTime() + 14 * 864e5), out = [];   // 이번 주 월요일부터 2주
  cal.getEvents(t0, t1).forEach(ev => {
    const info = {};
    String(ev.getDescription() || '').split(/\n/).forEach(l => {
      const m = l.match(/^\s*(.+?)\/\((.+?)\)\s*(\S+)\s*:\s*([^_]+)(?:_(.*))?$/); if (!m) return;
      const kind = m[4], rest = m[5] || '', tm = kind.match(/(\d{1,2}:\d{2})~(\d{1,2}:\d{2})/);
      info[m[3]] = { team: m[1].trim(), when: tm ? tm[1] + '~' + tm[2] : /반차/.test(kind) ? (/오전/.test(rest) ? '오전' : /오후/.test(rest) ? '오후' : '') : '',
        rank: m[2].trim(), note: clip_(/반차/.test(kind) ? rest.replace(/^(오전|오후)_?/, '') : rest.split('_')[0], 80).trim(),   // 휴가는 사유, 출장은 목적(첫 칸)
        place: /반차|연차|휴가|경조/.test(kind) ? '' : kind.replace(/\(\d{1,2}\/\d{1,2}~\d{1,2}\/\d{1,2}\)/g, ' ').replace(/^\s*\d{1,2}\.\d{1,2}\([^)]*\)/, ' ').replace(/\((주|사|재)\)|주식회사/g, ' ').replace(/\s+/g, ' ').trim() };
    });
    const items = [];
    String(ev.getTitle()).replace(/\[([^\]]+)\]([^\[]*)/g, (all, label, names) => {
      const type = /출장/.test(label) ? '출장' : /반반차/.test(label) ? '반반차' : /반차/.test(label) ? '반차' : '휴가';
      names.split(/[,\s·/]+/).filter(n => /^[가-힣A-Za-z0-9]{2,6}$/.test(n)).forEach(n => { const x = info[n] || {}, it = { name: n, type, label: clip_(label, 10), team: x.team || '', rank: x.rank || '', when: x.when || '', note: x.note || '' };
        if (type === '출장') { const g = geo_(x.place); it.place = clip_(x.place || '', 60); if (g) { it.lat = g.lat; it.lon = g.lon; it.at = g.at; } }
        items.push(it); });
      return all;
    });
    for (let d = new Date(Math.max(ev.getStartTime(), t0)); d < ev.getEndTime() && d < t1; d = new Date(d.getTime() + 864e5)) {
      const date = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
      items.forEach(x => out.push(Object.assign({ date }, x)));
    }
  });
  const res = { on: true, list: out };
  cache.put('absence4', JSON.stringify(res), 180);   // 3분
  return res;
}
/** 출장지 글자 → 좌표. 뒤 단어를 하나씩 떼어 가며 찾고, 찾은 값은 오래 기억한다 (Apps Script 내장 지오코더, 키 필요 없음) */
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
function log_(name, action, meta, fail) {
  try { append_('접속', { at: now_(), name: clip_(name, 20), action: clip_(action, 20), device: clip_(meta && meta.dev, 40), via: clip_(meta && meta.via, 10), fail: fail ? 1 : '' }); } catch (e) {}
}

/* ══════════ 자동 수집 (트리거) ══════════ */
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
function ymdhm_(d) { return Utilities.formatDate(d, TZ, 'yyyyMMddHHmm'); }
/* 시트가 '10:00'을 시각 값(Date)으로 바꿔 돌려주므로 다시 'HH:mm' 글자로 */
function hm_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v || '').slice(0, 5); }
/* 새 공공데이터 API(조석 등)는 JSON에 response 껍데기가 없을 수 있다 */
function items_(j) { const b = j && (j.response || j).body; const it = b && b.items; return !it ? [] : Array.isArray(it) ? it : Array.isArray(it.item) ? it.item : it.item ? [it.item] : []; }

/** 지난 공고 채우기 — 하루씩 받아 바로 저장하고, 실행 시간(6분 제한)이 3분 30초를 넘으면 다음 실행에서 이어 간다.
    진행 위치는 설정 'backfillDay'(남은 날 수)에 기억. 편집기에서 backfillBids()로 처음부터 다시 돌릴 수 있다 */
function backfill_(key, kw, t0, have, old) {
  let d = Number(getSetting_('backfillDay', 45)), n = 0;
  const end = Date.now();
  while (d > 2 && Date.now() - t0 < 3.5 * 6e4) {
    n += saveBids_(gather_(key, kw, new Date(end - d * 864e5), new Date(end - (d - 1) * 864e5)), have, old);
    d--; setSetting_('backfillDay', d);
  }
  if (d <= 2) setSetting_('backfillAt', now_());
  return n;
}
function backfillBids() { setSetting_('backfillAt', ''); setSetting_('backfillDay', 45); collectBids(); }

/** 모은 공고를 시트에 넣는다(같은 id는 고쳐 쓰기). 새로 넣은 건수를 돌려준다 */
function saveBids_(found, have, old) {
  const at = now_(), seen = {}; let n = 0;
  const same = (b, o) => !o || ['title', 'kind', 'org', 'demand', 'close', 'url', 'kw', 'ofcl', 'tel'].every(k => String(b[k] == null ? '' : b[k]) === String(o[k] == null ? '' : o[k]))
    && Number(b.budget || 0) === Number(o.budget || 0) && str_(o.posted) === String(b.posted || '') && hm_(o.closeTime) === String(b.closeTime || '');
  found.filter(b => !seen[b.id] && (seen[b.id] = 1)).forEach(b => {
    if (have[b.id] > 0) { if (!same(b, old && old[b.id])) update_('공고', have[b.id], Object.assign({}, b, { collectedAt: at })); }
    else if (!have[b.id]) { append_('공고', Object.assign({ owner: '', collectedAt: at }, b)); have[b.id] = -1; n++; } });
  return n;
}

/** 나라장터 입찰공고·사전규격(용역)에서 기간 안의 관련 공고를 고른다 */
function gather_(key, kw, start, end) {
  const found = [];
  const pick = (title, org) => relevant_(title, org, kw);
  const prop = PropertiesService.getScriptProperties();
  // 입찰공고 (용역)
  for (let page = 1; page <= 10; page++) {
    const j = fetchJson_(prop.getProperty('EP_BID') || ENDPOINT.BID, { serviceKey: key, type: 'json', numOfRows: 100, pageNo: page, inqryDiv: 1, inqryBgnDt: ymdhm_(start), inqryEndDt: ymdhm_(end) });
    const L = items_(j); if (!L.length) break;
    L.forEach(x => { const k = pick(x.bidNtceNm || '', (x.ntceInsttNm || '') + ' ' + (x.dminsttNm || '')); if (!k) return;
      const close = String(x.bidClseDt || '');
      found.push({ ofcl: clip_(x.ntceInsttOfclNm || x.dminsttOfclNm || '', 20), tel: clip_(x.ntceInsttOfclTelNo || x.dminsttOfclTelNo || '', 20), id: 'B' + x.bidNtceNo + '-' + (x.bidNtceOrd || '00'), kind: '입찰공고', no: x.bidNtceNo, title: x.bidNtceNm, org: x.ntceInsttNm, demand: x.dminsttNm,
        budget: Number(x.asignBdgtAmt || x.presmptPrce || 0), posted: String(x.bidNtceDt || '').slice(0, 10), close: close.slice(0, 10), closeTime: close.slice(11, 16),
        url: x.bidNtceDtlUrl || '', kw: k.join(',') }); });
    if (L.length < 100) break;
  }
  // 사전규격 (용역)
  for (let page = 1; page <= 10; page++) {
    const j = fetchJson_(prop.getProperty('EP_PRE') || ENDPOINT.PRE, { serviceKey: key, type: 'json', numOfRows: 100, pageNo: page, inqryDiv: 1, inqryBgnDt: ymdhm_(start), inqryEndDt: ymdhm_(end) });
    const L = items_(j); if (!L.length) break;
    L.forEach(x => { const t = x.prdctClsfcNoNm || x.bsnsNm || ''; const k = pick(t, (x.orderInsttNm || '') + ' ' + (x.rlDminsttNm || '')); if (!k) return;
      found.push({ ofcl: clip_(x.ofclNm || x.rgstInsttOfclNm || '', 20), tel: clip_(x.ofclTelNo || x.rgstInsttOfclTelNo || '', 20), id: 'P' + x.bfSpecRgstNo, kind: '사전규격', no: x.bfSpecRgstNo, title: t, org: x.orderInsttNm, demand: x.rlDminsttNm,
        budget: Number(x.asignBdgtAmt || 0), posted: String(x.rgstDt || '').slice(0, 10), close: String(x.opninRgstClseDt || '').slice(0, 10), closeTime: String(x.opninRgstClseDt || '').slice(11, 16),
        url: '', kw: k.join(',') }); });
    if (L.length < 100) break;
  }
  return found;
}

/* ══ 건강 점검 ══
   편집기에서 healthCheck() 를 실행하면 관리자 계정으로 앱 불러오기(load)를 그대로 돌려 부분별 시간과 오류를 로그로 보여 준다.
   배포 직후 한 번 실행해서 "✓" 가 나오면 사람들에게 써도 된다. 매시 수집(collectBids) 끝에도 자동으로 돌아
   20초가 넘거나 오류가 나면 관리자에게 메일을 보낸다(6시간에 한 번까지). */
function health_() {
  const admin = rows_('회원').find(u => u.role === 'admin' && u.status === 'active'); if (!admin) return { ok: false, ms: 0, msg: '관리자 계정이 없어요' };
  const me = { user: admin, session: { id: '' } }, t0 = Date.now(), parts = [];
  const time = (name, fn) => { const t = Date.now(); try { fn(); parts.push(name + ' ' + (Date.now() - t) + 'ms'); } catch (e) { parts.push(name + ' 오류: ' + e.message); throw e; } };
  try {
    SpreadsheetApp.flush(); rowsDirty_(); memberNames_ = null;
    time('공고', () => bids_(me)); time('현장', () => sites_(me)); time('휴가·출장', () => absence_()); time('소식', () => news_(me)); time('관리자', () => admin_());
    rowsDirty_(); memberNames_ = null;
    const t1 = Date.now(), d = load_(me), ms = Date.now() - t1, kb = Math.round(JSON.stringify(d).length / 1024);
    const ok = ms < 20000 && !(d.loadErr || []).length;
    return { ok, ms, msg: (ok ? '✓ 정상' : '✗ 확인 필요') + ` · 앱 열기 ${ms}ms · 응답 ${kb}KB · 공고 ${d.bids.length}건` + ((d.loadErr || []).length ? ' · 실패: ' + d.loadErr.join(', ') : '') + '\n' + parts.join(' / ') };
  } catch (e) { return { ok: false, ms: Date.now() - t0, msg: '✗ 오류: ' + e.message + '\n' + parts.join(' / ') }; }
}
function healthCheck() { const h = health_(); console.log(h.msg); return h.msg; }
function healthWatch_() {
  const h = health_(); setSetting_('health', { at: now_(), ok: h.ok, ms: h.ms, msg: clip_(h.msg, 300) });
  if (h.ok) return;
  const last = getSetting_('healthMailAt', ''); if (last && Date.now() - new Date(last).getTime() < 6 * 36e5) return;
  const to = rows_('회원').filter(u => u.status === 'active' && u.role === 'admin' && u.email).map(u => u.email);
  if (!to.length) return;
  try { MailApp.sendEmail({ bcc: to.join(','), to: Session.getEffectiveUser().getEmail(), subject: '[올포오션] 앱 불러오기 점검 실패', body: h.msg + '\n\n앱이 느리거나 열리지 않을 수 있어요. Claude에게 이 메일 내용을 보여 주세요.' }); setSetting_('healthMailAt', now_()); } catch (e) { console.warn('점검 메일', e); }
}

/** 나라장터 공고 모으기 — 매시 실행. 지난 2일치 용역 공고에서 관심 단어가 들어간 것만 남긴다 */
function collectBids() {
  const t0 = Date.now();
  upgrade_();
  const key = prop_('DATA_GO_KR_KEY'); if (!key) return console.warn('DATA_GO_KR_KEY 가 없어요');
  const kw = kw_(), end = new Date(), start = new Date(end.getTime() - 2 * 864e5);
  const have = {}, old = {}; rows_('공고').forEach(b => { have[b.id] = b._row; old[b.id] = b; });
  const found = gather_(key, kw, start, end);
  // KIMST(해양수산과학기술진흥원) R&D 사업공고 — 나라장터에는 없어서 진흥원 사업공고 게시판에서 모은다
  try { found.push(...kimst_(1)); } catch (e) { console.warn('KIMST', e); }
  let n = saveBids_(found, have, old);
  setSetting_('collectedAt', now_());
  try { const k = getSetting_('kimstUp', null); if (!k || Date.now() - new Date(k.at).getTime() > 20 * 36e5) kimstForecast(); } catch (e) { console.warn('KIMST 예상', e); }
  // 수집 시작 전에 올라온 공고 채우기(지난 45일) — 몇 번의 실행에 나눠서
  if (!getSetting_('backfillAt', '')) { try { n += backfill_(key, kw, t0, have, old); } catch (e) { console.warn('지난 공고 채우기', e); } }
  // 연차 사업 이력: 새 공고가 있거나 6시간이 지났으면 아카이브에서 다시 맞춘다 (시간이 남을 때만)
  if (Date.now() - t0 < 4.5 * 6e4) try { if (n || Date.now() - new Date(getSetting_('historyAt', 0)).getTime() > 6 * 36e5) syncHistory(); } catch (e) { console.warn('연차 이력', e); }
  // 앱 불러오기 점검 (느리거나 오류면 관리자에게 메일)
  if (Date.now() - t0 < 4.8 * 6e4) try { healthWatch_(); } catch (e) { console.warn('점검', e); }
  console.log('새 공고 ' + n + '건, 남은 채우기 ' + getSetting_('backfillDay', 45) + '일');
}

/** KIMST 사업공고 목록 (첫 쪽 = 최근 공고 10여 건). 표: 공고번호 | 공고명(IRIS 링크) | 공고시작일 | 접수기간 */
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
/** 곧 나올 KIMST 공고 — 게시판 여러 쪽(약 2년치)을 읽어, 해마다 다시 나온 사업은 작년 공고 달 기준으로 다음 공고를 예상한다. 하루 한 번 */
const kimstName_ = t => String(t).replace(/^\s*(\[[^\]]+\]\s*)?(20\d{2}년도?\s*)?/, '').replace(/\s*(신규과제|선정\s*계획|선정계획|재공고|공고|\(\d차\)|\(R&D\)|R&D|\(정책지정\))\s*/g, ' ')
  .replace(/사업\s*$/, '').replace(/\s+/g, '').trim();
function kimstForecast() {
  const all = [];
  for (let pg = 1; pg <= 8; pg++) { let L = []; try { L = kimst_(pg); } catch (e) { break; } if (!L.length) break; all.push(...L); Utilities.sleep(400); }
  if (!all.length) return;
  const G = {};
  all.forEach(b => { const k = kimstName_(b.title), y = b.posted.slice(0, 4); if (!k) return;
    const g = G[k] = G[k] || { name: b.title.replace(/^\s*(\[[^\]]+\]\s*)?20\d{2}년도?\s*/, '').replace(/\s*(신규과제\s*)?선정\s*계획\s*(재)?공고.*$/, '').trim(), years: {} };
    if (!g.years[y] || b.posted < g.years[y].posted) g.years[y] = { posted: b.posted, close: b.close, url: b.url }; });
  const t = today_(), tEnd = Utilities.formatDate(new Date(Date.now() + 150 * 864e5), TZ, 'yyyy-MM-dd'), items = [];
  Object.keys(G).forEach(k => { const g = G[k], ys = Object.keys(g.years).sort(); if (ys.length < 2) return;   // 두 해 이상 나온 사업만 '다시 나올 것'으로 본다
    const last = g.years[ys[ys.length - 1]], next = (+last.posted.slice(0, 4) + 1) + last.posted.slice(4);
    if (next < t || next > tEnd) return;
    items.push({ name: clip_(g.name, 120), years: ys.map(Number), last: last.posted, lastClose: last.close, next: next.slice(0, 7), url: last.url }); });
  // 해마다 언제 몰리는지: 가장 최근 해의 달별 건수
  const yNow = all.map(b => b.posted.slice(0, 4)).sort().pop(), months = {};
  all.filter(b => b.posted.slice(0, 4) === yNow).forEach(b => { const m = +b.posted.slice(5, 7); months[m] = (months[m] || 0) + 1; });
  setSetting_('kimstUp', { at: now_(), y: +yNow, n: all.filter(b => b.posted.slice(0, 4) === yNow).length, months, items: items.sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name)).slice(0, 12) });
}
/** 시험: 편집기에서 실행하면 KIMST 공고를 로그로 보여 줘요 */
function testKimst() { kimst_(1).forEach(b => console.log(b.posted, b.close, b.title)); }

/** 현장 날씨 모으기 — 3시간마다. 기상청 단기예보(파고·풍속) + 특보 + 국립해양조사원 조석 */
function collectWeather() {
  const key = prop_('DATA_GO_KR_KEY'); if (!key) return console.warn('DATA_GO_KR_KEY 가 없어요');
  const ctx = weatherCtx_();
  rows_('지점').forEach(s => weatherOne_(s, ctx));
  setSetting_('weatherAt', now_());
}
function weatherCtx_() {
  const key = prop_('DATA_GO_KR_KEY'), prop = PropertiesService.getScriptProperties();
  let warnText = '';
  try { warnText = JSON.stringify(items_(fetchJson_(prop.getProperty('EP_WRN') || ENDPOINT.WRN, { serviceKey: key, dataType: 'JSON', numOfRows: 10, pageNo: 1 }))); } catch (e) { console.warn('특보', e.message); }
  return { key, prop, warnText, base: baseTime_() };
}
/* 한 격자의 단기예보에서 파고(WAV)·풍속(WSD)을 시간별로 꺼낸다 */
function fcstAt_(c, x, y) {
  const L = items_(fetchJson_(c.prop.getProperty('EP_FCST') || ENDPOINT.FCST, { serviceKey: c.key, dataType: 'JSON', numOfRows: 1000, pageNo: 1, base_date: c.base.d, base_time: c.base.t, nx: x, ny: y }));
  const by = {}; L.forEach(i => { if (i.category !== 'WAV' && i.category !== 'WSD') return; const k = i.fcstDate + i.fcstTime; (by[k] = by[k] || { d: i.fcstDate, t: i.fcstTime })[i.category] = Number(i.fcstValue); });
  return Object.keys(by).sort().map(k => by[k]);
}
/* 지점 하나의 날씨 받기. 실패해도 이유를 남겨 화면에 '0'이 아니라 '자료 없음 + 이유'가 보이게 한다 */
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
      // 물때 예보는 바뀌지 않으므로 이미 받은 날은 다시 받지 않는다 → 조사원 서버가 잠시 멈춰도(503) 전에 받은 곡선을 계속 보여 준다
      const day = n => Utilities.formatDate(new Date(Date.now() + n * 864e5), TZ, 'yyyy-MM-dd'), td = day(0);
      let old = []; try { old = (JSON.parse(s.wx || '{}').tideAll || []).filter(x => x.d >= td); } catch (e) {}
      const all = old.slice(), fails = [];
      [0, 1].forEach(n => { const ds = day(n); if (old.some(x => x.d === ds)) return;
        const get = () => fetchJson_(c.prop.getProperty('EP_TIDE') || ENDPOINT.TIDE, { serviceKey: prop_('KHOA_KEY') || c.key, type: 'json', numOfRows: 10, pageNo: 1, obsCode: s.obsCode, reqDate: ds.replace(/-/g, '') });
        let r; try { r = get(); } catch (e) { Utilities.sleep(1500); try { r = get(); } catch (e2) { fails.push(e2.message); return; } }
        items_(r).forEach(x => { const dt = String(x.predcDt || ''); if (dt.length >= 16) all.push({ d: dt.slice(0, 10), t: dt.slice(11, 16), hl: Number(x.extrSe) % 2 === 1 ? '고' : '저', h: Number(x.predcTdlvVl) }); }); });
      all.sort((p, q) => (p.d + p.t).localeCompare(q.d + q.t));
      wx.tideAll = all; wx.tides = all.filter(x => x.d === td).map(x => ({ hl: x.hl, t: x.t, h: x.h }));
      if (fails.length && !wx.tides.length) wx.tideErr = /HTTP 5\d\d/.test(fails[0]) ? '국립해양조사원 서버가 잠시 응답하지 않아요 · 다음 갱신 때 다시 받아요' : clip_(fails[0], 100);
      else if (!all.length) wx.tideErr = '물때 자료가 비어 있어요 (예보지점 ' + s.obsCode + ')';
    } catch (e) { wx.tideErr = /HTTP 5\d\d/.test(e.message) ? '국립해양조사원 서버가 잠시 응답하지 않아요 · 다음 갱신 때 다시 받아요' : clip_(e.message, 100); console.warn('조석', s.name, e.message); }
  }
  update_('지점', s._row, { wx: JSON.stringify(wx) });
}
/** 점검: 편집기에서 실행하면 첫 지점의 날씨 받기 결과를 로그로 보여 준다 */
function testWeather() {
  const s = rows_('지점')[0]; if (!s) return console.log('지점이 없어요');
  console.log('인증키 있음: ' + !!prop_('DATA_GO_KR_KEY') + ' · 지점: ' + s.name + ' (' + s.lat + ', ' + s.lon + ') · 격자 ' + JSON.stringify(grid_(Number(s.lat), Number(s.lon))) + ' · 발표시각 ' + JSON.stringify(baseTime_()));
  weatherOne_(s); console.log('결과: ' + rows_('지점')[0].wx);
}
/* ══════════ 연차 사업 이력 (나라장터 해양공고 아카이브 시트) ══════════
   NAS 수집기가 매일 채우는 아카이브의 '사업 계보'·'개찰 결과'·'올포랜드 수행실적'·'공고목록'을 읽어
   지금 공고와 같은 사업의 지난 공고(사업자 구성·사업비·낙찰률·경쟁 업체 수)를 공고마다 붙인다.
   스크립트 속성 ARCHIVE_ID 에 아카이브 시트 ID 를 넣어야 동작한다(이 서버 계정이 그 시트를 볼 수 있어야 함). */
function n_(v) { const x = Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : 0; }
function d_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').slice(0, 10); }
function normName_(t) {
  return String(t || '').normalize('NFC')
    .replace(/\[[^\]]*\]/g, '')                                   // [공고 2회]
    .replace(/\([^)]*(\d|차|회|~)[^)]*\)/g, '')                     // (2027~2028), (Ⅲ)는 아래에서
    .replace(/(19|20)\d{2}\s*(년도|년)?/g, '').replace(/[`'’‘]\s*\d{2}/g, '')
    .replace(/제?\s*\d+\s*차\s*(년도)?/g, '').replace(/\d+\s*(년도|년)/g, '')
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, '').replace(/[^0-9A-Za-z가-힣]/g, '');
}
function orgCore_(o) { const L = String(o || '').trim().split(/\s+/); return L[L.length - 1] || ''; }
function coName_(n) { return String(n || '').replace(/주식회사|\(주\)|㈜|\(유\)|유한회사/g, '').replace(/\s+/g, ' ').trim(); }
/* "엘티메트릭 주식회사(55%), 주식회사 지오스토리(25%)" → [{n, s}] */
function members_(txt) {
  return String(txt || '').split(/,\s*/).map(x => { const m = x.match(/^(.*?)\s*\((\d+(?:\.\d+)?)%\)\s*$/); return m ? { n: coName_(m[1]), s: Number(m[2]) } : { n: coName_(x), s: null }; }).filter(x => x.n);
}
function archiveSheet_(ss, name) { const sh = ss.getSheetByName(name); if (!sh) return []; const v = sh.getDataRange().getValues(); v.shift(); return v; }

function syncHistory() {
  const id = prop_('ARCHIVE_ID'); if (!id) return console.warn('ARCHIVE_ID 가 없어요(아카이브 시트 ID)');
  const ar = SpreadsheetApp.openById(id);
  // 사업 계보: A 사업(최근 명칭) B 수요기관 C 연도 D 공고일 E 당해 사업명 F 배정예산 G 전년대비 H 낙찰업체 I 낙찰금액 J 올포랜드 K 다음공고 L 공고번호
  const LG = archiveSheet_(ar, '사업 계보'), groups = {}, byNo = {}, byName = {};
  LG.forEach(r => {
    const g = r[0] + '|' + r[1], no = String(r[11] || '').trim();
    const row = { y: String(r[2]), d: d_(r[3]), t: String(r[4]), budget: n_(r[5]), win: coName_(r[7]), amt: n_(r[8]), alf: r[9] === 'Y', next: String(r[10] || ''), no };
    (groups[g] = groups[g] || { name: String(r[0]), org: String(r[1]), rows: [] }).rows.push(row);
    if (no) byNo[no] = g;
    [r[0], r[4]].forEach(t => byName[normName_(t) + '|' + orgCore_(r[1])] = g);
  });
  // 공고목록: 계보에 없는 사업을 이름으로 한 번 더 찾는다 (B 공고일 C 사업명 D 수요기관 E 예산 G 올포랜드 H 낙찰업체 I 낙찰금액 J 공고번호)
  const LIST = archiveSheet_(ar, '공고목록'), listBy = {};
  const listByOrg = {};
  LIST.forEach(r => { const k = normName_(r[2]) + '|' + orgCore_(r[3]);
    (listByOrg[orgCore_(r[3])] = listByOrg[orgCore_(r[3])] || []).push({ y: String(r[0]), d: d_(r[1]), t: String(r[2]), budget: n_(r[4]), win: coName_(r[7]), amt: n_(r[8]), alf: r[6] === 'Y', no: String(r[9] || '').trim() });
    (listBy[k] = listBy[k] || []).push({ y: String(r[0]), d: d_(r[1]), t: String(r[2]), budget: n_(r[4]), win: coName_(r[7]), amt: n_(r[8]), alf: r[6] === 'Y', no: String(r[9] || '').trim() }); });
  // 올포랜드 수행실적: C 사업명 F 계약금액 G 역할 I 지분율 L 공동수급 구성사 M 공고번호
  const perf = {};
  archiveSheet_(ar, '올포랜드 수행실적').forEach(r => { const no = String(r[12] || '').trim(); if (!no) return;
    perf[no] = { amt: n_(r[5]), mem: [{ n: '올포랜드', s: r[8] === '' ? null : n_(r[8]), lead: /주계약|대표/.test(r[6]) }].concat(members_(r[11])) }; });
  // 개찰 결과: D 공고번호 E 순위 F 투찰업체 G 투찰금액 I 투찰률 L 총점
  const open = {};
  archiveSheet_(ar, '개찰 결과').forEach(r => { const no = String(r[3] || '').trim(); if (!no) return;
    (open[no] = open[no] || []).push({ rank: n_(r[4]) || 99, n: coName_(r[5]), rate: String(r[8] || ''), score: n_(r[11]), alf: r[13] === 'Y' }); });
  // 지금 앱에 있는 공고 중 개찰 결과가 나온 공고번호 — 관심 공고를 마감 뒤에도 남겼다가 개찰되면 내린다
  try { const keyNo = x => String(x || '').trim().split('-')[0];
    const openSet = {}; Object.keys(open).forEach(k => openSet[keyNo(k)] = 1);
    setSetting_('opened', rows_('공고').map(b => keyNo(b.no)).filter((n, i, a) => n && openSet[n] && a.indexOf(n) === i));
  } catch (e) { console.warn('개찰 여부', e); }

  const cons = getSetting_('consortium', {}); let apiCalls = 0;
  const consOf = (no, win) => {
    if (perf[no]) return perf[no].mem;
    if (!win || !no) return null;
    if (cons[no] !== undefined) return cons[no];
    if (apiCalls >= 25) return null;
    apiCalls++;
    return (cons[no] = contractMembers_(no));
  };
  const rowOut = r => {
    const o = open[r.no] || [], ranked = o.filter(x => x.rank < 99).sort((a, b) => a.rank - b.rank);
    const amt = r.amt || (perf[r.no] && perf[r.no].amt) || 0;
    return { y: r.y, d: r.d, t: r.t, no: r.no, budget: r.budget, win: r.win || (ranked[0] && ranked[0].n) || '', amt,
      rate: amt && r.budget ? Math.round(amt / r.budget * 10000) / 100 : null, alf: r.alf,
      mem: consOf(r.no, r.win), bidRate: ranked[0] && ranked[0].rate ? (n => isFinite(n) ? (Math.round((n <= 1.5 ? n * 100 : n) * 100) / 100).toFixed(2) + '%' : String(ranked[0].rate))(parseFloat(String(ranked[0].rate))) : '', n: o.length || null, ru: ranked.slice(1, 3).map(x => x.n), alfRank: (o.find(x => x.alf) || {}).rank || null };
  };

  const ss = ss_(), sh = ss.getSheetByName('공고'), H = SHEETS['공고'], col = H.indexOf('hist') + 1;
  const B = rows_('공고'), from = Utilities.formatDate(new Date(Date.now() - 45 * 864e5), TZ, 'yyyy-MM-dd');
  const vals = sh.getRange(2, col, Math.max(1, B.length), 1).getValues();
  B.forEach((b, i) => {
    if (str_(b.close) < from) return;
    const core = [orgCore_(b.demand), orgCore_(b.org)], nm = normName_(b.title);
    let g = byNo[String(b.no)] || core.map(c => byName[nm + '|' + c]).find(Boolean), src = g ? groups[g].rows : null;
    if (!src) src = core.map(c => listBy[nm + '|' + c]).find(Boolean) || null;
    let h = '';
    const posted = str_(b.posted) || today_();
    // 낙찰자가 정해진 지난 공고만 '전차 사업'으로 본다 (같은 해 재공고·유찰은 빼기)
    let cand = (src || []).filter(r => r.no !== String(b.no) && r.d && r.d < posted && r.win);
    // 계보에서 끊긴 사업(예: '지원을 위한' ↔ '서비스를 위한')은 같은 기관의 비슷한 이름으로 한 번 더 찾는다
    if (cand.length < 2) {
      const seen = {}; cand.forEach(r => seen[r.no] = 1);
      core.forEach(c => (listByOrg[c] || []).forEach(r => { if (seen[r.no] || !r.win || !r.d || r.d >= posted || r.no === String(b.no)) return;
        if (similar_(b.title, r.t) >= .7) { seen[r.no] = 1; cand.push(r); } }));
    }
    // 한 해에 여러 건이면 가장 늦은 낙찰 건 하나만
    const byYear = {}; cand.sort((a, c) => c.d.localeCompare(a.d)).forEach(r => { if (!byYear[r.y]) byYear[r.y] = r; });
    src = Object.values(byYear);
    if (src.length) {
      const prev = src.sort((a, c) => c.d.localeCompare(a.d)).slice(0, 6).map(rowOut);
      if (prev.length) {
        const last = prev[0], rates = prev.filter(x => x.rate).map(x => x.rate);
        h = JSON.stringify({ rows: prev,
          change: last.budget && Number(b.budget) ? Math.round((Number(b.budget) / last.budget - 1) * 1000) / 10 : null,
          avgRate: rates.length ? Math.round(rates.reduce((a, c) => a + c, 0) / rates.length * 100) / 100 : null,
          alfEver: prev.some(x => x.alf), same: prev.length > 1 && prev.every(x => x.win && x.win === last.win) });
      }
    }
    vals[i] = [h.length > 45000 ? '' : h];
  });
  if (B.length) { rowsDirty_('공고'); sh.getRange(2, col, B.length, 1).setValues(vals); }
  setSetting_('consortium', cons);

  // 곧 나올 연차 사업: 계보의 '다음 공고 예상'이 이번 달~두 달 뒤인 사업 중 우리 분야이거나 올포랜드가 수행했던 것
  const kw = kw_(), ym = Utilities.formatDate(new Date(), TZ, 'yyyy-MM'), ym2 = Utilities.formatDate(new Date(Date.now() + 62 * 864e5), TZ, 'yyyy-MM');
  const up = [];
  Object.keys(groups).forEach(k => {
    const G = groups[k], R = G.rows.slice().sort((a, b) => b.d.localeCompare(a.d)), last = R[0];
    const m = (last.next || '').match(/(\d{4}-\d{2})/); if (!m || m[1] < ym || m[1] > ym2) return;
    const alf = R.some(r => r.alf);
    if (!alf && !relevant_(G.name, G.org, kw)) return;
    const won = R.find(r => r.win) || {};
    up.push({ name: G.name, org: G.org, next: m[1], budget: last.budget, win: won.win || '', rate: won.amt && won.budget ? Math.round(won.amt / won.budget * 10000) / 100 : null, alf, years: R.length });
  });
  up.sort((a, b) => a.next.localeCompare(b.next) || (b.alf - a.alf) || b.budget - a.budget);
  setSetting_('upcoming', up.slice(0, 40));
  try { syncProjects_(ar); } catch (e) { console.warn('사업 현황', e); }
  setSetting_('historyAt', now_());
}
/* ══════════ 사업 현황 (자동) ══════════
   ① 나라장터 계약정보: 아카이브 '올포랜드 수행실적' (사업명·발주처·계약금액·지분·공동수급사·계약기간)
   ② 그룹웨어 주간보고: 매일 아침 예약 작업이 '올포오션 사업 주간보고 (자동 수집)' 시트(스크립트 속성 WEEKLY_ID)에 옮겨 둔 것
   두 자료를 사업명으로 짝지어 한 사업 카드로 합친다. 사람이 입력하는 칸은 없다. */
function yearOf_(t) { const m = String(t).match(/(?:20)?(\d{2})\s*년|[’'`](\d{2})(?!\d)/); return m ? Number(m[1] || m[2]) : 0; }
function bigram_(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
function similar_(a, b) {   // 글자 두 개씩 겹치는 비율 (0~1)
  a = normName_(a); b = normName_(b);
  if (!a || !b) return 0; if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return .95;
  const A = bigram_(a), B = bigram_(b), used = {}; let hit = 0;
  A.forEach(x => { const i = B.findIndex((y, j) => y === x && !used[j]); if (i >= 0) { used[i] = 1; hit++; } });
  return 2 * hit / (A.length + B.length || 1);
}
/* "2026-01-01 ~ 2026-12-31", "2026-12-18", "4월 9일 ~ 12월 4일", "~ 2027년 3월 31일" → 끝나는 날 yyyy-MM-dd */
function endOf_(txt, year) {
  txt = String(txt || ''); const all = txt.match(/\d{4}-\d{2}-\d{2}/g); if (all) return all[all.length - 1];
  const parts = txt.split('~'), t = parts[parts.length - 1];
  const m = t.match(/(?:(\d{4})\s*[년.\-/]\s*)?(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/); if (!m) return '';
  const d = (m[1] || year) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}
function syncProjects_(ar) {
  const year = Number(today_().slice(0, 4));
  const C = archiveSheet_(ar, '올포랜드 수행실적').map(r => ({ y: Number(r[0]) || 0, date: d_(r[1]), name: String(r[2]), org: String(r[3]), amount: n_(r[5]), role: String(r[6]), joint: String(r[7]),
    share: r[8] === '' ? null : n_(r[8]), shareAmt: n_(r[9]), period: String(r[10] || ''), members: members_(r[11]), no: String(r[12] || '') })).filter(c => c.name && c.y >= year - 2);
  let W = [];
  const wid = prop_('WEEKLY_ID');
  if (wid) { const sh = SpreadsheetApp.openById(wid).getSheetByName('주간보고'); if (sh) { const v = sh.getDataRange().getValues(); v.shift(); W = v.filter(r => r[0] && r[3]); } }
  const used = {}, out = [];
  W.forEach(r => {
    const w = { id: String(r[0]), team: String(r[1]), pm: String(r[2]), name: String(r[3]), state: String(r[4]), cons: String(r[5]), amountTxt: String(r[6]), period: String(r[7]),
      actual: r[8] === '' ? null : n_(r[8]), plan: r[9] === '' ? null : n_(r[9]), title: String(r[10]), reported: d_(r[11]), done: String(r[12]), next: String(r[13]), issue: String(r[14]), event: String(r[15]) };
    let best = -1, bs = 0;
    // 연도가 다른 같은 이름(예: '25년 사업과 '26년 사업)은 점수를 깎고, 비슷하면 더 최근 계약을 고른다
    const yw = yearOf_(w.name) || (/^(26|2026)/.test(w.name) ? year % 100 : 0);
    C.forEach((c, i) => { if (used[i]) return; let sc = similar_(w.name, c.name); const yc = yearOf_(c.name);
      if (yw && yc && yw !== yc) sc *= .4; if (c.y < year - 1) sc *= .8;
      if (sc > bs + .01 || (Math.abs(sc - bs) <= .01 && best >= 0 && c.date > C[best].date)) { bs = Math.max(sc, bs); best = i; } });
    const c = bs >= .5 ? C[best] : null; if (c) used[best] = 1;
    const consM = members_(w.cons), me = consM.find(m => /올포랜드/.test(m.n));
    out.push({ id: w.id, src: c ? 'both' : 'gw', team: w.team, pm: w.pm, name: c ? c.name : w.name, short: w.name, org: c ? c.org : '', state: w.state,
      amount: c ? c.amount : n_(w.amountTxt.split('원')[0]), share: c ? c.share : (me ? me.s : null), shareAmt: c ? c.shareAmt : 0,
      members: (c && c.members.length ? c.members : consM).filter(m => !/올포랜드/.test(m.n)), role: c ? c.role : '', contract: c ? c.date : '', no: c ? c.no : '',
      end: endOf_(c && c.period, c ? c.y : year) || endOf_(w.period, c ? Number(c.date.slice(0, 4)) || year : year),
      actual: w.actual, plan: w.plan, reported: w.reported, title: w.title, done: w.done.slice(0, 900), next: w.next.slice(0, 900), issue: w.issue.slice(0, 600), event: w.event.slice(0, 300) });
  });
  // 주간보고는 없지만 최근 1년 안에 계약했고 아직 끝나지 않은 사업 (계약정보만)
  const t = today_(), yearAgo = Utilities.formatDate(new Date(Date.now() - 365 * 864e5), TZ, 'yyyy-MM-dd');
  C.forEach((c, i) => {
    if (used[i] || c.date < yearAgo) return;
    const end = endOf_(c.period, c.y); if (end && end < t) return;
    out.push({ id: 'c' + (c.no || i), src: 'g2b', team: '', pm: '', name: c.name, short: c.name, org: c.org, state: '', amount: c.amount, share: c.share, shareAmt: c.shareAmt,
      members: c.members.filter(m => !/올포랜드/.test(m.n)), role: c.role, contract: c.date, no: c.no, end, actual: null, plan: null, reported: '', title: '', done: '', next: '', issue: '', event: '' });
  });
  setSetting_('projAuto', out);
  setSetting_('projAt', now_());
}
/** 점검·즉시 반영: 편집기에서 실행하면 사업 현황을 바로 다시 맞춘다 */
function syncProjectsNow() { const id = prop_('ARCHIVE_ID'); if (!id) return console.log('ARCHIVE_ID 가 없어요'); syncProjects_(SpreadsheetApp.openById(id)); console.log('사업 ' + getSetting_('projAuto', []).length + '건을 맞췄어요'); }

/* 나라장터 계약정보에서 공동수급 구성사 꺼내기 — 응답 모양이 서비스 버전마다 달라 넓게 읽는다. 못 찾으면 [] */
function contractMembers_(no) {
  const key = prop_('DATA_GO_KR_KEY'); if (!key) return [];
  const prop = PropertiesService.getScriptProperties();
  try {
    const L = items_(fetchJson_(prop.getProperty('EP_CNTRCT') || ENDPOINT.CNTRCT,
      { serviceKey: key, type: 'json', numOfRows: 5, pageNo: 1, inqryDiv: prop.getProperty('CNTRCT_DIV') || '4', bidNtceNo: String(no).replace(/-\d+$/, '') }));
    for (const x of L) {
      const raw = Object.keys(x).filter(k => /corp/i.test(k)).map(k => String(x[k] || '')).join('');
      if (!raw) continue;
      // "[1^주계약업체^공동^업체명^대표자^국적^지분율…][2^…]" 꼴: 칸마다 업체명(한글·회사 글자)과 지분율(0~100 숫자)을 찾는다
      const out = raw.split(/\]\s*\[|\[|\]/).filter(Boolean).map(seg => {
        const f = seg.split('^').map(t => t.trim());
        const name = f[3] && /[가-힣A-Za-z]/.test(f[3]) ? f[3] : f.find(t => /주식회사|\(주\)|㈜|법인|조합|대학/.test(t));
        const share = isFinite(Number(f[6])) && Number(f[6]) > 0 && Number(f[6]) <= 100 ? Number(f[6]) : null;
        return name ? { n: coName_(name), s: share || null } : null;
      }).filter(Boolean);
      if (out.length) return out.slice(0, 6);
    }
  } catch (e) { console.warn('계약정보', no, e); }
  return [];
}

/* 단기예보 발표 시각(02,05,08,11,14,17,20,23시, 10분 뒤부터 조회 가능) */
function baseTime_() {
  const d = new Date(Date.now() - 15 * 6e4), h = Number(Utilities.formatDate(d, TZ, 'H'));
  const hs = [23, 20, 17, 14, 11, 8, 5, 2], bh = hs.find(x => x <= h);
  const day = bh == null ? new Date(d.getTime() - 864e5) : d;
  return { d: Utilities.formatDate(day, TZ, 'yyyyMMdd'), t: ('0' + (bh == null ? 23 : bh)).slice(-2) + '00' };
}
/* 위경도 → 기상청 격자(LCC) */
function grid_(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136, R = Math.PI / 180;
  const re = RE / GRID, s1 = SLAT1 * R, s2 = SLAT2 * R, ol = OLON * R, oa = OLAT * R;
  let sn = Math.tan(Math.PI * .25 + s2 * .5) / Math.tan(Math.PI * .25 + s1 * .5); sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * .25 + s1 * .5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
  let ro = Math.tan(Math.PI * .25 + oa * .5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * .25 + lat * R * .5); ra = re * sf / Math.pow(ra, sn);
  let th = lon * R - ol; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return { x: Math.floor(ra * Math.sin(th) + XO + .5), y: Math.floor(ro - ra * Math.cos(th) + YO + .5) };
}

/** 아침 8시 메일 요약 — 메일을 켠 사람에게만. 앱과 같은 거르기 규칙을 쓰고, 표로 보낸다 */
const APP_URL = 'https://friese8807.github.io/badapan/';
function morningDigest(onlyTo) {
  const t = today_(), soon = Utilities.formatDate(new Date(Date.now() + 3 * 864e5), TZ, 'yyyy-MM-dd'), y = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd');
  const kw = kw_(), votes = rows_('투표');
  const joined = id => votes.some(v => v.bidId === id && v.vote === '참여');
  // 앱 목록과 같은 공고만: 관심 단어 규칙을 통과했거나 누군가 참여·담당한 공고 (KIMST R&D 는 따로 공고가 뜰 때만)
  const B = rows_('공고').map(b => Object.assign({}, b, { posted: str_(b.posted), close: str_(b.close), closeTime: hm_(b.closeTime), join: joined(b.id) }))
    .filter(b => b.kind !== 'R&D공고' ? (b.owner || b.join || relevant_(b.title, b.org + ' ' + b.demand, kw)) : b.posted >= y);
  const dd = c => { const n = Math.round((new Date(c + 'T00:00:00+09:00') - new Date(t + 'T00:00:00+09:00')) / 864e5); return n === 0 ? 'D-day' : n > 0 ? 'D-' + n : '마감'; };
  const mine = B.filter(b => b.join && b.close >= t).sort((a, b) => a.close.localeCompare(b.close));
  const fresh = B.filter(b => b.posted >= y && !b.join).sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0));
  const due = B.filter(b => b.close >= t && b.close <= soon && !b.join && b.posted < y).sort((a, b) => a.close.localeCompare(b.close) || (Number(b.budget) || 0) - (Number(a.budget) || 0));
  const bad = sites_({ user: { id: '' } }).filter(s => s.now && (s.warn || s.now.wave > s.maxWave || s.now.wind > s.maxWind));
  if (!mine.length && !fresh.length && !due.length && !bad.length) return;

  const h = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eok = v => { const n = Number(v) || 0; return n ? (n / 1e8).toFixed(1) + '억' : '-'; };
  const md = d => d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : '';
  const TH = 'align="center" bgcolor="#DDEBF7" style="background:#DDEBF7;color:#1f2d3d;font-weight:bold;border:1px solid #c9d6e3;padding:6px;text-align:center;font-size:12px;white-space:nowrap"';
  const TD = a => `align="${a}" style="border:1px solid #dfe6ee;padding:6px;text-align:${a};font-size:12px;vertical-align:top"`;
  const KIND = { 입찰공고: ['본공고', '#1f7fd0'], 사전규격: ['사전규격', '#7c5cd6'], 'R&D공고': ['KIMST', '#2e9e5b'] };
  const table = (L, max) => {
    if (!L.length) return '<p style="color:#888;font-size:12px;margin:4px 0 14px">없음</p>';
    const rows = L.slice(0, max).map(b => { const k = KIND[b.kind] || [b.kind, '#555'], d = dd(b.close), hot = /D-day|D-[0-3]$/.test(d);
      const name = b.url ? `<a href="${h(b.url)}" style="color:#0b6aa6;text-decoration:none">${h(b.title)}</a>` : h(b.title);
      return `<tr><td ${TD('center')}><span style="color:${k[1]};font-weight:bold">${k[0]}</span></td><td ${TD('left')}>${name}</td><td ${TD('left')}>${h(b.demand && b.demand !== b.org ? b.demand : b.org)}</td>`
        + `<td ${TD('right')}>${eok(b.budget)}</td><td ${TD('center')}>${md(b.close)}${b.closeTime ? ' ' + h(b.closeTime) : ''}<br><span style="color:${hot ? '#d0392b' : '#888'};font-weight:${hot ? 'bold' : 'normal'}">${d}</span></td></tr>`; }).join('');
    const more = L.length > max ? `<p style="color:#888;font-size:12px;margin:4px 0 0">외 ${L.length - max}건은 앱에서 확인해 주세요</p>` : '';
    return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px;margin:4px 0 14px"><tr><th ${TH}>구분</th><th ${TH}>사업명</th><th ${TH}>발주처</th><th ${TH}>금액</th><th ${TH}>마감</th></tr>${rows}</table>${more}`;
  };
  const sec = (title, n, color) => `<h3 style="font-size:15px;margin:18px 0 4px;color:#1f2d3d;border-left:4px solid ${color};padding-left:8px">${title} <span style="color:#888;font-weight:normal">${n}건</span></h3>`;
  const sites = bad.length ? `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:4px 0 14px"><tr><th ${TH}>현장</th><th ${TH}>파고</th><th ${TH}>풍속</th><th ${TH}>특보</th></tr>`
    + bad.map(s => `<tr><td ${TD('left')}>${h(s.name)}</td><td ${TD('right')}>${s.now.wave == null ? '-' : s.now.wave + 'm'}</td><td ${TD('right')}>${s.now.wind == null ? '-' : s.now.wind + 'm/s'}</td><td ${TD('center')}>${h(s.warn || '-')}</td></tr>`).join('') + '</table>' : '';
  const html = `<div style="font-family:'Malgun Gothic',Apple SD Gothic Neo,sans-serif;color:#1f2d3d;max-width:760px">
    <h2 style="font-size:18px;margin:0 0 4px">올포오션 아침 요약 · ${md(t)}</h2>
    <p style="font-size:12px;color:#666;margin:0 0 6px">새 공고 ${fresh.length}건 · 3일 안 마감 ${due.length}건${mine.length ? ' · 참여 공고 ' + mine.length + '건' : ''}${bad.length ? ' · 작업 유의 현장 ' + bad.length + '곳' : ''}</p>
    ${mine.length ? sec('🙋 참여하기로 한 공고', mine.length, '#2e9e5b') + table(mine, 10) : ''}
    ${sec('🆕 새 공고 (어제·오늘)', fresh.length, '#1f7fd0') + table(fresh, 15)}
    ${sec('⏰ 3일 안 마감', due.length, '#d0392b') + table(due, 15)}
    ${bad.length ? sec('🌊 작업 유의·불가 현장', bad.length, '#e0a020') + sites : ''}
    <p style="margin:18px 0 6px"><a href="${APP_URL}" style="background:#4f93c9;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:13px">올포오션 앱에서 보기</a></p>
    <p style="font-size:11px;color:#999;margin:10px 0 0">금액이 큰 순(새 공고)·마감이 빠른 순(마감 임박)으로 정리했어요. 빨간 D-day는 3일 안 마감. 메일 끄기: 앱 → 더보기 → 알림</p></div>`;
  const txt = b => `· [${(KIND[b.kind] || [b.kind])[0]}] ${b.title} / ${b.demand || b.org} / ${eok(b.budget)} / ${md(b.close)} ${dd(b.close)}`;
  const body = [`올포오션 아침 요약 ${t}`, '', `[새 공고 ${fresh.length}건]`, ...fresh.slice(0, 15).map(txt), '', `[3일 안 마감 ${due.length}건]`, ...due.slice(0, 15).map(txt), '', APP_URL].join('\n');
  const to = onlyTo ? [{ email: onlyTo }] : rows_('회원').filter(u => u.status === 'active' && on_(u.digest) && u.email);
  to.forEach(u => {
    try { MailApp.sendEmail({ to: u.email, subject: `[올포오션] ${md(t)} 새 공고 ${fresh.length} · 마감 임박 ${due.length}${mine.length ? ' · 참여 ' + mine.length : ''}`, body, htmlBody: html }); } catch (e) { console.warn(e); }
  });
}
/** 점검: 아침 메일을 지금 나(실행한 계정)에게만 한 번 보내 본다 */
function testDigest() { const me = Session.getEffectiveUser().getEmail(); morningDigest(me); console.log(me + ' 로 보냈어요(공고가 하나도 없으면 보내지 않아요)'); }

/** 매일 새벽: 끝난 세션·오래된 접속 기록(180일)·지난 공고(1년) 정리 */
function cleanup() {
  const now = new Date();
  rows_('세션').filter(s => new Date(s.expiresAt) < now).reverse().forEach(s => del_('세션', s._row));
  const keep = new Date(now.getTime() - 180 * 864e5).toISOString();
  const old = rows_('접속').filter(x => String(x.at) < keep); if (old.length) { rowsDirty_('접속'); sh_('접속').deleteRows(2, old.length); }
  const y = Utilities.formatDate(new Date(now.getTime() - 365 * 864e5), TZ, 'yyyy-MM-dd');
  rows_('공고').filter(b => str_(b.close) && str_(b.close) < y).reverse().forEach(b => del_('공고', b._row));
  const nk = new Date(now.getTime() - 90 * 864e5).toISOString();
  const oldN = rows_('소식').filter(x => String(x.at) < nk); if (oldN.length) { rowsDirty_('소식'); sh_('소식').deleteRows(2, oldN.length); }
}

/* ══════════ 설치 ══════════ */
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PEPPER')) p.setProperty('PEPPER', token_() + token_());
  let ss; const id = p.getProperty('SHEET_ID');
  if (id) ss = SpreadsheetApp.openById(id); else { ss = SpreadsheetApp.create('올포오션 데이터 (공유 금지)'); p.setProperty('SHEET_ID', ss.getId()); }
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(n => {
    let s = ss.getSheetByName(n); if (!s) s = ss.insertSheet(n);
    // 모든 칸을 '글자' 형식으로: 아이디·해시·날짜를 시트가 숫자나 날짜로 멋대로 바꾸지 않게
    s.getRange(1, 1, s.getMaxRows(), SHEETS[n].length).setNumberFormat('@');
    s.getRange(1, 1, 1, SHEETS[n].length).setValues([SHEETS[n]]).setFontWeight('bold'); s.setFrozenRows(1);
  });
  const d = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1'); if (d && ss.getSheets().length > 1) ss.deleteSheet(d);
  if (!rows_('설정').some(x => x.key === 'keywords')) setSetting_('keywords', DEFAULT_KW);
  p.setProperty('SCHEMA', SCHEMA);
  console.log('시트: ' + ss.getUrl() + '\n이 시트는 본부 공용 계정만 볼 수 있게 두세요(공유하지 마세요). 다음: createAdmin(...) 을 한 번 실행.');
}
/** 첫 관리자 만들기 — 값을 고쳐 한 번 실행한 뒤, 비밀번호가 남지 않게 이 줄의 숫자를 지운다 */
function createAdmin(name, company, team, pin) {
  name = nm_(name || '이름'); company = company || '올포랜드'; team = team || '해양SI 1팀'; pin = String(pin || '');
  if (weakPin_(pin)) throw new Error('쉽지 않은 숫자 6자리 비밀번호를 넣어 주세요');
  const salt = 's' + token_().slice(0, 31);   // 글자로 시작 → 시트가 숫자로 바꾸지 않게
  append_('회원', { id: uid_(), name, company, team, role: 'admin', email: '', digest: '', salt, hash: hashPin_(pin, salt), status: 'active', createdAt: now_(), lastAt: '', device: '' });
  console.log(name + ' 관리자를 만들었어요.');
}
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('collectBids').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('collectWeather').timeBased().everyHours(3).create();
  ScriptApp.newTrigger('morningDigest').timeBased().atHour(8).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('cleanup').timeBased().atHour(4).everyDays(1).inTimezone(TZ).create();
  console.log('자동 실행 4개를 걸었어요.');
}

/* ══════════ 점검용 (편집기에서 직접 실행) ══════════ */
/** 회원 목록 점검 — 비밀값은 보이지 않고, 이름 글자·상태·저장 형식만 보여 준다 */
function checkMembers() {
  rows_('회원').forEach(u => console.log(JSON.stringify({ 이름: u.name, 글자수: String(u.name).length, 보정이름: nm_(u.name), 상태: u.status, 역할: u.role,
    소금형식: typeof u.salt + '/' + String(u.salt).length, 해시형식: typeof u.hash + '/' + String(u.hash).length })));
  console.log('서버 비밀값 있음: ' + !!prop_('PEPPER') + ' · 시트: ' + ss_().getUrl());
}
/** 비밀번호 확인 시험 — 숫자를 넣어 실행하고, 끝나면 숫자를 지운다 */
function testLogin(name, pin) {
  name = name || '서의성'; pin = String(pin || '');
  const u = rows_('회원').find(x => nm_(x.name) === nm_(name));
  if (!u) return console.log('이름을 못 찾았어요: ' + name + ' → checkMembers 로 저장된 이름을 확인해 주세요');
  console.log('상태: ' + u.status + ' · 비밀번호 ' + (eq_(hashPin_(pin, u.salt), String(u.hash)) ? '맞아요' : '틀려요'));
}
/** 여러 번 틀려 잠긴 것 풀기 */
function unlockAll() {
  const c = CacheService.getScriptCache(); c.remove('f:all'); rows_('회원').forEach(u => c.remove('f:u:' + u.id)); console.log('잠금을 풀었어요');
}
/** 비밀번호 다시 정하기 — 이름과 새 숫자를 넣어 실행하고, 끝나면 숫자를 지운다 */
function resetPin(name, pin) {
  pin = String(pin || ''); if (weakPin_(pin)) throw new Error('쉽지 않은 숫자 6자리 비밀번호를 넣어 주세요');
  const u = rows_('회원').find(x => nm_(x.name) === nm_(name)); if (!u) throw new Error('이름을 못 찾았어요');
  const salt = 's' + token_().slice(0, 31);
  update_('회원', u._row, { salt, hash: hashPin_(pin, salt), status: 'active' });
  dropSessions_(u.id); unlockAll(); console.log(u.name + ' 비밀번호를 새로 정했어요');
}
