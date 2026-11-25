"""NFC transmit and receive path: the load between TX1 and TX2, the transmitter's supply current and the
voltage at the receiver input, for a given loop and for parts within their tolerance.

Per side: TX - L0 - (C0 to ground) - C1 - (C2 to ground) - Rq - loop. Both sides are equal, so each works
on half the loop. The transmitter is a full bridge that switches TVDD: its supply current is the real
part of the fundamental's current, I = (2/pi) |I1| cos(phi) with I1 = (4/pi) TVDD / (Z + 2 Rdrv). The
receiver input hangs on the node behind L0 of side 2, through the divider R2 / R1.
Part values come from the circuit description; the chip's figures from the PN532 data sheet (rev. 3.6)."""
import numpy as np

from board import value

W = 2 * np.pi * 13.56e6
TVDD = (2.7, 3.0, 3.4)          # regulator output, table 293
RDRV = (2.0, 4.0, 5.0)          # per driver; table 317 gives 5 ohm at most (0.4 V at 80 mA)
I_LIMIT, I_MAX = 0.100, 0.150   # table 295 (operation) and table 290 (limiting value)
RX_MAX = 4.0                    # Vpp at RX: AVDD + 1 V, table 315
R_FILTER = 1.0                  # loss of the filter inductor L0 at 13.56 MHz
TOLERANCE = 0.05                # capacitors and filter inductors


def parts(board):
    """The network's values from the circuit description."""
    one = lambda a, b, kind: [value(p.value) for p in board.part_between(a, b, kind)]
    return {'L0': one('NFC_TX1', 'NFC_F1', 'L')[0], 'C0': one('NFC_F1', 'GND', 'C')[0],
            'C1': one('NFC_F1', 'NFC_M1', 'C')[0], 'C2': one('NFC_M1', 'GND', 'C'),
            'Rq': one('NFC_M1', 'NFC_ANT1', 'R')[0], 'R2': one('NFC_F2', 'NFC_RXC', 'R')[0],
            'R1': one('NFC_RX', 'NFC_VMID', 'R')[0]}


def par(a, b):
    return a * b / (a + b)


def operate(p, la, ra, ca, tvdd=TVDD[1], rdrv=RDRV[1]):
    """(load between TX1 and TX2, supply current, Vpp at RX, peak loop current) for a loop la, ra, ca."""
    c2 = sum(p['C2']) if isinstance(p['C2'], list) else p['C2']
    za = par(ra + 1j * W * la, 1 / (1j * W * ca)) if ca else ra + 1j * W * la
    branch = p['Rq'] + za / 2
    z = par(branch, 1 / (1j * W * c2)) + 1 / (1j * W * p['C1'])
    z = par(z, 1 / (1j * W * p['C0'])) + 1j * W * p['L0'] + R_FILTER
    zt = 2 * z + 2 * rdrv
    i1 = 4 / np.pi * tvdd / zt                                   # fundamental, per side
    supply = 2 / np.pi * np.abs(i1) * np.real(zt) / np.abs(zt)
    v_f = 4 / np.pi * tvdd / 2 - i1 * (rdrv + 1j * W * p['L0'] + R_FILTER)
    v_rx = 2 * np.abs(v_f) * p['R1'] / (p['R1'] + p['R2'])
    v_m = v_f * par(branch, 1 / (1j * W * c2)) / (par(branch, 1 / (1j * W * c2)) + 1 / (1j * W * p['C1']))
    return 2 * z, supply, v_rx, np.abs(v_m / branch)


def spread(p, la, ra, ca, n=20000, seed=1):
    """Supply current and RX voltage of n boards whose parts lie evenly within their tolerance."""
    rng = np.random.default_rng(seed)
    tol = lambda v: v * (1 + TOLERANCE * rng.uniform(-1, 1, n))
    q = dict(p, L0=tol(p['L0']), C0=tol(p['C0']), C1=tol(p['C1']), C2=sum(tol(c) for c in p['C2']))
    _, supply, v_rx, _ = operate(q, la, ra, ca, tvdd=rng.uniform(TVDD[0], TVDD[2], n), rdrv=rng.uniform(RDRV[0], RDRV[2], n))
    return supply, v_rx
