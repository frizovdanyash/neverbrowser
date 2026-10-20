"""Prepare the BoyKisser mascot: transparent background + app icon."""
from collections import deque
from PIL import Image

SRC = 'assets/mascot-original.jpg'
im = Image.open(SRC).convert('RGB')
w, h = im.size
px = im.load()

# Flood-fill the near-white outer background from the borders only, so the
# white fur / apron inside the black outline stays intact.
seen = [[False] * w for _ in range(h)]
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))

out = im.convert('RGBA')
op = out.load()
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
        continue
    seen[y][x] = True
    r, g, b = px[x, y]
    if min(r, g, b) < 232:
        continue
    # feathered alpha on the anti-aliased rim
    edge = min(r, g, b)
    alpha = 0 if edge >= 250 else max(0, min(255, int((250 - edge) * 8)))
    op[x, y] = (r, g, b, alpha)
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

bbox = out.getbbox()
out = out.crop(bbox)
out.save('assets/mascot.png')

icon = out.copy()
icon.thumbnail((440, 440), Image.LANCZOS)
canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
canvas.alpha_composite(icon, ((512 - icon.width) // 2, (512 - icon.height) // 2))
canvas.save('assets/icon.png')
print('mascot', out.size, 'icon', canvas.size)
