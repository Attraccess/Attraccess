"""Tile light-test variants from base.sc (a copy of the committed design), one 3MF per variant."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
TC = -67.85                       # tile centre y; ring of LEDs 21.4 from it
RIM_TOP, CH_CENTRE = 23.8, 19.7   # flat white rim top; channel boxes are centred in z on 19.7
LEDS = [(s * a, TC + t * 21.4) for t in (-1, 1) for a in (5.35, 16.05) for s in (-1, 1)] + \
       [(t * 21.4, TC + s * a) for t in (-1, 1) for a in (5.35, 16.05) for s in (-1, 1)]
assert len(LEDS) == 16

def roof(top):   # channel top at `top`; narrow the outer edge so a wall stays to the skirt (±22.4)
    h = 2 * (top - CH_CENTRE)
    return [{"command": "parameters.change", "params": {"name": n, "expression": str(round(h, 3))}} for n in ("d349", "d353")] + \
           [{"command": "parameters.change", "params": {"name": "d347", "expression": "43.6"}},
            {"command": "parameters.change", "params": {"name": "d348", "expression": "43.6"}},
            {"command": "parameters.change", "params": {"name": "d350", "expression": "5.4"}}]

def dots(skin, bottom=20.0):
    top = RIM_TOP - skin + (0.05 if skin == 0 else 0)
    out = []
    for i, (x, y) in enumerate(LEDS):
        out.append({"command": "solid.cylinder", "params": {"name": f"Dot{i}", "base": [x, y, bottom], "axis": "Z",
                    "diameter": 1.2, "height": round(top - bottom, 3), "operation": "cut", "targets": ["Tile"]}})
    return out

def marks(n):   # n notches in the flange's lower edge, to tell the variants apart
    return [{"command": "solid.box", "params": {"name": f"Mark{k}", "center": [-10 + 3 * k, TC - 23.6, 19.95],
             "length": 1.2, "width": 1.6, "height": 3.1, "operation": "cut", "targets": ["Tile"]}} for k in range(n)]

TILE = ["Tile", "Tile top", "Tile inlay", "Tile keyhole"]
VARIANTS = {
    "v1-roof1.2": roof(22.6),
    "v2-roof0.6": roof(23.2),
    "v3-dots-open": dots(0),
    "v4-dots-skin0.1": dots(0.1),
    "v5-dots-skin0.2": dots(0.2),
    "v6-roof1.2-dots-skin0.2": roof(22.6) + dots(0.2, bottom=22.0),
}
for n, (name, cmds) in enumerate(VARIANTS.items(), 1):
    script = cmds + marks(n) + [
        {"command": "solid.move", "params": {"bodies": TILE, "name": "TileLay", "translate": [0, -TC, -18.5]}},
        {"command": "file.export", "params": {"path": os.path.join(HERE, f"tile-{name}.3mf"), "bodies": TILE, "quality": "fine"}},
        {"command": "file.export", "params": {"path": os.path.join(HERE, f"tile-{name}.step"), "bodies": TILE}}]
    json.dump({"commands": script}, open(os.path.join(HERE, f"{name}.json"), "w"))
    r = subprocess.run(["solidcraft-cli", "eval", os.path.join(HERE, f"{name}.json"), "--in", os.path.join(HERE, "base.sc"),
                        "--json-out", os.path.join(HERE, f"{name}.m.json"), "--quiet"], capture_output=True, text=True)
    if r.returncode:
        print(name, "FAILED", r.stderr[-800:]); continue
    d = json.load(open(os.path.join(HERE, f"{name}.m.json")))
    t = next(b for b in d["bodies"] if b["name"] == "Tile")
    print(name, round(t["volume_mm3"], 1), t["bbox"])
