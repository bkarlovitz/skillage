from pathlib import Path
import struct
import zlib

size = 256
bg = (6, 18, 28, 255)
fg = (100, 244, 196, 255)
accent = (255, 214, 102, 255)

pixels = []
for y in range(size):
    row = bytearray()
    for x in range(size):
        # rounded-ish teal square mark with a simple S-like diagonal
        r = min(x, y, size - 1 - x, size - 1 - y)
        color = bg
        if r > 24:
            color = (11, 33, 48, 255)
        # stylized S bands
        if 62 <= y <= 88 and 58 <= x <= 198:
            color = fg
        if 84 <= y <= 122 and 58 <= x <= 86:
            color = fg
        if 116 <= y <= 142 and 58 <= x <= 198:
            color = fg
        if 138 <= y <= 176 and 170 <= x <= 198:
            color = fg
        if 170 <= y <= 196 and 58 <= x <= 198:
            color = fg
        if 34 <= x <= 48 and 34 <= y <= 222:
            color = accent
        row.extend(color)
    pixels.append(bytes(row))

raw = b''.join(b'\x00' + row for row in pixels)

def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')

out = Path('/home/karlo/uwchlan/skillage/src-tauri/icons/icon.png')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(png)
print(out)
