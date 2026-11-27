"""Runs every simulation on the routed board and compares the results with the limits of the parts.

Usage: run.py <board.json>      (the JSON that dump_board.py writes; tools/pcb.sh simulate does both)
Needs numpy and ngspice (NGSPICE names the program if it is not on the PATH). Exit code 1 if a limit
is missed. What is modelled, and what is not, is in docs/en/hardware/touch-p4/simulations.md."""
import sys

import numpy as np

import dock
import field2d
import irdrop
import isolation
import nfc_loop
import nfc_match
import pdn
import shorted_turn
import si
import spice
import test_solvers
import thermal
from board import Board, geometry, short

failed = []


def check(ok, text):
    print('   %s %s' % ('ok  ' if ok else 'FAIL', text))
    if not ok:
        failed.append(text)


def solvers():
    print('Field solvers against closed-form results')
    for what, got, want, tol in test_solvers.cases():
        check(abs(got / want - 1) <= tol, '%s: %.1f, expected %.1f' % (what, got, want))


def nfc(board):
    print('NFC loop at 13.56 MHz (4 turns, from the antenna footprint)')
    free = nfc_loop.loop(board, copper=False)
    on_board = nfc_loop.loop(board)
    on_metal = nfc_loop.loop(board, wall=nfc_loop.WALL_BEHIND)
    bridged = nfc_loop.loop(board, bridge=True)
    for label, (l, r) in (('in free air', free), ('on the board, wall of wood or stone', on_board),
                          ('on the board, metal wall %d mm behind the loop' % nfc_loop.WALL_BEHIND, on_metal),
                          ('with metal across the gap in the copper around it', bridged)):
        print('   %-52s %.3f uH, %.2f ohm' % (label, l * 1e6, r))
    # the field solver against two published closed forms for the loop alone (Mohan et al. 1999, 2-3 %)
    for name, l in zip(('modified Wheeler formula', 'current-sheet expression'), nfc_loop.closed_forms()):
        check(abs(free[0] / l - 1) < 0.06, 'in free air by the %s (Mohan et al. 1999): %.3f uH, the solver %+.1f %%'
              % (name, l * 1e6, (free[0] / l - 1) * 100))
    # no closed copper round the loop, on any layer: every net alone, and the supply nets together
    for what, closes in shorted_turn.check(board):
        check(not closes, 'no closed copper round the loop: %s' % what)
    for passes, what in shorted_turn.crossings(board):
        check(passes, what)
    # no mounting hole (a metal screw and insert) in the gap of the copper round it
    gx1, gy1, gx2, gy2 = geometry.NFC_GAP
    r = geometry.MOUNT_KEEPOUT_R
    check(not any(gx1 - r < hx < gx2 + r and gy1 - r < hy < gy2 + r for hx, hy in geometry.MOUNT_HOLES),
          'no mounting hole within %.1f mm of the gap in the copper round the loop' % r)

    p = nfc_match.parts(board)
    print('   matching: series %g pF, parallel %s pF, damping %g ohm, receive divider %g k / %g k; loop capacitance %.1f pF'
          % (p['C1'] * 1e12, ' + '.join('%g' % (c * 1e12) for c in p['C2']), p['Rq'], p['R2'] / 1e3, p['R1'] / 1e3,
             nfc_loop.C_LOOP * 1e12))
    for label, (l, r) in (('wall of wood or stone', on_board), ('metal wall', on_metal)):
        z, supply, v_rx, i_loop = nfc_match.operate(p, l, r, nfc_loop.C_LOOP)
        many_i, many_v = nfc_match.spread(p, l, r, nfc_loop.C_LOOP)
        print('   %s: load %.0f %+.0fj ohm, transmitter %.0f mA, receiver input %.1f Vpp, loop %.0f mA peak'
              % (label, z.real, z.imag, supply * 1e3, v_rx, i_loop * 1e3))
        check(supply < nfc_match.I_LIMIT and (many_i > nfc_match.I_LIMIT).mean() < 0.01,
              '%s: transmitter below 100 mA (parts of 5 %%: %.1f %% of boards above)' % (label, 100 * (many_i > nfc_match.I_LIMIT).mean()))
        check((many_i > nfc_match.I_MAX).mean() < 0.001, '%s: transmitter below its limiting value of 150 mA (%.2f %% above)'
              % (label, 100 * (many_i > nfc_match.I_MAX).mean()))
        check(v_rx < nfc_match.RX_MAX and (many_v > nfc_match.RX_MAX).mean() < 0.01,
              '%s: receiver input below 4 Vpp (%.1f %% of boards above)' % (label, 100 * (many_v > nfc_match.RX_MAX).mean()))
        check(i_loop ** 2 / 2 * p['Rq'] < 0.1, '%s: %.0f mW in each damping resistor, rated 100 mW' % (label, i_loop ** 2 / 2 * p['Rq'] * 1e3))
    # the field a card finds in front of the reader: ISO/IEC 14443 asks for 1.5 to 7.5 A/m
    d = np.arange(nfc_loop.FRONT, 60.0, 0.5)
    for label, (l, r), wall in (('wall of wood or stone', on_board, None), ('metal wall', on_metal, nfc_loop.WALL_BEHIND)):
        i_loop = nfc_match.operate(p, l, r, nfc_loop.C_LOOP)[3]
        h = nfc_loop.field(board, d, wall=wall).min(axis=1) * i_loop / np.sqrt(2)
        reach = d[np.argmax(h < nfc_loop.H_MIN)] - (nfc_loop.FRONT - 0.4)
        check(h[0] < nfc_loop.H_MAX and reach > 10,
              '%s: %.1f A/m at a card on the case (limit 7.5), 1.5 A/m up to %.0f mm in front of the case'
              % (label, h[0], reach))
    safe = [l for l in np.arange(0.90, 1.50, 0.01)
            if (nfc_match.spread(p, l * 1e-6, on_board[1], nfc_loop.C_LOOP, n=4000)[0] > nfc_match.I_LIMIT).mean() < 0.01]
    print('   with parts of 5 %% the transmitter stays below 100 mA for a loop of %.2f to %.2f uH' % (safe[0], safe[-1]))
    l, r = on_board
    z, supply, v_rx, _ = nfc_match.operate(p, l, r, nfc_loop.C_LOOP)
    m = spice.run('nfc_tx.cir', la=l, ra=r, ca=nfc_loop.C_LOOP, l0=p['L0'], c0=p['C0'], c1=p['C1'], c2=sum(p['C2']),
                  rq=p['Rq'], r2=p['R2'], r1=p['R1'])
    check(abs(m['p_supply'] / nfc_match.TVDD[1] / supply - 1) < 0.2,
          'time domain with all harmonics: %.0f mA, %.1f Vpp at the receiver (formula: %.0f mA, %.1f Vpp)'
          % (m['p_supply'] / nfc_match.TVDD[1] * 1e3, m['rx_max'] - m['rx_min'], supply * 1e3, v_rx))


def dc_input():
    print('DC input: a live supply is plugged in (converter limit 40 V for 0.4 s; target 5 V below it, TVS at '
          'the top of its range, C120 at -20 %)')
    cables = (('1.5 m of 2 x 0.35 mm2', 1.1e-6, 0.15), ('3 m of 2 x 0.75 mm2', 2.25e-6, 0.142),
              ('5 m of 2 x 1.5 mm2', 3.45e-6, 0.119), ('10 m of 2 x 1.5 mm2', 6.9e-6, 0.237))
    for volt in (24, 26.4):
        for name, l, r in cables:
            peak = max(spice.run('dc_hotplug.cir', vsup=volt, lcab=l, rcab=r, esr=e)['v_converter']
                       for e in (0.1, 0.8))
            check(peak < 35, '%.1f V, %s: %.1f V at the converter at most (C120 with 0.1 or 0.8 ohm ESR)'
                  % (volt, name, peak))
    m = spice.run('dc_hotplug.cir', vsup=28, esr=0.1)
    print('        28.0 V, 5 m of 2 x 1.5 mm2: %.1f V at the converter, %.1f A in the TVS' % (m['v_converter'], m['i_tvs']))


def dc_surge():
    print('DC input: a surge while the board runs (EN 50130-4 line-to-earth: 1.2/50 us behind 42 ohm, here '
          'across the input; converter limit 40 V for 0.4 s, D105 100 V, TVS at the top of their range)')
    for volt in (12, 24, 26.4, 28):
        for kv in (1000, -1000):
            m = max((spice.run('dc_surge.cir', vsup=volt, vs=abs(kv), pol=1 if kv > 0 else -1, esr=e, lsat=l)
                     for e in (0.1, 0.8) for l in (2.2e-6, 0.1e-6)), key=lambda r: r['v_converter'])
            check(m['v_converter'] < 40 and m['v_d105_rev'] > -80,
                  '%4.1f V, %+.0f V: %.1f V at the converter, D105 %.0f V reverse, TVS %.1f A (input) %.1f A '
                  '(converter), converter input down to %.1f V' % (
                      volt, kv, m['v_converter'], -m['v_d105_rev'], max(m['i_tvs1'], -m['i_tvs1_fwd']),
                      m['i_tvs'], m['v_converter_min']))


def power_up():
    print('Power-up from USB through the eFuse (reset must stay low until the 3.3 V rail has been steady for 50 us)')
    # 3.3 V loads (U103, U302): a running board with the Wi-Fi module receiving, 0.45 A in all, from a good and
    # a weak USB source; and 1.1 A in all with the module sending
    for volt, cable, load, wifi in ((5.0, 0.25, 0.33, 0.12), (4.5, 0.5, 0.33, 0.12), (5.0, 0.25, 0.67, 0.43)):
        m = spice.run('powerup.cir', vusb=volt, rcable=cable, iload=load, iwifi=wifi)
        wait = m['t_reset_ends'] - m['t_rail_ok']
        # the MCU drives nothing before the Wi-Fi module's rail is up: its reset ends after that, by the
        # supervisor's delay (2 ms here, 120 to 280 ms in the part)
        order = m['t_reset_ends'] - m['t_wifi_ok']
        check(m['reset_at_rail_ok'] < 0.25 * 3.3 and wait > 50e-6 and m['v5_running'] > 3.8 and m['v33_running'] > 3.2
              and order > 1e-3 and m['t_c5_en'] > m['t_wifi_ok'] and m['v33w_running'] > 3.2,
              '%.1f V behind %.2f ohm, %.2f + %.2f A at 3.3 V: rail up after %.1f ms, reset released %.1f ms later '
              '(supervisor delay shortened to 2 ms; the part has 120 to 280 ms), running at %.2f V on the 5 V rail; '
              'Wi-Fi rail up after %.1f ms, the module\'s EN %.1f ms after that, %.2f V with it running'
              % (volt, cable, load, wifi, m['t_rail_ok'] * 1e3, wait * 1e3, m['v5_running'], m['t_wifi_ok'] * 1e3,
                 (m['t_c5_en'] - m['t_wifi_ok']) * 1e3, m['v33w_running']))
    m = spice.run('powerup.cir')
    check(m['i_slew'] < 0.1, 'USB attach: %.1f A for microseconds into C101 (10 uF, what USB 2.0 7.2.4.1 allows '
          'at attach), then %.0f mA while the eFuse ramps the 5 V rail at 0.91 V/ms' % (m['i_inrush'], m['i_slew'] * 1e3))


def supply_switch():
    print('Changing supplies while the board runs (supervisor resets below 2.87 to 2.99 V; 0.9 A on +5V, '
          '0.6 A at 3.3 V: 0.17 A on +3V3, 0.43 A on +3V3_WIFI; the module stands 3.0 V)')
    cases = (('DC, USB plugged in, DC pulled', dict(tdc_on=0, tdc_off=6e-3, tusb_on=2e-3)),
             ('USB at 4.75 V, DC at 5.05 V plugged in and pulled', dict(tusb_on=1e-4, tdc_on=2e-3, tdc_off=6e-3,
                                                                       vusb=4.75, vdc=5.05)),
             ('PoE, DC plugged in, PoE pulled', dict(tpoe_on=0, tdc_on=2e-3, tpoe_off=6e-3)),
             ('PoE and USB at 4.75 V, PoE pulled', dict(tpoe_on=0, tusb_on=1e-4, tpoe_off=6e-3, vusb=4.75)))
    for name, kw in cases:
        m = spice.run('switchover.cir', **kw)
        check(m['v33_min'] > 2.99 and m['v33w_min'] > 3.0, '%s: +5V at least %.2f V, +3V3 at least %.2f V, '
              '+3V3_WIFI at least %.2f V' % (name, m['v5_min'], m['v33_min'], m['v33w_min']))
    m = spice.run('switchover.cir', tdc_on=0, tusb_on=1)
    check(m['usb_back'] < 0.8, 'running on DC, USB unplugged: VBUS at %.0f mV (a USB-C host wants below 0.8 V)'
          % (m['usb_back'] * 1e3))
    m = spice.run('switchover.cir', tusb_on=1e-4)
    check(m['dc_back'] < 0.5, 'running on USB: the DC converter\'s output at %.0f mV' % (m['dc_back'] * 1e3))


def signals(board):
    lines = field2d.board_lines(board)
    print('Fast lines (0.15 mm track: %s)' % ', '.join('%s %.0f ohm, %.2f ps/mm' % (k, z, d * 1e9) for k, (z, d) in lines.items()
                                                       if k != 'B.Cu'))
    for name, nets, *_ in si.LINES:
        length = sum(sum(board.length_by_layer(n).values()) for n in nets)
        over, back = si.reflections(board, lines, name, 33)
        over3, back3 = si.reflections(board, lines, name, 17)
        check(over < 0.5 and back > 0.8 * si.VDD,
              '%-32s %3.0f mm: overshoot %.2f V, back to %.2f V (strongest drive: %.2f V, %.2f V)' % (name, length, over, back, over3, back3))


def pair_geometry(board, pos, neg, layer):
    """(track width, edge gap) of a routed pair on one layer, in metres: the most common width, and the
    median distance from the middle of each straight piece of one line to the other line."""
    def segs(net):
        return [t for t in board.net_tracks(net) if t['layer'] == layer]
    def dist(px, py, t):
        dx, dy = t['x2'] - t['x1'], t['y2'] - t['y1']
        L = dx * dx + dy * dy
        u = 0 if L == 0 else max(0.0, min(1.0, ((px - t['x1']) * dx + (py - t['y1']) * dy) / L))
        return np.hypot(px - t['x1'] - u * dx, py - t['y1'] - u * dy)
    p, n = segs(pos), segs(neg)
    widths = [round(t['w'], 3) for t in p + n]
    w = max(set(widths), key=widths.count)
    centre = [min(dist((t['x1'] + t['x2']) / 2, (t['y1'] + t['y2']) / 2, o) for o in n)
              for t in p if np.hypot(t['x2'] - t['x1'], t['y2'] - t['y1']) > 1.0]
    return w * 1e-3, (float(np.median(centre)) - w) * 1e-3


def controlled_lines(board):
    """The lines the order asks the fab to hold to an impedance, as routed, from the 2D field solution.
    JLCPCB holds +-10 %; USB 2.0 wants 90 ohm +-15 % between D+ and D-, 100BASE-TX 100 ohm +-15 %."""
    print('Controlled-impedance lines as routed (2D field solution, outer layer over the first plane)')
    for name, pos, neg, layer, target in (('USB D+/D-', 'USB_DP', 'USB_DN', 'B.Cu', 90.0),
                                          ('Ethernet transmit pair', 'MDI_TP', 'MDI_TN', 'F.Cu', 100.0),
                                          ('Ethernet receive pair', 'MDI_RP', 'MDI_RN', 'F.Cu', 100.0)):
        w, gap = pair_geometry(board, pos, neg, layer)
        # the plane under a back-layer line lies above it in the stack-up
        below = board.dielectric_above(layer) if layer == 'B.Cu' else board.dielectric_below(layer)
        z, _delay = field2d.pair(below, w, board.copper[layer], gap)
        check(abs(z / target - 1) <= 0.10, '%-24s %.3f mm wide, %.3f mm apart: %.1f ohm differential (target %.0f)'
              % (name, w * 1e3, gap * 1e3, z, target))
    w, _gap = pair_geometry(board, 'MDI_TP', 'MDI_TN', 'F.Cu')
    z0, _delay = field2d.line(board.dielectric_below('F.Cu'), None, w, board.copper['F.Cu'])
    print('        one Ethernet line alone, %.3f mm: %.1f ohm' % (w * 1e3, z0))


def wifi_link(board):
    lines = field2d.board_lines(board)
    delays, skew, round_trip = si.sdio_timing(board, lines)
    print('SDIO link to the Wi-Fi module: what the board adds to the timing')
    print('        MCU to module: ' + ', '.join('%s %.2f ns' % (n, d * 1e9) for n, d in delays.items()))
    lengths = {n: sum(sum(board.path_by_layer(net, *si.ENDS[net]).values()) for net in nets) for n, nets in si.SDIO}
    worst = max((n for n in lengths if n != 'CLK'), key=lambda n: abs(lengths[n] - lengths['CLK']))
    check(abs(lengths[worst] - lengths['CLK']) <= 1.27 and max(lengths.values()) <= 50.8,
          'pad to pad (the clock through its resistor): CLK %.2f mm, %s differs most, by %+.2f mm; Espressif asks '
          'for 1.27 mm at most and 50.8 mm in all (HDG 1.4.9)' % (lengths['CLK'], worst, lengths[worst] - lengths['CLK']))
    check(skew < 0.5e-9, 'clock and data arrive within %.2f ns of each other (tracks %.1f to %.1f mm)'
          % (skew * 1e9, min(lengths.values()), max(lengths.values())))
    for mhz in (40, 50):
        slack = 1e3 / mhz - si.SD_OUTPUT_DELAY * 1e9 - round_trip * 1e9
        check(round_trip < 2e-9, 'at %d MHz: clock out and data back take %.2f ns, which leaves the MCU %.1f ns after a module that answers within 14 ns'
              % (mhz, round_trip * 1e9, slack))
    # Reset of the module: the MCU pulls C5_EN low through a resistor, against the pull-up (on the module's own
    # rail) and the capacitor there. esp-hosted holds the line low for 10 ms; the module needs 50 us below a
    # quarter of its supply.
    series = board.value_of(board.part_between('C5_EN_M', 'C5_EN', 'R')[0])
    pull_up = board.value_of(board.part_between('+3V3_WIFI', 'C5_EN', 'R')[0])
    cap = board.value_of(board.part_between('C5_EN', 'GND', 'C')[0])
    low = 3.3 * series / (series + pull_up)
    tau = series * pull_up / (series + pull_up) * cap
    below = 10e-3 - tau * np.log((3.3 - low) / (0.25 * 3.3 - low)) if low < 0.25 * 3.3 else 0.0
    check(below > 50e-6, 'reset from the MCU: a 10 ms pulse takes the module\'s EN pin to %.2f V and holds it below 0.83 V for %.1f ms'
          % (low, below * 1e3))
    for net in ('SDIO_CMD', 'SDIO_D0', 'SDIO_D1', 'SDIO_D2', 'SDIO_D3'):
        pull = [board.value_of(p) for p in board.part_between('+3V3_WIFI', net, 'R')]
        check(len(pull) == 1 and 10e3 <= pull[0] <= 90e3, '%s has its pull-up (%s)' % (net, ', '.join('%g k' % (r / 1e3) for r in pull) or 'none'))


def poe_isolation(board):
    print('PoE: distance between 48 V copper and all other copper (the port is tested with 1500 V RMS)')
    (along, layer, at), (through, layers, at2) = isolation.distances(board)
    check(isolation.withstand(along) > 1.2 * isolation.TEST_PEAK,
          'along a layer: %.2f mm at the least (%s, at x %.1f y %.1f), good for %.1f kV peak in air; the test reaches %.1f kV'
          % (along, layer.replace('.Cu', ''), at[0], at[1], isolation.withstand(along) / 1e3, isolation.TEST_PEAK / 1e3))
    if through == float('inf'):
        check(True, 'through the board: no other copper on another layer within %.0f mm of the 48 V copper'
              % isolation.REACH)
    else:
        check(through >= along - 0.05, 'through the board: %.2f mm at the least (%s): no 48 V copper lies over or '
              'under other copper' % (through, layers.replace('.Cu', '')))


def heat(board):
    print('Heat in the closed case, estimated (+-40 %): rise over the room')
    for supply in thermal.SUPPLY:
        t, at, parts, on, lcd = thermal.solve(board, supply, 0)
        watts = sum(w[0] for w in parts.values()) + thermal.INTO_THE_AIR[supply][0]
        inside = {ref: at[ref] + parts[ref][0] * thermal.JUNCTION[ref][0] for ref in at if ref in thermal.JUNCTION}
        worst = max(inside, key=lambda ref: inside[ref] - thermal.JUNCTION[ref][1])
        display = thermal.display_rise(t[lcd & on].mean())
        ok = all(40 + inside[ref] < thermal.JUNCTION[ref][1] for ref in inside) and 40 + display < thermal.DISPLAY_MAX
        text = ('%-9s typical use, %.1f W: board +%.0f K (warmest spot +%.0f K), display +%.0f K, %s +%.0f K inside'
                % (supply, watts, t[on].mean(), t.max(), display, worst, inside[worst]))
        if supply == 'PoE':
            ok = ok and 40 + t[on].mean() < thermal.MODULE_AIR_MAX
            text += ', air around the PoE module +%.0f K' % t[on].mean()
        # the Wi-Fi module's air: below the board under it, above the cavity between board and dock plate
        cavity = 0.5 * (1 + thermal.DOCK_SHARE) * t[on].mean()
        ok = ok and 40 + at['U301'] < thermal.WIFI_AIR_MAX
        text += ', Wi-Fi module: board under it +%.0f K, cavity +%.0f K, inside +%.0f K' % (
            at['U301'], cavity, at['U301'] + parts['U301'][0] * thermal.WIFI_INSIDE)
        if 'F102' in at:
            amps = watts / 0.88 / 12
            hold = thermal.fuse_hold(40 + at['F102'])
            ok = ok and hold > 1.5 * amps
            text += ', fuse holds %.2f A against %.2f A' % (hold, amps)
        check(ok, text + ': inside every limit in a room of 40 degC')
        t, at, parts, on, lcd = thermal.solve(board, supply, 1)
        print('        %-9s everything on for a long time, %.1f W: board +%.0f K, LED ring +%.0f K, display +%.0f K, '
              'Wi-Fi module: board under it +%.0f K, cavity +%.0f K'
              % (supply, sum(w[1] for w in parts.values()) + thermal.INTO_THE_AIR[supply][1], t[on].mean(),
                 max(at[ref] for ref in thermal.LEDS), thermal.display_rise(t[lcd & on].mean()), at['U301'],
                 0.5 * (1 + thermal.DOCK_SHARE) * t[on].mean()))


def dock_magnet():
    print('Hall switch and the magnet in the dock (switches on above 4.8 mT, off below 0.5 mT)')
    d = dock.docked_distance()
    weak = dock.field(d, offset=4.0, br=dock.BR[0], warmer=40)
    check(weak > 2 * dock.B_ON, 'on the dock, %.1f mm from the magnet: %.0f mT; with the weakest magnet, 4 mm off its axis and 40 K warmer %.0f mT'
          % (d, dock.field(d) * 1e3, weak * 1e3))
    print('        lifted off: may switch after %.0f mm, has switched for certain after %.0f mm'
          % (dock.lift(dock.B_ON, dock.BR[0]), dock.lift(dock.B_OFF)))


def supply_tracks(board):
    print('Supply tracks with every load at its supply-sizing figure (%.2f A on the 5 V rail)' % sum(irdrop.RAIL_5V.values()))
    for net, source, loads, label in irdrop.CASES:
        drops, busy = irdrop.solve(board, net, source, loads)
        # IPC-2221's heating is for long conductors: a neck shorter than 1 mm between a pad and a wide track
        # (into the eFuse's 0.3 mm power bars) stays at their temperature
        tracks = [x for x in busy if x[1] == 'track' and x[4] > 1.0]
        cur, _k, w, layer, _l = max(tracks, key=lambda x: x[0] / irdrop.ipc2221(board, x[2], x[3]))
        limit = irdrop.ipc2221(board, w, layer)
        text = ('%-8s %-30s %3.0f mV lost; %.2f A in %.2f mm on %s (20 K rise at %.2f A)'
                % (net, label, max(drops.values()) * 1e3, cur, w, layer.replace('.Cu', ''), limit))
        if layer in ('F.Cu', 'B.Cu'):
            check(max(drops.values()) < 0.2 and cur < limit, text)
        else:           # an inner track lies 0.1 mm from a plane that takes its heat: the figure does not apply
            check(max(drops.values()) < 0.2, text + ', next to a plane')


def supply_impedance(board):
    print('Supply impedance at the MCU pins (board only, without the package)')
    for net, plane, gap, label in (('VDD_HP', 'B.Cu', 0.1, 'core rail 1.1 V'), ('+3V3', 'In3.Cu', 0.55, '3.3 V rail')):
        s = pdn.summary(board, net, plane, gap)
        print('        %s: %s within 25 mm, the nearest %.1f mm from the centre; %d pins' % (label, s['capacitors'], s['nearest_mm'], s['pins']))
        print('        %.3f / %.3f / %.2f ohm at 1 / 10 / 100 MHz; above 30 MHz like %.1f nH (%.1f nH for one pin alone)'
              % (s['z'][1e6], s['z'][1e7], s['z'][1e8], s['rail_nh'], s['pin_alone_nh']))


if __name__ == '__main__':
    board = Board(sys.argv[1])
    solvers()
    nfc(board)
    dc_input()
    dc_surge()
    power_up()
    supply_switch()
    signals(board)
    controlled_lines(board)
    wifi_link(board)
    supply_tracks(board)
    supply_impedance(board)
    poe_isolation(board)
    heat(board)
    dock_magnet()
    print('%d limit(s) missed' % len(failed) if failed else 'all limits kept')
    sys.exit(1 if failed else 0)
