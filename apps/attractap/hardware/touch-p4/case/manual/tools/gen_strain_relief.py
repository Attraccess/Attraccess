"""Second batch for the manual's scene file: the strain-relief features of the design
(tie saddles in the cap, tie fins and taller cable gate in the stand) re-applied to the
scene copy, plus illustration-only bodies (re-routed bottom cable, cable ties, desk cable)."""
import json, math, os, tempfile
# Folder for the generated step files. SolidCraft's MCP server only reads files from the folders it allows (its
# session temp folder is one), so point SOLIDCRAFT_WORK at such a folder. The default is the system temp folder.
T = os.path.join(os.environ.get("SOLIDCRAFT_WORK") or tempfile.gettempdir(), "")
steps = []
def add(cmd, **p): steps.append({"command": cmd, "params": p})

# ---- design features, identical to the master design ----
for tag, cx, outer, inner in (("Eth", -34.8, [(-45.3, -5.3), (-45.3, 0.3), (-39.7, 0.3)], [(-27.7, -4.5), (-27.7, 0.3), (-32.5, 0.3)]),
                              ("Dc", 36.8, [(45.3, -5.3), (45.3, 0.3), (39.7, 0.3)], [(27.7, -4.5), (27.7, 0.3), (32.5, 0.3)])):
    add("solid.box", center=[cx, -101.15, "(11.2 + z_in + 0.3) / 2"], length=5.2, width=11.6, height="z_in + 0.3 - 11.2",
        operation="join", targets=["Cap"], name=f"TieSaddle{tag}Block")
    add("solid.box", center=[cx, -100.35, "(14 + z_in) / 2"], length=7.2, width=4.5, height="z_in - 14",
        operation="cut", targets=["Cap"], name=f"TieSaddle{tag}Tunnel")
    add("sketch.create", plane={"origin": [0, -98.1, "z_in"], "x_dir": [1, 0, 0], "y_dir": [0, 0, 1]}, name=f"TieRampSketch{tag}")
    add("sketch.line", points=[list(p) for p in outer], closed=True)
    add("sketch.line", points=[list(p) for p in inner], closed=True)
    add("sketch.constraint.fix", entities=[f"l{i}" for i in range(1, 7)])
    add("sketch.solve"); add("sketch.finish")
    add("solid.extrude", sketch=f"TieRampSketch{tag}", distance=4.5, operation="join", targets=["Cap"], name=f"TieRamps{tag}")
# the stand's cable gate and tie fins: the same steps that were applied to the master design
steps += json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "stand-steps.json")))["commands"][:-1]

# ---- desk frame of the stand: u along the desk towards the front, v up from the desk ----
C = (-21.28, -136.99); B = (-117.19, 0.0)
L = math.hypot(B[0] - C[0], B[1] - C[1]); d = ((B[0] - C[0]) / L, (B[1] - C[1]) / L); n = (d[1], -d[0])
W = lambda x, u, v: [x, C[0] + u * d[0] + v * n[0], C[1] + u * d[1] + v * n[1]]

dark, nylon = [], []
def run(name, pts, r=2.75):
    """Cable as straight cylinders with balls at the kinks, each its own body."""
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ax = [b[k] - a[k] for k in range(3)]; ln = math.sqrt(sum(v * v for v in ax))
        bn = name if i == 0 else f"{name} {i + 1}"; dark.append(bn)
        add("solid.cylinder", radius=r, height=round(ln, 4), base=list(a), axis=ax, operation="new_body", name=f"Hw{name.title().replace(' ', '').replace('(', '').replace(')', '')}Run{i + 1}", body_name=bn)
        if i > 0:
            kn = f"{name} knee {i}"; dark.append(kn)
            add("solid.sphere", radius=r, center=list(a), operation="new_body", name=f"Hw{name.title().replace(' ', '').replace('(', '').replace(')', '')}Knee{i}", body_name=kn)

# bottom-exit cable again, now lying under the saddle seat (centre 8.25: top just clears the notch's 11.0)
add("timeline.delete", features=["HwCableBottomA", "HwCableBottomKnee", "HwCableBottomB"])
run("Ethernet cable (bottom exit)", [(-33.8, -73.6, 10.15), (-33.8, -94.0, 8.25), (-33.8, -170.0, 8.25)])

# cable tie on the Ethernet saddle: a rectangular band around cable and bridge, head in the outer shaft
add("solid.box", center=[-34.25, -100.35, 9.75], length=8.5, width=2.5, height=10.7, operation="new_body", name="HwTieCapBand", body_name="Cable tie (cap)")
add("solid.box", center=[-34.25, -100.35, 9.75], length=6.5, width=4.0, height=8.7, operation="cut", targets=["Cable tie (cap)"], name="HwTieCapBandInner")
add("solid.box", center=[-40.75, -100.35, 7.95], length=4.5, width=4.8, height=3.5, operation="new_body", name="HwTieCapHead", body_name="Cable tie (cap) head")
nylon += ["Cable tie (cap)", "Cable tie (cap) head"]

# desk cable: plug -> through dock opening and stand window -> left tie fin -> out through the gate
VC = 6.75
run("Ethernet cable (desk)", [(-33.8, -73.6, 10.15), (-32.0, -86.0, 2.0), (-26.0, -88.0, -12.0), W(-3.2, 24, VC), W(-3.2, -16, VC)])

# cable tie on the left fin: band in the X-v plane through both slots, head on the far side of the fin
def uv_sketch(name, u0):
    o = W(0, u0, 0)
    add("sketch.create", plane={"origin": o, "x_dir": [1, 0, 0], "y_dir": [0, n[0], n[1]]}, name=name)
def rect(x0, v0, x1, v1): add("sketch.line", points=[[x0, v0], [x1, v0], [x1, v1], [x0, v1]], closed=True)
uv_sketch("HwTieStandBandSketch", 13.0)
rect(-10.3, 3.0, 0.55, 10.5); rect(-9.3, 4.0, -0.45, 9.5)
add("sketch.constraint.fix", entities=[f"l{i}" for i in range(1, 9)]); add("sketch.solve"); add("sketch.finish")
add("solid.extrude", sketch="HwTieStandBandSketch", distance=2.5, operation="new", name="HwTieStandBand", body_name="Cable tie (stand)")
uv_sketch("HwTieStandHeadSketch", 12.0)
rect(-14.8, 5.0, -10.3, 8.5)
add("sketch.constraint.fix", entities=[f"l{i}" for i in range(1, 5)]); add("sketch.solve"); add("sketch.finish")
add("solid.extrude", sketch="HwTieStandHeadSketch", distance=4.5, operation="new", name="HwTieStandHead", body_name="Cable tie (stand) head")
nylon += ["Cable tie (stand)", "Cable tie (stand) head"]

add("appearance.assign", bodies=dark, color="#2B2F36")
add("appearance.assign", bodies=nylon, color="#F4F1E8")
add("browser.visibility", visible=False, items=["TieRampSketchEth", "TieRampSketchDc", "StandCableGateSketch", "StandTieFinRSketch", "StandTieFinLSketch",
                                                "StandTieSlotSketch", "HwTieStandBandSketch", "HwTieStandHeadSketch"])
for b in ("Cap", "Stand", "Cable tie (cap)", "Cable tie (stand)"): add("measure", body=b, summary=True)
add("inspect.interference", bodies=["Cap", "Stand", "Dock", "Cable tie (cap)", "Cable tie (cap) head", "Cable tie (stand)", "Cable tie (stand) head"] + dark
    + ["attractap-touch-p4-unsaved-export-lowFx6_PCB", "Ethernet plug (ref)", "RJ45 jack (ref)"])
json.dump({"commands": steps}, open(T + "hw2-steps.json", "w"), indent=1)
print(len(steps), "steps;", "dark:", dark, "nylon:", nylon)
print("desk cable pts:", W(-3.2, 24, VC), W(-3.2, -16, VC))
