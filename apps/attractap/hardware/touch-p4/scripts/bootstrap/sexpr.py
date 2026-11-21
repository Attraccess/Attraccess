"""Minimal KiCad S-expression reader/writer."""
import re

class Sym(str):
    """Bare (unquoted) atom."""
    __slots__ = ()

_tok = re.compile(r'''\s*(?:(\()|(\))|"((?:[^"\\]|\\.)*)"|([^\s()"]+))''')

def loads(text):
    pos = 0
    stack = [[]]
    n = len(text)
    while True:
        m = _tok.match(text, pos)
        if not m:
            break
        pos = m.end()
        if m.group(1):
            stack.append([])
        elif m.group(2):
            done = stack.pop()
            stack[-1].append(done)
        elif m.group(3) is not None:
            s = m.group(3)
            s = s.replace('\\"', '"').replace('\\\\', '\\').replace('\\n', '\n')
            stack[-1].append(s)
        else:
            stack[-1].append(Sym(m.group(4)))
        if pos >= n:
            break
    return stack[0][0]

def _q(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'

def dumps(x, indent=0):
    if isinstance(x, Sym):
        return str(x)
    if isinstance(x, str):
        return _q(x)
    if isinstance(x, bool):
        return 'yes' if x else 'no'
    if isinstance(x, float):
        s = ('%.6f' % x).rstrip('0').rstrip('.')
        return s if s not in ('-0', '') else '0'
    if isinstance(x, int):
        return str(x)
    # list
    flat = '(' + ' '.join(dumps(i) for i in x) + ')'
    if len(flat) <= 100 or all(not isinstance(i, list) for i in x):
        return flat
    pad = '\t' * (indent + 1)
    out = ['(' + dumps(x[0])]
    i = 1
    while i < len(x) and not isinstance(x[i], list):
        out[0] += ' ' + dumps(x[i]); i += 1
    for item in x[i:]:
        out.append(pad + dumps(item, indent + 1))
    out.append('\t' * indent + ')')
    return '\n'.join(out)

def find(x, name):
    return [i for i in x if isinstance(i, list) and i and i[0] == name]

def first(x, name, default=None):
    for i in x:
        if isinstance(i, list) and i and i[0] == name:
            return i
    return default
