"""Inductance and resistance of the NFC loop at 13.56 MHz, from the copper of the routed board.

The loop is taken from the antenna footprint. The copper pours around it (ground on five layers, 3.3 V
on one) are meshed as one sheet, in which the loop induces eddy currents. A metal wall behind the reader
and metal across the gap in that copper can be added."""
import numpy as np

from board import OX, OY, geometry, inside
from peec import Mesh

F0 = 13.56e6
MM = 1e-3
TRACK_W, TRACK_T = 0.5 * MM, 35e-6
# Capacitance across the loop's terminals, estimated: 1.0 pF between the turns (40 pF/m between two
# neighbouring tracks, three gaps of 0.13 m, each with a quarter of the voltage), 0.4 pF from the outer
# turn to the copper around it, 1 pF of pads and feed tracks.
C_LOOP = 2.4e-12
WALL_BEHIND = 18.0          # mm from the loop to a metal wall: board 1.6, dock plate 13.9 + 2.5 mm behind it


def centreline(board):
    """Centre line of the spiral: the footprint's polygon runs out along one edge of the track and back
    along the other."""
    poly = board.footprint('ANT501')['copper'][0]['poly'][0]
    n = len(poly) // 2
    return [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in zip(poly[:n], poly[n:][::-1])]


def copper_mask(board, x0, y0, nx, ny, h, sub=3, layer=None, share=False):
    """Cells of size h mm that a filled zone covers (majority of sub x sub sample points): on any layer, or
    on one. With share, the covered part of every cell instead of yes or no."""
    off = (np.arange(sub) + 0.5) / sub
    gx = x0 + (np.arange(nx)[:, None] + off[None, :]).ravel() * h
    gy = y0 + (np.arange(ny)[:, None] + off[None, :]).ravel() * h
    X, Y = np.meshgrid(gx, gy)
    pts = np.column_stack([X.ravel(), Y.ravel()])
    cover = np.zeros(len(pts), dtype=bool)
    for z in board.zones:
        if layer and z['layer'] != layer:
            continue
        for p in z['polys']:
            o = np.asarray(p['outline'])
            if o[:, 0].max() < x0 or o[:, 0].min() > x0 + nx * h or o[:, 1].max() < y0 or o[:, 1].min() > y0 + ny * h:
                continue
            hit = inside(p['outline'], pts)
            for hole in p['holes']:
                if len(hole) >= 3:
                    hit &= ~inside(hole, pts)
            cover |= hit
    cover = cover.reshape(ny, sub, nx, sub).mean(axis=(1, 3))
    return cover if share else cover >= 0.5


# The card: the 72 x 42 mm of the coil that ISO/IEC 10373-6 measures a reader's field with. A card works
# from 1.5 A/m (rms) and a reader may not give it more than 7.5 A/m (ISO/IEC 14443-2).
CARD = (72.0, 42.0)
H_MIN, H_MAX = 1.5, 7.5
FRONT = 4.74 + 0.4      # mm from the loop to the coil of a card that lies on the case: the display side of
#                         the board is 4.74 mm behind the front (design notes), the coil is inside the card


def field(board, distances, wall=None, mesh=1.25):
    """Field strength per ampere in the loop, averaged over a card held parallel to the reader in front of
    the loop's centre, at each distance in mm (card's long side across the reader, and along it)."""
    m, n_in, n_out = _model(board, mesh, True, wall, False, 7)
    _z, currents = m.impedance(F0, n_in, n_out)
    ax, ay = geometry.ANT_C[0] + OX, geometry.ANT_C[1] + OY
    out = []
    for d in distances:
        both = []
        for w, h in (CARD, CARD[::-1]):
            xs, ys = np.meshgrid(ax + (np.arange(24) + 0.5) / 24 * w - w / 2, ay + (np.arange(14) + 0.5) / 14 * h - h / 2)
            pts = np.column_stack([xs.ravel() * MM, ys.ravel() * MM, np.full(xs.size, -d * MM)])
            both.append(abs(m.field_z(currents, pts).mean()))
        out.append(both)
    return np.array(out)


def loop(board, mesh=1.25, copper=True, wall=None, bridge=False, filaments=7):
    """(inductance in henry, resistance in ohm) of the loop.

    copper: with the pours around the loop. wall: distance in mm to a metal plate behind the reader.
    bridge: metal across the gap in the copper at the mounting hole, as a screw head through the solder
    mask would be."""
    m, n_in, n_out = _model(board, mesh, copper, wall, bridge, filaments)
    z, _ = m.impedance(F0, n_in, n_out)
    return z.imag / (2 * np.pi * F0), z.real


def _model(board, mesh, copper, wall, bridge, filaments):
    """The loop is at z = 0; the user is on the side of negative z, the wall on the positive one."""
    m = Mesh()
    n_in, n_out = m.track([(x * MM, y * MM) for x, y in centreline(board)], TRACK_W, TRACK_T, 0.0, nfil=filaments)
    ax, ay = geometry.ANT_C[0] + OX, geometry.ANT_C[1] + OY
    if copper:
        x0, y0 = ax - geometry.ANT_W / 2 - 14, ay - geometry.ANT_H / 2 - 16
        nx, ny = int((geometry.ANT_W + 28) / mesh), int((geometry.ANT_H + 30) / mesh)
        mask = copper_mask(board, x0, y0, nx, ny, mesh)
        if bridge:
            hx, hy = geometry.NFC_GAP_HOLE[0] + OX, geometry.NFC_GAP_HOLE[1] + OY
            yy, xx = np.mgrid[0:ny, 0:nx]
            mask |= np.hypot(x0 + (xx + 0.5) * mesh - hx, y0 + (yy + 0.5) * mesh - hy) < 3.0
        m.sheet(mask, x0 * MM, y0 * MM, mesh * MM, 35e-6, 0.1 * MM)
    if wall:
        cell, n = 4.0, 30               # steel or aluminium, 120 x 120 mm
        m.sheet(np.ones((n, n), dtype=bool), (ax - n * cell / 2) * MM, (ay - n * cell / 2) * MM, cell * MM, 1e-3,
                wall * MM, rho=1e-7)
    return m, n_in, n_out
