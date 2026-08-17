#!/usr/bin/env bash
# 마음장부 카운터 3.0 Windows exe 크로스 빌드 (Linux에서 mingw-w64 사용)
#   필요: g++-mingw-w64-x86-64, python3, curl, unzip
#   webview 라이브러리는 win/webview/ 에 벤더링돼 있음(프로필 폴더 고정 패치 포함 — win32_edge.hh 참고).
#   WebView2 SDK 헤더는 라이선스상 저장소에 넣지 않고 NuGet에서 내려받는다.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f vendor/webview2sdk/build/native/include/WebView2.h ]; then
  mkdir -p vendor/webview2sdk
  curl -fsSL -o vendor/webview2sdk.zip "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.1150.38"
  unzip -oq vendor/webview2sdk.zip -d vendor/webview2sdk
  rm vendor/webview2sdk.zip
fi

python3 gen_html_header.py ../index.html app_html.h
python3 gen_icon.py app.ico
x86_64-w64-mingw32-windres --codepage=65001 -O coff app.rc app.res

OUT="마음장부_카운터_v3.0.0.exe"
x86_64-w64-mingw32-g++ main.cc app.res \
  -std=c++14 -Os -static -mwindows \
  -Iwebview/core/include \
  -Iwebview/compatibility/mingw/include \
  -Ivendor/webview2sdk/build/native/include \
  -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion \
  -o "$OUT"
x86_64-w64-mingw32-strip "$OUT"
mkdir -p ../dist
mv "$OUT" ../dist/
ls -la "../dist/$OUT"
