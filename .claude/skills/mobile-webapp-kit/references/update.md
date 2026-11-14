# 새 버전 반영·홈 화면 설치

휴대폰은 예전 화면을 오래 붙잡는다. "고쳤는데 안 바뀌었다"는 대부분 이 문제다.

## 구성

- `version.txt` — 숫자 한 줄(배포 시각).
- `index.html` — `const BUILD='숫자'` 와 `AppKit.autoUpdate(BUILD)`. 열 때와 화면에 돌아올 때 `version.txt`를 새로 받아 숫자가 다르면 `?v=숫자`로 다시 연다. 같은 숫자로는 한 번만 시도한다.
- `sw.js` — 네트워크 우선, 실패하면 캐시. `CACHE` 이름에 같은 숫자. `skipWaiting` + `clients.claim`으로 바로 교체. `version.txt`와 다른 주소(Apps Script, 지도 등)는 건드리지 않는다.
- 배포 전 `python3 scripts/bump_version.py 앱폴더` — 세 곳의 숫자를 한 번에 올린다.

## 매니페스트

`id`, `start_url`, `scope`는 `./`. `display:standalone`. `background_color`는 시작 화면 색(어두운 배경 권장).
아이콘·이름을 바꾸면 `<link rel="manifest" href="manifest.webmanifest?v=2">`처럼 숫자를 올린다.

## 배포 (GitHub Pages)

- 저장소 루트에 `index.html`. 주소는 `https://계정.github.io/저장소/`.
- 반영까지 1~2분. 사용자에게는 "앱을 닫았다가 다시 열면 새 버전이 뜬다"고 알린다.
- 주소가 바뀌면 홈 화면 앱은 따로 설치된 것으로 취급된다(저장된 로그인도 새로). 주소는 처음에 정하고 바꾸지 않는다.

## 기타

- 다른 주소의 스크립트 오류는 `Script error.`로만 보인다. 전역 오류 알림을 띄우는 앱이라면 이 문구는 무시한다.
- 로그인·설정은 `localStorage`에 둔다. 사파리와 홈 화면 앱은 저장소가 따로이므로, 한 번 누르면 설정되는 링크(`#setup=`)를 제공하면 편하다(`references/apps-script.md`).
