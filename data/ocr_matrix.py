import json
import numpy as np
from PIL import Image
import pytesseract

STATIONS = [
    "Pelabuhan Klang","Jalan Kastam","Kg. Raja Uda","Teluk Gadong","Teluk Pulai","Klang",
    "Bukit Badak","Padang Jawa","Shah Alam","Batu Tiga","Subang Jaya","Setia Jaya","Seri Setia",
    "Kg. Dato Harun","Jalan Templer","Petaling","Pantai Dalam","Angkasapuri","KL Sentral",
    "Kuala Lumpur","Bank Negara","Putra","Sentul","Batu Kentonmen","Kg. Batu","Taman Wahyu",
    "Batu Caves","Tanjung Malim","Kuala Kubu Bharu","Rasa","Batang Kali","Serendah","Rawang",
    "Kuang","Sungai Buloh","Kepong Sentral","Kepong","Segambut","Mid Valley","Seputeh",
    "Salak Selatan","Bandar Tasik Selatan","Serdang","Kajang","UKM","Bangi","Batang Benar",
    "Nilai","Labu","Tiroi","Seremban","Senawang","Sungai Gadut","Rembau","Tampin",
    "Batang Melaka","Gemas",
]
N = len(STATIONS)  # 57

img = Image.open('hi/ktm_fare.pdf.png').convert('L')
A = np.array(img)
H, W = A.shape

# Synthesized grid from detected anchors
X0, X1 = 325.0, 3952.0           # left/right of data columns
Y0 = 696.0                        # top of first data row
ROWH = (2278.0 - Y0) / N          # row height
COLW = (X1 - X0) / N

def cell_text(r, c):
    x0 = int(round(X0 + c * COLW)); x1 = int(round(X0 + (c + 1) * COLW))
    y0 = int(round(Y0 + r * ROWH)); y1 = int(round(Y0 + (r + 1) * ROWH))
    pad = 4
    sub = A[y0 + pad:y1 - pad, x0 + pad:x1 - pad]
    if sub.size == 0:
        return ''
    im = Image.fromarray(sub).resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.LANCZOS)
    txt = pytesseract.image_to_string(
        im, config='--psm 7 -c tessedit_char_whitelist=0123456789.-'
    ).strip()
    return txt

def parse(txt):
    txt = txt.replace(' ', '')
    if txt in ('', '-', '--', '.'):
        return None
    # fix common OCR: stray dots
    t = txt.replace('..', '.')
    try:
        v = float(t)
        if 0 < v < 30:
            return round(v, 2)
    except ValueError:
        pass
    return 'ERR:' + txt

M = [[None] * N for _ in range(N)]
raw = [[''] * N for _ in range(N)]
for r in range(N):
    for c in range(N):
        if r == c:
            M[r][c] = 0.0
            continue
        t = cell_text(r, c)
        raw[r][c] = t
        M[r][c] = parse(t)

# Symmetry validation
mismatch = 0
errs = 0
for r in range(N):
    for c in range(r + 1, N):
        a, b = M[r][c], M[c][r]
        if isinstance(a, str) or isinstance(b, str):
            errs += 1
        elif a is None or b is None:
            if a != b:
                mismatch += 1
        elif abs(a - b) > 0.001:
            mismatch += 1

print('rowh', round(ROWH, 2), 'colw', round(COLW, 2))
print('symmetry mismatches:', mismatch, 'cells with ERR/parse issues:', errs)

# Show some sample known values for sanity
def val(i, j):
    return M[i - 1][j - 1]
print('Pel Klang->Klang (exp 2.10):', val(1, 6))
print('Klang->KL Sentral (exp 4.50):', val(6, 19))
print('KL Sentral->Batu Caves:', val(19, 27))
print('Kajang->Bangi (exp 2.30):', val(44, 46))
print('Mid Valley->Kajang (exp 3.40):', val(39, 44))

json.dump({'stations': STATIONS, 'matrix': M, 'raw': raw},
          open('ktm_matrix_raw.json', 'w'), ensure_ascii=False)
print('saved ktm_matrix_raw.json')
