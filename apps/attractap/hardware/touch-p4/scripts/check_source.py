"""The generator is the master; the KiCad files are its output (docs/en/hardware/touch-p4/development.md,
"Source of truth").

Each generator step stamps what it wrote into kicad/generated-from.json: a fingerprint of the generator's
inputs and the SHA-256 of every KiCad file it wrote. The check fails when

- a KiCad file differs from what the generator wrote (edited by hand, or by KiCad and saved), or
- the generator changed after the files were generated (its Python code, the libraries in kicad/lib, the
  autorouter result), so that its output would differ.

Comments, docstrings and blank lines of the generator's code are not part of the fingerprint: changing
them changes nothing the generator writes.

Usage:
    check_source.py                  check (needs only Python; part of the check target)
    check_source.py --stamp schematic|board
                                     record what a generator step just wrote (tools/pcb.sh does this)
    check_source.py --full           regenerate everything in a copy of the project and compare it with
                                     the files in git (needs KiCad; about 45 minutes; before an order)
"""
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import tokenize

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KICAD = os.path.join(ROOT, 'kicad')
STAMP = os.path.join(KICAD, 'generated-from.json')
NAME = 'attractap-touch-p4'
# Python files in scripts/bootstrap that do not shape the output, should a step import them: tests and checks
NOT_GENERATOR = {'test_design.py', 'check_netlist.py', 'check_overlap.py', 'collect_models.py'}


def code_text(path):
    """A Python file without its comments, blank lines and statements that are a bare string (docstrings).
    Works on the token positions only, so every Python version gives the same text."""
    with open(path, 'rb') as f:
        src = f.read().decode('utf-8')
    toks = [t for t in tokenize.generate_tokens(io.StringIO(src).readline) if t.type not in (tokenize.NL, tokenize.ENCODING)]
    drop, prev = [], None
    for i, t in enumerate(toks):
        if t.type == tokenize.COMMENT:
            drop.append((t.start, t.end))
            continue
        if t.type == tokenize.STRING and (prev is None or prev.type in (tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT)):
            nxt = next((u for u in toks[i + 1:] if u.type != tokenize.COMMENT), None)
            if nxt is None or nxt.type in (tokenize.NEWLINE, tokenize.ENDMARKER):
                drop.append((t.start, t.end))
        prev = t
    lines = src.splitlines()
    for (r1, c1), (r2, c2) in sorted(drop, reverse=True):
        if r1 == r2:
            lines[r1 - 1] = lines[r1 - 1][:c1] + lines[r1 - 1][c2:]
        else:
            lines[r1 - 1:r2] = [lines[r1 - 1][:c1] + lines[r2 - 1][c2:]]
    return '\n'.join(ln.rstrip() for ln in lines if ln.strip())


# What each generator step runs (tools/pcb.sh); the modules they import from scripts/bootstrap count too
ENTRY = {'schematic': ['build_sch.py'], 'board': ['build_pcb.py', 'finish_route.py', 'post_route.py']}


def imports(path):
    """Names of the modules a Python file imports (any depth of the file, not only the top)."""
    import ast
    with open(path, 'rb') as f:
        tree = ast.parse(f.read())
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out |= {a.name.split('.')[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            out.add(node.module.split('.')[0])
    return out


def modules(step):
    """The generator's Python files that a step runs: its entry points and what they import, recursively."""
    boot = os.path.join(HERE, 'bootstrap')
    todo, seen = list(ENTRY[step]), set()
    while todo:
        name = todo.pop()
        if name in seen or not os.path.exists(os.path.join(boot, name)):
            continue
        seen.add(name)
        todo += [m + '.py' for m in imports(os.path.join(boot, name))]
    return sorted(seen - NOT_GENERATOR)


def generator_inputs(step):
    """(relative path, digest) of everything a generator step reads: its code, the libraries, and for the
    board the autorouter result."""
    items = []
    boot = os.path.join(HERE, 'bootstrap')
    for name in modules(step):
        data = code_text(os.path.join(boot, name)).encode()
        items.append(('scripts/bootstrap/' + name, hashlib.sha256(data).hexdigest()))
    lib = os.path.join(KICAD, 'lib')
    for dirpath, _dirs, files in os.walk(lib):
        for name in sorted(files):
            path = os.path.join(dirpath, name)
            items.append((os.path.relpath(path, ROOT), file_hash(path)))
    ses = os.path.join(KICAD, NAME + '.ses')
    if step == 'board' and os.path.exists(ses):
        items.append(('kicad/' + NAME + '.ses', file_hash(ses)))
    return sorted(items)


def fingerprint(step):
    return hashlib.sha256(json.dumps(generator_inputs(step)).encode()).hexdigest()


def file_hash(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def outputs(step):
    if step == 'board':
        return [NAME + '.kicad_pcb']
    return sorted(n for n in os.listdir(KICAD) if n.endswith('.kicad_sch'))


def load():
    if not os.path.exists(STAMP):
        return {}
    with open(STAMP) as f:
        return json.load(f)


def stamp(step):
    data = load()
    data[step] = {'generator': fingerprint(step), 'files': {n: file_hash(os.path.join(KICAD, n)) for n in outputs(step)}}
    with open(STAMP, 'w') as f:
        json.dump(data, f, indent=1, sort_keys=True)
        f.write('\n')
    print('%s: stamped %d files' % (step, len(data[step]['files'])))


def check():
    data, bad = load(), []
    for step, how in (('schematic', 'tools/pcb.sh generate-schematic'), ('board', 'tools/pcb.sh place, then route-finish')):
        rec = data.get(step)
        if not rec:
            bad.append('%s: no stamp in kicad/generated-from.json; run %s' % (step, how))
            continue
        if rec['generator'] != fingerprint(step):
            bad.append('%s: the generator changed after the files were written; run %s' % (step, how))
        names = outputs(step)
        for n in sorted(set(names) | set(rec['files'])):
            path = os.path.join(KICAD, n)
            if n not in rec['files']:
                bad.append('%s: kicad/%s was not written by the generator' % (step, n))
            elif not os.path.exists(path):
                bad.append('%s: kicad/%s is missing' % (step, n))
            elif file_hash(path) != rec['files'][n]:
                bad.append('%s: kicad/%s differs from what the generator wrote (edited by hand?); '
                           'make the change in scripts/bootstrap and run %s' % (step, n, how))
    for line in bad:
        print('check_source: ' + line, file=sys.stderr)
    if not bad:
        print('KiCad files match the generator (schematic and board)')
    return 1 if bad else 0


def without_ids(path):
    """A KiCad file without its UUIDs, which KiCad gives new items at random."""
    import re
    with open(path) as f:
        return re.sub(r'\(uuid "[^"]*"\)', '(uuid)', f.read())


def full():
    """Regenerate into a copy and compare (the generator is deterministic: PYTHONHASHSEED=0 in tools/pcb.sh)."""
    tmp = tempfile.mkdtemp(prefix='touch-p4-')
    copy = os.path.join(tmp, 'touch-p4')
    shutil.copytree(ROOT, copy, ignore=shutil.ignore_patterns('fab', '.tools', '__pycache__'))
    for step in ('generate-schematic', 'place', 'route-finish'):
        subprocess.run(['bash', os.path.join(copy, 'tools', 'pcb.sh'), step], check=True)
    bad = [n for n in outputs('schematic') + outputs('board')
           if without_ids(os.path.join(KICAD, n)) != without_ids(os.path.join(copy, 'kicad', n))]
    for n in bad:
        print('check_source: kicad/%s differs from a fresh generator run (%s)' % (n, os.path.join(copy, 'kicad', n)),
              file=sys.stderr)
    if not bad:
        shutil.rmtree(tmp)
        print('a fresh generator run gives the KiCad files in git')
    return 1 if bad else 0


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--stamp':
        stamp(sys.argv[2])
    elif len(sys.argv) > 1 and sys.argv[1] == '--full':
        sys.exit(full())
    else:
        sys.exit(check())
