"""Wi-Fi antenna of the ESP32-C5-MINI-1 on the Touch P4 board: full-wave model (openEMS, FDTD), 2.4 and 5 GHz.

The module's antenna is a dual-band printed antenna on its own little board, fed through a diplexer; its
exact shape is not published (the FCC's internal photos show it under solder mask). A stand-in of the same
size and kind, an inverted-F with a long arm for 2.4 GHz and a short branch for 5 GHz, is first tuned on a
small evaluation board with the antenna out over its edge, then put on this board unchanged:

- at its place on this board (geometry.WIFI_MODULE): the cut in the top edge under it, the copper keep-out
  beside it, the display's metal back, the printed case, a metal wall behind the reader, a metal face plate;
- at Espressif's recommended place (HDG 1.4.7, fig. 22 position 3 and fig. 23): the same board, the module in
  its top right corner with the antenna's ground point at the edge and the antenna out over the edge. The
  case is taken as large as that needs, with the same distances from the antenna to its walls.

What changes from case to case is the answer; the absolute figures are those of the stand-in, not of the
module (Espressif's antenna report for the module's own antenna: 78 to 83 % radiated at 2.4 GHz, 51 to 68 %
at 5 GHz, in free space; FCC ID 2AC7Z-ESPC5MINI1, exhibit "ANT Test Report").

Usage: wifi_antenna.py [case ...] [--band 2.4|5] [--arms LB HB]
cases: reference board display in_case metal_wall faceplate p3_board p3_in_case p3_metal_wall
Needs a Python with openEMS and CSXCAD (Debian: python3-openems). Three to ten minutes per case and band;
not part of the simulate target. Results of revision A: docs/design-notes.md, "Simulation".
Lengths in mm. x across the board, y up (the board's top edge is y = 0, the board hangs below it),
z = 0 is the component side, which faces the wall; the display is on the side of negative z."""
import os
import sys
import tempfile

import numpy as np

for _name, _type in (('float', float), ('int', int), ('complex', complex), ('bool', bool)):
    if _name not in vars(np):           # openEMS's bindings of 2019 still use numpy's old names
        setattr(np, _name, _type)
from CSXCAD import ContinuousStructure
from openEMS import openEMS
from openEMS.physical_constants import Z0

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scripts', 'bootstrap'))
import geometry as G  # noqa: E402

# Each band is simulated on its own, with a pulse kept to the band. The space between the display's metal
# back and the board is a flat cavity with resonances of its own near 2.0 and 2.8 GHz that hardly lose any
# energy; a pulse that reaches them never dies down.
BANDS = {
    '2.4': dict(f0=2.45e9, wide=0.6e9, narrow=0.25e9, f=(2.2e9, 2.7e9), channels=(2.412e9, 2.442e9, 2.472e9)),
    '5': dict(f0=5.5e9, wide=1.0e9, narrow=0.6e9, f=(4.9e9, 6.1e9), channels=(5.18e9, 5.50e9, 5.70e9)),
}
STEEL = 1.4e6                                  # S/m: the display's back is stainless steel sheet, 0.2 mm
ALU = 3.5e7                                    # S/m: an aluminium face plate
BOARD = (G.BOARD_W, G.BOARD_H, 1.6)
LCM = G.LCM[0], G.LCM[2], G.LCM[1], G.LCM[3], G.DISPLAY_GAP[0]   # metal back: x1, x2, y1, y2 below the top edge, gap
LENS = G.LENS
WALL = 16.4                                    # metal wall behind the dock plate, from the component side
EPS_FR4, TAND = 4.4, 0.02
# The printed case around the board, as far as the antenna sees it: front wall 2.34 mm from the display side
# (2.4 mm thick), top and side wall 1.5 mm from the board's edges, dock plate 13.9 mm behind the component
# side (2.5 mm). PETG or ABS.
EPS_CASE, TAND_CASE = 3.0, 0.015
# The module (datasheet v1.4, fig. 11-1): 15.4 mm wide; its antenna area 5.85 mm, from the ground edge of the
# module's board up; the shielded part below it. At this board's place its pad centre is geometry.WIFI_MODULE.
MW, ANT_H, BODY_H = G.WIFI_W, G.WIFI_TOP - G.WIFI_ANT, G.WIFI_ANT + G.WIFI_BOTTOM
# Stand-in: arm lengths (mm) that tune it on the evaluation board to about 2.44 and 5.5 GHz
ARMS = (4.3, 6.8)
CASES = ('reference', 'board', 'display', 'in_case', 'metal_wall', 'faceplate', 'faceplate_window', 'p3_board',
         'p3_in_case', 'p3_metal_wall')


def place(case):
    """(x1 of the module, y of its antenna's ground edge, how far the case's top grows) for a case."""
    if case.startswith('p3_'):
        # top right corner, its right edge 1 mm inside the board's (fig. 23 "Max 1"), antenna over the edge
        return BOARD[0] - 1.0 - MW, 0.0, ANT_H + 0.3
    cx, cy = G.WIFI_MODULE
    return cx - MW / 2, -(cy - G.WIFI_ANT), 0.0


def build(case, band, arms):
    b = BANDS[band]
    base = case[3:] if case.startswith('p3_') else case
    fdtd = openEMS(NrTS=150000, EndCriteria=1e-3)
    fdtd.SetGaussExcite(b['f0'], b['wide'] if base in ('reference', 'board') else b['narrow'])
    fdtd.SetBoundaryCond(['PML_8'] * 6)
    csx = ContinuousStructure()
    fdtd.SetCSX(csx)
    mesh = csx.GetGrid()
    mesh.SetDeltaUnit(1e-3)
    metal = csx.AddMetal('metal')
    fr4 = csx.AddMaterial('fr4', epsilon=EPS_FR4, kappa=2 * np.pi * b['f0'] * 8.854e-12 * EPS_FR4 * TAND)
    edges = {'x': [], 'y': [], 'z': []}

    def box(prop, x1, x2, y1, y2, z1, z2, priority=10):
        prop.AddBox(priority=priority, start=[x1, y1, z1], stop=[x2, y2, z2])
        edges['x'] += [x1, x2]; edges['y'] += [y1, y2]; edges['z'] += [z1, z2]

    mx1, y0, grow = place(case)
    mx2 = mx1 + MW
    w, h, t = BOARD
    # --- the base board ---------------------------------------------------------------------------
    if base == 'reference':          # evaluation board: 40 x 55 mm of ground, the antenna stands out over its edge
        bx1 = (mx1 + mx2) / 2 - 20
        box(metal, bx1, bx1 + 40, y0 - 55, y0, -t, 0)
    elif case.startswith('p3_'):     # this board, its top edge at the antenna's ground edge, no cut
        box(metal, 0, w, -h, 0, -t, 0)
    else:
        nx1, nx2, nd = G.WIFI_NOTCH
        kx1, ky1, kx2, ky2 = G.WIFI_KEEPOUT
        box(fr4, 0, w, -h, 0, -t, 0, priority=1)
        air = csx.AddMaterial('air', epsilon=1.0)
        box(air, nx1, nx2, -nd, 0, -t, 0, priority=2)
        # six copper layers, tied together by vias every few millimetres: one block of metal, except where
        # the keep-out leaves the board bare
        box(metal, kx2, w, -h, 0, -t, 0)
        box(metal, 0, kx2, -h, -ky2, -t, 0)
    if base in ('display', 'in_case', 'metal_wall', 'faceplate', 'faceplate_window'):
        x1, x2, y1, y2, gap = LCM
        back = csx.AddConductingSheet('lcd_back', conductivity=STEEL, thickness=0.2e-3)
        box(back, x1, x2, -y2, -y1, -t - gap, -t - gap)
        for px, py in G.LCD_GROUND_PADS:            # conductive foam on the four ground pads behind the display
            box(metal, px - 2.5, px + 2.5, -py - 2.5, -py + 2.5, -t - gap, -t)
    if base in ('in_case', 'metal_wall', 'faceplate', 'faceplate_window'):
        plastic = csx.AddMaterial('case', epsilon=EPS_CASE, kappa=2 * np.pi * b['f0'] * 8.854e-12 * EPS_CASE * TAND_CASE)
        front, rear = -t - 2.34, 13.9
        top = 1.5 + grow
        box(plastic, -3.9, w + 3.9, -LENS[1], top + 2.4, front - 2.4, front, priority=1)      # bezel above the display
        box(plastic, -3.9, w + 3.9, top, top + 2.4, front, rear, priority=1)                  # top wall
        box(plastic, -3.9, -1.5, -40.0, top, front, rear, priority=1)                         # side walls by the corners
        box(plastic, w + 1.5, w + 3.9, -40.0, top, front, rear, priority=1)
        box(plastic, -3.9, w + 3.9, -60.0, top + 2.4, rear, rear + 2.5, priority=1)           # dock plate
        if base.startswith('faceplate'):            # 0.8 mm aluminium on the front, a window for the display
            alu = csx.AddConductingSheet('alu', conductivity=ALU, thickness=0.8e-3)
            zf = front - 2.4
            # faceplate_window: the strip above the display left open over the antenna and its keep-out
            x0 = G.WIFI_KEEPOUT[2] if base == 'faceplate_window' else -3.9
            box(alu, x0, w + 3.9, -LENS[1], top + 2.4, zf, zf)
            box(alu, -3.9, LENS[0], -60.0, -LENS[1], zf, zf)
            box(alu, LENS[2], w + 3.9, -60.0, -LENS[1], zf, zf)
    if base == 'metal_wall':
        box(metal, -60, w + 60, -h - 40, 50, WALL, WALL)
    # --- the module: ground and shield as one block, its board under the antenna ----------------------
    box(metal, mx1, mx2, y0 - BODY_H, y0, 0.0, 0.8)
    box(metal, mx1 + 0.6, mx2 - 0.6, y0 - BODY_H + 0.5, y0 - 1.0, 0.8, 2.4)
    box(fr4, mx1, mx2, y0, y0 + ANT_H, 0, 0.8, priority=1)
    # --- the stand-in antenna on the module's top face: inverted-F, 0.5 mm track, ground point on the right ---
    za = 0.8                                      # v = 0 at the edge of the module's ground

    def trace(u1, u2, v1, v2):
        box(metal, mx1 + u1, mx1 + u2, y0 + v1, y0 + v2, za, za)
    lb, hb = arms
    trace(14.4, 14.9, 0.0, 5.0)                   # short to ground at the right end
    trace(0.5, 14.9, 4.5, 5.0)                    # along the top edge
    trace(12.9, 13.4, 0.5, 4.5)                   # feed
    trace(0.5, 1.0, 1.75, 4.5)                    # low band: down the far end
    trace(0.5, 0.5 + lb, 1.75, 2.25)              # and back
    trace(12.9 - hb, 13.4, 3.0, 3.5)              # high band: a short branch off the feed
    port = fdtd.AddLumpedPort(1, 50, [mx1 + 12.9, y0, za], [mx1 + 13.4, y0 + 0.5, za], 'y', 1.0, priority=5)
    # --- mesh: 0.25 mm around the antenna, anchored at the corner of the module's ground; elsewhere the
    # edges of the parts, unless one lies within 0.2 mm of a line that is there already (a sliver of a
    # cell would cut the time step of the whole model) -------------------------------------------------
    fine, margin = 0.25, 40.0
    lo = {'x': -margin - 6, 'y': -h - margin, 'z': -margin - 6}
    hi = {'x': w + margin + 6, 'y': margin + grow, 'z': margin + (WALL if base == 'metal_wall' else 0)}
    if base == 'reference':
        lo['y'] = y0 - 55 - margin
        lo['x'], hi['x'] = (mx1 + mx2) / 2 - 20 - margin, (mx1 + mx2) / 2 + 20 + margin
    grid = {'x': list(mx1 + fine * np.arange(-4, 66)), 'y': list(y0 + fine * np.arange(-6, 28)),
            'z': [-t, -0.8, 0.0, 0.4, 0.8, 1.2, 1.6, 2.4, 3.2]}
    for d in 'xyz':
        pts = list(grid[d])
        for e in sorted(set(edges[d] + [lo[d], hi[d]])):
            if lo[d] <= e <= hi[d] and min(abs(e - p) for p in pts) >= 0.2:
                pts.append(e)
        mesh.AddLine(d, np.unique(np.round(pts, 3)))
    mesh.SmoothMeshLines('all', 2.5 if band == '5' else 3.0, 1.4)
    nf2ff = fdtd.CreateNF2FFBox()
    return fdtd, port, nf2ff, mesh


def run(case, band, arms=ARMS):
    b = BANDS[band]
    fdtd, port, nf2ff, mesh = build(case, band, arms)
    cells = np.prod([len(mesh.GetLines(d)) for d in range(3)])
    sim = tempfile.mkdtemp(prefix='ant_')
    fdtd.Run(sim, verbose=0, cleanup=True)
    f = np.linspace(b['f'][0], b['f'][1], 241)
    port.CalcPort(sim, f)
    s11 = port.uf_ref / port.uf_inc
    zin = port.uf_tot / port.if_tot
    p_acc = 0.5 * np.real(port.uf_tot * np.conj(port.if_tot))
    p_inc = 0.5 * np.abs(port.uf_inc) ** 2 / 50
    k = int(np.argmin(np.abs(s11)))
    out = {'case': case, 'band': band, 'arms': arms, 'cells': int(cells), 'f_res': float(f[k]),
           's11_res_db': float(20 * np.log10(abs(s11[k]))), 'band_rows': []}
    below = np.abs(s11) < 10 ** (-6 / 20)
    out['bandwidth_6db'] = float(below.sum() * (f[1] - f[0]))
    theta, phi = np.arange(0, 181, 5.0), np.arange(0, 360, 10.0)
    w, h, _t = BOARD
    for fb in b['channels']:
        i = int(np.argmin(np.abs(f - fb)))
        res = nf2ff.CalcNF2FF(sim, fb, theta, phi, center=[w / 2, -h / 2 if case != 'reference' else -30, 0], verbose=0)
        e = np.abs(res.E_norm[0]) ** 2                               # theta x phi, at r = 1 m
        wgt = np.sin(np.deg2rad(theta))[:, None] * np.deg2rad(5.0) * np.deg2rad(10.0)
        p_dir = e / (2 * Z0)
        total = float((p_dir * wgt).sum())
        front = float((p_dir * wgt)[theta > 90].sum())               # theta > 90: negative z, the side of the display
        out['band_rows'].append({'f': fb, 's11_db': float(20 * np.log10(abs(s11[i]))), 'z_re': float(zin[i].real),
                                 'z_im': float(zin[i].imag), 'mismatch_db': float(10 * np.log10(1 - abs(s11[i]) ** 2)),
                                 'radiation_eff': float(res.Prad[0] / p_acc[i]),
                                 'total_eff_db': float(10 * np.log10(res.Prad[0] / p_inc[i])),
                                 'front_share': front / total})
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    bands = ['2.4', '5']
    arms = ARMS
    if '--band' in args:
        i = args.index('--band'); bands = [args[i + 1]]; del args[i:i + 2]
    if '--arms' in args:
        i = args.index('--arms'); arms = (float(args[i + 1]), float(args[i + 2])); del args[i:i + 3]
    print('%-16s %4s %9s %7s %9s | radiated of the power fed in (accepted), three channels | %s'
          % ('case', 'band', 'resonance', 'S11', 'bandwidth', 'to the front'), flush=True)
    for case in args or CASES:
        for band in bands:
            r = run(case, band, arms)
            rows = r['band_rows']
            print('%-16s %4s %5.3f GHz %4.0f dB %5.0f MHz | %6.1f / %.1f / %.1f dB (%.1f / %.1f / %.1f) at %s | %5.0f %%'
                  '   arms %s, %d cells'
                  % (case, band, r['f_res'] / 1e9, r['s11_res_db'], r['bandwidth_6db'] / 1e6,
                     *[x['total_eff_db'] for x in rows], *[10 * np.log10(x['radiation_eff']) for x in rows],
                     ' / '.join('%.3f' % (x['f'] / 1e9) for x in rows),
                     100 * rows[1]['front_share'], '%g %g' % arms, r['cells']), flush=True)
