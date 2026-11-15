"""Export manufacturing files for JLCPCB from the KiCad project into ../fab (not committed).

Reads only the KiCad files, so it keeps working after the project is edited in KiCad.

Output:
  fab/gerbers/           Gerber and drill files (zip the folder for the PCB order)
  fab/<variant>/bom.csv  Comment, Designator, Footprint, LCSC Part #, Manufacturer Part
  fab/<variant>/bom-external-antenna.csv  the same with the Wi-Fi module that has an antenna connector
  fab/<variant>/cpl.csv  Designator, Mid X, Mid Y, Layer, Rotation
  fab/schematic.pdf, fab/board-front.pdf, fab/board-back.pdf

Variants: a schematic symbol with the field ``Variant = lan`` is only fitted on the
Ethernet/PoE version. Symbols marked DNP are never fitted. A symbol with the fields
``Alt_MPN`` / ``Alt_LCSC`` has a second part that fits the same footprint; it replaces the
normal part in bom-external-antenna.csv.

Usage: tools/pcb.sh export          (or python3 export_fab.py with kicad-cli on PATH or in $KICAD_CLI)
"""
import csv
import os
import shutil
import subprocess
import sys

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


def main():
    pcb = os.path.join(PROJECT, NAME + '.kicad_pcb')
    sch = os.path.join(PROJECT, NAME + '.kicad_sch')
    gerbers = os.path.join(FAB, 'gerbers')
    shutil.rmtree(gerbers, ignore_errors=True)        # no files of an earlier export in the order
    os.makedirs(gerbers)
    run('pcb', 'export', 'gerbers', '--layers',
        COPPER + ',F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts',
        '--no-protel-ext', '--subtract-soldermask', '--check-zones', '-o', gerbers + os.sep, pcb)
    run('pcb', 'export', 'drill', '--format', 'excellon', '--excellon-separate-th', '--generate-map',
        '--map-format', 'gerberx2', '-o', gerbers + os.sep, pcb)
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
        out = os.path.join(FAB, variant)
        os.makedirs(out, exist_ok=True)
        fitted = [r for r in rows if r['Variant'] in tags]
        for name, alt in (('bom.csv', False), ('bom-external-antenna.csv', True)):
            groups = {}
            for r in fitted:
                swap = alt and r.get('Alt_LCSC')
                key = (r['Alt_MPN'] if swap else r['Value'], r['Footprint'].split(':')[-1],
                       r['Alt_LCSC'] if swap else r['LCSC'], r['Alt_MPN'] if swap else r['MPN'])
                groups.setdefault(key, []).append(r['Reference'])
            with open(os.path.join(out, name), 'w', newline='') as f:
                w = csv.writer(f)
                w.writerow(['Comment', 'Designator', 'Footprint', 'LCSC Part #', 'Manufacturer Part'])
                for (value, fp, lcsc, mpn), refs in sorted(groups.items(), key=lambda kv: kv[1][0]):
                    w.writerow([value, ','.join(refs), fp, lcsc, mpn])
        with open(os.path.join(out, 'cpl.csv'), 'w', newline='') as f:
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
