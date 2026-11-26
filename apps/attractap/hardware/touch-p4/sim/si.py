"""Reflections on the fast single-ended lines: ngspice with transmission lines of the routed lengths.

No IBIS models are published for these chips. A driver is a ramp behind a resistance; the ESP32-P4's pad
drivers come out at about 17, 33 and 66 ohm for drive strength 3, 2 (the default) and 1, from the output
currents in its data sheet. A receiver is a capacitance without clamp diodes, so overshoot is the worst
case. The impedance and delay of the tracks come from field2d.py."""
import numpy as np

import spice
from board import value

VDD = 3.3
C_VIA = 0.35e-12
FLEX = (60.0, 5.5e-9)       # the display's flex tail: about 60 ohm
# what is driven: (name, nets from the driver to the receiver, clock or toggle frequency, receiver pF, mm of flex)
LINES = [
    ('RMII clock, PHY to MCU', ('PHY_CLK50', 'RMII_REF_CLK'), 50e6, 4, 0),
    ('RMII RXD0, PHY to MCU', ('PHY_RXD0', 'RMII_RXD0'), 25e6, 4, 0),
    ('RMII TXD0, MCU to PHY', ('RMII_TXD0',), 25e6, 5, 0),
    ('RMII TXD1, MCU to PHY', ('RMII_TXD1',), 25e6, 5, 0),
    ('RMII TX_EN, MCU to PHY', ('RMII_TX_EN',), 25e6, 5, 0),
    ('SDIO clock, MCU to Wi-Fi module', ('SDIO_CLK_M', 'SDIO_CLK'), 40e6, 5, 0),
    ('SDIO D3, MCU to Wi-Fi module', ('SDIO_D3',), 20e6, 5, 0),
    ('flash clock', ('FLASH_CK_M', 'FLASH_CK'), 80e6, 6, 0),
    ('display clock, MCU to panel', ('LCD_PCLK_M', 'LCD_PCLK'), 18e6, 8, 30),
]


# The SDIO link to the Wi-Fi module, from the MCU's pads to the module's: clock first.
SDIO = [('CLK', ('SDIO_CLK_M', 'SDIO_CLK'))] + [(n, ('SDIO_' + n,)) for n in ('CMD', 'D0', 'D1', 'D2', 'D3')]
# the SDIO lines from pad to pad, without the stubs to their pull-ups (a 51 k resistor at the end of 1 to 2 mm
# of track, a fraction of a picofarad)
ENDS = {'SDIO_CLK_M': ('U201', 'R304'), 'SDIO_CLK': ('R304', 'U301'),
        **{'SDIO_' + n: ('U201', 'U301') for n in ('CMD', 'D0', 'D1', 'D2', 'D3')}}
SD_OUTPUT_DELAY = 14e-9     # a high-speed SD card may take this long from the clock edge to valid data


def series_resistor(board, a, b):
    """Ohms of the resistor (or resistor array) that joins two nets, from the circuit description."""
    for p in board.parts.values():
        if p.ref[0] == 'R' and {a, b} <= set(p.nets.values()):
            return value(p.value)
    raise ValueError('no resistor between %s and %s' % (a, b))


def deck(board, lines, nets, freq, c_rx, flex_mm, r_drv, edge):
    per, ramp = 1 / freq, edge / 0.8
    out = ['* reflections', 'V1 src 0 PULSE(0 %g 1n %g %g %g %g)' % (VDD, ramp, ramp, per / 2 - ramp, per),
           'Rdrv src n0 %g' % r_drv, 'Cdrv n0 0 2p']
    node, k = 'n0', 0
    for i, net in enumerate(nets):
        if i:
            r = series_resistor(board, nets[i - 1], net)
            out.append('Rs%d %s n%d %g' % (i, node, k + 1, max(r, 1e-3)))
            node, k = 'n%d' % (k + 1), k + 1
        lengths = board.path_by_layer(net, *ENDS[net]) if net in ENDS else board.length_by_layer(net)
        segments = [(lines[layer], mm) for layer, mm in sorted(lengths.items())]
        if flex_mm and net == nets[-1]:
            segments.append((FLEX, flex_mm))
        for (z0, delay), mm in segments:
            out += ['T%d %s 0 n%d 0 Z0=%g TD=%g' % (k, node, k + 1, z0, mm * 1e-3 * delay), 'Cv%d n%d 0 %g' % (k, k + 1, C_VIA)]
            node, k = 'n%d' % (k + 1), k + 1
    out += ['Crx %s 0 %gp' % (node, c_rx), 'Rrx %s 0 1meg' % node, '.tran 10p %g 0 10p' % (1e-9 + 2.2 * per)]
    return '\n'.join(out), node


def reflections(board, lines, name, r_drv, edge=1e-9):
    """(overshoot above VDD, lowest level after the first peak of a high half-period), in volts."""
    _n, nets, freq, c_rx, flex = next(l for l in LINES if l[0] == name)
    text, node = deck(board, lines, nets, freq, c_rx, flex, r_drv, edge)
    t, (v,) = spice.waveform(text, node)
    t0 = 1e-9 + 1 / freq                                    # second period: the line has found its rhythm
    high = v[(t >= t0) & (t < t0 + 0.5 / freq)]
    return max(high.max() - VDD, 0.0), high[np.argmax(high):].min()


def delay(board, lines, nets, r_drv=33, edge=1e-9, c_rx=5):
    """Seconds from the middle of the driver's edge to the middle of the edge at the receiver."""
    freq = 50e6                 # one short run: the line has 10 ns to settle after the edge
    text, node = deck(board, lines, nets, freq, c_rx, 0, r_drv, edge)
    t, (v,) = spice.waveform(text, node)
    rising = t < 1e-9 + 0.4 / freq
    return float(np.interp(VDD / 2, v[rising], t[rising])) - (1e-9 + edge / 0.8 / 2)


def sdio_timing(board, lines):
    """What the board adds to the SDIO timing: ({line: delay}, largest difference between the clock and
    a data line, round trip of the clock out and the slowest data line back)."""
    delays = {name: delay(board, lines, nets) for name, nets in SDIO}
    data = [d for name, d in delays.items() if name != 'CLK']
    skew = max(abs(d - delays['CLK']) for d in data)
    return delays, skew, delays['CLK'] + max(data)
