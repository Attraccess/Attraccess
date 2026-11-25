"""Writes the routed board as JSON for the simulations: layer stack, tracks, vias, pads, filled zones
and the copper shapes of the footprints. Runs with KiCad's Python (it needs pcbnew).

Usage: dump_board.py <board.kicad_pcb> <board.json>"""
import json
import re
import sys

import pcbnew

mm = pcbnew.ToMM
SHAPES = {int(pcbnew.PAD_SHAPE_CIRCLE): 'circle', int(pcbnew.PAD_SHAPE_OVAL): 'oval'}     # all others: 'rect'


def stackup(path):
    """[{name, type, thickness, epsilon_r}] from top to bottom, read from the board file's text."""
    text = open(path, encoding='utf-8').read()
    block = text[text.index('(stackup'):text.index('(copper_finish')]
    layers = []
    for name, body in re.findall(r'\(layer "([^"]+)"(.*?)(?=\(layer "|\Z)', block, re.S):
        kind = re.search(r'\(type "([^"]+)"\)', body).group(1)
        thick = re.search(r'\(thickness ([0-9.]+)', body)
        eps = re.search(r'\(epsilon_r ([0-9.]+)', body)
        if thick:
            layers.append({'name': name, 'type': kind, 'thickness': float(thick.group(1)),
                           'epsilon_r': float(eps.group(1)) if eps else None})
    return layers


def outline(chain):
    return [[mm(chain.CPoint(k).x), mm(chain.CPoint(k).y)] for k in range(chain.PointCount())]


def main(src, dst):
    b = pcbnew.LoadBoard(src)
    lname = b.GetLayerName
    out = {'stackup': stackup(src), 'tracks': [], 'vias': [], 'pads': [], 'zones': [], 'footprints': []}
    for t in b.GetTracks():
        if t.GetClass() == 'PCB_VIA':
            p = t.GetPosition()
            out['vias'].append({'net': t.GetNetname(), 'x': mm(p.x), 'y': mm(p.y), 'drill': mm(t.GetDrillValue()),
                                'dia': mm(t.GetWidth(pcbnew.F_Cu))})
        else:
            s, e = t.GetStart(), t.GetEnd()
            out['tracks'].append({'net': t.GetNetname(), 'layer': lname(t.GetLayer()), 'w': mm(t.GetWidth()),
                                  'x1': mm(s.x), 'y1': mm(s.y), 'x2': mm(e.x), 'y2': mm(e.y)})
    for fp in b.GetFootprints():
        p = fp.GetPosition()
        shapes = []
        for g in fp.GraphicalItems():
            if g.GetClass() == 'PCB_SHAPE' and g.GetShape() == pcbnew.SHAPE_T_POLY and lname(g.GetLayer()).endswith('.Cu'):
                poly = g.GetPolyShape()
                shapes.append({'layer': lname(g.GetLayer()), 'poly': [outline(poly.Outline(i)) for i in range(poly.OutlineCount())]})
        out['footprints'].append({'ref': fp.GetReference(), 'value': fp.GetValue(), 'x': mm(p.x), 'y': mm(p.y),
                                  'copper': shapes})
        for pad in fp.Pads():
            pp, ids = pad.GetPosition(), list(pad.GetLayerSet().CuStack())
            size = pad.GetSize(ids[0]) if ids else pcbnew.VECTOR2I(0, 0)
            shape = SHAPES.get(int(pad.GetShape(ids[0])), 'rect') if ids else 'rect'
            out['pads'].append({'ref': fp.GetReference(), 'num': pad.GetNumber(), 'net': pad.GetNetname(),
                                'x': mm(pp.x), 'y': mm(pp.y), 'sx': mm(size.x), 'sy': mm(size.y), 'shape': shape,
                                'rot': pad.GetOrientationDegrees(), 'layers': [lname(l) for l in ids]})
    for z in b.Zones():
        if z.GetIsRuleArea():
            continue
        for lid in z.GetLayerSet().CuStack():
            fill = z.GetFilledPolysList(lid)
            polys = [{'outline': outline(fill.Outline(i)),
                      'holes': [outline(fill.Hole(i, h)) for h in range(fill.HoleCount(i))]}
                     for i in range(fill.OutlineCount())]
            out['zones'].append({'net': z.GetNetname(), 'layer': lname(lid), 'polys': polys})
    json.dump(out, open(dst, 'w'))
    print('%s: %d tracks, %d vias, %d pads, %d zone fills' % (dst, len(out['tracks']), len(out['vias']),
                                                               len(out['pads']), len(out['zones'])))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
