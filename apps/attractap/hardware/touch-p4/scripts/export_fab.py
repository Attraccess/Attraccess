"""Export manufacturing files for JLCPCB from the KiCad project into ../fab.

Reads only the KiCad files, so it keeps working after the project is edited in KiCad.

Output:
  fab/jlcpcb/                      what goes to JLCPCB (committed, so an order can be traced)
    attractap-touch-p4-gerbers.zip   Gerber and drill files, for the PCB order
    attractap-touch-p4-fab.pdf       fabrication drawing: outline, stack-up, drill table, notes
    attractap-touch-p4-assembly.pdf  assembly drawing: designators, pin 1 and polarity, detail sheets
    attractap-touch-p4.ipc           IPC-D-356 netlist, for the fab's electrical test
    bom-<variant>.csv                assembly parts list: Comment, Designator, Footprint, LCSC Part #, then
                                     Manufacturer, Manufacturer Part, Description, Alternate, Lifecycle
    cpl-<variant>.csv                Designator, Mid X, Mid Y, Layer, Rotation
    parts-list-<variant>.csv         everything to buy for a reader: the assembly list plus the parts that
                                     JLCPCB does not fit (the display panel)
  fab/gerbers/                     the files inside the zip, for a Gerber viewer
  fab/schematic.pdf, fab/board-front.pdf, fab/board-back.pdf

Variants: a schematic symbol with the field ``Variant = lan`` is only fitted on the
Ethernet/PoE version. Symbols marked DNP are never fitted.

The package does not change when the design has not: creation dates are taken out of the
Gerber and drill files and the zip has fixed time stamps.

Usage: tools/pcb.sh export          (or python3 export_fab.py with kicad-cli on PATH or in $KICAD_CLI)
"""
import csv
import os
import re
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bootstrap'))
import parts_info  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', 'kicad'))
FAB = os.path.normpath(os.path.join(HERE, '..', 'fab'))
NAME = 'attractap-touch-p4'
CLI = os.environ.get('KICAD_CLI') or (
    os.path.join(os.environ['KICAD'], 'bin', 'kicad-cli') if os.environ.get('KICAD') else 'kicad-cli')
VARIANTS = {'wifi': {''}, 'lan': {'', 'lan'}}
NOT_ASSEMBLED = ('TP', 'H', 'FID', 'ANT')          # bare copper / holes, nothing to place


def copper_layers(pcb):
    """The board's copper layers, top to bottom, as the board file lists them (four or six)."""
    text = open(pcb, encoding='utf-8').read()
    inner = sorted(set(re.findall(r'^\t\t\(\d+ "(In\d+\.Cu)"', text, re.M)), key=lambda name: int(name[2:-3]))
    return ','.join(['F.Cu'] + inner + ['B.Cu'])


# JLCPCB counts a part's angle from the orientation of its own library footprint for that part number
# (the JLCEDA/EasyEDA library, https://easyeda.com). Most footprints of this board were converted from
# that library, so KiCad's angle is JLCPCB's. For these it is not: (footprint, LCSC number) -> degrees
# to add, counter-clockwise. Found by comparing every footprint pad by pad with the library entry of
# its part number (scripts/check_jlc_footprints.py); run that again when a part number or a footprint
# changes.
JLC_ROTATION = {
    ('Package_TO_SOT_SMD:SOT-23', 'C20917'): 180,          # KiCad draws pin 3 on the right, the library on the left
    ('Package_TO_SOT_SMD:SOT-23', 'C140921'): 180,         # the hall switch: the same
    ('Package_TO_SOT_SMD:SOT-23', 'C67272'): 180,          # the ideal diodes' MOSFETs: the same
    ('Package_TO_SOT_SMD:SOT-23', 'C132016'): 180,         # the supervisor: the same
    ('Package_LGA:LGA-12_2x2mm_P0.5mm', 'C110926'): 270,   # accelerometer: the library starts pin 1 on another side
    ('Resistor_SMD:R_Array_Convex_4x0402', 'C25501'): 90,  # KiCad: pads in two columns, library: in two rows
    # The footprint is the one of the NXP PN532 (C28925). The library footprint of the Tokmas part is
    # drawn a quarter turn on from it.
    ('attractap:QFN-40_L6.0-W6.0-P0.50-BL-EP', 'C53457895'): 90,
    # the same for the level shifter: footprint of the 74AHCT1G125 (C7484), part 74LV1T125
    ('attractap:SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR', 'C473338'): 90,
}


def run(*args):
    print('+ kicad-cli', ' '.join(args[:3]))
    subprocess.run([CLI] + list(args), check=True, stdout=subprocess.DEVNULL)


def zip_gerbers(folder, target):
    """Zip the Gerber and drill files. Creation dates are removed and the time stamps fixed, so the
    zip only changes when the board does."""
    dated = re.compile(r'^(?:%TF\.CreationDate.*|G04 #@! TF\.CreationDate.*|; #@! TF\.CreationDate.*)\n|'
                       r'(?<=[ }])date \d{4}-\d\d-\d\d[ T][\d:]+(?:[+-][\d:]+)?', re.M)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in sorted(os.listdir(folder)):
            if name.endswith('.gbrjob'):                 # KiCad's job file; JLCPCB does not use it
                continue
            path = os.path.join(folder, name)
            text = dated.sub('', open(path, encoding='utf-8').read())
            open(path, 'w', encoding='utf-8').write(text)
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, text)


def main():
    pcb = os.path.join(PROJECT, NAME + '.kicad_pcb')
    sch = os.path.join(PROJECT, NAME + '.kicad_sch')
    gerbers = os.path.join(FAB, 'gerbers')
    shutil.rmtree(gerbers, ignore_errors=True)        # no files of an earlier export in the order
    os.makedirs(gerbers)
    # Settings as in JLCPCB's KiCad guide: Protel file extensions, Excellon drill files in millimetres with
    # absolute origin, oval holes in "alternate" mode (KiCad's default), plated and unplated holes apart.
    run('pcb', 'export', 'gerbers', '--layers',
        copper_layers(pcb) + ',F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts',
        '--subtract-soldermask', '--check-zones', '-o', gerbers + os.sep, pcb)
    run('pcb', 'export', 'drill', '--format', 'excellon', '--excellon-units', 'mm', '--excellon-oval-format',
        'alternate', '--excellon-separate-th', '-o', gerbers + os.sep, pcb)
    jlc = os.path.join(FAB, 'jlcpcb')
    shutil.rmtree(jlc, ignore_errors=True)
    os.makedirs(jlc)
    zip_gerbers(gerbers, os.path.join(jlc, NAME + '-gerbers.zip'))
    # IPC-D-356 netlist for the fab's electrical test, without its creation date
    ipc = os.path.join(jlc, NAME + '.ipc')
    run('pcb', 'export', 'ipcd356', '-o', ipc, pcb)
    text = open(ipc, encoding='utf-8').read()
    open(ipc, 'w', encoding='utf-8').write(re.sub(r'^C  .*(Date|DATE|date).*\n', '', text, flags=re.M))
    # fabrication drawing (fab_drawing.py reads the board with pcbnew)
    subprocess.run([sys.executable, os.path.join(HERE, 'fab_drawing.py'), pcb, os.path.join(jlc, NAME + '-fab.pdf')],
                   check=True)
    # assembly drawing: every part with its designator, pin 1 and polarity; detail sheets of the dense areas
    subprocess.run([sys.executable, os.path.join(HERE, 'assembly_drawing.py'), pcb,
                    os.path.join(jlc, NAME + '-assembly.pdf')], check=True)
    pos = os.path.join(FAB, 'positions.csv')
    run('pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'both', '-o', pos, pcb)
    parts = os.path.join(FAB, 'parts.csv')
    fields = 'Reference,Value,Footprint,LCSC,MPN,Variant,Manufacturer,BOM description,Alternate,Lifecycle'
    run('sch', 'export', 'bom', '--fields', fields, '--labels', fields, '--exclude-dnp', '-o', parts, sch)
    run('sch', 'export', 'pdf', '-o', os.path.join(FAB, 'schematic.pdf'), sch)
    run('pcb', 'export', 'pdf', '--layers', 'F.Cu,F.SilkS,F.Fab,Edge.Cuts,Dwgs.User', '--mode-single',
        '-o', os.path.join(FAB, 'board-front.pdf'), pcb)
    run('pcb', 'export', 'pdf', '--layers', 'B.Cu,B.SilkS,Edge.Cuts,Dwgs.User', '--mode-single', '--mirror',
        '-o', os.path.join(FAB, 'board-back.pdf'), pcb)

    rows = [r for r in csv.DictReader(open(parts)) if not r['Reference'].startswith(NOT_ASSEMBLED)]
    positions = {r['Ref']: r for r in csv.DictReader(open(pos))}
    missing = sorted(r['Reference'] for r in rows if not r['LCSC'])
    if missing:
        print('WARNING: no LCSC number on', ', '.join(missing))
    for variant, tags in VARIANTS.items():
        fitted = [r for r in rows if r['Variant'] in tags]
        # One line per LCSC part: JLCPCB warns when two lines name the same part (the RESET and
        # BOOT buttons are one part with two values). The values become the comment.
        groups = {}
        for r in fitted:
            values, refs, row = groups.setdefault((r['Footprint'].split(':')[-1], r['LCSC'], r['MPN']), ([], [], r))
            if r['Value'] not in values:
                values.append(r['Value'])
            refs.append(r['Reference'])
        header = ['Comment', 'Designator', 'Footprint', 'LCSC Part #', 'Manufacturer', 'Manufacturer Part',
                  'Description', 'Alternate', 'Lifecycle']
        lines = []
        for (fp, lcsc, mpn), (values, refs, row) in sorted(groups.items(), key=lambda kv: kv[1][1][0]):
            lines.append([' / '.join(values), ','.join(refs), fp, lcsc, row['Manufacturer'], mpn,
                          row['BOM description'], row['Alternate'], row['Lifecycle']])
        with open(os.path.join(jlc, 'bom-%s.csv' % variant), 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(lines)
        with open(os.path.join(jlc, 'parts-list-%s.csv' % variant), 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['Quantity'] + header + ['Assembled by'])
            for line in lines:
                w.writerow([len(line[1].split(','))] + line + ['JLCPCB'])
            for variants, qty, item, mfr, mpn, desc, alt in parts_info.NOT_ASSEMBLED:
                if variant in variants:
                    w.writerow([qty, item, '', '', '', mfr, mpn, desc, alt, '', 'by hand'])
        with open(os.path.join(jlc, 'cpl-%s.csv' % variant), 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
            for r in fitted:
                p = positions.get(r['Reference'])
                if p is None:
                    print('WARNING: %s is in the schematic but has no position on the board' % r['Reference'])
                    continue
                turn = JLC_ROTATION.get((r['Footprint'], r['LCSC']), 0)
                rot = '%.6f' % ((float(p['Rot']) + turn + 180) % 360 - 180) if turn else p['Rot']
                w.writerow([r['Reference'], p['PosX'] + 'mm', p['PosY'] + 'mm',
                            'Top' if p['Side'].lower().startswith('top') else 'Bottom', rot])
        print('%s: %d parts, %d BOM lines' % (variant, len(fitted), len(groups)))


if __name__ == '__main__':
    sys.exit(main())
