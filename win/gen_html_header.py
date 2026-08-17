#!/usr/bin/env python3
"""index.html을 C 헤더(app_html.h)로 임베드한다. 사용: gen_html_header.py <입력 html> <출력 헤더>"""
import sys

src, dst = sys.argv[1], sys.argv[2]
data = open(src, 'rb').read()
with open(dst, 'w') as f:
    f.write('// 자동 생성 파일 — gen_html_header.py가 index.html에서 만든다. 직접 수정 금지.\n')
    f.write('#pragma once\n')
    f.write(f'static const unsigned int APP_HTML_LEN = {len(data)}u;\n')
    f.write('static const unsigned char APP_HTML[] = {\n')
    for i in range(0, len(data), 16):
        f.write('  ' + ','.join(str(b) for b in data[i:i+16]) + ',\n')
    f.write('};\n')
print(f'{dst}: {len(data)} bytes embedded')
