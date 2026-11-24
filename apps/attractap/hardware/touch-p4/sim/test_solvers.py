"""Checks of the two field solvers against results that are known in closed form.

Usage: python3 test_solvers.py     (run.py runs them too)"""
import math

import numpy as np

import field2d
from board import MU0
from peec import Mesh

A, W, T = 0.05, 0.5e-3, 35e-6                       # a square loop of 50 mm, of 0.5 mm track
SQUARE = [(0, 0), (A, 0), (A, A), (0, A)]
RADIUS = 0.2235 * (W + T) / math.exp(-0.25)         # round wire with the strip's geometric mean distance


def neumann(p, q, dz=0.0, n=3000):
    """Mutual inductance of two closed polygons by Neumann's double integral, point by point."""
    def points(poly):
        poly = np.array(poly + [poly[0]], dtype=float)
        seg = np.diff(poly, axis=0)
        length = np.hypot(*seg.T)
        mid, dl = [], []
        for start, s, k in zip(poly[:-1], seg, np.maximum(1, (length / length.sum() * n).astype(int))):
            f = (np.arange(k) + 0.5) / k
            mid.append(start + f[:, None] * s)
            dl.append(np.tile(s / k, (k, 1)))
        return np.vstack(mid), np.vstack(dl)
    (m1, d1), (m2, d2) = points(p), points(q)
    r = np.sqrt((m1[:, None, 0] - m2[None, :, 0]) ** 2 + (m1[:, None, 1] - m2[None, :, 1]) ** 2 + dz * dz)
    return MU0 / (4 * np.pi) * ((d1 @ d2.T) / r).sum()


def loop_inductance(freq=1e3, ring=None, plate=None):
    """The square loop alone, inside a closed ring of track `ring` metres outside it, or `plate` metres
    above a copper plate of 85 mm."""
    m = Mesh()
    n_in, n_out = m.track(SQUARE + [(0, 1e-6)], W, T, plate or 0.0, nfil=1)
    if ring:
        pts = [(-ring, -ring), (A + ring, -ring), (A + ring, A + ring), (-ring, A + ring), (-ring, -ring + 1e-6)]
        r_in, r_out = m.track(pts, W, T, 0.0, nfil=1)
        m.branch(1, -ring + 1e-6, -ring, -ring, 0.0, W, T, r_out, r_in)
    if plate:
        cell, n = 2.5e-3, 34
        m.sheet(np.ones((n, n), dtype=bool), (A - n * cell) / 2, (A - n * cell) / 2, cell, 35e-6, 0.0)
    return m.impedance(freq, n_in, n_out)[0].imag / (2 * np.pi * freq)


def elliptic_k(k):
    a, b = 1.0, math.sqrt(1 - k * k)
    for _ in range(40):
        a, b = (a + b) / 2, math.sqrt(a * b)
    return math.pi / (2 * a)


def cases():
    """[(what, computed, expected, allowed relative error)]"""
    out = []
    alone = loop_inductance()
    out.append(('square loop of track, nH', alone * 1e9, 2 * MU0 * A / np.pi * (math.log(A / RADIUS) - 0.524) * 1e9, 0.02))
    gap = 2e-3
    outer = [(-gap, -gap), (A + gap, -gap), (A + gap, A + gap), (-gap, A + gap)]
    l_outer = 2 * MU0 * (A + 2 * gap) / np.pi * (math.log((A + 2 * gap) / RADIUS) - 0.524)
    out.append(('the same inside a shorted ring, nH', loop_inductance(13.56e6, ring=gap) * 1e9,
                (alone - neumann(SQUARE, outer) ** 2 / l_outer) * 1e9, 0.02))
    for h in (2e-3, 5e-3):
        # a plate acts like a second loop with the opposite current, twice as far away
        out.append(('the same %d mm above a copper plate, nH' % (h * 1e3), loop_inductance(13.56e6, plate=h) * 1e9,
                    (alone - neumann(SQUARE, SQUARE, 2 * h)) * 1e9, 0.03))
    # field of the loop: 2 sqrt(2) I / (pi a) at its centre; on its axis the four sides add up to
    # 2 a^2 I / (pi (a^2 + 4 z^2) sqrt(a^2 / 2 + z^2))
    m = Mesh()
    n_in, n_out = m.track(SQUARE + [(0, 1e-6)], W, T, 0.0, nfil=1)
    _z, currents = m.impedance(1e3, n_in, n_out)
    z = 0.02
    h = np.abs(m.field_z(currents, np.array([[A / 2, A / 2, 0.0], [A / 2, A / 2, z]])))
    out.append(('field at the centre of the loop, A/m per A', h[0], 2 * math.sqrt(2) / (math.pi * A), 0.01))
    out.append(('field 20 mm above it, A/m per A', h[1],
                2 * A * A / (math.pi * (A * A + 4 * z * z) * math.sqrt(A * A / 2 + z * z)), 0.01))
    # Stripline in the middle between two planes: Z0 = 30 pi / sqrt(er) * K(k') / K(k), k = 1 / cosh(pi w / 2b).
    # The track's thickness t acts like more width: w + t / pi * (1 + ln(4 pi w / t)).
    er, b, w, t = 4.3, 0.4e-3, 0.15e-3, 5e-6
    k = 1 / math.cosh(math.pi * (w + t / math.pi * (1 + math.log(4 * math.pi * w / t))) / (2 * b))
    exact = 30 * math.pi / math.sqrt(er) * elliptic_k(k) / elliptic_k(math.sqrt(1 - k * k))
    z0, delay = field2d.line((b / 2, er), (b / 2, er), w, t, cell=5e-6)
    out.append(('stripline between two planes, ohm', z0, exact, 0.03))
    out.append(('its delay, ps/mm', delay * 1e9, math.sqrt(er) / field2d.C_LIGHT * 1e9, 0.01))
    return out


if __name__ == '__main__':
    bad = 0
    for what, got, want, tol in cases():
        ok = abs(got / want - 1) <= tol
        bad += not ok
        print('%-44s %8.2f  expected %8.2f  %s' % (what, got, want, 'ok' if ok else 'OFF BY MORE THAN %.0f %%' % (tol * 100)))
    raise SystemExit(1 if bad else 0)
