"""Closed copper round the NFC loop: a shorted turn that takes the loop's field.

The copper of the board is drawn on a grid of CELL mm, all layers on top of each other (a net's layers are
joined by its vias anyway), and the area round the loop's centre that no copper covers is flooded from the
centre. If that flood cannot reach the edge of the copper's bounding box, the copper closes round the loop.

Checked for every net on its own, and for the supply nets together: their decoupling capacitors join them at
13.56 MHz (100 nF is 0.1 ohm there), so a ground pour open on one side and a 5 V rail open on another would
still make one closed turn. Signal nets are not added to that union, but a signal net that crosses the gap in
the copper round the loop (geometry.NFC_GAP) does close a turn with it: through the driver at one end (low
impedance to its supply) and the input at the other (its capacitance and clamp diodes to its ground). The
carrier induced in that turn reaches the input. crossings() finds such nets and passes them only behind a
low-pass at the input: a series resistor between two nets and a capacitor from the input's net to ground.
"""
import collections

import numpy as np

from board import OX, OY, geometry, short

CELL = 0.1
LOOP_NETS = ('NFC_ANT1', 'NFC_ANT2')
SUPPLY = ('GND', '+5V', '+5V_LED', '+3V3')
F_CARRIER = 13.56e6
# Signal nets allowed across the gap, with their filter: (output side, input side) -> (series R, C to ground)
FILTERED = {('LED_D6', 'LED_D6_F'): ('R709', 'C727')}
# what the filter must do: the carrier at the input at most this share of what is induced, the data edges delayed
# by at most this time constant (SK6812: T0H 0.3 us, T1H 0.6 us, each +-0.15 us)
CARRIER_LEFT, TAU_MAX = 0.2, 0.12e-6


def _raster(board, nets, box):
    x0, y0, x1, y1 = box
    nx, ny = int((x1 - x0) / CELL) + 1, int((y1 - y0) / CELL) + 1
    cu = np.zeros((ny, nx), dtype=bool)
    xs = x0 + (np.arange(nx) + 0.5) * CELL
    ys = y0 + (np.arange(ny) + 0.5) * CELL

    def window(xa, ya, xb, yb, r):
        i0, i1 = max(int((min(xa, xb) - r - x0) / CELL), 0), min(int((max(xa, xb) + r - x0) / CELL) + 2, nx)
        j0, j1 = max(int((min(ya, yb) - r - y0) / CELL), 0), min(int((max(ya, yb) + r - y0) / CELL) + 2, ny)
        return i0, i1, j0, j1

    def capsule(xa, ya, xb, yb, r):
        i0, i1, j0, j1 = window(xa, ya, xb, yb, r)
        if i0 >= i1 or j0 >= j1:
            return
        X, Y = np.meshgrid(xs[i0:i1], ys[j0:j1])
        dx, dy = xb - xa, yb - ya
        L2 = dx * dx + dy * dy
        t = np.zeros_like(X) if L2 == 0 else np.clip(((X - xa) * dx + (Y - ya) * dy) / L2, 0, 1)
        cu[j0:j1, i0:i1] |= np.hypot(X - xa - t * dx, Y - ya - t * dy) <= r

    def polygon(target, poly, value):
        """Scan-line fill (even-odd) of a polygon into target: value True draws, False cuts a hole."""
        p = np.asarray(poly)
        ax, ay = p[:, 0], p[:, 1]
        bx, by = np.roll(ax, -1), np.roll(ay, -1)
        j0, j1 = max(int((ay.min() - y0) / CELL), 0), min(int((ay.max() - y0) / CELL) + 2, ny)
        for j in range(j0, j1):
            y = ys[j]
            m = (ay > y) != (by > y)
            if not m.any():
                continue
            xc = np.sort(ax[m] + (y - ay[m]) * (bx[m] - ax[m]) / (by[m] - ay[m]))
            for a, b in zip(xc[0::2], xc[1::2]):
                i0, i1 = max(int(np.ceil((a - x0) / CELL - 0.5)), 0), min(int(np.floor((b - x0) / CELL - 0.5)) + 1, nx)
                if i0 < i1:
                    target[j, i0:i1] = value

    for t in board.tracks:
        if short(t['net']) in nets:
            capsule(t['x1'], t['y1'], t['x2'], t['y2'], t['w'] / 2)
    for v in board.vias:
        if short(v['net']) in nets:
            capsule(v['x'], v['y'], v['x'], v['y'], v['dia'] / 2)
    for p in board.pads:
        if short(p['net']) in nets:
            sx, sy = (p['sx'], p['sy']) if round(p['rot']) % 180 == 0 else (p['sy'], p['sx'])
            if round(p['rot']) % 90:
                sx = sy = max(sx, sy)
            i0, i1, j0, j1 = window(p['x'] - sx / 2, p['y'] - sy / 2, p['x'] + sx / 2, p['y'] + sy / 2, 0)
            sel_x = np.abs(xs[i0:i1] - p['x']) <= sx / 2
            sel_y = np.abs(ys[j0:j1] - p['y']) <= sy / 2
            cu[j0:j1, i0:i1] |= sel_y[:, None] & sel_x[None, :]
    for z in board.zones:
        if short(z['net']) in nets:
            for p in z['polys']:
                fill = np.zeros_like(cu)
                polygon(fill, p['outline'], True)
                for hole in p['holes']:
                    if len(hole) >= 3:
                        polygon(fill, hole, False)
                cu |= fill
    return cu


def _box(board, nets):
    xs, ys = [], []
    for t in board.tracks:
        if short(t['net']) in nets:
            xs += [t['x1'], t['x2']]; ys += [t['y1'], t['y2']]
    for z in board.zones:
        if short(z['net']) in nets:
            for p in z['polys']:
                o = np.asarray(p['outline'])
                xs += [o[:, 0].min(), o[:, 0].max()]; ys += [o[:, 1].min(), o[:, 1].max()]
    for p in board.pads + board.vias:
        if short(p['net']) in nets:
            xs.append(p['x']); ys.append(p['y'])
    if not xs:
        return None
    return min(xs) - 1, min(ys) - 1, max(xs) + 1, max(ys) + 1


def encloses(board, nets):
    """True when the copper of these nets (all layers together) closes round the loop's centre."""
    nets = set(nets)
    box = _box(board, nets)
    ax, ay = geometry.ANT_C[0] + OX, geometry.ANT_C[1] + OY
    hw, hh = geometry.ANT_W / 2, geometry.ANT_H / 2
    if box is None or not (box[0] < ax - hw and box[1] < ay - hh and box[2] > ax + hw and box[3] > ay + hh):
        return False
    cu = _raster(board, nets, box)
    ny, nx = cu.shape
    seen = np.zeros_like(cu)
    start = (int((ay - box[1]) / CELL), int((ax - box[0]) / CELL))
    if cu[start]:
        return False
    queue = collections.deque([start])
    seen[start] = True
    while queue:
        j, i = queue.popleft()
        if j in (0, ny - 1) or i in (0, nx - 1):
            return False
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (j + dj, i + di)
            if not seen[q] and not cu[q]:
                seen[q] = True
                queue.append(q)
    return True


def check(board):
    """[(what, closes)] for the supply nets together and for every other net that spans the loop."""
    nets = {short(t['net']) for t in board.tracks} | {short(z['net']) for z in board.zones} | \
        {short(v['net']) for v in board.vias}
    nets -= set(LOOP_NETS) | {''}
    out = [('supply nets together (%s)' % ', '.join(SUPPLY), encloses(board, SUPPLY))]
    for net in sorted(nets):
        box = _box(board, {net})
        ax, ay = geometry.ANT_C[0] + OX, geometry.ANT_C[1] + OY
        if box and box[0] < ax - geometry.ANT_W / 2 and box[2] > ax + geometry.ANT_W / 2 and \
                box[1] < ay - geometry.ANT_H / 2 and box[3] > ay + geometry.ANT_H / 2:
            out.append((net, encloses(board, {net})))
    return out


def _value(text):
    """'2.2k' -> 2200.0, '39p' -> 39e-12."""
    scale = {'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'k': 1e3, 'M': 1e6}
    text = text.split('/')[0].rstrip('R')
    return float(text[:-1]) * scale[text[-1]] if text[-1] in scale else float(text)


def _in_gap(x, y):
    gx1, gy1, gx2, gy2 = geometry.NFC_GAP
    return gx1 + OX <= x <= gx2 + OX and gy1 + OY <= y <= gy2 + OY


def _bridged(board):
    """A copy of the board with each part that has a pad in the gap drawn as copper from pad to pad: a
    resistor there conducts, and the turn closes through it."""
    import copy
    out = copy.copy(board)
    out.tracks = list(board.tracks)
    for ref in {p['ref'] for p in board.pads if _in_gap(p['x'], p['y'])}:
        pads = [p for p in board.pads if p['ref'] == ref]
        for a, c in zip(pads, pads[1:]):
            out.tracks.append({'net': a['net'], 'layer': 'F.Cu', 'w': 0.3, 'x1': a['x'], 'y1': a['y'],
                               'x2': c['x'], 'y2': c['y']})
    return out


def gap_nets(board):
    """Signal nets with copper in the gap of the copper round the loop (geometry.NFC_GAP), on any layer."""
    gx1, gy1, gx2, gy2 = geometry.NFC_GAP
    x1, y1, x2, y2 = gx1 + OX, gy1 + OY, gx2 + OX, gy2 + OY
    out = set()
    for t in board.tracks:
        for k in range(51):
            x, y = t['x1'] + k / 50 * (t['x2'] - t['x1']), t['y1'] + k / 50 * (t['y2'] - t['y1'])
            if x1 <= x <= x2 and y1 <= y <= y2:
                out.add(short(t['net']))
                break
    for p in board.pads + board.vias:
        if x1 <= p['x'] <= x2 and y1 <= p['y'] <= y2:
            out.add(short(p['net']))
    return out - set(LOOP_NETS) - set(SUPPLY) - {''}


def crossings(board):
    """[(passes, what)] for the signal copper across the gap: none, or only nets behind a carrier filter."""
    nets = gap_nets(board)
    if not nets or not encloses(_bridged(board), set(SUPPLY) | nets):
        return [(True, 'no signal net closes a turn round the loop with the supply copper')]
    out = []
    for (a, b), (r, c) in FILTERED.items():
        if not {a, b} & nets:
            continue
        pr, pc = board.parts.get(r), board.parts.get(c)

        def on_board(ref):
            return {short(p['net']) for p in board.pads if p['ref'] == ref}
        wired = pr is not None and pc is not None and on_board(r) == {a, b} and on_board(c) == {b, 'GND'}
        if not wired:
            out.append((False, '%s / %s across the gap without the filter %s / %s' % (a, b, r, c)))
            continue
        rv, cv = _value(pr.value), _value(pc.value)
        w = 2 * 3.141592653589793 * F_CARRIER * rv * cv
        left = 1 / (1 + w * w) ** 0.5
        out.append((left <= CARRIER_LEFT and rv * cv <= TAU_MAX,
                    '%s / %s cross the gap through %s %s, %s %s to ground at the input: %.2f of the carrier left, '
                    'edges delayed %.0f ns' % (a, b, r, pr.value, c, pc.value, left, rv * cv * 1e9)))
    rest = nets - {n for pair in FILTERED for n in pair}
    if rest:
        out.append((False, 'signal nets across the gap without a carrier filter: ' + ', '.join(sorted(rest))))
    return out
