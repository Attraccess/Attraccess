"""Compare every fitted footprint of the board with the library footprint of its LCSC part number.

JLCPCB places a part by the centre and the angle of its own library footprint for that part number
(the JLCEDA/EasyEDA library, https://easyeda.com). This check finds:

  - a part whose pads do not land on the board's pads (wrong footprint for the part number),
  - a footprint that is drawn turned against the library's, so the angle in the placement file has to
    be corrected (export_fab.JLC_ROTATION). That happens when a footprint is reused for a second
    source, or comes from KiCad's own library.

Usage: tools/pcb.sh check-footprints        (needs the internet; answers are cached under .tools/kicad)

The library is read through the interface that easyeda2kicad uses. It refuses many requests in a row,
so this is not part of the `check` target: run it after a part number or a footprint has changed.
"""
import json
import math
import os
import subprocess
import sys
import time

import pcbnew

from export_fab import JLC_ROTATION, NAME, NOT_ASSEMBLED, PROJECT

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', '..', '.tools', 'kicad', 'jlc-footprints'))
URL = 'https://easyeda.com/api/products/%s/components?version=6.4.19.5'
UNIT = 0.254                      # the library counts in 10 mil
TOLERANCE = 0.3                   # mm between a library pad and the board pad of the same number
# Four equal resistors without polarity: KiCad numbers the pads round the part one way, the library the
# other way. Only the positions of the pads are compared.
ANY_PAD = {'Resistor_SMD:R_Array_Convex_4x0402'}
# (footprint, LCSC number) -> (library pad number -> pad number on the board, tolerance in mm): the
# library draws the part's ground pads in another way than the footprint does.
# The Wi-Fi module: the footprint is the library's for the ESP32-C6-MINI-1 (C5736265), nine ground pads
# numbered 49 at a pitch of 1.8 mm. The library's footprint for the MINI-1U numbers them 49 and 54 to 61
# and draws them at 1.975 mm. The datasheet has one land pattern for both modules, with 2.05 mm (v1.5,
# figures 11-1 and 11-2); the pads are 1.45 mm wide, so all three overlap by more than a millimetre.
# Pins 1 to 48 and the corner pads 50 to 53 are compared by number as for every other part.
GROUND_PADS = {
    ('attractap:WIFIM-SMD_61P-L16.6-W13.2-P0.80-ESP32-C6-MINI-1-N4', 'C20627095'):
        ({str(n): '49' for n in range(54, 62)}, 0.35),
    # The bidirectional TVS D107: the library's land for this part number has its pads 0.44 mm further
    # from the centre than KiCad's D_SMB, the IPC pattern for DO-214AA that D106 uses too (and that matches
    # the library for the unidirectional SMBJ28A). DO-214AA terminals lie 2.0 to 2.8 mm from the centre;
    # both lands cover them. Same pad numbers.
    ('Diode_SMD:D_SMB', 'C151259'): ({}, 0.5),
}


def library_pads(code):
    """[(pad number, x, y)] of the part's library footprint, relative to its origin, in millimetres.
    An empty list if the library has no footprint for the part, None if it could not be asked."""
    path = os.path.join(CACHE, code + '.json')
    for attempt in range(4):
        if not os.path.exists(path):
            time.sleep(2)
            subprocess.run(['curl', '-s', '--compressed', '-A', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0',
                            '-o', path, URL % code], check=False)
        try:
            data = json.load(open(path, encoding='utf-8'))
        except (OSError, ValueError):
            data = None                                   # refused (an error page instead of an answer)
        if data and data.get('success'):
            break
        if data and data.get('code') == 404:
            return []                                     # the answer is kept: the part has no footprint
        if os.path.exists(path):
            os.remove(path)
        time.sleep(60 * (attempt + 1))                    # wait and try again
    else:
        return None
    package = data['result']['packageDetail']['dataStr']
    ox, oy = float(package['head']['x']), float(package['head']['y'])
    pads = []
    for shape in package['shape']:
        f = shape.split('~')
        if f[0] == 'PAD' and f[8]:
            pads.append((f[8], (float(f[2]) - ox) * UNIT, (float(f[3]) - oy) * UNIT))
    return pads


def turned(x, y, degrees):
    """Counter-clockwise on the screen, as KiCad and JLCPCB count angles (y points down)."""
    a = math.radians(degrees)
    return x * math.cos(a) + y * math.sin(a), -x * math.sin(a) + y * math.cos(a)


def fit(board_pads, lib_pads):
    """(angle, largest distance) of the best of the four turns of the library footprint. Every library
    pad must land on a board pad with its number; the board may have more pads (vias in a thermal pad,
    two holes per pole)."""
    best = None
    for angle in (0, 90, 180, 270):
        worst = 0.0
        for num, x, y in lib_pads:
            x, y = turned(x, y, angle)
            same = [math.hypot(x - bx, y - by) for bnum, bx, by in board_pads if bnum == num]
            worst = max(worst, min(same) if same else 99.0)
        if best is None or worst < best[1] - 1e-6:
            best = (angle, worst)
    return best


def main():
    os.makedirs(CACHE, exist_ok=True)
    board = pcbnew.LoadBoard(os.path.join(PROJECT, NAME + '.kicad_pcb'))
    seen, problems = {}, 0
    for fp in sorted(board.GetFootprints(), key=lambda f: f.GetReference()):
        ref = fp.GetReference()
        code = fp.GetFieldText('LCSC') if fp.HasField('LCSC') else ''
        if ref.startswith(NOT_ASSEMBLED) or not code:
            continue
        name = str(fp.GetFPID().GetUniStringLibId())
        if (name, code) in seen:
            continue
        seen[(name, code)] = ref
        lib = library_pads(code)
        if not lib:
            problems += lib is None
            print('%-7s %-10s %-52s %s' % (ref, code, name[:52], 'NO ANSWER FROM THE LIBRARY' if lib is None else
                                           'not checked: the library has no footprint for this part'))
            continue
        pads = [(p.GetNumber(), pcbnew.ToMM(p.GetFPRelativePosition().x), pcbnew.ToMM(p.GetFPRelativePosition().y))
                for p in fp.Pads() if p.GetNumber()]
        if name in ANY_PAD:
            pads, lib = [('', x, y) for _n, x, y in pads], [('', x, y) for _n, x, y in lib]
        renumber, tolerance = GROUND_PADS.get((name, code), ({}, TOLERANCE))
        angle, worst = fit(pads, [(renumber.get(n, n), x, y) for n, x, y in lib])
        listed = JLC_ROTATION.get((name, code), 0)
        if worst > tolerance:
            verdict = 'PADS DO NOT MATCH (%.2f mm off)' % worst
        elif angle != listed % 360:
            verdict = 'TURNED BY %d, export_fab.JLC_ROTATION has %d' % (angle, listed)
        else:
            verdict = 'ok' + (' (placement angle corrected by %d)' % listed if listed else '')
        problems += verdict.split()[0] != 'ok'
        print('%-7s %-10s %-52s %s' % (ref, code, name[:52], verdict))
    print('%d footprint and part number pairs checked, %d problems' % (len(seen), problems))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
