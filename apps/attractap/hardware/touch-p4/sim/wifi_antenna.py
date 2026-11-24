"""Wi-Fi antenna of the ESP32-C6-MINI-1 on the Touch P4 board: full-wave model (openEMS, FDTD).

The module's antenna is a meandered inverted-F on its own little board; its exact shape is not
published. A stand-in of the same size and kind is first put on a small evaluation board, then on this
board unchanged: with the cut under it, with the display's metal back (on its four ground pads, and
floating), inside the printed case, and in the case with a metal wall behind the reader. What changes from case to case is the answer; the
absolute figures are those of the stand-in, not of the module.

Usage: wifi_antenna.py [case ...]     cases: reference board display display_floating in_case metal_wall
Needs a Python with openEMS and CSXCAD (Debian: python3-openems). About five minutes per case; not part
of the simulate target. Results of revision A: docs/design-notes.md, "Simulation".
Lengths in mm. x across the board, y up (the board's top edge is y = 0, the board hangs below it),
z = 0 is the component side, which faces the wall; the display is on the side of negative z."""
import sys
import tempfile

import numpy as np

for _name, _type in (('float', float), ('int', int), ('complex', complex), ('bool', bool)):
    if _name not in vars(np):           # openEMS's bindings of 2019 still use numpy's old names
        setattr(np, _name, _type)
from CSXCAD import ContinuousStructure
from openEMS import openEMS
from openEMS.physical_constants import Z0

F0 = 2.45e9
# Width of the pulse that excites the model. The space between the display's metal back and the board is
# a flat cavity with resonances of its own near 2.0 and 2.8 GHz that hardly lose any energy; a pulse
# that reaches them never dies down. With the display the pulse is kept to the band.
FC_WIDE, FC_BAND = 0.6e9, 0.25e9
STEEL = 1.4e6                                  # S/m: the display's back is stainless steel sheet, 0.2 mm
BAND = (2.412e9, 2.442e9, 2.472e9)             # channels 1, 7 and 13
BOARD = (86.0, 143.5, 1.6)
KEEPOUT = (0.0, 44.0, 6.0)                     # no copper for x1..x2 down to this depth below the top edge
NOTCH = (14.9, 29.1, 5.65)                     # the board is cut away here
MODULE = (15.4, 28.6, 0.32, 16.92)             # x1, x2, top and bottom edge below the board's top edge
ANT_DEPTH = 5.46                               # the antenna end of the module reaches down to here
LCM = (5.6, 80.4, 12.8, 89.4, 1.5)             # metal back of the display: x1, x2, y1, y2, distance from the board
GROUND_PADS = ((13.5, 18.5), (66.0, 38.0), (48.0, 17.0), (43.0, 80.0))
WALL = 16.4                                    # metal wall behind the dock plate, from the component side
EPS_FR4, TAND = 4.4, 0.02
ARM = 9.25                                     # mm of the stand-in's last arm: resonance at 2.42 GHz on the evaluation board
CASES = ('reference', 'board', 'display', 'display_floating', 'in_case', 'metal_wall')
# The printed case around the top of the board, as far as the antenna sees it: front wall 2.34 mm from
# the display side (2.4 mm thick), top and side wall 1.5 mm from the board's edges, dock plate 13.9 mm
# behind the component side (2.5 mm). PETG or PLA.
EPS_CASE, TAND_CASE = 3.0, 0.015


def build(case, arm, grounded=True):
    fdtd = openEMS(NrTS=100000, EndCriteria=1e-3)
    fdtd.SetGaussExcite(F0, FC_WIDE if case in ('reference', 'board') else FC_BAND)
    fdtd.SetBoundaryCond(['PML_8'] * 6)
    csx = ContinuousStructure()
    fdtd.SetCSX(csx)
    mesh = csx.GetGrid()
    mesh.SetDeltaUnit(1e-3)
    metal = csx.AddMetal('metal')
    fr4 = csx.AddMaterial('fr4', epsilon=EPS_FR4, kappa=2 * np.pi * F0 * 8.854e-12 * EPS_FR4 * TAND)
    edges = {'x': [], 'y': [], 'z': []}

    def box(prop, x1, x2, y1, y2, z1, z2, priority=10):
        prop.AddBox(priority=priority, start=[x1, y1, z1], stop=[x2, y2, z2])
        edges['x'] += [x1, x2]; edges['y'] += [y1, y2]; edges['z'] += [z1, z2]

    mx1, mx2, mtop, mbot = MODULE
    # --- the base board ---------------------------------------------------------------------------
    if case == 'reference':          # evaluation board: 40 x 55 mm of ground, the antenna stands out over its edge
        bx1, bx2, btop, bbot = (mx1 + mx2) / 2 - 20, (mx1 + mx2) / 2 + 20, ANT_DEPTH + 0.3, ANT_DEPTH + 55
        box(metal, bx1, bx2, -bbot, -btop, -BOARD[2], 0)
    else:
        w, h, t = BOARD
        box(fr4, 0, w, -h, 0, -t, 0, priority=1)
        air = csx.AddMaterial('air', epsilon=1.0)
        box(air, NOTCH[0], NOTCH[1], -NOTCH[2], 0, -t, 0, priority=2)
        # six copper layers, tied together by vias every few millimetres: one block of metal
        box(metal, KEEPOUT[1], w, -h, 0, -t, 0)
        box(metal, KEEPOUT[0], KEEPOUT[1], -h, -KEEPOUT[2], -t, 0)
    if case in ('display', 'in_case', 'metal_wall'):
        x1, x2, y1, y2, gap = LCM
        back = csx.AddConductingSheet('lcd_back', conductivity=STEEL, thickness=0.2e-3)
        box(back, x1, x2, -y2, -y1, -BOARD[2] - gap, -BOARD[2] - gap)
        if grounded:                 # conductive foam on the four ground pads behind the display
            for px, py in GROUND_PADS:
                box(metal, px - 2.5, px + 2.5, -py - 2.5, -py + 2.5, -BOARD[2] - gap, -BOARD[2])
    if case in ('in_case', 'metal_wall'):
        plastic = csx.AddMaterial('case', epsilon=EPS_CASE, kappa=2 * np.pi * F0 * 8.854e-12 * EPS_CASE * TAND_CASE)
        front, back = -BOARD[2] - 2.34, 13.9
        box(plastic, -3.9, BOARD[0] + 3.9, -7.0, 3.9, front - 2.4, front, priority=1)        # bezel above the display
        box(plastic, -3.9, BOARD[0] + 3.9, 1.5, 3.9, front, back, priority=1)                 # top wall
        box(plastic, -3.9, -1.5, -40.0, 1.5, front, back, priority=1)                         # side wall next to the antenna
        box(plastic, -3.9, BOARD[0] + 3.9, -60.0, 3.9, back, back + 2.5, priority=1)          # dock plate
    if case == 'metal_wall':
        box(metal, -60, BOARD[0] + 60, -BOARD[1] - 40, 50, WALL, WALL)
    # --- the module: ground and shield as one block, its board under the antenna ------------------------
    box(metal, mx1, mx2, -mbot, -ANT_DEPTH, 0.0, 0.8)
    box(metal, mx1 + 0.6, mx2 - 0.6, -mbot + 0.5, -ANT_DEPTH - 1.0, 0.8, 2.4)
    box(fr4, mx1, mx2, -ANT_DEPTH, -mtop, 0, 0.8, priority=1)
    # --- the stand-in antenna on the module's top face: meandered inverted-F, 0.5 mm track ---------
    za, y0 = 0.8, -ANT_DEPTH                      # v = 0 at the edge of the module's ground
    def trace(u1, u2, v1, v2):
        box(metal, mx1 + u1, mx1 + u2, y0 + v1, y0 + v2, za, za)
    # all of it on the 0.25 mm grid of the mesh
    trace(0.5, 1.0, 0.0, 4.5)                     # short to ground
    trace(0.5, 12.75, 4.0, 4.5)                   # along the top edge
    trace(2.5, 3.0, 0.5, 4.0)                     # feed
    trace(12.25, 12.75, 1.75, 4.0)                # down the far end
    trace(12.75 - arm, 12.75, 1.75, 2.25)         # and back: its length and height tune the antenna
    port = fdtd.AddLumpedPort(1, 50, [mx1 + 2.5, y0, za], [mx1 + 3.0, y0 + 0.5, za], 'y', 1.0, priority=5)
    # --- mesh: 0.25 mm around the antenna, anchored at the corner of the module's ground; elsewhere the
    # edges of the parts, unless one lies within 0.2 mm of a line that is there already (a sliver of a
    # cell would cut the time step of the whole model) -------------------------------------------------
    fine = 0.25
    margin = 40.0
    lo = {'x': -margin - 6, 'y': -BOARD[1] - margin, 'z': -margin - 6}
    hi = {'x': BOARD[0] + margin + 6, 'y': margin, 'z': margin + (WALL if case == 'metal_wall' else 0)}
    if case == 'reference':
        lo['y'] = -ANT_DEPTH - 55 - margin
        lo['x'], hi['x'] = (mx1 + mx2) / 2 - 20 - margin, (mx1 + mx2) / 2 + 20 + margin
    grid = {'x': list(mx1 + fine * np.arange(-4, 58)), 'y': list(y0 + fine * np.arange(-6, 27)),
            'z': [-BOARD[2], -0.8, 0.0, 0.4, 0.8, 1.2, 1.6, 2.4, 3.2]}
    for d in 'xyz':
        pts = list(grid[d])
        for e in sorted(set(edges[d] + [lo[d], hi[d]])):
            if lo[d] <= e <= hi[d] and min(abs(e - p) for p in pts) >= 0.2:
                pts.append(e)
        mesh.AddLine(d, np.unique(np.round(pts, 3)))
    mesh.SmoothMeshLines('all', 3.0, 1.4)
    nf2ff = fdtd.CreateNF2FFBox()
    return fdtd, port, nf2ff, mesh


def run(case, arm, grounded=True):
    fdtd, port, nf2ff, mesh = build(case.replace('_floating', ''), arm, grounded and not case.endswith('_floating'))
    cells = np.prod([len(mesh.GetLines(d)) for d in range(3)])
    sim = tempfile.mkdtemp(prefix='ant_')
    fdtd.Run(sim, verbose=0, cleanup=True)
    f = np.linspace(2.2e9, 2.7e9, 251)
    port.CalcPort(sim, f)
    s11 = port.uf_ref / port.uf_inc
    zin = port.uf_tot / port.if_tot
    p_acc = 0.5 * np.real(port.uf_tot * np.conj(port.if_tot))
    p_inc = 0.5 * np.abs(port.uf_inc) ** 2 / 50
    k = int(np.argmin(np.abs(s11)))
    out = {'case': case, 'arm': arm, 'cells': int(cells), 'f_res': float(f[k]), 's11_res_db': float(20 * np.log10(abs(s11[k]))),
           'band': []}
    theta = np.arange(0, 181, 5.0)
    phi = np.arange(0, 360, 10.0)
    below = np.abs(s11) < 10 ** (-6 / 20)
    out['bandwidth_6db'] = float(below.sum() * (f[1] - f[0]))
    for fb in (float(f[k]),) + BAND:
        i = int(np.argmin(np.abs(f - fb)))
        res = nf2ff.CalcNF2FF(sim, fb, theta, phi, center=[BOARD[0] / 2, -BOARD[1] / 2 if case != 'reference' else -30, 0], verbose=0)
        e = np.abs(res.E_norm[0]) ** 2                               # theta x phi, at r = 1 m
        w = np.sin(np.deg2rad(theta))[:, None] * np.deg2rad(5.0) * np.deg2rad(10.0)
        p_dir = e / (2 * Z0)
        total = float((p_dir * w).sum())
        front = float((p_dir * w)[theta > 90].sum())                 # theta > 90: negative z, the side of the display
        out['band'].append({'f': fb, 's11_db': float(20 * np.log10(abs(s11[i]))), 'z_re': float(zin[i].real), 'z_im': float(zin[i].imag),
                            'mismatch_db': float(10 * np.log10(1 - abs(s11[i]) ** 2)),
                            'radiation_eff': float(res.Prad[0] / p_acc[i]), 'total_eff_db': float(10 * np.log10(res.Prad[0] / p_inc[i])),
                            'front_share': front / total, 'dmax_dbi': float(10 * np.log10(res.Dmax[0]))})
    return out


if __name__ == '__main__':
    print('%-17s %9s %7s %9s | radiated of the power fed in, channel 1 / 7 / 13 | %s' % ('case', 'resonance', 'S11', 'bandwidth', 'to the front'))
    for case in sys.argv[1:] or CASES:
        r = run(case, ARM)
        band = [next(x for x in r['band'] if x['f'] == fb) for fb in BAND]
        print('%-17s %5.3f GHz %4.0f dB %5.0f MHz | %22.1f / %.1f / %.1f dB | %8.0f %%'
              % (case, r['f_res'] / 1e9, r['s11_res_db'], r['bandwidth_6db'] / 1e6, *[b['total_eff_db'] for b in band],
                 100 * band[1]['front_share']), flush=True)
