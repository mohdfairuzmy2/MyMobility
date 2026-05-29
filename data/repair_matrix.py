import json
import re
import math

d = json.load(open('ktm_matrix_raw.json'))
STATIONS = d['stations']
raw = d['raw']
N = len(STATIONS)

def insert(digits):
    if not digits.isdigit():
        return None
    n = len(digits)
    if n == 1:
        v = float(digits)
    elif n == 2:
        v = int(digits) / 10.0
    elif n in (3, 4, 5):
        v = int(digits) / 100.0
    else:
        return None
    return v if 0 < v < 30 else None

def reparse(txt):
    if txt is None:
        return None, False
    t = txt.replace(' ', '').replace(',', '.')
    if t in ('', '-', '--', '.'):
        return None, False
    t = re.sub(r'[^0-9.]', '', t)
    if t == '':
        return None, False
    complete = ('.' in t and len(t.replace('.', '')) >= 2)
    if '.' in t:
        try:
            v = float(t)
            if 0 < v < 30:
                return v, complete
        except ValueError:
            pass
        return insert(t.replace('.', '')), complete
    return insert(t), False

def snap(v):
    if v is None:
        return None
    # all base fares are multiples of RM0.10; OCR errors raise the hundredth digit.
    return round(math.floor(v * 10 + 0.05) / 10.0, 2)

P = [[None] * N for _ in range(N)]
C = [[False] * N for _ in range(N)]
for r in range(N):
    for c in range(N):
        if r == c:
            P[r][c] = 0.0
        else:
            v, comp = reparse(raw[r][c])
            P[r][c] = snap(v)
            C[r][c] = comp

final = [[None] * N for _ in range(N)]
conflicts = []
for r in range(N):
    for c in range(N):
        if r == c:
            final[r][c] = 0.0
            continue
        a, b = P[r][c], P[c][r]
        if a is None and b is None:
            final[r][c] = None
        elif a is None:
            final[r][c] = b
        elif b is None:
            final[r][c] = a
        elif abs(a - b) < 0.001:
            final[r][c] = a
        else:
            # prefer the complete raw reading
            ca, cb = C[r][c], C[c][r]
            if ca and not cb:
                final[r][c] = a
            elif cb and not ca:
                final[r][c] = b
            else:
                final[r][c] = None
                if r < c:
                    conflicts.append((r, c, a, b))

# Manual fixes for the 5 genuine OCR 9-vs-5 conflicts (verified from hi-res crops)
MANUAL = {(6, 12): 2.90, (13, 28): 7.90, (16, 35): 2.90, (18, 34): 2.90, (35, 40): 2.90}
for (r, c), v in MANUAL.items():
    final[r][c] = v
    final[c][r] = v

missing = sorted(set((min(r, c), max(r, c)) for r in range(N) for c in range(N)
                     if final[r][c] is None and r != c))

print('genuine conflicts:', len(conflicts))
for r, c, a, b in conflicts:
    print(f'  {r+1:2d}x{c+1:2d} {STATIONS[r]:>22} <-> {STATIONS[c]:<22} raw=({raw[r][c]!r},{raw[c][r]!r}) {a} vs {b}')
print('missing pairs:', len(missing))
for r, c in missing:
    print(f'  MISS {r+1:2d}x{c+1:2d} {STATIONS[r]:>22} <-> {STATIONS[c]:<22} raw=({raw[r][c]!r},{raw[c][r]!r})')

json.dump({'stations': STATIONS, 'matrix': final}, open('ktm_matrix_final.json', 'w'), ensure_ascii=False)
print('saved ktm_matrix_final.json')
