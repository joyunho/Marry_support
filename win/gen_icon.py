#!/usr/bin/env python3
"""app.ico 생성 — 분홍 바탕에 흰 하트 (마음장부). 외부 라이브러리 없이 BMP 엔트리로 만든다."""
import struct, sys

BG = (0x6E, 0x50, 0xE8, 255)   # BGRA — #E8506E (진분홍)
FG = (255, 255, 255, 255)      # 흰 하트


def heart(nx, ny):
    """하트 내부 판정. nx,ny는 -1.5~1.5 정규화 좌표 (y 위가 양수)."""
    x, y = nx, ny + 0.25
    v = (x * x + y * y - 1)
    return v * v * v - x * x * y * y * y < 0


def rounded(px, py, size):
    r = size * 0.22
    x0, y0, x1, y1 = 0, 0, size - 1, size - 1
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r or (x0 + r <= px <= x1 - r) or (y0 + r <= py <= y1 - r)


def draw(size):
    pix = []
    for py in range(size):
        row = []
        for px in range(size):
            if not rounded(px, py, size):
                row.append((0, 0, 0, 0))
                continue
            # 픽셀 → 하트 좌표 (2x2 슈퍼샘플링)
            hit = 0
            for sx in (0.25, 0.75):
                for sy in (0.25, 0.75):
                    nx = ((px + sx) / size - 0.5) * 3.0
                    ny = (0.5 - (py + sy) / size) * 3.0
                    if heart(nx * 1.15, ny * 1.15):
                        hit += 1
            if hit == 4: row.append(FG)
            elif hit > 0:
                a = hit / 4.0
                row.append(tuple(int(FG[i] * a + BG[i] * (1 - a)) for i in range(3)) + (255,))
            else: row.append(BG)
        pix.append(row)
    return pix


def bmp_entry(size):
    pix = draw(size)
    # BITMAPINFOHEADER + 상향(bottom-up) BGRA + AND 마스크
    header = struct.pack('<IiiHHIIiiII', 40, size, size * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    body = b''
    for py in range(size - 1, -1, -1):
        for px in range(size):
            body += bytes(pix[py][px])
    mask_row = ((size + 31) // 32) * 4
    body += b'\x00' * (mask_row * size)
    return header + body


sizes = [16, 24, 32, 48, 64, 256]
entries = [bmp_entry(s) for s in sizes]
out = struct.pack('<HHH', 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
for s, e in zip(sizes, entries):
    dim = 0 if s == 256 else s
    out += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(e), offset)
    offset += len(e)
for e in entries:
    out += e
open(sys.argv[1] if len(sys.argv) > 1 else 'app.ico', 'wb').write(out)
print(f'app.ico: {len(out)} bytes, sizes {sizes}')
