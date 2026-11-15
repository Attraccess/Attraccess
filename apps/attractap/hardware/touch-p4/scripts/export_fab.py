"""Export manufacturing files for JLCPCB from the KiCad project into ../fab.

Reads only the KiCad files, so it keeps working after the project is edited in KiCad.

Output:
  fab/jlcpcb/                      what goes to JLCPCB (committed, so an order can be traced)
    attractap-touch-p4-gerbers.zip   Gerber and drill files, for the PCB order
    bom-<variant>.csv                Comment, Designator, Footprint, LCSC Part #, Manufacturer Part
    bom-<variant>-external-antenna.csv   the same with the Wi-Fi module that has an antenna connector
    cpl-<variant>.csv                Designator, Mid X, Mid Y, Layer, Rotation
  fab/gerbers/                     the files inside the zip, for a Gerber viewer
  fab/schematic.pdf, fab/board-front.pdf, fab/board-back.pdf

Variants: a schematic symbol with the field ``Variant = lan`` is only fitted on the
Ethernet/PoE version. Symbols marked DNP are never fitted. A symbol with the fields
``Alt_MPN`` / ``Alt_LCSC`` has a second part that fits the same footprint; it replaces the
normal part in bom-<variant>-external-antenna.csv.

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

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', 'kicad'))
FAB = os.path.normpath(os.path.join(HERE, '..', 'fab'))
NAME = 'attractap-touch-p4'
CLI = os.environ.get('KICAD_CLI') or (
    os.path.join(os.environ['KICAD'], 'bin', 'kicad-cli') if os.environ.get('KICAD') else 'kicad-cli')
VARIANTS = {'wifi': {''}, 'lan': {'', 'lan'}}
NOT_ASSEMBLED = ('TP', 'H', 'FID', 'ANT')          # bare copper / holes, nothing to place
COPPER = 'F.Cu,In1.Cu,In2.Cu,B.Cu'


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
        COPPER + ',F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts',
        '--subtract-soldermask', '--check-zones', '-o', gerbers + os.sep, pcb)
    run('pcb', 'export', 'drill', '--format', 'excellon', '--excellon-units', 'mm', '--excellon-oval-format',
        'alternate', '--excellon-separate-th', '-o', gerbers + os.sep, pcb)
    jlc = os.path.join(FAB, 'jlcpcb')
    shutil.rmtree(jlc, ignore_errors=True)
    os.makedirs(jlc)
    zip_gerbers(gerbers, os.path.join(jlc, NAME + '-gerbers.zip'))
    pos = os.path.join(FAB, 'positions.csv')
    run('pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--side', 'both', '-o', pos, pcb)
    parts = os.path.join(FAB, 'parts.csv')
    fields = 'Reference,Value,Footprint,LCSC,MPN,Variant,Alt_MPN,Alt_LCSC'
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
        for name, alt in (('bom-%s.csv' % variant, False), ('bom-%s-external-antenna.csv' % variant, True)):
            groups = {}
            for r in fitted:
                swap = alt and r.get('Alt_LCSC')
                key = (r['Alt_MPN'] if swap else r['Value'], r['Footprint'].split(':')[-1],
                       r['Alt_LCSC'] if swap else r['LCSC'], r['Alt_MPN'] if swap else r['MPN'])
                groups.setdefault(key, []).append(r['Reference'])
            with open(os.path.join(jlc, name), 'w', newline='') as f:
                w = csv.writer(f)
                w.writerow(['Comment', 'Designator', 'Footprint', 'LCSC Part #', 'Manufacturer Part'])
                for (value, fp, lcsc, mpn), refs in sorted(groups.items(), key=lambda kv: kv[1][0]):
                    w.writerow([value, ','.join(refs), fp, lcsc, mpn])
        with open(os.path.join(jlc, 'cpl-%s.csv' % variant), 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
            for r in fitted:
                p = positions.get(r['Reference'])
                if p is None:
                    print('WARNING: %s is in the schematic but has no position on the board' % r['Reference'])
                    continue
                w.writerow([r['Reference'], p['PosX'] + 'mm', p['PosY'] + 'mm',
                            'Top' if p['Side'].lower().startswith('top') else 'Bottom', p['Rot']])
        print('%s: %d parts, %d BOM lines' % (variant, len(fitted), len(groups)))


if __name__ == '__main__':
    sys.exit(main())
