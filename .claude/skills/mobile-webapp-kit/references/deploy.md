# 서버(Apps Script) 자동 배포 — 모든 앱 공통

사용자에게 "Code.gs 붙여 넣고 새 버전 배포해 주세요"라고 부탁하지 않는다. 서버 코드는 저장소에 두고, main(기본 브랜치)에 올리면 GitHub Actions 가 배포한다.
앱 화면(GitHub Pages)은 원래 자동이다.

## 새 앱 / 아직 연결 안 된 앱에 넣기

1. 서버 코드는 저장소 안에 둔다. 기본 위치 `Code.gs` (기존 앱은 `server/Code.gs`, `apps-script/Code.gs` 등 그대로).
2. `assets/deploy/deploy-server.yml` 을 저장소 `.github/workflows/deploy-server.yml` 로 복사하고 env 를 채운다.
   - `CODE`: 서버 코드 경로
   - `DEPLOY_ID`: 앱 코드에 `script.google.com/macros/s/○○○/exec` 가 있으면 그 ○○○. 사용자가 앱 설정에서 주소를 넣는 앱이면 비워 둔다.
   - `SCRIPT_ID`: 알면 적는다. 모르면 비워 두면 첫 실행이 찾아서 `::notice::` 로 알려 준다 → 확인 후 적어서 다시 올린다.
   - 기본 브랜치가 main 이 아니면 `branches:` 를 그 브랜치로.
3. 사용자에게 그 저장소의 비밀값 링크를 준다: `https://github.com/계정/저장소/settings/secrets/actions/new`, Name `CLASPRC_JSON`.
   내용은 이미 만든 `.clasprc.json` 과 같다(같은 구글 계정이면). 개인 GitHub 계정은 비밀값을 저장소끼리 나눠 쓸 수 없어 저장소마다 넣어야 한다.
   비밀값이 없으면 워크플로는 실패하지 않고 "건너뛰었어요" 안내만 남긴다.
4. 새 앱이면 Apps Script 프로젝트는 사용자가 한 번 만들고(시트 → 확장 프로그램 → Apps Script, 또는 script.google.com), 첫 "새 배포 → 웹 앱"도 한 번 해야 배포 ID 가 생긴다. 그다음부터는 자동.

## 워크플로가 하는 일

- 저장소에 서버 코드가 없으면: Apps Script 에서 가져와 `CODE` 로 커밋만 한다(서버는 건드리지 않음). 사용자가 편집기에서만 고쳐 온 앱을 처음 연결할 때.
- `SCRIPT_ID` 를 찾을 때는 `DEPLOY_ID` 를 가진 프로젝트, 없으면 함수 이름이 가장 많이 겹치는 프로젝트(절반 이상). 프로젝트 이름은 로그에 쓰지 않는다(공개 저장소).
  코드 비교로 찾았으면 그 실행에서는 덮어쓰지 않는다. 사람이 확인하고 `SCRIPT_ID` 를 적어야 배포한다 — 다른 앱 서버를 덮어쓰는 사고 방지.
- 배포: 문법 검사(+ 저장소에 `tools/check.sh` 가 있으면 실행) → `clasp pull`(설정 파일 appsscript.json 은 서버 것 그대로) → 코드 파일 덮어쓰기 → `clasp push -f` → `clasp deploy -i DEPLOY_ID`(같은 배포에 새 버전, 앱 주소 그대로).
- clasp 2.4.2 는 실패해도 0으로 끝날 때가 있어 출력("Pushed", "배포ID @번호")으로 확인한다. 결과는 `::notice::배포 완료 @번호`.

## 결과 확인 (Claude)

로그인 없이 읽을 수 있다:
```bash
R=friese8807/저장소
ID=$(curl -s "https://api.github.com/repos/$R/actions/runs?per_page=5" | python3 -c "import json,sys;print([r['id'] for r in json.load(sys.stdin)['workflow_runs'] if r['name']=='서버 배포'][0])")
J=$(curl -s https://api.github.com/repos/$R/actions/runs/$ID/jobs | python3 -c "import json,sys;print(json.load(sys.stdin)['jobs'][0]['id'])")
curl -s https://api.github.com/repos/$R/check-runs/$J/annotations | python3 -c "import json,sys;[print(a['annotation_level'],a['message']) for a in json.load(sys.stdin)]"
```
배포 후 사용자에게 버전 번호(@N)와 함께 알린다. 실패면 메시지를 쉬운 말로 옮긴다.
- `invalid_grant`, `unauthorized` 류 → 로그인 만료. 사용자가 `npx @google/clasp@2.4.2 login` 을 다시 하고 각 저장소 `CLASPRC_JSON` 을 Update.
- "User has not enabled the Apps Script API" → https://script.google.com/home/usersettings 에서 켜기.

## 처음 한 번 (사용자, 계정당)

1. https://script.google.com/home/usersettings → Google Apps Script API 사용.
2. PC(Windows): nodejs.org 에서 Node 설치 → 명령 프롬프트에서 `npx @google/clasp@2.4.2 login` → 브라우저에서 허용 → `notepad %USERPROFILE%\.clasprc.json` 내용 복사.
3. 저장소마다 비밀값 `CLASPRC_JSON` 에 붙여 넣기. **채팅으로 받지 않는다.** 다 넣은 뒤 PC의 파일은 지워도 된다(`del %USERPROFILE%\.clasprc.json`).
   - GitHub 404 가 나오면 로그인 안 된 상태다.

## 연결 현황 (2026-11)

| 앱 | 저장소 | CODE | 비고 |
|---|---|---|---|
| 올포오션 | badapan | Code.gs | 배포 중 (자체 워크플로, ID 고정) |
| 수급 레이더 | supply-radar | Code.gs | |
| 명함첩 | card-book | server/Code.gs | |
| 경조사 기록장 | gyeongjosa | Code.gs | |
| 개찰알림 | g2b | apps-script/Code.gs | 기본 브랜치가 claude/… |
| 힐스초등수학 | hills-math | Code.gs | 서버 코드 가져오기부터 |
| 윤호채원이네 | ycn-app | server/Code.gs | 가져오기부터. server.html(복사용 안내)은 이후 오래된 내용이 됨 |
| 발자취 | footprint | Code.gs | SCRIPT_ID 고정(사용자 제공), 가져오기부터 |
