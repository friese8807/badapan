# 화면 꽉 채우기 (위아래 공백 제거)

아이폰 홈 화면 앱에서 위·아래에 빈 띠가 생기거나, 탭바가 스크롤을 따라 움직이거나, 버튼이 눌리지 않는 문제를 막는 방법이다.
윤호채원이네와 발자취에서 여러 번 고쳐 가며 정리된 결론이며 `app-kit.css` 1번 구역과 `AppKit.fixViewport()`에 들어 있다.

## 구조

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="밝은 배경" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="어두운 배경" media="(prefers-color-scheme: dark)">
```
```
html  height:100%; overflow:hidden; background: 탭바 색(--solid)
body  height:var(--app-h,100%); display:flex; flex-direction:column; overflow:hidden
 ├ header.ak-top   flex:none   padding-top: 8px + safe-area-inset-top
 ├ main#sc         flex:1; min-height:0; overflow-y:auto   ← 여기만 스크롤
 └ nav.ak-tabs     flex:none   padding-bottom: safe-area-inset-bottom 기준
```

## 왜 이렇게 하는가

1. **문서는 고정하고 안쪽만 스크롤** — 문서 전체가 스크롤되면 아이폰에서 탭바가 따라 움직이고 위아래로 튕긴다.
2. **하단 바는 `position:fixed`를 쓰지 않는다** — iOS 홈 화면 앱은 `fixed; bottom:0`이 화면 끝보다 위에서 끝나 틈이 생긴다(iOS 26에서 확인). flex 맨 아래 칸에 둔다.
3. **`html` 배경 = 탭바 색** — 아이폰이 웹 화면 밖에 남기는 맨 아래 칸이 `html` 배경으로 칠해진다. 탭바와 같은 색이면 이어져 보인다.
   탭바가 없고 바텀시트가 바닥에 있으면 시트 색으로 맞춘다.
4. **`--app-h` 보정** — 홈 화면 앱에서 `innerHeight`가 실제 화면보다 짧게 잡힐 때 `fixViewport()`가 그 차이(160px 미만일 때만)를 더한다. `100vh`·`100dvh`만으로는 해결되지 않았다.
5. **상태바는 `default`** — `black-translucent`는 내용이 상태바 밑으로 들어가 위쪽 버튼이 눌리지 않는 일이 있었다.
   지도처럼 화면 끝까지 그려야 하는 앱(발자취)만 `black-translucent`를 쓰고, 그때는 위쪽 요소에 `safe-area-inset-top`만큼 여백을 준다.
6. **안전 영역** — 좌우는 `max(16px, env(safe-area-inset-left))`, 아래는 `env(safe-area-inset-bottom)`. 탭바 아래 여백은 홈 바 높이 전부가 아니라 `max(6px, sab - 14px)` 정도가 보기 좋다.
7. **토스트·알약** 은 탭바 위(`bottom: 84px + sab`)에 띄운다.

## 기본 품질

- 입력칸 글자 16px 이상 — 작으면 아이폰이 누를 때 화면을 확대한다.
- `-webkit-tap-highlight-color:transparent`, `overscroll-behavior` 로 튕김·번쩍임 제거.
- 색은 `:root` 토큰으로 두고 `prefers-color-scheme: dark`에서 다시 정의. `color-scheme`도 함께.
- `user-scalable=no`는 지도 앱처럼 꼭 필요할 때만.
- 설정 화면 맨 아래에 `AppKit.env(BUILD)` 문구를 작게 넣는다. 화면 문제를 물어볼 때 사용자가 이 줄을 캡처해 주면 원인을 바로 알 수 있다.

## 하지 말 것

- 앱을 `iframe`에 넣어 보여 주지 않는다(윤호채원이네 초기 방식). 높이·터치·안전 영역이 모두 어긋난다. 앱 화면을 직접 내보낸다.
- `body`에 `padding-bottom`으로 탭바 자리를 비우는 방식(고정 탭바 전제)으로 되돌리지 않는다.
- 브라우저(사파리 탭)에서만 보고 "됐다"고 하지 않는다. 문제는 홈 화면 앱에서만 생긴다. 확인이 필요하다고 알린다.
