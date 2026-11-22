"""Attractap Touch P4: circuit description (parts and nets).

This description is the single source the schematic and the PCB were first
generated from. The parts themselves are listed sheet by sheet in
circuit_core.py and circuit_io.py; this file holds the part model, the passive
part numbers and build(). Every part lists its nets by pin NUMBER (or by pin
name for the large ICs, resolved against the symbol library), so the schematic
and the board cannot drift apart.

Variants: a part tagged ``lan`` is only fitted on the Ethernet/PoE version.
"""
from collections import OrderedDict

import circuit_core
import circuit_io

STD_FP = {
    'R0402': 'Resistor_SMD:R_0402_1005Metric',
    'R0603': 'Resistor_SMD:R_0603_1608Metric',
    'R1206': 'Resistor_SMD:R_1206_3216Metric',
    'C0402': 'Capacitor_SMD:C_0402_1005Metric',
    'C0603': 'Capacitor_SMD:C_0603_1608Metric',
    'C0805': 'Capacitor_SMD:C_0805_2012Metric',
    'C1206': 'Capacitor_SMD:C_1206_3216Metric',
}

# JLCPCB / LCSC part numbers for passives: (kind, value, size) -> LCSC
LCSC = {
    ('R', '0R', '0402'): 'C17168', ('R', '22R', '0402'): 'C25092', ('R', '33R', '0402'): 'C25105',
    ('R', '100R', '0402'): 'C25076', ('R', '1k', '0402'): 'C11702', ('R', '1.5k', '0402'): 'C25867',
    ('R', '2.2k', '0402'): 'C25879', ('R', '2.7k', '0402'): 'C25885', ('R', '4.7k', '0402'): 'C25900',
    ('R', '5.1k', '0402'): 'C25905', ('R', '10k', '0402'): 'C25744', ('R', '51k', '0402'): 'C25794',
    ('R', '100k', '0402'): 'C25741', ('R', '510k', '0402'): 'C11616', ('R', '6.19k', '0402'): 'C25914',
    ('R', '1.5R', '0603'): 'C22769', ('R', '5.1R', '0603'): 'C25197',
    ('R', '100R', '1206'): 'C17901', ('R', '1M', '1206'): 'C17927',
    ('C', '12p', '0402'): 'C1547', ('C', '18p', '0402'): 'C1549', ('C', '22p', '0402'): 'C1555',
    ('C', '39p', '0402'): 'C106223', ('C', '180p', '0402'): 'C106999', ('C', '220p', '0402'): 'C71693',
    ('C', '1n', '0402'): 'C1523', ('C', '10n', '0402'): 'C15195', ('C', '100n', '0402'): 'C1525',
    ('C', '1u', '0402'): 'C52923', ('C', '4.7u', '0603'): 'C19666', ('C', '10u', '0603'): 'C19702',
    ('C', '1u/50V', '0603'): 'C15849', ('C', '22u', '0805'): 'C45783', ('C', '10u/25V', '0805'): 'C15850',
    ('C', '1n/2kV', '1206'): 'C9196', ('C', '2.2u/100V', '1206'): 'C170101',
}


NOT_FITTED = ('TP', 'H', 'FID', 'ANT')     # bare copper and holes: nothing to buy or place


class Part:
    def __init__(self, ref, value, sym, fp, nets, sheet, lcsc='', mpn='', variant='', dnp=False,
                 nc=(), desc='', group='', units=None, extra=None):
        self.ref = ref
        self.value = value
        self.sym = sym          # 'lib:name'
        self.fp = fp            # 'lib:name'
        self.nets = dict(nets)  # pin number -> net name
        self.nc = set(nc)       # pin numbers deliberately unconnected
        self.sheet = sheet
        self.lcsc = lcsc
        self.mpn = mpn
        self.variant = variant  # '' = always fitted, 'lan' = Ethernet/PoE version only
        self.dnp = dnp          # never fitted (tuning / option footprint)
        self.desc = desc
        self.extra = dict(extra or {})   # further fields on the symbol and the footprint
        self.group = group      # sub-block heading on the schematic sheet
        # symbol unit -> (sheet, group); single-unit parts have only unit 1
        self.units = units or {1: (sheet, group)}


class Design:
    def __init__(self):
        self.parts = OrderedDict()
        self._count = {}
        self.sheet = None
        self.base = 0
        self.grp = ''

    def begin(self, sheet, base):
        self.sheet = sheet
        self.base = base
        self.grp = ''

    def group(self, title, sheet=None):
        """Start a sub-block; ``sheet`` moves the following parts to another sheet (numbering continues)."""
        self.grp = title
        if sheet:
            self.sheet = sheet

    def ref(self, prefix):
        key = (prefix, self.base)
        self._count[key] = self._count.get(key, 0) + 1
        return '%s%d' % (prefix, self.base + self._count[key])

    def add(self, prefix, value, sym, fp, nets, **kw):
        ref = kw.pop('ref', None)
        while ref is None or ref in self.parts:
            ref = self.ref(prefix)
        sheet = kw.pop('sheet', None) or self.sheet
        kw.setdefault('group', self.grp)
        p = Part(ref, value, sym, fp, nets, sheet, **kw)
        self.parts[ref] = p
        return p

    # --- passives -----------------------------------------------------------
    def R(self, value, a, b, size='0402', **kw):
        lc = kw.pop('lcsc', LCSC.get(('R', value, size), ''))
        assert lc or kw.get('dnp'), ('no LCSC for R', value, size)
        return self.add('R', value, 'Device:R', STD_FP['R' + size], {'1': a, '2': b}, lcsc=lc, **kw)

    def C(self, value, a, b='GND', size='0402', **kw):
        lc = kw.pop('lcsc', LCSC.get(('C', value, size), ''))
        assert lc or kw.get('dnp'), ('no LCSC for C', value, size)
        return self.add('C', value, 'Device:C', STD_FP['C' + size], {'1': a, '2': b}, lcsc=lc, **kw)

    def FB(self, a, b, big=False, **kw):
        if big:
            return self.add('FB', '600R@100MHz 2A', 'Device:FerriteBead', 'attractap:L0805',
                            {'1': a, '2': b}, lcsc='C21519', mpn='MPZ2012S601AT000', **kw)
        return self.add('FB', '600R@100MHz', 'Device:FerriteBead', 'attractap:L0603',
                        {'1': a, '2': b}, lcsc='C85833', mpn='BLM18KG601SN1D', **kw)

    def TP(self, net, label, sheet=None, group='Test points'):
        return self.add('TP', label, 'Connector:TestPoint', 'TestPoint:TestPoint_Pad_D1.5mm', {'1': net},
                        sheet=sheet, group=group)


def build():
    """All parts, sheet by sheet. The order of the calls fixes the reference designators."""
    d = Design()
    for sheet in (circuit_core.power, circuit_core.mcu, circuit_core.wifi,
                  circuit_io.eth, circuit_io.nfc, circuit_io.display, circuit_io.ui, circuit_io.mech):
        sheet(d)
    return d


if __name__ == '__main__':
    d = build()
    nets = {}
    for p in d.parts.values():
        for pin, n in p.nets.items():
            nets.setdefault(n, []).append('%s.%s' % (p.ref, pin))
    print(len(d.parts), 'parts,', len(nets), 'nets')
    single = sorted(n for n, pins in nets.items() if len(pins) == 1)
    print('single-pin nets:', single)
