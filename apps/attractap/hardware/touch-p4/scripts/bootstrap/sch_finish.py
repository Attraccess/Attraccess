"""Finishing a sheet drawn with sch_draw: power symbols, labels and no-connect flags for the pins a
layout left open, the connectivity check, the overlap lint, and the KiCad items of the sheet."""
from sch_draw import CHAR, DIR, P, POWER, font, key, overlap, snap, text_box, uid
from sexpr import Sym as S


def _neighbour(u, x, y, side, step):
    """Is a pin one or two pitches away along the side (towards step = -1 / +1) connected to something?
    An upright power symbol and its name take that much room."""
    for num, (px, py, s, _name) in u.pins.items():
        if s != side or num not in u.part.nets:
            continue
        for k in (1, 2):
            if side in 'LR' and px == x and abs(py - (y + step * k * P)) < 0.01:
                return True
            if side in 'UD' and py == y and abs(px - (x + step * k * P)) < 0.01:
                return True
    return False


def finish(cv):
    """Close every pin the layout left open."""
    attached = {key(x1, y1) for x1, y1, *_ in cv.wires} | {key(x2, y2) for *_, x2, y2 in cv.wires}
    attached |= {key(x, y) for x, y, *_ in cv.anchors}
    count = {}
    for u in cv.units.values():
        for num, (x, y, _s, _n) in u.pins.items():
            k = key(x, y)
            if u.part.nets.get(num):
                count[k] = count.get(k, 0) + 1
            if any(_on_segment(k, w) for w in cv.wires):
                attached.add(k)                    # a pin on a wire: joined there
    attached |= {k for k, n in count.items() if n > 1 and
                 len({u.part.ref for u in cv.units.values() for x, y, *_ in u.pins.values() if key(x, y) == k}) > 1}
    seen = set()
    runs = {}
    for (ref, _unit), u in sorted(cv.units.items()):
        part = u.part
        for num, (x, y, side, _name) in sorted(u.pins.items(), key=lambda kv: (kv[1][2], kv[1][1], kv[1][0])):
            k = key(x, y)
            net = part.nets.get(num)
            if net is None:
                if num not in part.nc:
                    raise SystemExit('%s pin %s has neither a net nor a no-connect' % (ref, num))
                if k not in seen:
                    cv.ncs.append((x, y))
                seen.add(k)
                continue
            if k in attached or k in seen:
                continue
            seen.add(k)
            runs.setdefault((ref, u.unit, side, net), []).append((x, y))
    for (ref, unit, side, net), pts in runs.items():
        u = cv.units[(ref, unit)]
        cv.block = u.block
        if net in POWER:
            _power_run(cv, u, side, net, pts)
        else:
            _label_run(cv, side, net, pts)
    _label_open_trees(cv)
    name_nets(cv)


def _label_run(cv, side, net, pts):
    """Pins of one net next to each other on one side share a bar and one label."""
    along = 1 if side in 'LR' else 0
    pts.sort(key=lambda p: p[along])
    dx, dy = DIR[side]
    groups, cur = [], [pts[0]]
    for p in pts[1:]:
        if abs(p[along] - cur[-1][along] - P) < 0.01:
            cur.append(p)
        else:
            groups.append(cur)
            cur = [p]
    groups.append(cur)
    for g in groups:
        ends = [(x + dx * P, y + dy * P) for x, y in g]
        for (x, y), e in zip(g, ends):
            cv.wire((x, y), e)
        if len(ends) > 1:
            cv.wire(ends[0], ends[-1])
        cv.label(net, ends[0][0], ends[0][1], side)


def _power_run(cv, u, side, net, pts):
    """Power pins of one side of a part: adjacent pins of one net share a bar and a symbol."""
    along = 1 if side in 'LR' else 0
    pts.sort(key=lambda p: p[along])
    groups, cur = [], [pts[0]]
    for p in pts[1:]:
        if abs(p[along] - cur[-1][along] - P) < 0.01:
            cur.append(p)
        else:
            groups.append(cur)
            cur = [p]
    groups.append(cur)
    supply = net != 'GND'
    dx, dy = DIR[side]
    for g in groups:
        natural = (supply and side == 'U') or (not supply and side == 'D')
        if natural and len(g) == 1:
            cv.power(net, *g[0])
            continue
        ends = [(x + dx * P, y + dy * P) for x, y in g]
        for (x, y), e in zip(g, ends):
            cv.wire((x, y), e)
        if len(ends) > 1:
            cv.wire(ends[0], ends[-1])
        if side in 'LR':
            # the bar end towards the symbol's direction: top for a supply, bottom for ground
            end = ends[0] if supply else ends[-1]
            x, y = g[0] if supply else g[-1]
            blocked = _neighbour(u, x, y, side, -1 if supply else 1)
            if blocked:
                ang = (90 if side == 'L' else 270) if supply else (270 if side == 'L' else 90)
                cv.power(net, end[0], end[1], ang)
            else:
                cv.power(net, *end)
        else:
            end = ends[0]
            cv.power(net, end[0], end[1], 0 if natural else 180)


def _components(cv):
    """Union-find over everything that joins: wire ends, wire interiors touched by a point, pins, labels."""
    parent = {}

    def find_(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find_(a)] = find_(b)

    points = {}
    for (ref, _u), u in cv.units.items():
        for num, (x, y, _s, _n) in u.pins.items():
            net = u.part.nets.get(num)
            if net:
                points.setdefault(key(x, y), set()).add(('pin', ref + '.' + num, net))
    for x, y, net, kind in cv.anchors:
        points.setdefault(key(x, y), set()).add((kind, net, net))
    for u in cv.units.values():                    # pins joined inside the part
        for group in u.jumpers:
            ks = [key(*u.pins[n][:2]) for n in group if n in u.pins]
            for k in ks[1:]:
                union(ks[0], k)
    ends = set()
    for x1, y1, x2, y2 in cv.wires:
        ends |= {key(x1, y1), key(x2, y2)}
    for k in ends:
        points.setdefault(k, set())
    for x1, y1, x2, y2 in cv.wires:
        a, b = key(x1, y1), key(x2, y2)
        union(a, b)
        for k in points:
            if k not in (a, b) and _on_segment(k, (x1, y1, x2, y2)):
                union(k, a)
    return points, find_


def _on_segment(k, seg):
    x, y = k
    x1, y1, x2, y2 = seg
    if x1 == x2:
        return abs(x - x1) < 0.01 and min(y1, y2) - 0.01 <= y <= max(y1, y2) + 0.01
    return abs(y - y1) < 0.01 and min(x1, x2) - 0.01 <= x <= max(x1, x2) + 0.01


def check(cv):
    """Raise when anything joins two nets; return {point: net} of every connected point."""
    points, find_ = _components(cv)
    comp = {}
    for k, items in points.items():
        comp.setdefault(find_(k), []).append((k, items))
    errors, net_at = [], {}
    for root, members in comp.items():
        nets = {it[2] for _k, items in members for it in items}
        if len(nets) > 1:
            where = sorted({it[1] for _k, items in members for it in items if it[0] == 'pin'})[:6]
            errors.append('%s: nets %s joined at %s' % (cv.key, sorted(nets), where))
        for k, _items in members:
            net_at[k] = next(iter(nets)) if nets else None
    for x, y in cv.ncs:
        if any(_on_segment(key(x, y), w) for w in cv.wires):
            errors.append('%s: no-connect flag on a wire at %s' % (cv.key, (x, y)))
    if errors:
        raise SystemExit('schematic connectivity:\n  ' + '\n  '.join(errors))
    return net_at


def _label_open_trees(cv):
    """A wired group of pins whose net goes on elsewhere needs a label: at a free wire end, if any."""
    points, find_ = _components(cv)
    comp = {}
    for k, items in points.items():
        comp.setdefault(find_(k), []).append((k, items))
    deg = {}
    for x1, y1, x2, y2 in cv.wires:
        for k, other in ((key(x1, y1), (x2, y2)), (key(x2, y2), (x1, y1))):
            deg.setdefault(k, []).append(other)
    for members in comp.values():
        items = [it for _k, its in members for it in its]
        nets = {it[2] for it in items}
        if len(nets) != 1:
            continue
        net = nets.pop()
        if any(it[0] in ('local', 'hier', 'power') for it in items):
            continue
        pins = [it for it in items if it[0] == 'pin']
        if len(pins) >= cv.net_pins.get(net, 0):
            continue
        free = [k for k, its in members if not its and len(deg.get(k, [])) == 1
                and not any(_on_strict(w, k) for w in cv.wires)]
        if not free:
            raise SystemExit('%s: net %s needs a label (no free wire end): %s' %
                             (cv.key, net, [it[1] for it in pins]))
        k = min(free)
        ox, oy = deg[k][0]
        ref = pins[0][1].split('.')[0]
        cv.block = next(u.block for (r, _), u in cv.units.items() if r == ref)
        side = 'R' if k[0] > ox else 'L' if k[0] < ox else 'D' if k[1] > oy else 'U'
        if net in POWER:
            cv.power(net, *k)
        else:
            cv.label(net, k[0], k[1], side)


def name_nets(cv):
    """A wired net without any label gets one on a free stretch of its wire, so it keeps its name."""
    points, find_ = _components(cv)
    comp = {}
    for k, items in points.items():
        comp.setdefault(find_(k), []).append((k, items))
    taken = [(b, o.startswith(('label ', 'power '))) for kind, o, b in boxes(cv)]
    taken += [(b, False) for u in cv.units.values() for _n, _k, b in u.pin_text]
    for members in comp.values():
        items = [it for _k, its in members for it in its]
        nets = {it[2] for it in items}
        if len(nets) != 1:
            continue
        net = nets.pop()
        if net in POWER or any(it[0] in ('local', 'hier') for it in items):
            continue
        keys = {k for k, _its in members}
        segs = [w for w in cv.wires if key(w[0], w[1]) in keys or key(w[2], w[3]) in keys]
        w = len(net) * 1.27 * CHAR + 0.6
        best = None
        for x1, y1, x2, y2 in sorted(segs, key=lambda s: -abs(s[2] - s[0]) - abs(s[3] - s[1])):
            horizontal = y1 == y2
            lo, hi = (min(x1, x2), max(x1, x2)) if horizontal else (min(y1, y2), max(y1, y2))
            v = snap(lo + 1.27)
            while v + w + 0.6 <= hi + 0.01:
                box = (v + 0.2, y1 - 1.75, v + 0.2 + w, y1 - 0.25) if horizontal else (x1 - 1.75, v + 0.2, x1 - 0.25, v + 0.2 + w)
                if not any(overlap(box, b, -0.05 if name else GAP) for b, name in taken) and not _box_on_wire(cv, box):
                    best = ((v, y1, 'R') if horizontal else (x1, v, 'D'))
                    break
                v = snap(v + 1.27)
            if best:
                break
        if best is None and segs:
            x1, y1, x2, y2 = max(segs, key=lambda s: abs(s[2] - s[0]) + abs(s[3] - s[1]))
            best = (snap(min(x1, x2)), y1, 'R') if y1 == y2 else (x1, snap(min(y1, y2)), 'D')
        if best:
            blk = cv.block
            cv.block = next((b for (x1, y1, x2, y2), b in zip(cv.wires, cv.owner['wire'])
                             if (x1, y1, x2, y2) in segs), blk)
            cv.label(net, *best)
            cv.block = blk
            taken.append(((best[0], best[1] - 1.75, best[0] + w, best[1]) if best[2] == 'R'
                          else (best[0] - 1.75, best[1], best[0], best[1] + w), True))


def _box_on_wire(cv, box):
    for x1, y1, x2, y2 in cv.wires + [s for u in cv.units.values() for s in u.pin_lines]:
        if overlap(box, (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)), -0.1):
            return True
    return False


def boxes(cv):
    """Text and symbol extents for the lint: [(kind, owner, box)]."""
    out = []
    for (ref, unit), u in cv.units.items():
        if u.pins or not ref.startswith(('H', 'FID')):
            out.append(('body', ref, u.body))
        for name, (x, y, _a, just) in u.fields.items():
            s = {'Reference': ref, 'Value': u.part.value, 'Description': u.part.desc}.get(name) or u.part.extra.get(name, '')
            out.append(('text', ref + ':' + name, text_box(s, x, y, 1.27, just)))
    for net, x, y, side, kind in cv.labels:
        w, h = len(net) * 1.27 * CHAR + (1.6 if kind == 'hier' else 0.6), 1.6
        dx, dy = DIR[side]
        if kind == 'local':                        # KiCad draws a net label just above its wire
            if side in 'LR':
                x1 = x + 0.2 if dx > 0 else x - 0.2 - w
                out.append(('text', 'label ' + net, (x1, y - 1.75, x1 + w, y - 0.25)))
            else:
                y1 = y + 0.2 if dy > 0 else y - 0.2 - w
                out.append(('text', 'label ' + net, (x - 1.75, y1, x - 0.25, y1 + w)))
            continue
        if side in 'LR':
            x1 = x + 0.3 if dx > 0 else x - 0.3 - w
            out.append(('text', 'label ' + net, (x1, y - h / 2, x1 + w, y + h / 2)))
        else:
            y1 = y + 0.3 if dy > 0 else y - 0.3 - w
            out.append(('text', 'label ' + net, (x - h / 2, y1, x + h / 2, y1 + w)))
    for net, x, y, ang in cv.powers:
        tx, ty, just = power_text(net, x, y, ang)
        out.append(('text', 'power ' + net, text_box(net, tx, ty, 1.0, just)))
    for s, x, y, size, _b, just in cv.texts:
        out.append(('text', s[:20], text_box(s, x, y - size * 0.5, size, just)))
    return out


def power_text(net, x, y, ang):
    """Centre of a power symbol's name. Centred text: KiCad applies a justification in the turned
    frame of a turned symbol, which puts it on the other side of the point."""
    half = len(net) * 1.0 * CHAR / 2
    if net == 'GND':
        return {0: (x, y + 3.6, None), 180: (x, y - 3.6, None), 90: (x + 3.3 + half, y, None),
                270: (x - 3.3 - half, y, None)}[ang]
    return {0: (x, y - 3.6, None), 180: (x, y + 3.6, None), 90: (x - 3.3 - half, y, None),
            270: (x + 3.3 + half, y, None)}[ang]


def _inside(a, b):
    return a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3]


GAP = 0.25        # texts must keep this much room from other texts and from drawings (mm)


def lint(cv):
    """Overlapping texts and symbols, and texts on wires. Returns a list of findings.

    Covers the fields, labels, power symbol names and notes, the pin names and numbers that KiCad
    writes inside and along a symbol, and the symbols' drawings: a field may lie inside a box symbol
    (clear of its pin texts) but not on any other drawing, its own included."""
    items = boxes(cv)
    found = []
    texts = [(o, b) for kind, o, b in items if kind == 'text']
    bodies = [(o, b) for kind, o, b in items if kind == 'body']
    boxed = {ref for (ref, _u), u in cv.units.items() if u.boxed}
    pins = [('%s pin %s %s' % (ref, num, kind), b) for (ref, _u), u in cv.units.items() for num, kind, b in u.pin_text]
    pin_lines = [(ref,) + s for (ref, _u), u in cv.units.items() for s in u.pin_lines]
    for i, (o1, b1) in enumerate(texts):
        for o2, b2 in texts[i + 1:]:
            same_part = ':' in o1 and o1.split(':')[0] == o2.split(':')[0]    # one part's stacked fields
            net_names = o1.startswith(('label ', 'power ')) and o2.startswith(('label ', 'power '))
            if overlap(b1, b2, -0.05 if same_part or net_names else GAP):
                found.append('text %r on text %r at %.0f,%.0f' % (o1, o2, b1[0], b1[1]))
        for o2, b2 in bodies:
            if overlap(b1, b2, GAP) and not (o2 in boxed and _inside(b1, b2)):
                found.append('text %r on symbol %s' % (o1, o2))
        for o2, b2 in pins:
            if overlap(b1, b2, GAP):
                found.append('text %r on %s' % (o1, o2))
        for x1, y1, x2, y2 in cv.wires:
            seg = (min(x1, x2) - 0.05, min(y1, y2) - 0.05, max(x1, x2) + 0.05, max(y1, y2) + 0.05)
            if overlap(b1, seg, -0.2):
                found.append('text %r on a wire at %s' % (o1, (x1, y1, x2, y2)))
                break
        for ref, x1, y1, x2, y2 in pin_lines:
            seg = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
            if overlap(b1, seg, -0.1) and not o1.startswith(ref + ':'):
                found.append('text %r on a pin of %s' % (o1, ref))
                break
    for i, (o1, b1) in enumerate(pins):
        for o2, b2 in pins[i + 1:]:
            if overlap(b1, b2, -0.05) and o1.split(' pin ')[0] == o2.split(' pin ')[0]:
                found.append('%s on %s' % (o1, o2))
        for o2, b2 in bodies:
            if o1.split(' pin ')[0] != o2 and overlap(b1, b2, -0.1):
                found.append('%s on symbol %s' % (o1, o2))
    for i, (o1, b1) in enumerate(bodies):
        for o2, b2 in bodies[i + 1:]:
            if overlap(b1, b2, -0.1):
                found.append('symbol %s on symbol %s' % (o1, o2))
    for i, f1 in enumerate(cv.frames):
        for f2 in cv.frames[i + 1:]:
            if overlap(f1, f2):
                found.append('block frame %s on %s' % (f1, f2))
    return found


def items(cv, path, project, page, instance):
    """The KiCad items of the sheet, after finish() and check()."""
    out = []
    pts = {}
    for x1, y1, x2, y2 in cv.wires:
        for k in (key(x1, y1), key(x2, y2)):
            pts[k] = pts.get(k, 0) + 1
    pin_pts = {key(x, y) for u in cv.units.values() for x, y, *_ in u.pins.values()}
    # split every wire where another wire ends on it, and mark the joint
    cuts = set(pts) | pin_pts | {key(x, y) for x, y, *_ in cv.anchors}
    junctions = set()
    for x1, y1, x2, y2 in cv.wires:
        inner = sorted(k for k in cuts if k not in (key(x1, y1), key(x2, y2)) and _on_strict((x1, y1, x2, y2), k))
        chain = [(x1, y1)] + (inner if (x1, y1) < (x2, y2) else inner[::-1]) + [(x2, y2)]
        for k in inner:
            junctions.add(k)
        for (ax, ay), (bx, by) in zip(chain, chain[1:]):
            out.append([S('wire'), [S('pts'), [S('xy'), ax, ay], [S('xy'), bx, by]],
                        [S('stroke'), [S('width'), 0], [S('type'), S('default')]],
                        [S('uuid'), uid(cv.key, 'w', str(ax), str(ay), str(bx), str(by))]])
    junctions |= {k for k, n in pts.items() if n + (k in pin_pts) >= 3}
    for x, y in sorted(junctions):
        out.append([S('junction'), [S('at'), x, y], [S('diameter'), 0], [S('color'), 0, 0, 0, 0],
                    [S('uuid'), uid(cv.key, 'j', str(x), str(y))]])
    for x, y in cv.ncs:
        out.append([S('no_connect'), [S('at'), x, y], [S('uuid'), uid(cv.key, 'nc', str(x), str(y))]])
    for net, x, y, side, kind in cv.labels:
        ang, just = {'L': (180, 'right'), 'R': (0, 'left'), 'U': (90, 'left'), 'D': (270, 'right')}[side]
        u = [S('uuid'), uid(cv.key, kind, net, str(x), str(y))]
        if kind == 'hier':
            out.append([S('hierarchical_label'), net, [S('shape'), S('passive')], [S('at'), x, y, ang],
                        font(justify=just), u])
        else:
            out.append([S('label'), net, [S('at'), x, y, ang], font(justify=just + ' bottom'), u])
    for n, (net, x, y, ang) in enumerate(cv.powers):
        ref = '#PWR%s%03d' % (page, n + 1)
        tx, ty, just = power_text(net, x, y, ang)
        u = uid(cv.key, 'pwr', str(n + 1))
        cv.use(POWER[net])
        out.append(instance(POWER[net], x, y, ang, 1, u, ref, [
            ('Reference', ref, (x, y), 0, font(hide=True)),
            ('Value', net, (tx, ty), ang if ang in (90, 270) else 0, font(1.0, justify=just)),
            ('Footprint', '', (x, y), 0, font(hide=True)), ('Datasheet', '', (x, y), 0, font(hide=True)),
        ], ['1']))
    for s, x, y, size, bold, just in cv.texts:
        out.append([S('text'), s, [S('exclude_from_sim'), S('no')], [S('at'), x, y, 0],
                    font(size, justify=just + ' bottom', bold=bold), [S('uuid'), uid(cv.key, 't', s, str(x), str(y))]])
    for x1, y1, x2, y2 in cv.frames:
        out.append([S('rectangle'), [S('start'), x1, y1], [S('end'), x2, y2],
                    [S('stroke'), [S('width'), 0.15], [S('type'), S('dash')]], [S('fill'), [S('type'), S('none')]],
                    [S('uuid'), uid(cv.key, 'fr', str(x1), str(y1))]])
    return out


def _on_strict(seg, k):
    x1, y1, x2, y2 = seg
    x, y = k
    if x1 == x2:
        return abs(x - x1) < 0.01 and min(y1, y2) + 0.01 < y < max(y1, y2) - 0.01
    return abs(y - y1) < 0.01 and min(x1, x2) + 0.01 < x < max(x1, x2) - 0.01


def make_frames(cv, pad=1.9):
    """A titled frame around each block: its parts with their fields, wires, labels and power symbols."""
    ext = {}

    def grow(block, b):
        if block is None:
            return
        e = ext.setdefault(block, [1e9, 1e9, -1e9, -1e9])
        e[0], e[1], e[2], e[3] = min(e[0], b[0]), min(e[1], b[1]), max(e[2], b[2]), max(e[3], b[3])

    for (ref, _u), u in cv.units.items():
        grow(u.block, u.body)
        for x, y, *_ in u.pins.values():
            grow(u.block, (x, y, x, y))
        for name, (x, y, _a, just) in u.fields.items():
            s = {'Reference': ref, 'Value': u.part.value, 'Description': u.part.desc}.get(name) or u.part.extra.get(name, '')
            grow(u.block, text_box(s, x, y, 1.27, just))
    for (x1, y1, x2, y2), blk in zip(cv.wires, cv.owner['wire']):
        grow(blk, (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))
    lbl = [b for kind, o, b in boxes(cv) if o.startswith('label ')]
    for b, blk in zip(lbl, cv.owner['label']):
        grow(blk, b)
    for (net, x, y, ang), blk in zip(cv.powers, cv.owner['power']):
        tx, ty, just = power_text(net, x, y, ang)
        grow(blk, text_box(net, tx, ty, 1.0, just))
        grow(blk, (x - 1.3, y - 2.6, x + 1.3, y + 2.6))
    for (s, x, y, size, _b, just), blk in cv.owned_texts:
        grow(blk, text_box(s, x, y - size * 0.5, size, just))
    for title in cv.blocks:
        if title not in ext:
            continue
        x1, y1, x2, y2 = ext[title]
        x1, y1 = snap(x1 - pad), snap(y1 - pad - 4.4)
        x2 = snap(max(x2 + pad, x1 + len(title) * 2.0 * CHAR + 4))
        y2 = snap(y2 + pad)
        cv.frame(title, x1, y1, x2, y2)


def extent(cv):
    """Every drawn item as a box: texts, symbols, frames and wires."""
    bs = [b for _k, _o, b in boxes(cv)] + list(cv.frames)
    bs += [(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)) for x1, y1, x2, y2 in cv.wires]
    return bs
