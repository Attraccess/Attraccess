"""Characteristic impedance and delay of a track in the board's layer stack, from a 2D field solution
(finite differences, successive over-relaxation): Z0 = 1 / (c sqrt(C C_air)), delay = sqrt(C / C_air) / c."""
import numpy as np

EPS0, C_LIGHT = 8.854e-12, 2.998e8


def capacitance(eps, cond, gnd, minus=None):
    """Capacitance per metre between the nodes `cond` and `gnd`. eps: relative permittivity of the cells
    (ny, nx); cond, gnd: masks of the nodes (ny + 1, nx + 1). The outer boundary is ground.
    minus: nodes of a second conductor held at -1 V (odd mode of a pair); the result is then the
    capacitance of one line to ground in that mode."""
    ep = np.pad(eps, 1, mode='edge')
    ex = 0.5 * (ep[:-1, 1:-1] + ep[1:, 1:-1])           # edges between horizontal neighbours (ny + 1, nx)
    ey = 0.5 * (ep[1:-1, :-1] + ep[1:-1, 1:])           # edges between vertical neighbours (ny, nx + 1)
    west, east = np.pad(ex, ((0, 0), (1, 0))), np.pad(ex, ((0, 0), (0, 1)))
    north, south = np.pad(ey, ((1, 0), (0, 0))), np.pad(ey, ((0, 1), (0, 0)))
    total = west + east + north + south
    fixed = cond | gnd | (minus if minus is not None else False)
    fixed[0, :] = fixed[-1, :] = fixed[:, 0] = fixed[:, -1] = True
    phi = np.where(cond, 1.0, 0.0) - (np.where(minus, 1.0, 0.0) if minus is not None else 0.0)
    ii, jj = np.indices(phi.shape)
    colour = [((ii + jj) % 2 == c) & ~fixed for c in (0, 1)]
    omega = 2 / (1 + np.sin(np.pi / min(phi.shape)))
    for sweep in range(20000):
        change = 0.0
        for free in colour:
            p = np.pad(phi, 1)
            new = (west * p[1:-1, :-2] + east * p[1:-1, 2:] + north * p[:-2, 1:-1] + south * p[2:, 1:-1]) / total
            step = np.where(free, omega * (new - phi), 0.0)
            phi += step
            change = max(change, np.abs(step).max())
        if change < 2e-7:
            break
    # energy of the field: C V^2 = sum over the edges of eps (difference of potential)^2; in the odd mode
    # both lines carry C V^2
    energy = EPS0 * ((ex * np.diff(phi, axis=1) ** 2).sum() + (ey * np.diff(phi, axis=0) ** 2).sum())
    return energy / (2 if minus is not None else 1)


def line(below, above, w, t, beside=None, cell=5e-6, width=2e-3, air=0.5e-3):
    """(Z0, delay per metre) of a track of width w and thickness t.

    below: (thickness, eps_r) of the dielectric down to the plane under the track.
    above: the same up to the plane above it, or None for an outer layer (solder mask, then air).
    beside: gap to the ground fill on the track's own layer, or None."""
    h1 = below[0]
    h2 = above[0] if above else 0.02e-3 + air
    ny, nx = int(round((h1 + h2) / cell)), int(round(width / cell))
    yc = (np.arange(ny) + 0.5) * cell
    eps = np.ones((ny, nx))
    eps[yc < h1, :] = below[1]
    eps[(yc >= h1) & (yc < h1 + (above[0] if above else 0.02e-3)), :] = above[1] if above else 3.8
    X, Y = np.meshgrid((np.arange(nx + 1) - nx / 2) * cell, np.arange(ny + 1) * cell)
    level = (Y >= h1 - 1e-9) & (Y <= h1 + t + 1e-9)
    track = (np.abs(X) <= w / 2 + 1e-9) & level
    gnd = np.zeros_like(track)
    if beside:
        gnd |= (np.abs(X) >= w / 2 + beside - 1e-9) & level
    c, c_air = capacitance(eps, track, gnd.copy()), capacitance(np.ones_like(eps), track, gnd.copy())
    return 1 / (C_LIGHT * np.sqrt(c * c_air)), np.sqrt(c / c_air) / C_LIGHT


def pair(below, w, t, gap, cell=5e-6, width=None, air=0.5e-3, mask=(0.025e-3, 0.015e-3)):
    """(differential impedance, delay per metre) of two coupled tracks of width w, thickness t and edge
    gap `gap` on an outer layer: dielectric `below` (thickness, eps_r) down to the plane, then solder mask
    (eps_r 3.8; `mask`: its thickness on the laminate and on the copper, JLCPCB's 1.0 and 0.6 mil) and
    air. Odd mode: Zdiff = 2 / (c sqrt(C_odd C_odd,air))."""
    h1 = below[0]
    width = width or max(2e-3, 2 * w + gap + 1.6e-3)
    ny, nx = int(round((h1 + t + mask[1] + air) / cell)), int(round(width / cell))
    yc = (np.arange(ny) + 0.5) * cell
    xc = (np.arange(nx) + 0.5 - nx / 2) * cell
    eps = np.ones((ny, nx))
    eps[yc < h1, :] = below[1]
    eps[(yc >= h1) & (yc < h1 + mask[0]), :] = 3.8
    on = ((np.abs(xc) >= gap / 2 - mask[1]) & (np.abs(xc) <= gap / 2 + w + mask[1]))[None, :]
    eps[((yc >= h1) & (yc < h1 + t + mask[1]))[:, None] & on] = 3.8
    X, Y = np.meshgrid((np.arange(nx + 1) - nx / 2) * cell, np.arange(ny + 1) * cell)
    level = (Y >= h1 - 1e-9) & (Y <= h1 + t + 1e-9)
    a = (X >= gap / 2 - 1e-9) & (X <= gap / 2 + w + 1e-9) & level
    b = (X <= -gap / 2 + 1e-9) & (X >= -gap / 2 - w - 1e-9) & level
    none = np.zeros_like(a)
    c = capacitance(eps, a, none.copy(), minus=b)
    c_air = capacitance(np.ones_like(eps), a, none.copy(), minus=b)
    return 2 / (C_LIGHT * np.sqrt(c * c_air)), np.sqrt(c / c_air) / C_LIGHT


def board_lines(board, w=0.15e-3, gap=0.127e-3):
    """{layer: (Z0, delay per metre)} of a signal track with the ground fill beside it, for the layers
    that carry tracks."""
    out = {}
    out['F.Cu'] = out['B.Cu'] = line(board.dielectric_below('F.Cu'), None, w, board.copper['F.Cu'], gap)
    out['In2.Cu'] = line(board.dielectric_below('In2.Cu'), board.dielectric_above('In2.Cu'), w, board.copper['In2.Cu'], gap)
    return out
