// {{NAME}} 위젯 — Scriptable 앱에 이 글 전체를 붙여 넣어요. (처음 한 번만)
// ▼ 필요하면 여기만 고쳐요
const WHO = "";     // 이 폰을 쓰는 사람 (앱에 사람 구분이 없으면 그대로)
const PIN = "";     // 앱 비밀번호 (없으면 그대로)

// ---- 아래는 고치지 않아요. 위젯 본체를 인터넷에서 받아 항상 최신으로 유지해요. ----
const fm = module.filename.includes("Documents/iCloud") || module.filename.includes("Mobile Documents") ? FileManager.iCloud() : FileManager.local();
const dir = module.filename.slice(0, module.filename.lastIndexOf("/"));
const core = fm.joinPath(dir, "{{SLUG}}-widget-core.js");
try {
  const r = new Request("{{APP_URL}}widget-core.js?t=" + Date.now());
  r.timeoutInterval = 15;
  const code = await r.loadString();
  if (code.includes("{{MARK}}")) fm.writeString(core, code);   // 표식이 있을 때만 저장 (오류 페이지를 저장하지 않게)
} catch (e) {}
if (fm.isFileStoredIniCloud(core) && !fm.isFileDownloaded(core)) await fm.downloadFileFromiCloud(core);
await importModule("{{SLUG}}-widget-core")({ who: WHO, pin: PIN });
