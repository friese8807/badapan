# Google Apps Script·시트 연결

사용자의 앱은 대부분 화면은 GitHub Pages, 데이터는 Apps Script 웹 앱(`…/exec`) + 구글 시트다.

## 호출

```js
async function api(action, payload){
  const r = await fetch(API_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload }) });
  const j = await r.json(); if(!j.ok) throw new Error(j.error || '처리하지 못했어요'); return j.data;
}
api = AppKit.wrap(api, a => a === 'refresh');
```

- `Content-Type`은 `text/plain` — `application/json`이면 사전 요청이 생기는데 Apps Script는 받지 못한다.
- 배포 설정: 실행 "나", 액세스 "모든 사용자". 코드를 고치면 **새 버전으로 다시 배포**해야 반영된다(주소는 유지).
- 주소·토큰은 화면 코드에 넣어도 되는 것만. 비밀번호는 서버에서 확인하고 토큰만 `localStorage`에 둔다.

## 아이폰 홈 화면 앱에서 `Load failed`가 날 때 (발자취에서 겪음)

차례로 시도하고, 성공한 방식을 기억해 다음부터 그 방식을 먼저 쓴다.

1. `fetch`
2. JSONP — `<script src="…/exec?callback=이름&…">`. `Code.gs`의 `doGet`이 `callback`이 있으면 `이름(JSON)`을 자바스크립트로 돌려줘야 한다.
3. 숨은 `iframe` + `postMessage`

읽기는 2·3으로 가능하지만 주소 길이 제한이 있으므로 큰 데이터 쓰기는 `fetch`가 필요하다. 구현은 발자취 `index.html`의 `jsonp`, `viaFrame`, `MODES` 부분을 가져다 쓴다.
연결 문제를 볼 수 있는 진단 화면(발자취 `diag.html`)도 함께 두면 원인을 빨리 찾는다.

## 한 번 누르는 설정 링크

`…/앱/#setup=<base64(JSON {url, token})>` 로 열면 설정을 저장하고 주소에서 지운다. 사파리와 홈 화면 앱은 저장소가 달라
홈 화면 앱에서 긴 주소를 직접 붙여 넣어야 하는 일을 없앤다.

## 데이터 다루기

- 계좌번호·전화번호처럼 0으로 시작하거나 긴 숫자는 시트에 **글자**로 저장한다(앞에 `'`).
- 날짜는 한국 시간 기준 `YYYY-MM-DD` 글자로 주고받는다.
- 오프라인이거나 실패한 쓰기는 `localStorage` 대기열에 넣고 `online` 이벤트에서 다시 보낸다.
- 지난 데이터는 저장해 두었다가 먼저 보여 주고, 뒤에서 새로 받아 바꾼다.

## 화면을 어디에 둘 것인가 (세 앱에서 쓴 방식)

| 방식 | 앱 | 장점 | 주의 |
|---|---|---|---|
| 화면은 `github.io`, Apps Script는 데이터만 | 발자취, 윤호채원이네(현재) | 가장 단순하고 빠르다. **기본으로 쓴다** | 화면을 고치면 GitHub에 올려야 한다 |
| 껍데기만 `github.io`, 화면(style·app)은 서버가 내려 줌 | 힐스초등수학 | Apps Script만 다시 배포하면 화면이 바뀐다 | 껍데기에 `google.script.run`을 흉내 내는 코드가 필요하다(`hills-math/index.html`의 `runner`) |
| Apps Script 화면을 `iframe`으로 넣기 | 윤호채원이네(초기) | — | **쓰지 않는다.** 높이·터치·저장소가 모두 어긋났다 |

- 한 코드가 Apps Script 안(`google.script.run`)과 `github.io`(`fetch`) 양쪽에서 돌게 하려면 호출 함수 하나에서 `window.google?.script?.run`이 있는지 보고 갈라 탄다.
- 서버 주소가 오래된 화면으로 가지 않게, Apps Script 주소로 직접 들어온 사람은 `github.io` 앱으로 보낸다.
- 서버 응답 모양은 `{ ok:true, data }` / `{ ok:false, code, message }`로 통일한다. `code:"auth"`는 로그인 풀림.
