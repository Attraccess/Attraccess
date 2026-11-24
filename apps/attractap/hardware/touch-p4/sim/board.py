"""The routed board as the simulations see it: the JSON that dump_board.py writes, with a few helpers."""
import collections
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'scripts', 'bootstrap'))
import design      # noqa: E402  (the circuit description: part values and nets)
import geometry    # noqa: E402  (board coordinates)

OX, OY = 60.0, 30.0                 # the board's origin on the KiCad sheet (scripts/bootstrap/board.py)
RHO_CU = 1.72e-8                    # ohm metre at 20 degC
MU0 = 4e-7 * math.pi


def short(net):
    return net.split('/')[-1]


class Board:
    def __init__(self, path):
        self.__dict__.update(json.load(open(path)))
        self.parts = design.build().parts
        self.copper = {l['name']: l['thickness'] * 1e-3 for l in self.stackup if l['type'] == 'copper'}
        # depth of every copper layer below the top of the board, in millimetres
        self.depth, z = {}, 0.0
        for l in self.stackup:
            if l['type'] == 'copper':
                self.depth[l['name']] = z
            if l['type'] in ('copper', 'core', 'prepreg'):
                z += l['thickness']

    def dielectric_below(self, layer):
        """(thickness in metres, epsilon_r) of the dielectric right under a copper layer."""
        names = [l['name'] for l in self.stackup]
        d = self.stackup[names.index(layer) + 1]
        return d['thickness'] * 1e-3, d['epsilon_r']

    def dielectric_above(self, layer):
        names = [l['name'] for l in self.stackup]
        d = self.stackup[names.index(layer) - 1]
        return d['thickness'] * 1e-3, d['epsilon_r']

    def net_tracks(self, net):
        return [t for t in self.tracks if short(t['net']) == net]

    def net_vias(self, net):
        return [v for v in self.vias if short(v['net']) == net]

    def net_pads(self, net):
        return [p for p in self.pads if short(p['net']) == net]

    def length_by_layer(self, net):
        """Millimetres of track of a net on each layer."""
        out = collections.Counter()
        for t in self.net_tracks(net):
            out[t['layer']] += math.hypot(t['x2'] - t['x1'], t['y2'] - t['y1'])
        return out

    def footprint(self, ref):
        return next(f for f in self.footprints if f['ref'] == ref)

    @staticmethod
    def value_of(part):
        return value(part.value)

    def part_between(self, net_a, net_b, prefix):
        """The parts with reference prefix `prefix` that sit between two nets, from the circuit description."""
        return [p for p in self.parts.values()
                if p.ref.startswith(prefix) and not p.ref[len(prefix)].isalpha() and set(p.nets.values()) == {net_a, net_b}]


def value(text):
    """'180p' -> 1.8e-10, '3.9k' -> 3900, '1.5R' -> 1.5, '560nH' -> 5.6e-7."""
    text = text.split()[0].split('/')[0].rstrip('HFh')
    scale = {'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'm': 1e-3, 'k': 1e3, 'M': 1e6, 'R': 1.0}
    if text[-1] in scale:
        return float(text[:-1]) * scale[text[-1]]
    return float(text)


def inside(poly, pts):
    """Which of the points (n, 2) lie inside the polygon (list of [x, y]): even-odd rule."""
    poly = np.asarray(poly)
    x, y = pts[:, 0], pts[:, 1]
    x1, y1 = poly[:, 0], poly[:, 1]
    x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
    hit = np.zeros(len(pts), dtype=bool)
    for ax, ay, bx, by in zip(x1, y1, x2, y2):
        if ay == by:
            continue
        cross = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / (by - ay) + ax)
        hit ^= cross
    return hit
