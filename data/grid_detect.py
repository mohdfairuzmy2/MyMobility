import sys
import numpy as np
from PIL import Image

img = Image.open('hi/ktm_fare.pdf.png').convert('L')
a = np.array(img)
H, W = a.shape
print('image', W, 'x', H)

# Dark mask (gridlines + text are dark on light cells)
dark = a < 128

# Detect vertical gridlines: columns where many pixels are dark across the data band.
# First find the data band vertically (rows region). We'll scan a vertical strip in the
# middle of the table for horizontal lines later. For columns, use a y-band known to be data.
# Use rows 700..2500 as data band guess.
yb0, yb1 = 700, 2500
col_dark = dark[yb0:yb1, :].sum(axis=0)
# gridlines are tall thin dark runs -> high col_dark
thr_c = (yb1 - yb0) * 0.6
vlines = [x for x in range(W) if col_dark[x] > thr_c]
# group consecutive
def group(idxs):
    groups = []
    if not idxs:
        return groups
    s = idxs[0]; p = idxs[0]
    for x in idxs[1:]:
        if x - p <= 3:
            p = x
        else:
            groups.append((s + p) // 2); s = x; p = x
    groups.append((s + p) // 2)
    return groups
vg = group(vlines)
print('num vertical gridlines:', len(vg))
print('first 10 vlines:', vg[:10])
print('last 5 vlines:', vg[-5:])

# Horizontal gridlines: use an x-band in data area
xb0, xb1 = 300, 3900
row_dark = dark[:, xb0:xb1].sum(axis=1)
thr_r = (xb1 - xb0) * 0.6
hlines = [y for y in range(H) if row_dark[y] > thr_r]
hg = group(hlines)
print('num horizontal gridlines:', len(hg))
print('first 10 hlines:', hg[:10])
print('last 5 hlines:', hg[-5:])
