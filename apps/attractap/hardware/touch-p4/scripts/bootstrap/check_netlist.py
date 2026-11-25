"""Compare a netlist exported by KiCad from the schematic with design.py, and check the I2C buses.

Usage: check_netlist.py <netlist.net>   (kicad-cli sch export netlist --format kicadsexpr)
"""
import sys

import design
import libs
from sexpr import find, first, loads


# 7-bit I2C address of every part that may sit on an I2C bus, by part value. A part that is not listed
# here fails the check, so adding a device forces a look at the address map. (On an earlier reader an
# IO expander and the PN532 both answered at 0x24.) The function gets a pin -> net lookup.
I2C_MASTER = 'ESP32-P4NRW32X'
I2C_ADDRESS = {
    'TCA9554PWR': lambda net: (0x20 + sum(1 << bit for bit, pin in enumerate('123') if net(pin) == '+3V3'),),
    'PN5321A3HN/C106': lambda net: (0x24,),
    'LCD 40P 0.5mm': lambda net: (0x5D, 0x14),      # GT911 on the panel: one of the two, set by TP_INT at reset
    'LIS2DH12TR': lambda net: (0x18 if net('3') == 'GND' else 0x19,),    # SA0: pulled up unless grounded
    'VCNL4040M3OE': lambda net: (0x60,),            # fixed
}
I2C_STRAPS = {'TCA9554PWR': '123'}                  # address pins: each must be tied to GND or +3V3
# Parts on a bus that do not answer on it: ESD diode arrays
I2C_SILENT = {'USBLC6-2SC6'}


def i2c_buses(got, values):
    """Print the devices on every I2C bus (a net named ..._SCL) and return the number of problems."""
    errs = 0
    for scl in sorted({n for n in got.values() if n.endswith('_SCL')}):
        used, line = {}, []
        for ref in sorted({r for (r, _pin), n in got.items() if n == scl}):
            value = values[ref]
            if value == I2C_MASTER or value in I2C_SILENT or ref.rstrip('0123456789') in ('R', 'TP'):
                continue                              # the master, ESD arrays, pull-ups, test points
            if value not in I2C_ADDRESS:
                errs += 1
                print('I2C      %s (%s) is on %s but has no entry in I2C_ADDRESS' % (ref, value, scl))
                continue
            for pin in I2C_STRAPS.get(value, ''):
                if got.get((ref, pin)) not in ('GND', '+3V3'):
                    errs += 1
                    print('I2C      %s.%s address pin is on %s, not on GND or +3V3' % (ref, pin, got.get((ref, pin))))
            addrs = I2C_ADDRESS[value](lambda pin: got.get((ref, pin)))
            line.append('%s %s %s' % (ref, value, ' or '.join('0x%02X' % a for a in addrs)))
            for a in addrs:
                if a in used:
                    errs += 1
                    print('I2C      address 0x%02X on %s is used by %s and %s' % (a, scl, used[a], ref))
                used[a] = ref
        print('I2C bus %-9s %s' % (scl[:-4] + ':', '; '.join(line) or 'no devices'))
    return errs


def main(path):
    d = libs.resolve(design.build())
    want = {}
    for p in d.parts.values():
        for pin, net in p.nets.items():
            want[(p.ref, pin)] = net
    tree = loads(open(path, encoding='utf-8').read())
    got = {}
    for net in find(first(tree, 'nets'), 'net'):
        name = first(net, 'name')[1].split('/')[-1]      # drop the sheet path
        for node in find(net, 'node'):
            ref = first(node, 'ref')[1]
            if ref.startswith('#'):
                continue
            got[(ref, first(node, 'pin')[1])] = name
    errs = 0
    for key, net in sorted(want.items()):
        g = got.get(key)
        if g != net:
            errs += 1
            if errs <= 40:
                print('MISMATCH %s.%s: design %s, schematic %s' % (key[0], key[1], net, g))
    for key, g in sorted(got.items()):
        if key not in want and not g.startswith('unconnected-'):
            errs += 1
            if errs <= 40:
                print('EXTRA    %s.%s on %s' % (key[0], key[1], g))
    values = {first(c, 'ref')[1]: first(c, 'value')[1] for c in find(first(tree, 'components'), 'comp')}
    comps = set(values)
    errs += i2c_buses(got, values)
    missing = set(d.parts) - comps
    if missing:
        errs += len(missing)
        print('parts missing in schematic:', sorted(missing)[:20])
    print('%d pins compared, %d problems' % (len(want), errs))
    return errs


if __name__ == '__main__':
    sys.exit(1 if main(sys.argv[1]) else 0)
