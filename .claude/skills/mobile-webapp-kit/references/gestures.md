# 스와이프·끌기

## 좌우 스와이프로 탭·날짜 넘기기

```js
const tabs = AppKit.tabs({ ids:['home','list','set'], render(id){ /* #sc 내용 그리기 */ } });
// 탭이 아닌 것(날짜, 달, 아이 전환 등)
AppKit.swipe('#sc', { onNext: () => moveDay(+1), onPrev: () => moveDay(-1) });
```

- 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전. 넘어갈 때 `ak-in-l`/`ak-in-r`로 살짝 미끄러져 들어온다.
- 세로 스크롤과 헷갈리지 않게 가로 이동이 세로의 1.5배 이상, 60px 이상, 0.7초 이내일 때만 반응한다.
- 가로로 스크롤되는 영역(날짜 띠, 표, 타임라인), 입력칸, 지도, `data-noswipe` 안에서 시작한 동작은 무시한다.
  가로 스크롤 영역에는 `.ak-hscroll`(`touch-action:pan-x`)을 붙인다.
- 화면 왼쪽 끝 24px에서 시작한 동작은 무시한다(사파리 뒤로 가기와 겹침).
- 스와이프는 **보조 수단**이다. 같은 이동을 하는 버튼(탭바, ‹ › 화살표)을 반드시 함께 둔다.
- 마지막으로 본 탭은 `localStorage`에 기억한다.

## 바텀시트

```js
const sheet = AppKit.sheet('#sheet');   // <div class="ak-sheet" id="sheet"><div class="ak-grab"></div><div class="body">…</div></div>
sheet.open(); sheet.close();
```

- 손잡이를 30% 이상 끌어내리거나 빠르게 튕기면 닫힌다. 바깥(어두운 부분)을 눌러도 닫힌다.
- 손잡이에는 `touch-action:none` + 포인터 캡처를 써서 끄는 동안 뒤 화면이 스크롤되지 않게 한다.
- 시트 안 내용은 `.body`에서만 스크롤(`overscroll-behavior:contain`).
- 시트 아래로 같은 색을 200px 이어 붙여(`::after`) 아이폰 하단 틈을 가린다.
- 항상 떠 있는 시트(발자취처럼 접힘↔펼침)는 같은 방식에 "접힌 높이"만 더한 것이다. 발자취 `index.html`의 "바텀시트 드래그" 부분을 참고한다.

## 길게 누르기

지도·목록에서 길게 눌러 추가하는 동작: `touchstart`에서 650ms 타이머, 10px 이상 움직이면 취소, 실행 시 `navigator.vibrate?.(20)`.
길게 누르기는 발견하기 어려우므로 같은 기능의 버튼을 함께 둔다.
