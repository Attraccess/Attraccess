"""Impedance of the MCU's supply rails seen from its pins: a lumped model.

Every capacitor is C + ESR + ESL plus the inductance of its way to the pins: the track from its pad to
its via (0.3 nH/mm over the ground plane 0.1 mm below), the pair of vias through the board,
L = mu0 h / pi * ln(s / r), and the spreading in the plane, mu0 h / (2 pi) * ln(d / r). The distances are
read from the routed board. The chip's package and its own capacitance are not in the model."""
import collections
import math

import numpy as np

from board import MU0, short

# value: (capacitance left at the rail's voltage, ESR, ESL of the part)
PART = {'22u': (18e-6, 0.004, 0.6e-9), '10u': (7e-6, 0.006, 0.5e-9), '4.7u': (3.5e-6, 0.008, 0.5e-9),
        '1u': (0.8e-6, 0.015, 0.35e-9), '100n': (90e-9, 0.03, 0.35e-9), '10n': (10e-9, 0.08, 0.35e-9)}
MCU = 'U201'


def via_pair(depth_mm, spacing_mm=1.2, radius_mm=0.1):
    return MU0 * depth_mm * 1e-3 / math.pi * math.log(spacing_mm / radius_mm)


def rail(board, net, plane, plane_gap_mm):
    """([(ref, value, C, ESR, L, mm from the MCU)], [inductance of each MCU pin's way to the plane])."""
    depth = board.depth[plane]
    vias = [(v['x'], v['y']) for v in board.net_vias(net)]
    mcu = board.footprint(MCU)
    val = {f['ref']: f['value'] for f in board.footprints}
    caps, pins = [], []
    for p in board.net_pads(net):
        to_via = min((math.hypot(p['x'] - x, p['y'] - y) for x, y in vias), default=None)
        if to_via is None:
            continue
        if p['ref'] == MCU:
            pins.append(0.3e-9 * to_via + via_pair(depth, 1.5))
        elif p['ref'][0] == 'C' and val[p['ref']] in PART:
            c, esr, esl = PART[val[p['ref']]]
            far = math.hypot(p['x'] - mcu['x'], p['y'] - mcu['y'])
            spread = MU0 * plane_gap_mm * 1e-3 / (2 * math.pi) * math.log(max(far, 1.0) / 0.15)
            caps.append((p['ref'], val[p['ref']], c, esr, esl + 0.3e-9 * to_via + via_pair(depth) + spread, far))
    return [c for c in caps if c[5] < 25], pins


def impedance(caps, pins, f, one_pin=False):
    w = 2 * np.pi * f
    z = 1 / sum(1 / (esr + 1j * w * l + 1 / (1j * w * c)) for _r, _v, c, esr, l, _d in caps)
    return np.abs(z + 1j * w * (max(pins) if one_pin else 1 / sum(1 / l for l in pins)))


def summary(board, net, plane, plane_gap_mm):
    caps, pins = rail(board, net, plane, plane_gap_mm)
    kinds = collections.Counter(c[1] for c in caps)
    f = 3e8
    return {'capacitors': ', '.join('%d x %s' % (n, v) for v, n in kinds.items()), 'pins': len(pins),
            'pin_nh': np.mean(pins) * 1e9, 'nearest_mm': min(c[5] for c in caps),
            'rail_nh': impedance(caps, pins, f) / (2 * np.pi * f) * 1e9,
            'pin_alone_nh': impedance(caps, pins, f, one_pin=True) / (2 * np.pi * f) * 1e9,
            'z': {x: impedance(caps, pins, x) for x in (1e6, 1e7, 1e8)}}
