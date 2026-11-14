---
name: "mobile-webapp-kit"
description: 모든 웹앱 작업의 기본 스킬. 휴대폰 홈 화면에 추가해서 쓰는 웹앱(PWA)을 새로 만들거나 고칠 때 반드시 먼저 읽는다(올포오션·발자취·윤호채원이네·수급 레이더·힐스초등수학 등 모든 앱). "웹앱 만들어줘", "앱 만들어줘", "홈 화면에 추가", "아이폰에서 쓸 수 있게", GitHub Pages·Apps Script 웹앱, 기존 앱(올포오션·발자취·윤호채원이네·수급 레이더·힐스초등수학) 수정 요청에 적용. 지도·그래프·달력·표·로그인·공공데이터 연결은 검증된 패턴과 코드 조각을 쓴다. 홈 화면 아이콘 제작, 위아래 공백 제거(화면 꽉 채우기), 좌우 스와이프, 로딩·진행 표시, 바텀시트, 새 버전 자동 반영, 자동 새로고침, 오류 표시, 예시 모드, 로그인 기억, Apps Script 연결, 아이폰 위젯(Scriptable)을 처음부터 공통으로 넣는다. 화면 디자인이 바뀌는 작업은 배포 전에 시안을 3개 이상 보여 주고 사용자가 고른 안만 적용한다. 사용자가 이런 처리를 따로 말하지 않아도 적용한다.
---

# 모바일 웹앱 공통 키트

사용자는 아이폰 홈 화면에 추가해서 쓰는 한 파일짜리 웹앱(`index.html` + GitHub Pages, 데이터는 주로 Google Apps Script·시트)을 만든다.
지금까지 앱마다 같은 문제를 여러 번 되풀이해서 고쳤다(윤호채원이네는 화면 높이만 열 번 넘게). 이 스킬은 그 결과를 모아 **처음부터** 넣기 위한 것이다.
사용자는 개발자가 아니므로, 아래 항목은 묻지 말고 기본으로 적용하고 결과만 쉬운 말로 알린다.

## 가장 먼저: 디자인이 바뀌는 작업은 시안부터

**화면 모양이 달라지는 작업(새 앱의 화면, 배치·색·모양 변경, 새 화면 추가, 아이콘·위젯 모양)은 배포 전에 시안을 3개 이상 만들어 보여 주고, 사용자가 고른 안만 적용한다.**
고르기 전에는 `main`에 올리거나 서버·위젯을 배포하지 않는다. 고장 수리나 사용자가 모양을 정확히 지정한 변경은 바로 진행한다.
순서와 예외는 `references/design-review.md`를 읽고 그대로 따른다. 시안 사진은 `scripts/samples.py`로 만든다.

## 검증된 패턴 먼저 (모든 웹앱)

`references/proven-patterns.md`를 **항상** 읽는다. 사용자가 실제로 고른 최종 모양(파스텔 색감, 카드·버튼, 가운데 정렬 설명), 작업 방식(시안 플래그·스크린샷을 오른쪽 패널에·서버 배포 안내), 그리고 실제로 터졌던 문제의 해법이 들어 있다.
지도·시간 그래프·물때 곡선·글 속 날짜 달력·사람×요일 표·자동 로그인·초대 링크·공공데이터 호출을 만들 때는 `assets/snippets/`의 코드를 그대로 가져다 쓴다.

## 새 앱을 만들 때

1. 뼈대 생성 — 공통 CSS·JS가 들어간 `index.html`, 매니페스트, 서비스 워커, `version.txt`, 아이콘이 한 번에 나온다.
   ```bash
   python3 scripts/new_app.py --name "앱 이름" --short "짧은이름" --slug english-slug --out ./english-slug \
       --accent "#3b6cf6" --bg-light "#f3f5f8" --bg-dark "#10141b"
   ```
   위젯도 만들 때는 `--widget --app-url https://계정.github.io/english-slug/ --data-url JSON주소` 를 붙인다.
2. 아이콘 제작 — 앱 내용에 맞는 `icon.svg`를 직접 그려서 교체한다. 규칙은 `references/icons.md`.
   ```bash
   python3 scripts/make_icons.py icon.svg ./english-slug --v 1
   ```
3. 화면 시안을 3개 이상 만들어 보여 주고 고르게 한다(`references/design-review.md`). 아이콘도 같은 방식으로 고르게 한다.
   고른 안으로 `index.html`의 예시 화면(탭 3개·시트·`api` 자리)을 실제 내용으로 바꾼다. `AppKit` 부분과 `ak-` 클래스는 그대로 둔다.
4. 아래 체크리스트를 확인하고, 가능하면 Playwright의 iPhone 화면으로 열어 본다.
5. 배포할 때마다 `python3 scripts/bump_version.py 앱폴더` 를 실행한다.

## 기존 앱을 고칠 때

기존 앱 네 개는 이 키트 이전에 만들어져 클래스 이름이 다르다. 통째로 바꾸지 말고, 요청받은 부분을 고치면서
`assets/kit/app-kit.css`·`app-kit.js`에서 필요한 조각만 옮긴다. 화면 모양이 달라지면 먼저 시안 루틴을 거친다. 아래 체크리스트에서 빠진 것이 보이면 고치기 전에 한 줄로 알린다.

## 체크리스트 (모든 웹앱 공통)

| # | 항목 | 핵심 | 자세히 |
|---|---|---|---|
| 0 | 디자인 변경 루틴 | 시안 3개 이상 → 한 장으로 비교 → 사용자가 선택 → 고른 안만 적용·배포 | `references/design-review.md` |
| 1 | 홈 화면 아이콘 | PNG 180·192·512·maskable, 파일 이름에 `-v숫자`, 아이콘에 글자·둥근 모서리·투명 없음 | `references/icons.md` |
| 2 | 위아래 공백 제거 | `viewport-fit=cover`, 문서는 고정·`#sc`만 스크롤, 탭바는 `fixed` 대신 flex 맨 아래, `html` 배경=탭바 색, `AppKit.fixViewport()` | `references/layout.md` |
| 3 | 스와이프 | 탭·날짜는 좌우로 밀어 넘김(`AppKit.tabs`/`swipe`), 시트는 끌어내려 닫기(`AppKit.sheet`) | `references/gestures.md` |
| 4 | 로딩 표시 | 첫 화면 `.ak-boot`, 누른 동작은 막대+알약+버튼 스피너(`AppKit.wrap`), 배경 새로고침은 아이콘만 회전 | `references/loading.md` |
| 5 | 새 버전 반영 | `version.txt` + `AppKit.autoUpdate(BUILD)` + 서비스 워커 네트워크 우선 + 배포 때 `bump_version.py` | `references/update.md` |
| 6 | 화면 기본 품질 | 입력칸 16px(아이폰 확대 방지), 밝은·어두운 화면, `prefers-reduced-motion`, 설정 화면 맨 아래 `AppKit.env()` 진단 문구 | `references/layout.md` |
| 7 | 앱 틀 | 파일 하나, 상태 `S` + `render()`, `data-*` 클릭 한 개, `AppKit.store('접두어')`, `esc()`, 마지막 탭·선택 기억 | `references/app-basics.md` |
| 8 | 데이터 갱신 | 지난 데이터 먼저 표시, 자동 새로고침(`AppKit.poll`), 입력 중엔 다시 그리지 않기, 늦은 응답 버리기, 오프라인 대기열, "14:32 갱신" 표시 | `references/app-basics.md` |
| 9 | 오류·실수 방지 | 오류 띠(`AppKit.showErrors`), 쉬운 말 토스트, 두 번 눌림 방지, 두 번 눌러 지우기(`AppKit.sure`), 다시 시도 버튼 | `references/app-basics.md` |
| 10 | 예시 모드 | 서버 없이 `#demo`로 화면 전체가 동작, "예시 데이터" 띠 표시 | `references/app-basics.md` |
| 11 | 글·숫자·모양 | 설명 글은 가운데 정렬 + 낱말 안 끊기(`keep-all`·`balance`), 쉬운 우리말 "~요"체, ko-KR 숫자·원·억, 상승 빨강·하락 파랑, 줄 아이콘 SVG, 가족용은 검색 차단 | `references/app-basics.md` |
| 12 | Apps Script 연결 | `text/plain` POST → 실패하면 JSONP → 숨은 iframe, 한 번 누르는 설정 링크, 화면은 `github.io`에서 직접 | `references/apps-script.md` |
| 13 | 로그인 (필요할 때) | 처음 한 번만 넣고 기억, 비밀번호 확인은 서버에서, 역할·넘겨주기, 접속 기록 | `references/login.md` |
| 14 | 아이폰 위젯 (필요할 때) | Scriptable 로더+본체 자동 갱신, 크기별 화면, 오프라인 캐시, 설치 안내 페이지 | `references/widget.md` |
| 16 | 검증된 패턴 | 파스텔 하늘 색감·카드 모양·지도 범위·시각 비례 그래프·0건 배지 숨김·공공데이터 오류 판별 | `references/proven-patterns.md`, `assets/snippets/` |
| 15 | 그 밖 (필요할 때) | GitHub Actions 자료 수집, 사진 줄이기, 토스 송금·복사, 지도, 저장소 작업 방식, README | `references/extras.md` |

1~12는 모든 앱에 기본으로 넣는다. 13~15는 앱 성격에 맞을 때 넣고, 맞을 것 같으면 먼저 제안한다.

작업 내용과 관련된 참고 파일만 읽는다. 화면 높이·아이콘 문제는 아이폰에서만 드러나므로, 고쳤다고 말하기 전에 해당 참고 파일의 "하지 말 것"을 다시 확인한다.

## 파일

- `assets/kit/app-kit.css`, `assets/kit/app-kit.js` — 공통 스타일·동작(주석에 이유가 적혀 있다). 한 파일 앱이므로 `index.html` 안에 넣어서 쓴다.
- `assets/template/` — `new_app.py`가 쓰는 뼈대.
- `assets/widget/` — 위젯 로더·본체·설치 안내 페이지 뼈대.
- `assets/snippets/` — 올포오션에서 검증된 코드 조각(지도 어댑터, 그래프·물때 곡선, 글 속 날짜 달력, 주간 표, 자동 로그인·초대·배지, Apps Script 공공데이터).
- `scripts/new_app.py`, `scripts/make_icons.py`, `scripts/bump_version.py`, `scripts/samples.py`(시안 비교 사진)

## 사용자에게 알릴 때

- 아이콘을 바꿨으면: 아이폰은 홈 화면 아이콘을 붙잡고 있으므로 **홈 화면에서 앱을 지우고 다시 추가**해야 바뀐다고 알린다.
- 배포 후: GitHub Pages는 반영까지 1~2분 걸리고, 앱을 다시 열면 새 버전이 자동으로 뜬다고 알린다.
- 아이폰 실제 기기에서만 확인되는 것(하단 띠, 상태바 영역)은 "휴대폰에서 확인이 필요하다"고 분명히 말한다.
