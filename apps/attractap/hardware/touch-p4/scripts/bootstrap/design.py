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
import parts_info

STD_FP = {
    'R0402': 'Resistor_SMD:R_0402_1005Metric',
    'R0603': 'Resistor_SMD:R_0603_1608Metric',
    'R1206': 'Resistor_SMD:R_1206_3216Metric',
    'C0402': 'Capacitor_SMD:C_0402_1005Metric',
    'C0603': 'Capacitor_SMD:C_0603_1608Metric',
    'C0805': 'Capacitor_SMD:C_0805_2012Metric',
    'C1206': 'Capacitor_SMD:C_1206_3216Metric',
    'C1808': 'Capacitor_SMD:C_1808_4520Metric',
    'C2211': 'attractap:C_2211_5728Metric_Y2',
}

# Passives: (kind, value, size) -> (LCSC number, manufacturer, part number, rating). The manufacturer and
# part number are LCSC's (EasyEDA part data); the rating is decoded from the maker's part-number code
# (Samsung CL: dielectric A = X5R, B = X7R, C = C0G; voltage P 10 V, O 16 V, A 25 V, B 50 V, C 100 V).
# Capacitors show their rating on the schematic; resistors where the tolerance matters (show=True).
UR, SEM, FH, YG, MU = 'UNI-ROYAL (Uniroyal Elec)', 'Samsung Electro-Mechanics', 'Fenghua (FH)', 'YAGEO', 'Murata'
R0402, R0603, R1206 = '1% 62.5mW', '1% 0.1W', '1% 0.25W'
PASSIVES = {
    ('R', '0R', '0402'): ('C17168', UR, '0402WGF0000TCE', 'jumper 62.5mW'),
    ('R', '22R', '0402'): ('C25092', UR, '0402WGF220JTCE', R0402),
    ('R', '33R', '0402'): ('C25105', UR, '0402WGF330JTCE', R0402),
    ('R', '100R', '0402'): ('C25076', UR, '0402WGF1000TCE', R0402),
    ('R', '1k', '0402'): ('C11702', UR, '0402WGF1001TCE', R0402),
    ('R', '1.5k', '0402'): ('C25867', UR, '0402WGF1501TCE', R0402),
    ('R', '2.2k', '0402'): ('C25879', UR, '0402WGF2201TCE', R0402),
    ('R', '3.9k', '0402'): ('C51721', UR, '0402WGF3901TCE', R0402),
    ('R', '4.7k', '0402'): ('C25900', UR, '0402WGF4701TCE', R0402),
    ('R', '5.1k', '0402'): ('C25905', UR, '0402WGF5101TCE', R0402),
    ('R', '6.19k', '0402'): ('C25914', UR, '0402WGF6191TCE', R0402),
    ('R', '10k', '0402'): ('C25744', UR, '0402WGF1002TCE', R0402),
    ('R', '51k', '0402'): ('C25794', UR, '0402WGF5102TCE', R0402),
    ('R', '100k', '0402'): ('C25741', UR, '0402WGF1003TCE', R0402),
    # Espressif's checklist for chip revision v3.x: the two 499 k of the core converter's divider "must be
    # populated" (ESP32-P4 Hardware Design Guidelines v2.0)
    ('R', '499k', '0402'): ('C25793', UR, '0402WGF4993TCE', R0402),
    ('R', '1.5R', '0603'): ('C22769', UR, '0603WAF150KT5E', R0603),
    ('R', '5.1R', '0603'): ('C25197', UR, '0603WAF510KT5E', R0603),
    ('R', '1M', '1206'): ('C17927', UR, '1206W4F1004T5E', R1206),
    ('C', '10p', '0402'): ('C32949', SEM, 'CL05C100JB5NNNC', '50V C0G'),
    ('C', '12p', '0402'): ('C1547', FH, '0402CG120J500NT', '50V C0G'),
    ('C', '18p', '0402'): ('C1549', FH, '0402CG180J500NT', '50V C0G'),
    ('C', '22p', '0402'): ('C1555', FH, '0402CG220J500NT', '50V C0G'),
    ('C', '39p', '0402'): ('C106223', YG, 'CC0402JRNPO9BN390', '50V C0G'),
    ('C', '180p', '0402'): ('C106999', YG, 'CC0402JRNPO9BN181', '50V C0G'),
    ('C', '220p', '0402'): ('C71693', MU, 'GRM1555C1H221JA01D', '50V C0G'),
    ('C', '1n', '0402'): ('C1523', FH, '0402B102K500NT', '50V X7R'),
    ('C', '10n', '0402'): ('C15195', SEM, 'CL05B103KB5NNNC', '50V X7R'),
    ('C', '100n', '0402'): ('C1525', SEM, 'CL05B104KO5NNNC', '16V X7R'),
    ('C', '1u', '0402'): ('C52923', SEM, 'CL05A105KA5NQNC', '25V X5R'),
    ('C', '4.7u', '0603'): ('C19666', SEM, 'CL10A475KO8NNNC', '16V X5R'),
    ('C', '10u', '0603'): ('C19702', SEM, 'CL10A106KP8NNNC', '10V X5R'),
    ('C', '1u/50V', '0603'): ('C15849', SEM, 'CL10A105KB8NNNC', '50V X5R'),
    ('C', '22u', '0805'): ('C45783', SEM, 'CL21A226MAQNNNE', '25V X5R'),
    ('C', '10u/25V', '0805'): ('C15850', SEM, 'CL21A106KAYNNNE', '25V X5R'),
    # IEEE 802.3 33.4.1: the PD withstands 1500 V RMS (2.1 kV peak) or 2250 V DC for 60 s. Across the PoE
    # barrier a certified Y2 capacitor (proof test 2000 V AC, 60 s); the shield capacitor 3 kV.
    ('C', '1n', '2211'): ('C91599', MU, 'GA352QR7GF102KW01L', 'Y2 250VAC X7R'),
    ('C', '1n', '1808'): ('C967608', FH, '1808B102K302NT', '3kV X7R'),
    ('C', '2.2u/100V', '1206'): ('C170101', SEM, 'CL31B225KCHSNNE', '100V X7R'),
}
LCSC = {k: v[0] for k, v in PASSIVES.items()}
TOLERANCE = {'C0G': '5%', 'X5R': '10%', 'X7R': '10%'}


def passive_desc(kind, value, size, rating):
    """The parts-list description of a passive, e.g. 'MLCC 100nF 16V X7R 10% 0402'."""
    v = value.split('/')[0]
    if kind == 'C':
        diel = rating.split()[-1]
        tol = '20%' if v == '22u' else TOLERANCE.get(diel, '')
        return 'MLCC %sF %s %s %s' % (v, rating, tol, size)
    if v == '0R':
        return 'Thick-film jumper 0R %s %s' % (rating.split()[-1], size)
    return 'Thick-film resistor %s %s %s' % (v.replace('R', ''), rating, size)


NOT_FITTED = ('TP', 'H', 'FID', 'ANT')     # bare copper and holes: nothing to buy or place


class Part:
    def __init__(self, ref, value, sym, fp, nets, sheet, lcsc='', mpn='', variant='', dnp=False,
                 nc=(), desc='', group='', units=None, extra=None, mfr=''):
        self.ref = ref
        self.value = value
        self.sym = sym          # 'lib:name'
        self.fp = fp            # 'lib:name'
        self.nets = dict(nets)  # pin number -> net name
        self.nc = set(nc)       # pin numbers deliberately unconnected
        self.sheet = sheet
        self.lcsc = lcsc
        self.mpn = mpn
        self.mfr = mfr          # manufacturer of mpn
        self.show_rating = False  # show the Rating field on the schematic
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
        known = parts_info.info(p.lcsc)
        if known:
            mfr, desc, lifecycle, alternate = known
            p.mfr = p.mfr or mfr
            p.extra.setdefault('BOM description', desc)
            if lifecycle:
                p.extra.setdefault('Lifecycle', lifecycle)
            p.extra.setdefault('Alternate', alternate)
        self.parts[ref] = p
        return p

    # --- passives -----------------------------------------------------------
    def _passive(self, kind, value, size, kw):
        entry = PASSIVES.get((kind, value, size))
        if 'lcsc' in kw:                    # a part outside the table: the call names it
            assert kw.get('mpn') and kw.get('mfr') and kw.get('rating'), ('passive without data', kind, value)
            entry = (kw.pop('lcsc'), kw.pop('mfr'), kw.pop('mpn'), kw.pop('rating'))
        assert entry, ('no part number for', kind, value, size)
        lcsc, mfr, mpn, rating = entry
        show = kw.pop('show', kind == 'C')
        extra = dict(kw.pop('extra', {}))
        # a value that names its voltage already (10u/25V) shows only the dielectric beside it
        extra['Rating'] = rating.split()[-1] if kind == 'C' and '/' in value else rating
        extra['BOM description'] = passive_desc(kind, value, size, rating)
        extra['Alternate'] = parts_info.EQUIVALENT
        part = dict(lcsc=lcsc, mfr=mfr, mpn=mpn, extra=extra)
        part.update(kw)
        return part, show

    def R(self, value, a, b, size='0402', **kw):
        kw, show = self._passive('R', value, size, kw)
        p = self.add('R', value, 'Device:R', STD_FP['R' + size], {'1': a, '2': b}, **kw)
        p.show_rating = show
        return p

    def C(self, value, a, b='GND', size='0402', **kw):
        kw, show = self._passive('C', value, size, kw)
        p = self.add('C', value, 'Device:C', STD_FP['C' + size], {'1': a, '2': b}, **kw)
        p.show_rating = show
        return p

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
