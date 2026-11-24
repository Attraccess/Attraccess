"""Runs ngspice decks: the results of their .meas lines, or the waveforms of chosen nodes."""
import os
import re
import subprocess
import tempfile

import numpy as np

NGSPICE = os.environ.get('NGSPICE', 'ngspice')
HERE = os.path.dirname(os.path.abspath(__file__))


def run(deck, **params):
    """deck: file name in this folder, or the text of a deck. params replace the defaults of its .param
    lines. Returns {name: value} of the measurements."""
    text = open(os.path.join(HERE, deck)).read() if deck.endswith('.cir') else deck
    for name, val in params.items():
        text, n = re.subn(r'(?m)^(\.param %s=)\S+' % re.escape(name), lambda m: m.group(1) + '%g' % val, text)
        if n != 1:
            raise ValueError('deck has no .param %s' % name)
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'deck.cir')
        open(path, 'w').write(text)
        res = subprocess.run([NGSPICE, '-b', path], capture_output=True, text=True, cwd=tmp)
    out = {}
    for line in res.stdout.splitlines():
        m = re.match(r'^(\w+)\s+=\s+(-?[0-9.]+e[-+][0-9]+)', line)
        if m:
            out[m.group(1)] = float(m.group(2))
    if not out:
        raise RuntimeError('ngspice gave no result:\n' + res.stdout[-2000:] + res.stderr[-2000:])
    return out


def waveform(deck, *nodes):
    """Runs the text of a deck that has no .control block. Returns (time, [voltage of each node])."""
    with tempfile.TemporaryDirectory() as tmp:
        data = os.path.join(tmp, 'out.txt')
        control = ['.control', 'set noaskquit', 'set wr_singlescale', 'run',
                   'wrdata %s %s' % (data, ' '.join('v(%s)' % n for n in nodes)), 'quit', '.endc', '.end']
        open(os.path.join(tmp, 'deck.cir'), 'w').write(deck + '\n' + '\n'.join(control) + '\n')
        res = subprocess.run([NGSPICE, '-b', 'deck.cir'], capture_output=True, text=True, cwd=tmp)
        if not os.path.exists(data):
            raise RuntimeError('ngspice gave no result:\n' + res.stdout[-2000:] + res.stderr[-2000:])
        a = np.loadtxt(data)
    return a[:, 0], [a[:, k + 1] for k in range(len(nodes))]
