#!/usr/bin/env bash
# 배포 전 검사 — 통과하지 못하면 배포하지 않는다.
#  1) Code.gs 문법  2) 정의되지 않은 이름·같은 이름 함수(덮어쓰기)  3) index.html 스크립트 문법
set -e
cd "$(dirname "$0")/.."
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
node -e "new Function(require('fs').readFileSync('Code.gs','utf8'))" && echo "✓ Code.gs 문법"
dup=$(grep -oE "^function [A-Za-z0-9_]+" Code.gs | sort | uniq -d)
[ -z "$dup" ] || { echo "✗ 같은 이름 함수(뒤의 것이 앞의 것을 덮음): $dup"; exit 1; }
echo "✓ 같은 이름 함수 없음"
cp Code.gs "$W/code.js"
cat > "$W/.eslintrc.json" <<'J'
{"root":true,"parserOptions":{"ecmaVersion":2022},"env":{"es2022":true},
 "globals":{"SpreadsheetApp":"readonly","PropertiesService":"readonly","UrlFetchApp":"readonly","Utilities":"readonly","LockService":"readonly","CacheService":"readonly","MailApp":"readonly","Session":"readonly","ContentService":"readonly","HtmlService":"readonly","Maps":"readonly","CalendarApp":"readonly","ScriptApp":"readonly","Logger":"readonly","console":"readonly","DriveApp":"readonly","GmailApp":"readonly"},
 "rules":{"no-undef":"error","no-redeclare":"error","no-func-assign":"error","no-dupe-keys":"error"}}
J
(cd "$W" && npx -y eslint@8.57.0 --no-eslintrc -c .eslintrc.json code.js) && echo "✓ 정의 안 된 이름·중복 선언 없음"
node -e "
const s=require('fs').readFileSync('index.html','utf8');let n=0;
for(const m of s.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){ if(m[1].length>200000) continue; new Function(m[1]); n++; }
console.log('✓ index.html 스크립트 문법 ('+n+'개)')"
# 서버에서 목록 한 줄마다 시트를 읽는 코드 경고 (map/forEach/filter 안의 rows_)
grep -nE "\.(map|forEach|filter)\(.*rows_\(" Code.gs && echo "⚠ 위 줄은 목록마다 시트를 읽을 수 있어요 — 확인하세요" || echo "✓ 목록 안 시트 읽기 없음"
