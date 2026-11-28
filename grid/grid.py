"""Tile with the pixel-grid dot ring (mockup A), on a copy of the committed design."""
import json, math, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "..", "tilevar", "base.sc")
TC, RIM_TOP = -67.85, 23.8
RAISED = 29.0          # raised black centre (was 40.8)
P, D = 1.6, 1.0        # grid pitch, dot diameter
def sd(x, y, h, r):
    qx, qy = abs(x) - h + r, abs(y) - h + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
DOTS = [(i * P, j * P) for i in range(-14, 15) for j in range(-14, 15)
        if sd(i * P, j * P, 22.4, 6) <= -(1.0 + D / 2) + 1e-9 and sd(i * P, j * P, RAISED / 2 + 0.5, 2.5) >= D / 2 - 1e-9]
def ch(n, e): return {"command": "parameters.change", "params": {"name": n, "expression": str(e)}}
GEOM = [ch("d313", RAISED), ch("d314", RAISED), ch("d331", RAISED), ch("d332", RAISED),
        ch("d335", RAISED - 3.2), ch("d336", RAISED - 3.2), ch("d339", RAISED - 5.2), ch("d340", RAISED - 5.2),
        ch("d351", 30.0), ch("d352", 30.0)]          # channel inner edge 15.0 from the centre, under the inner row
def dots(skin, bottom=20.6):
    top = RIM_TOP - skin
    return [{"command": "solid.cylinder", "params": {"name": f"Px{k}", "base": [x, TC + y, bottom], "axis": "Z",
             "diameter": D, "height": round(top - bottom, 3), "operation": "cut", "targets": ["Tile"]}}
            for k, (x, y) in enumerate(DOTS)]
def marks(n):
    return [{"command": "solid.box", "params": {"name": f"Mark{k}", "center": [-10 + 3 * k, TC - 23.6, 19.95],
             "length": 1.2, "width": 1.6, "height": 3.1, "operation": "cut", "targets": ["Tile"]}} for k in range(n)]
TILE = ["Tile", "Tile top", "Tile inlay", "Tile keyhole"]
PROBE = lambda skin: {"command": "inspect.classify_points", "params": {"body": "Tile", "points": [
    [DOTS[0][0], TC + DOTS[0][1], 23.8 - skin - 0.03], [DOTS[0][0], TC + DOTS[0][1], 23.8 - skin + 0.03],
    [DOTS[0][0], TC + DOTS[0][1], 21.5], [15.2, TC, 20.0], [14.8, TC, 20.0], [0, TC + 15.0, 24.3], [0, TC + 18, 24.3]]}}
print(len(DOTS), "dots")
for n, skin in enumerate(sys.argv[1:] and [float(a) for a in sys.argv[1:]] or [0.1, 0.2], 1):
    name = f"tile-grid-skin{skin}"
    script = GEOM + dots(skin) + marks(n) + [PROBE(skin),
        {"command": "solid.move", "params": {"bodies": TILE, "name": "TileLay", "translate": [0, -TC, -18.5]}},
        {"command": "file.export", "params": {"path": os.path.join(HERE, name + ".3mf"), "bodies": TILE, "quality": "fine"}},
        {"command": "file.export", "params": {"path": os.path.join(HERE, name + ".step"), "bodies": TILE}}]
    json.dump({"commands": script}, open(os.path.join(HERE, name + ".json"), "w"))
    r = subprocess.run(["solidcraft-cli", "run", os.path.join(HERE, name + ".json"), "--in", BASE, "--results",
                        "--json-out", os.path.join(HERE, name + ".out.json"), "--quiet", "--timings"], capture_output=True, text=True)
    print(name, "rc", r.returncode, r.stderr[-1500:])
