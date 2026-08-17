// 마음장부 카운터 3.0 — Windows 실행 파일 런처
//
// index.html(빌드 시 app_html.h로 임베드)을 %LOCALAPPDATA%\MaeumLedgerCounter\app.html 로
// 풀어놓고 Windows 내장 WebView2 창으로 띄운다. WebView2 런타임이 없는 PC에서는
// 기본 브라우저로 같은 파일을 여는 폴백으로 동작한다.
//
// 장부 데이터는 앱이 아니라 WebView2 프로필(localStorage)에 저장되며, 프로필 폴더를
// %LOCALAPPDATA%\MaeumLedgerCounter\WebView2Data 로 고정해 실행 위치와 무관하게 유지된다.

#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>

#include <string>

#include "webview/webview.h"
#include "app_html.h"

namespace {

const wchar_t *kAppTitleW = L"마음장부 카운터";

std::string narrowUtf8(const std::wstring &w){
  if (w.empty()) return std::string();
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr);
  return s;
}

// file:/// URL — 경로에 한글 사용자명·공백이 있어도 안전하도록 퍼센트 인코딩
std::string fileUrlFromPath(const std::wstring &path){
  std::string utf8 = narrowUtf8(path);
  std::string url = "file:///";
  static const char hex[] = "0123456789ABCDEF";
  for (unsigned char c : utf8){
    if (c == '\\') { url += '/'; continue; }
    bool safe = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
                c == '/' || c == ':' || c == '-' || c == '_' || c == '.' || c == '~';
    if (safe) url += (char)c;
    else { url += '%'; url += hex[c >> 4]; url += hex[c & 15]; }
  }
  return url;
}

bool writeFileAtomic(const std::wstring &path, const unsigned char *data, size_t len){
  std::wstring tmp = path + L".tmp";
  HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                         FILE_ATTRIBUTE_NORMAL, nullptr);
  if (h == INVALID_HANDLE_VALUE) return false;
  DWORD written = 0;
  BOOL ok = WriteFile(h, data, (DWORD)len, &written, nullptr);
  CloseHandle(h);
  if (!ok || written != len){ DeleteFileW(tmp.c_str()); return false; }
  if (!MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING)){
    DeleteFileW(tmp.c_str());
    return false;
  }
  return true;
}

bool fileExists(const std::wstring &path){
  DWORD a = GetFileAttributesW(path.c_str());
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

} // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int){
  // 같은 장부를 두 창에서 열면 기록이 덮어써질 수 있어 단일 실행만 허용
  // (핸들이 NULL이고 ACCESS_DENIED면 다른 권한의 인스턴스가 이미 실행 중인 경우)
  HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\MaeumLedgerCounter3.SingleInstance");
  DWORD mutexErr = GetLastError();
  if ((mutex && mutexErr == ERROR_ALREADY_EXISTS) || (!mutex && mutexErr == ERROR_ACCESS_DENIED)){
    MessageBoxW(nullptr,
                L"마음장부 카운터가 이미 실행 중입니다.",
                kAppTitleW, MB_OK | MB_ICONINFORMATION);
    return 0;
  }

  wchar_t base[MAX_PATH];
  if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, SHGFP_TYPE_CURRENT, base))){
    MessageBoxW(nullptr,
                L"장부 데이터 폴더를 준비하지 못했습니다. Windows 사용자 폴더 권한을 확인해 주세요.",
                kAppTitleW, MB_OK | MB_ICONERROR);
    return 1;
  }
  std::wstring dir = std::wstring(base) + L"\\MaeumLedgerCounter";
  CreateDirectoryW(dir.c_str(), nullptr);
  std::wstring dataDir = dir + L"\\WebView2Data";
  CreateDirectoryW(dataDir.c_str(), nullptr);
  // WebView2 프로필(=localStorage 저장 위치)을 고정 — exe를 어디서 실행해도 같은 장부
  SetEnvironmentVariableW(L"WEBVIEW2_USER_DATA_FOLDER", dataDir.c_str());

  std::wstring htmlPath = dir + L"\\app.html";
  if (!writeFileAtomic(htmlPath, APP_HTML, APP_HTML_LEN) && !fileExists(htmlPath)){
    MessageBoxW(nullptr,
                L"앱 파일을 쓸 수 없습니다. 디스크 공간과 권한을 확인해 주세요.",
                kAppTitleW, MB_OK | MB_ICONERROR);
    return 1;
  }

  const std::string url = fileUrlFromPath(htmlPath);
  try {
    webview::webview w(false, nullptr);
    w.set_title("\xEB\xA7\x88\xEC\x9D\x8C\xEC\x9E\xA5\xEB\xB6\x80 \xEC\xB9\xB4\xEC\x9A\xB4\xED\x84\xB0 3.0"); // 마음장부 카운터 3.0 (UTF-8)
    w.set_size(1180, 840, WEBVIEW_HINT_NONE);
    w.set_size(760, 560, WEBVIEW_HINT_MIN);
    w.navigate(url);
    w.run();
    return 0;
  } catch (...) {
    // WebView2 런타임이 없거나 손상된 PC — 기본 브라우저로 폴백 (기능 동일, 데이터는 브라우저에 저장)
    int r = MessageBoxW(nullptr,
        L"프로그램 창을 여는 데 실패했습니다.\n"
        L"WebView2 구성 요소가 없거나 손상되었을 수 있습니다.\n\n"
        L"기본 브라우저로 대신 열까요? (기능은 동일하게 동작합니다)",
        kAppTitleW, MB_YESNO | MB_ICONQUESTION);
    if (r == IDYES){
      ShellExecuteW(nullptr, L"open", htmlPath.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    }
    return 0;
  }
}
