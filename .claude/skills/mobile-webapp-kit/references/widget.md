# 아이폰 위젯 (Scriptable)

윤호채원이네와 수급 레이더에 같은 방식으로 넣었다. 웹앱은 위젯을 직접 만들 수 없어서 무료 앱 Scriptable을 쓴다.
사용자가 "위젯"을 말하거나, 앱의 핵심이 숫자 한두 개(오늘 건수, 이번 달 금액, 시세)라면 제안한다.

## 구성 (`assets/widget/`)

| 파일 | 역할 |
|---|---|
| `widget-loader.js` → 저장소에는 `widget-loader.txt` | 사용자가 Scriptable에 **한 번만** 붙여 넣는 짧은 코드. 실행될 때마다 본체를 새로 받는다 |
| `widget-core.js` | 위젯 본체. 이것만 고쳐서 올리면 모든 폰의 위젯이 바뀐다 |
| `widget.html` | 설치 안내 페이지 (코드 복사 버튼 + 4단계 설명) |

`{{NAME}}`, `{{SLUG}}`, `{{APP_URL}}`(끝에 `/`), `{{DATA_URL}}`, `{{MARK}}`(예: `BUDGET_WIDGET`)를 바꿔서 앱 폴더에 넣는다.

## 지켜야 할 것

- **로더와 본체를 나눈다.** 사용자에게 코드를 다시 붙여 넣게 하지 않는다.
- 본체 첫 줄에 표식(`{{MARK}}`)을 두고, 로더는 표식이 있을 때만 저장한다(오류 페이지를 저장하면 위젯이 죽는다).
- 데이터는 새로 받고, 실패하면 캐시(`FileManager.cacheDirectory()`)의 마지막 값을 "오프라인 HH:MM"으로 보여 준다. 빈 위젯을 보여 주지 않는다.
- 크기별로 따로 그린다: `small`(숫자 하나), `medium`, `large`, 잠금 화면 `accessoryRectangular`·`accessoryInline`·`accessoryCircular`.
- 글자는 `lineLimit=1` + `minimumScaleFactor`로 넘치지 않게. 줄임말(외·기·개)보다 칸을 나눠 온전한 낱말(외국인·기관·개인)을 쓴다.
- 색은 `Color.dynamic(밝은, 어두운)`. `DrawContext` 그림은 밝기 전환이 안 되므로 양쪽에서 보이는 고정색.
- `w.refreshAfterDate`로 다음 새로고침을 요청한다(15분, 변화가 잦을 때 5분). 실제 시각은 아이폰이 정하므로 "15~30분마다"라고 안내한다.
- `w.url`에 앱 주소 + `?via=widget`. 사파리 대신 주소창 없는 전체 화면으로 열려면 `scriptable:///run/스크립트이름?open=1`로 Scriptable 안에서 여는 방법도 있다(윤호채원이네 `widget-core.js`의 `openURL`·`openApp`).
- 배경 그림을 쓰면 낮·밤 두 벌을 PNG로 올려 두고 한 번 받아 캐시한다(파일 이름에 버전).
- 비밀번호가 필요한 앱은 로더 맨 위 상수(`PIN`)에 사용자가 직접 넣게 한다. 본체·저장소에 넣지 않는다.

## 사용자에게

설치 페이지 주소(`…/앱/widget.html`)를 알려 준다. 본체를 고친 뒤에는 "위젯은 다음 새로고침 때 저절로 바뀐다"고 알린다.
