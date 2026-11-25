"""Library access: resolve symbols and footprints, validate the design against them."""
import copy
import os
import re

from sexpr import Sym, dumps, find, first, loads

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', '..', 'kicad'))
PROJECT_LIB = os.path.join(PROJECT, 'lib')
SYM_DIR = os.environ.get('KICAD10_SYMBOL_DIR', '')
FP_DIR = os.environ.get('KICAD10_FOOTPRINT_DIR', '')
LIB_NICK = 'attractap'

_symlibs = {}


def symlib(nick):
    if nick not in _symlibs:
        path = (os.path.join(PROJECT_LIB, LIB_NICK + '.kicad_sym') if nick == LIB_NICK
                else os.path.join(SYM_DIR, nick + '.kicad_sym'))
        tree = loads(open(path, encoding='utf-8').read())
        _symlibs[nick] = {s[1]: s for s in find(tree, 'symbol')}
    return _symlibs[nick]


def symbol(libid):
    """Return a flattened copy of a library symbol (``extends`` resolved), named by its bare name."""
    nick, name = libid.split(':', 1)
    lib = symlib(nick)
    s = copy.deepcopy(lib[name])
    ext = first(s, 'extends')
    if ext:
        parent = copy.deepcopy(lib[ext[1]])
        props = {p[1]: p for p in find(s, 'property')}
        out = []
        for item in parent:
            if isinstance(item, list) and item and item[0] == 'property' and item[1] in props:
                out.append(props.pop(item[1]))
            elif isinstance(item, list) and item and item[0] == 'symbol':
                sub = copy.deepcopy(item)
                sub[1] = sub[1].replace(ext[1], name, 1)
                out.append(sub)
            else:
                out.append(item)
        out[1] = name
        out.extend(props.values())
        s = out
    return s


def symbol_pins(sym):
    """[(number, name, x, y, angle, length, unit)]"""
    pins = []
    for sub in find(sym, 'symbol'):
        m = re.match(r'.*_(\d+)_(\d+)$', sub[1])
        unit = int(m.group(1)) if m else 1
        for p in find(sub, 'pin'):
            at = first(p, 'at')
            ln = first(p, 'length')
            pins.append((first(p, 'number')[1], first(p, 'name')[1], float(at[1]), float(at[2]),
                         float(at[3]) if len(at) > 3 else 0.0, float(ln[1]) if ln else 0.0, unit))
    return pins


def fp_path(fpid):
    nick, name = fpid.split(':', 1)
    if nick == LIB_NICK:
        return os.path.join(PROJECT_LIB, LIB_NICK + '.pretty'), name
    return os.path.join(FP_DIR, nick + '.pretty'), name


_fpcache = {}


def fp_pads(fpid):
    if fpid not in _fpcache:
        d, name = fp_path(fpid)
        tree = loads(open(os.path.join(d, name + '.kicad_mod'), encoding='utf-8').read())
        _fpcache[fpid] = [str(p[1]) for p in find(tree, 'pad')]
    return _fpcache[fpid]


def resolve(design):
    """Resolve '@pin name' keys to pin numbers and check every part against symbol and footprint."""
    errors = []
    for p in design.parts.values():
        sym = symbol(p.sym)
        pins = symbol_pins(sym)
        by_name = {}
        for num, name, *_ in pins:
            by_name.setdefault(name, []).append(num)
        nets = {}
        for key, net in p.nets.items():
            if key.startswith('@'):
                if key[1:] not in by_name:
                    errors.append('%s: no pin named %s' % (p.ref, key[1:]))
                    continue
                for num in by_name[key[1:]]:
                    nets[num] = net
            else:
                nets[key] = net
        nc = set()
        for key in p.nc:
            if key.startswith('@'):
                if key[1:] not in by_name:
                    errors.append('%s: no pin named %s' % (p.ref, key[1:]))
                    continue
                nc.update(by_name[key[1:]])
            else:
                nc.add(key)
        p.nets, p.nc = nets, nc
        nums = {n for n, *_ in pins}
        used = set(nets) | nc
        if used - nums:
            errors.append('%s: pins not in symbol %s: %s' % (p.ref, p.sym, sorted(used - nums)))
        if nums - used:
            errors.append('%s: symbol pins without net or NC: %s' % (p.ref, sorted(nums - used)))
        if set(nets) & nc:
            errors.append('%s: pins both netted and NC: %s' % (p.ref, sorted(set(nets) & nc)))
        pads = {n for n in fp_pads(p.fp) if n}
        if pads - nums:
            errors.append('%s: footprint pads not in symbol: %s' % (p.ref, sorted(pads - nums)))
        if nums - pads:
            errors.append('%s: symbol pins without footprint pad: %s' % (p.ref, sorted(nums - pads)))
    if errors:
        raise SystemExit('design errors:\n  ' + '\n  '.join(errors))
    return design


def netlist(design):
    nets = {}
    for p in design.parts.values():
        for pin, n in p.nets.items():
            nets.setdefault(n, []).append((p.ref, pin))
    return nets
