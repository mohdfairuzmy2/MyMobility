import numpy as np
from PIL import Image

img = Image.open('hi/ktm_fare.pdf.png').convert('RGB')
A = np.array(img)
X0, Y0 = 325.0, 696.0
COLW = (3952.0 - 325.0) / 57.0
ROWH = (2278.0 - 696.0) / 57.0

# (r,c) 0-indexed conflict cells; we render the FULL row strip around the column for context
conf = [
    (6, 12, 'BukitBadak x SeriSetia'),
    (13, 28, 'KgDatoHarun x KualaKubu'),
    (16, 35, 'PantaiDalam x KepongSentral'),
    (18, 34, 'KLSentral x SungaiBuloh'),
    (35, 40, 'KepongSentral x SalakSelatan'),
]

tiles = []
for (r, c, name) in conf:
    for (rr, cc, tag) in [(r, c, 'A'), (c, r, 'B')]:
        x0 = int(X0 + cc * COLW) - 30
        x1 = int(X0 + (cc + 1) * COLW) + 30
        y0 = int(Y0 + rr * ROWH) - 6
        y1 = int(Y0 + (rr + 1) * ROWH) + 6
        sub = A[y0:y1, x0:x1]
        im = Image.fromarray(sub)
        im = im.resize((im.width * 4, im.height * 4), Image.LANCZOS)
        tiles.append((f'{name} [{tag}] r{rr+1}c{cc+1}', im))

maxw = max(im.width for _, im in tiles)
gap = 30
toth = sum(im.height + gap for _, im in tiles)
canvas = Image.new('RGB', (maxw, toth), (255, 255, 255))
y = 0
for label, im in tiles:
    canvas.paste(im, (0, y))
    y += im.height + gap
canvas.save('conflicts.png')
print('saved conflicts.png', canvas.size)
print('order:')
for label, _ in tiles:
    print(' ', label)
