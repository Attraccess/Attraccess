"""Collect the 3D models of the board's footprints into kicad/lib/attractap.3dshapes and write lib_models.py.

Usage (on a machine with network access; needs curl and uv for easyeda2kicad):
    python3 scripts/bootstrap/collect_models.py <cache-dir> [--fetch]

--fetch downloads what the cache does not hold yet: the EasyEDA (JLCEDA) conversion of each LCSC part with
easyeda2kicad (one part every 25 s, because EasyEDA refuses bursts), and KiCad's packages3D model of each
footprint taken from KiCad's library. Without --fetch the script only reads the cache. It then stores each
model as gzip-compressed STEP (<footprint>.stpz, which KiCad reads) and writes scripts/bootstrap/lib_models.py
with where each model sits on its footprint. Run `pcb.sh generate-library --refit` afterwards to attach them.
"""
import glob
import gzip
import math
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BOARD = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(BOARD, 'kicad/lib/attractap.3dshapes')
sys.path.insert(0, HERE)
import design  # noqa: E402
import model_fit  # noqa: E402

PACKAGES3D = 'https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/master/%s.3dshapes/%s.step'
# whose conversion gives the model for a footprint, where it is not the fitted part's own
SOURCE = {'attractap:QFN-40_L6.0-W6.0-P0.50-BL-EP': 'C28925'}          # footprint of the NXP PN532
# attractap footprints copied from a KiCad footprint, which brings its model
KICAD_MODEL = {'attractap:LED_SK6812MINI-E_ReverseMount_Clear':
               'LED_SMD:LED_SK6812MINI-E_3.2x2.8mm_P1.5mm_ReverseMount'}
NO_MODEL = {'attractap:NFC_Antenna_4T'}        # copper only
# no model from the maker or EasyEDA: an envelope box, drawn by hand and kept in attractap.3dshapes
ENVELOPE = {'attractap:PWRM-SMD_DP9900M-5V': 'envelope after SDAPO DP9900 datasheet 4.1: 21.2 x 14.0 mm, '
                                             '13.35 mm seated height, transformer block 6.15 / 7.1 mm from the ends'}


def pads(text):
    out = {}
    for m in re.finditer(r'\(pad "?([^"\s]+)"? \w+ \w+\s*\(at ([-\d.]+) ([-\d.]+)', text):
        out.setdefault(m.group(1), []).append((float(m.group(2)), float(m.group(3))))
    return out


def model_block(text):
    m = re.search(r'\(model "?([^"\s]+)"?\s*\(offset \(xyz ([-\d.]+) ([-\d.]+) ([-\d.]+)\)\)\s*\(scale[^)]*\)\)\s*'
                  r'\(rotate \(xyz ([-\d.]+) ([-\d.]+) ([-\d.]+)\)\)', text)
    if not m:
        return None
    return m.group(1), tuple(float(v) for v in m.groups()[1:4]), tuple(float(v) for v in m.groups()[4:7])


def footprints():
    """footprint -> LCSC number of the first part that uses it"""
    fps = {}
    for p in design.build().parts.values():
        fps.setdefault(p.fp, p.lcsc)
    return fps


def fetch(cache, fps):
    for fp, lcsc in sorted(fps.items()):
        lib, name = fp.split(':')
        if fp in NO_MODEL or fp in ENVELOPE or not lcsc and lib != 'attractap':
            continue
        if lib != 'attractap' or fp in KICAD_MODEL:
            lib, name = KICAD_MODEL.get(fp, fp).split(':')
            dst = os.path.join(cache, 'kicad', name + '.step')
            if not os.path.exists(dst):
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                subprocess.run(['curl', '-sfL', PACKAGES3D % (lib, name), '-o', dst], check=True)
            continue
        lc = SOURCE.get(fp, lcsc)
        d = os.path.join(cache, 'easyeda', lc)
        if glob.glob(os.path.join(d, 'lcsc.3dshapes', '*.step')):
            continue
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'log.txt'), 'w') as log:
            subprocess.run(['uvx', 'easyeda2kicad', '--lcsc_id', lc, '--full', '--output', os.path.join(d, 'lcsc')],
                           stdout=log, stderr=subprocess.STDOUT, timeout=180)
        time.sleep(25)


def step_box(path, arcs):
    """bounding box of a STEP body from its vertices (and, with arcs, the extremes of its circles)"""
    t = re.sub(r'\s+', ' ', open(path, errors='ignore').read())
    ent = dict(re.findall(r"#(\d+)\s*=\s*([A-Z_0-9]+\s*\(.*?\))\s*;", t))

    def pt(i):
        m = re.search(r"\(\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*\)", ent[i])
        return [float(v) for v in m.groups()]
    lo, hi = [1e9] * 3, [-1e9] * 3

    def add(p, r=(0, 0, 0)):
        for k in range(3):
            lo[k], hi[k] = min(lo[k], p[k] - r[k]), max(hi[k], p[k] + r[k])
    for e in ent.values():
        if e.startswith('VERTEX_POINT'):
            add(pt(re.search(r'#(\d+)', e).group(1)))
        elif arcs and e.startswith('CIRCLE'):
            ax, r = re.search(r"#(\d+)\s*,\s*([-\d.Ee+]+)\s*\)", e).groups()
            refs = re.findall(r'#(\d+)', ent[ax])
            c, d = pt(refs[0]), (pt(refs[1]) if len(refs) > 1 else [0, 0, 1])
            n = math.sqrt(sum(v * v for v in d)) or 1
            add(c, [float(r) * math.sqrt(max(0, 1 - (d[k] / n) ** 2)) for k in range(3)])
    return lo, hi


def vrml_box(path):
    """bounding box of easyeda2kicad's VRML mesh, in mm (VRML units are 0.1 inch)"""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for blk in re.findall(r'point\s*\[([^\]]*)\]', open(path).read()):
        nums = [float(v) * 2.54 for v in re.findall(r'[-\d.Ee+]+', blk)]
        for i in range(0, len(nums) - 2, 3):
            for k in range(3):
                lo[k], hi[k] = min(lo[k], nums[i + k]), max(hi[k], nums[i + k])
    return lo, hi


def step_shift(step, vrml):
    """EasyEDA's STEP files are not always placed like the VRML that easyeda2kicad writes for the footprint
    (some are centred on their own box). The shift that puts the STEP where the VRML is, in model
    coordinates; None when the two bodies differ in size."""
    w = vrml_box(vrml)
    for arcs in (False, True):          # vertices miss the top of a round body: then the arcs give it
        s = step_box(step, arcs)
        if all(abs((s[1][k] - s[0][k]) - (w[1][k] - w[0][k])) <= 0.05 for k in range(3)):
            return [round((w[0][k] + w[1][k] - s[0][k] - s[1][k]) / 2, 2) for k in range(3)]
    return None


def easyeda_model(cache, fp, lc, name):
    """(step file, offset, rotation) of the EasyEDA model, moved onto our footprint"""
    conv = glob.glob(os.path.join(cache, 'easyeda', lc, 'lcsc.pretty', '*.kicad_mod'))
    steps = glob.glob(os.path.join(cache, 'easyeda', lc, 'lcsc.3dshapes', '*.step'))
    vrmls = glob.glob(os.path.join(cache, 'easyeda', lc, 'lcsc.3dshapes', '*.wrl'))
    if not conv or not steps or not vrmls:
        return None
    gen = open(conv[0]).read()
    mb = model_block(gen)
    shift = step_shift(steps[0], vrmls[0])
    if not mb or shift is None:
        return None
    _path, off, rot = mb
    # KiCad turns the model by -rot (z) and then moves it by the offset
    a = math.radians(-rot[2])
    sx, sy = shift[0] * math.cos(a) - shift[1] * math.sin(a), shift[0] * math.sin(a) + shift[1] * math.cos(a)
    ours = open(os.path.join(BOARD, 'kicad/lib/attractap.pretty', name + '.kicad_mod')).read()
    p_ours, p_gen = pads(ours), pads(gen)
    all_ours = [q for v in p_ours.values() for q in v]
    all_gen = [q for v in p_gen.values() for q in v]
    dx = dy = 0.0
    if sorted(p_ours) == sorted(p_gen) and len(all_ours) == len(all_gen):
        # the same pads: centre on their centroid (pad spacings may differ slightly)
        dx = sum(q[0] for q in all_ours) / len(all_ours) - sum(q[0] for q in all_gen) / len(all_gen)
        dy = sum(q[1] for q in all_ours) / len(all_ours) - sum(q[1] for q in all_gen) / len(all_gen)
    elif '1' in p_ours and '1' in p_gen:
        a = min(p_ours['1'], key=lambda q: (q[1], q[0]))
        b = min(p_gen['1'], key=lambda q: (q[1], q[0]))
        dx, dy = a[0] - b[0], a[1] - b[1]
    # footprint y points down, model y up
    off = tuple(round(v, 3) + 0.0 for v in (off[0] + sx + dx, off[1] + sy - dy, off[2] + shift[2]))
    # the converter misplaces some models: move those onto their pads and holes
    off, fit, moved = model_fit.fit(model_fit.step_vertices(steps[0]), off, rot, model_fit.pad_rects(ours))
    if fit < model_fit.GOOD:
        print('%s: the model does not fit its footprint (%.2f)' % (name, fit))
        return None
    return steps[0], tuple(v + 0.0 for v in off), rot, moved


HEADER = '''"""3D models of the footprints: kicad/lib/attractap.3dshapes/<footprint>.stpz (gzip-compressed STEP).

Sources: the JLCEDA/EasyEDA official library (https://easyeda.com, https://lceda.cn), fetched with
easyeda2kicad for the footprints converted from it; KiCad's packages3D library
(https://gitlab.com/kicad/libraries/kicad-packages3D, CC-BY-SA 4.0 with the design exception) for the
standard footprints. Offset (mm, y up) and rotation (degrees) place a model on its footprint as the
converter placed its VRML (EasyEDA's STEP is shifted to the VRML's box where the two differ), moved
where the footprint's origin differs from the source's (centred on the pads where both have the same
pads, else pad 1 aligned), and moved again where its pins miss the holes or its terminals the pads
(model_fit.py).
Written by collect_models.py; make_lib.py attaches the models. Do not edit by hand."""
'''


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cache = os.path.abspath(sys.argv[1])
    fps = footprints()
    if '--fetch' in sys.argv:
        fetch(cache, fps)
    os.makedirs(OUT, exist_ok=True)
    table, missing = {}, []
    for fp, lcsc in sorted(fps.items()):
        lib, name = fp.split(':')
        if fp in NO_MODEL or not lcsc and lib != 'attractap':
            continue
        if fp in ENVELOPE:
            kept = os.path.exists(os.path.join(OUT, name + '.stpz'))
            if kept:
                table[name] = (ENVELOPE[fp], (0, 0, 0), (0, 0, 0))
            else:
                missing.append(fp)
            continue
        if lib != 'attractap' or fp in KICAD_MODEL:
            src_name = KICAD_MODEL.get(fp, fp).split(':')[1]
            src = os.path.join(cache, 'kicad', src_name + '.step')
            entry = (src, 'KiCad packages3D, %s.step' % src_name, (0, 0, 0), (0, 0, 0))
        else:
            lc = SOURCE.get(fp, lcsc)
            got = easyeda_model(cache, fp, lc, name)
            src = got[0] if got else ''
            note = '' if not got or got[3] == (0.0, 0.0) else \
                ', moved %.2f, %.2f mm onto its pads' % got[3]
            entry = got and (src, 'EasyEDA (JLCEDA) library %s, via easyeda2kicad%s' % (lc, note), got[1], got[2])
        if not entry or not os.path.exists(src):
            missing.append(fp)
            continue
        with open(src, 'rb') as f, open(os.path.join(OUT, name + '.stpz'), 'wb') as g:
            g.write(gzip.compress(f.read(), 9, mtime=0))
        table[name] = entry[1:]
    lines = [HEADER, 'MODELS = {']
    for name, (src, off, rot) in sorted(table.items()):
        lines.append('    %r: (%r, %r, %r),' % (name, src, tuple(off), tuple(rot)))
    lines.append('}')
    with open(os.path.join(HERE, 'lib_models.py'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('models: %d, %.1f MB, missing: %s' % (len(table), total / 1e6, missing or 'none'))
    if missing:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
