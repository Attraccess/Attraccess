import sys, math, json, subprocess, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenelib import *

Z = lambda d: {"t": [0, 0, d]}
PIV = [0, 56.25, 3]            # top edge of the dock plate: where the cap rocks while it swings shut

def f1():
    """Wall mounting, exploded along the wall normal."""
    mv = {"dock": Z(50), "wall_screws": Z(104)}
    for g in READER: mv[g] = Z(128)
    mv["lock_screws"] = {"t": [0, -34, 128]}
    s = Scene("f1-overview", Cam([0, 0, 0], -1.02, 0.30, 600, up="y", W=1400, H=1050),
              ["wall", "dock", "wall_screws", "lock_screws"] + READER, mv, fit_extra=(0.0, 0.03, 0.0, 0.0))
    s.build()
    s.label("Wall", "wall", [-125, 119, 0], -10, -22, "start")
    s.label("Dock", "dock", [-46.6, 52, 3], 30, -150, "start")
    s.label("Wall screws", "wall_screws", [-30, 36, -30], -50, -120, "end")
    s.label("Reader", "cap", [-47.4, -20, 14], -90, -40, "end")
    s.label("2 lock screws", "lock_screws", [20, -102, 12], 60, 40, "start")
    return s

def bench_cam(W=1400, H=1050, side=0.5):
    # cap lying face-down on the bench: device -Z is up, its bottom edge towards the viewer
    return cam_look([side, -0.80, -0.85], [0, 0, -1], up="z", W=W, H=H)

def f2():
    """Heat-set inserts into the cap."""
    mv = {"pcb_inserts": Z(-30), "lock_inserts": {"t": [0, -36, 0]}}
    s = Scene("f2-inserts", bench_cam(), ["cap", "pcb_inserts", "lock_inserts"], mv, fit_extra=(0.0, 0.04, 0.10, 0.02))
    s.build()
    for (x, y) in [(39.0, 45.65), (-39.0, 45.65), (25.1, -90.25), (-23.3, -67.85)]:
        s.arrow("pcb_inserts", [x, y, 20], None, [x, y, 18.5], shorten=(22, 10))
    for x in (20, -20):
        s.arrow("lock_inserts", [x, -100, 12], None, [x, -109.25, 12], shorten=(26, 8))
    s.label("4 short inserts\ninto the PCB bosses", "pcb_inserts", [39.0, 45.65, 18.5], 60, -70, "start")
    s.label("2 standard inserts\nthrough the bottom wall\ninto the lock bar", "lock_inserts", [20, -102.85, 12], 80, 10, "start")
    s.label("Lock bar", None, [-6, -99, 3.5], -200, -130, "end")
    s.label("Cap, face down", None, [-47.4, 20, 3], -60, -150, "end")
    s.label_abs("2 saddles for\ncable ties", None, [-34.8, -101, 11.2], 1125, 520, "start")
    return s

def f3():
    """Reader stack, exploded upwards from the face-down cap."""
    mv = {"diffusers": Z(-26), "display": Z(-60), "frame": Z(-92), "pcb": Z(-132), "pcb_screws": Z(-176)}
    cam = cam_look([0.55, -0.80, -0.50], [0, 0, -1], up="z", W=1300, H=1450)
    s = Scene("f3-stack", cam,
              ["cap", "pcb_inserts", "lock_inserts", "diffusers", "display", "frame", "pcb", "pcb_screws"], mv,
              fit_extra=(0.20, 0.0, 0.20, 0.0), margin=0.04)
    s.build()
    A = {"screws": ("pcb_screws", [-39.0, 45.65, 14.7]), "pcb": ("pcb", [-43, -10, 17.7]), "frame": ("frame", [44.5, 10, 20.5]),
         "display": ("display", [42.15, -30, 23.6]), "diff": ("diffusers", [-19.5, -46.5, 20]), "cap": ("cap", [47.4, -70, 8])}
    s.anchors = {k: s.P(*v) for k, v in A.items()}
    L, R = 270, 1035
    s.label_abs("4 screws M3 × 4", *A["screws"], R, s.anchors["screws"][1] - 30, "start")
    s.label_abs("PCB,\ncomponents up", *A["pcb"], R, s.anchors["pcb"][1] - 10, "start")
    s.label_abs("Display frame,\ntape on the rim", *A["frame"], L, s.anchors["frame"][1] - 30, "end")
    s.label_abs("Display,\nglass down", *A["display"], L, s.anchors["display"][1] + 10, "end")
    s.label_abs("2 LED diffusers", *A["diff"], R, s.anchors["diff"][1] - 20, "start")
    s.label_abs("Cap,\nface down", *A["cap"], L, s.anchors["cap"][1] + 40, "end")
    return s

TILT, LIFT = -22.0, 6.0
def f5():
    """Plug in, hook the top over the cleat, swing shut. Seen from the left side."""
    mv = {g: {"rot": (PIV, [1, 0, 0], TILT), "t": [0, LIFT, 0]} for g in READER + ["plug"]}
    s = Scene("f5-hook", Cam([0, 0, 0], 1.45, 0.08, 600, up="y", W=1400, H=1050),
              ["wall", "dock", "wall_screws", "plug"] + READER, mv, fit_extra=(0.0, 0.0, 0.0, 0.0),
              extra_pts=[[-33.8, -110, 50]], light=(0.55, 0.75, 0.45), margin=0.05)
    s.build()
    # slack cable from the wall hole to the tilted plug, as one arc in the plane X = -33.8
    S = s.xf("plug", [-33.8, -73.6, 10.15]); E = [-33.8, -84.0, -12.0]; M = [-33.8, -104.0, 30.0]
    s.cable = (S, M, E)
    s.extra_steps = [
        {"command": "sketch.create", "params": {"plane": "YZ", "offset": -33.8, "name": "CableSlackPath"}},
        {"command": "sketch.arc.three_point", "params": {"start": [round(S[1], 3), round(S[2], 3)], "end": [E[1], E[2]], "through": [M[1], M[2]]}},
        {"command": "sketch.finish", "params": {}},
    ]
    top = s.P("cap", [-47.4, 57.05, 14]); bot = s.P("cap", [-47.4, -109.25, 14]); cab = s.P(None, M)
    s.anchors = {"top": top, "bot": bot, "cable": cab, "tongue": s.P(None, [-27, -104.6, 19]), "dock": s.P(None, [-46.6, 10, 1.5]),
                 "wall": s.P(None, [-125, 90, -7])}
    s.label_abs("Wall", None, [-125, 90, -7], s.anchors["wall"][0] - 120, s.anchors["wall"][1] - 60, "end")
    s.label_abs("Dock", None, [-46.6, 10, 1.5], s.anchors["dock"][0] - 190, s.anchors["dock"][1] + 20, "end")
    s.label_abs("Dock tongue", None, [-27, -104.6, 19], s.anchors["tongue"][0] - 150, s.anchors["tongue"][1] + 130, "end")
    s.label_abs("Reader", "cap", [-47.4, -20, 24.4], s.P("cap", [-47.4, -20, 24.4])[0] + 170, s.P("cap", [-47.4, -20, 24.4])[1] - 40, "start")
    ws = s.P(None, [-30, 36, -30])
    s.label_abs("Wall screw", None, [-30, 36, -30], ws[0] - 110, ws[1] - 50, "end")
    a0 = s.P(None, [-47.4, -119, 66])
    s.note("1  Plug in the cable\n    from the wall", bot[0] + 90, bot[1] - 22, "start", 34, "700")
    s.note("2  Hook the top\n    over the cleat", top[0] + 150, top[1] - 90, "start", 34, "700")
    s.note("3  Swing shut", a0[0] + 34, a0[1] + 12, "start", 34, "700")
    s.arrow(None, [-47.4, 112, 30], None, [-47.4, 66, 12], shorten=(0, 0))
    s.arrow(None, [-47.4, -119, 66], None, [-47.4, -119, 26], shorten=(0, 0))
    return s

def detail(name, centre, half, labels):
    c = Cam([0, 0, 0], -1.32, 0.12, 300, fov=0.25, up="y", W=1400, H=1050)
    box = [[20 + dx, centre[0] + sy * half[0], centre[1] + sz * half[1]] for dx in (0, -25) for sy in (-1, 1) for sz in (-1, 1)]
    s = Scene(name, c, ["wall", "dock", "wall_screws", "lock_screws"] + READER, {}, fit_groups=[], extra_pts=box, margin=0.02)
    s.cut = True
    s.build()
    for (text, p, dx, dy, anchor) in labels:
        s.label(text, None, p, dx, dy, anchor)
    return s

def f6a():
    return detail("f6a-cleat", (44, 12), (24, 15), [
        ("Cap hook", [20, 53.6, 5.2], 160, -150, "start"),
        ("Dock cleat", [20, 48.5, 6.5], -120, -200, "end"),
        ("Dock plate", [20, 30, 1.5], -40, 150, "end"),
        ("Wall", [20, 30, -8], 40, 110, "start"),
        ("Wall screw", [-30, 36, -36.3], -30, 130, "end"),
    ])

def f6b():
    return detail("f6b-lock", (-96, 12), (24, 15), [
        ("Lock bar with\nbrass insert", [20, -99.5, 12], 150, -230, "start"),
        ("Dock tongue", [20, -104.6, 6.5], 150, 150, "start"),
        ("Lock screw M3 × 8", [20, -105.9, 12], 40, 200, "start"),
        ("Bottom wall with\naccess hole", [20, -108.1, 20.5], -120, 130, "end"),
        ("Wall", [20, -84, -8], 30, -150, "start"),
        ("Dock plate", [20, -93, 1.5], 140, 40, "start"),
    ])

def f8():
    """From below: lock screws and the bottom cable exit."""
    mv = {"lock_screws": {"t": [0, -46, 0]}}
    pts = [[-47.4, -15, 24.4], [47.4, -15, 24.4], [-47.4, -109.25, 3], [47.4, -109.25, 3], [47.4, -109.25, 24.4], [-47.4, -109.25, 24.4],
           [20, -154, 12], [-20, -154, 12], [-33.8, -168, 7], [70, -60, 0], [-70, -60, 0]]
    s = Scene("f8-below", Cam([0, 0, 0], -0.62, -0.85, 600, up="y", W=1400, H=1050),
              ["wall", "dock", "wall_screws", "lock_screws", "plug", "cable_bottom"] + READER, mv,
              fit_groups=[], extra_pts=pts, margin=0.07, fit_extra=(0.10, 0.0, 0.10, 0.0))
    s.pre_steps = [{"command": "timeline.suppress", "params": {"features": ["BreakTabEth", "BreakTabEthRound"], "suppressed": True}}]
    s.build()
    for x in (20, -20):
        s.arrow("lock_screws", [x, -106.45, 12], None, [x, -109.25, 12], shorten=(18, 14))
    scr = s.P("lock_screws", [20, -102.5, 12]); cab = s.P(None, [-33.8, -140, 7]); tab = s.P(None, [36.8, -109.25, 6])
    s.anchors = {"screw": scr, "cable": cab, "tab": tab}
    s.label_abs("2 lock screws M3 × 8", "lock_screws", [20, -102.5, 12], scr[0] + 110, scr[1] + 70, "start")
    s.label_abs("Cable leaves through\nthe bottom notch,\ntab snapped off", None, [-33.8, -140, 7], cab[0] - 90, cab[1] - 10, "end")
    s.label_abs("Second notch,\ntab left in", None, [36.8, -109.25, 6], tab[0] + 130, tab[1] - 20, "start")
    return s

NUP = [0, 0.8192, 0.5736]; FRONT = [0, -0.5736, 0.8192]
def f9():
    """Desk stand, exploded along the sloped face."""
    mv = {"stand_inserts": Z(18), "dock": Z(52), "stand_screws": Z(84)}
    for g in READER: mv[g] = Z(104)
    mv["lock_screws"] = Z(104)
    o = add(add([0.95, 0, 0], mul(FRONT, 0.38)), mul(NUP, 0.42))
    s = Scene("f9-stand", cam_look(o, NUP, up="z", W=1400, H=1050),
              ["stand", "stand_inserts", "dock", "stand_screws", "lock_screws", "desk"] + READER, mv,
              fit_groups=["stand", "dock", "stand_screws", "cap"], fit_extra=(0.0, 0.03, 0.0, 0.0))
    s.build()
    rd = s.P("cap", [-47.4, 10, 24.4]); dk = s.P("dock", [46.6, 56.25, 1.5]); sc = s.P("stand_screws", [30, 36, 0]); ins = s.P("stand_inserts", [30, 36, -2])
    win = s.P("stand", [-25, -76.5, 0])
    s.anchors = {"reader": rd, "dock": dk, "screw": sc, "insert": ins, "window": win}
    s.label("Stand", "stand", [40, -40, -80], 40, 150, "start")
    s.label_abs("Reader", "cap", [-47.4, 10, 24.4], rd[0] - 130, rd[1] - 60, "end")
    s.label_abs("4 screws M3 × 8", "stand_screws", [30, 36, 0], 720, 70, "start")
    s.label_abs("Dock", "dock", [46.6, 56.25, 1.5], 900, 170, "start")
    s.label_abs("4 inserts", "stand_inserts", [30, 36, -2], 960, 300, "start")
    s.label_abs("Cable window", "stand", [-25, -76.5, 0], win[0] - 60, win[1] + 190, "end")
    return s

def f11():
    """Strain relief at the bottom exit: the cable tied onto the saddle in the cap. Reader face down, seen from its top end."""
    cam = cam_look([-0.30, 0.75, -0.85], [0, 0, -1], up="z", W=1400, H=1000)
    pts = [[x, y, z] for x in (-47.4, 47.4) for y in (-109.25, -62) for z in (3, 24.4)] + [[-33.8, -128, 8.25]]
    s = Scene("f11-tie-cap", cam, ["cap", "pcb", "pcb_screws", "pcb_inserts", "lock_inserts", "plug", "cable_bottom", "tie_cap",
                                   "display", "frame", "diffusers"], {}, fit_groups=[], extra_pts=pts, margin=0.05)
    s.build()
    A = {"tie": [-34.25, -100.35, 4.4], "head": [-41.5, -100.35, 6.2], "saddle": [36.8, -100.4, 11.2], "cable": [-33.8, -118, 5.5],
         "lockbar": [24, -99.1, 3.5], "plug": [-33.8, -62, 6.15], "notch": [36.8, -108, 9.5]}
    s.anchors = {k: s.P(None, v) for k, v in A.items()}
    for (k, text, lx, ly, anchor) in getattr(f11, "labels", []):
        s.label_abs(text, None, A[k], lx, ly, anchor)
    return s

f11.labels = [("cable", "Ethernet cable, out\nthrough the bottom notch", 330, 105, "start"),
              ("tie", "Cable tie around\ncable and saddle", 470, 235, "start"),
              ("head", "Tie head,\nbeside the cable", 28, 640, "start"),
              ("lockbar", "Lock bar", 830, 70, "start"),
              ("saddle", "Second saddle,\nfor a power cable", 1090, 48, "start"),
              ("plug", "Ethernet plug", 610, 610, "start")]

def f12():
    """Strain relief on the desk stand: stand lifted and turned over, seen from its rear edge."""
    BACK = mul(FRONT, -1); DOWN = mul(NUP, -1)
    o = add(add(mul(DOWN, 0.80), mul(BACK, 0.62)), [0.26, 0, 0])
    cam = cam_look(o, FRONT, up="z", W=1400, H=1000)
    Wp = lambda x, u, v: add(add([x, -21.28, -136.99], mul(FRONT, u)), mul(NUP, v))
    pts = [Wp(x, u, v) for x in (-40, 40) for u in (-20, 62) for v in (0, 26)]
    s = Scene("f12-tie-stand", cam, ["stand", "dock", "stand_screws", "stand_inserts", "plug", "cable_desk", "tie_stand", "lock_screws"] + READER,
              {}, fit_groups=[], extra_pts=pts, margin=0.05)
    s.build()
    A = {"fin": Wp(7.6, 17, 13.5), "tie": Wp(-7.0, 14.25, 3.0), "gate": Wp(4.6, 1.5, 0.0), "cable": [-14.6, -58.8, -62.7],
         "rim": Wp(-38.4, 60, 0), "head": Wp(-12.5, 14.25, 8.5), "out": Wp(-3.2, -12, 9.5), "reader": [47.4, -70, 14]}
    s.anchors = {k: s.P(None, v) for k, v in A.items()}
    for (k, text, lx, ly, anchor) in getattr(f12, "labels", []):
        s.label_abs(text, None, A[k], lx, ly, anchor)
    return s

f12.labels = [("rim", "Stand, lifted and\nseen from below", 300, 130, "end"),
              ("cable", "Cable from the reader,\nthrough the window", 720, 105, "start"),
              ("tie", "Cable tie through both\nslots of the fin", 330, 760, "end"),
              ("fin", "Second fin,\nfor a second cable", 930, 800, "start"),
              ("gate", "Cable notch", 700, 905, "start")]

CUTX = -33.8                    # section plane of figure 13: through the middle of the Ethernet jack, plug and cable
def f13():
    """Cable into the wall: section through the Ethernet jack, seen from the reader's left side (wall on the left)."""
    cam = Cam([0, 0, 0], 1.42, 0.10, 300, fov=0.25, up="y", W=1400, H=1050)
    pts = [[x, y, z] for x in (CUTX, CUTX + 12) for y in (-112, -36) for z in (-24, 27)]
    s = Scene("f13-wall-route", cam, ["wall", "dock", "wall_screws", "lock_screws", "plug", "cable_wall"] + READER, {},
              fit_groups=[], extra_pts=pts, margin=0.03, fit_extra=(0.26, 0.0, 0.26, 0.0), light=(0.55, 0.75, 0.45))
    s.extra_steps = [{"command": "browser.visibility", "params": {"visible": False, "items": ["Wall screw 1", "Wall screw 3", "Wall screw 5"]}},
                     {"command": "solid.box", "params": {"length": 300, "width": 420, "height": 300, "center": [CUTX - 150, -26, 0],
                      "operation": "cut", "name": "CutawayWallRoute",
                      "targets": ["Cap", "Dock", "Wall (render prop)", PCB_BODY, "Display lens (ref)", "LCD module (ref)", "Display frame"]}}]
    s.build()
    A = {"wall": [CUTX, -60, -7], "hole": [CUTX, -82, -8], "edge": [CUTX, -97.6, 1.5], "dock": [CUTX, -47, 1.5],
         "cable": [-36.55, -86.8, 4.9], "plug": [-39.8, -60, 10.15], "jack": [-41.85, -40, 9], "pcb": [CUTX, -84, 17.7],
         "tab": [CUTX, -107.7, 5], "saddle": [CUTX, -104.7, 12.6], "front": [CUTX, -70, 23.2], "into": [-36.55, -92.1, -24],
         "screw": [-30, -40, -28]}
    s.anchors = {k: s.P(None, v) for k, v in A.items()}
    for (k, text, lx, ly, anchor) in getattr(f13, "labels", []):
        s.label_abs(text, None, A[k], lx, ly, anchor)
    return s

f13.labels = [("screw", "Wall screw", 340, 88, "end"),
              ("wall", "Wall", 440, 300, "end"),
              ("hole", "Hole in the wall,\n20 mm", 440, 480, "end"),
              ("cable", "Bend, radius\nabout 18 mm", 440, 600, "end"),
              ("into", "Ethernet cable\nfrom the wall", 440, 880, "end"),
              ("edge", "Lower edge of the\nopening in the dock", 440, 985, "end"),
              ("jack", "RJ45 jack\non the board", 1065, 90, "start"),
              ("plug", "Plug and boot", 1065, 290, "start"),
              ("pcb", "Board", 1065, 600, "start"),
              ("saddle", "Tie saddle, only for\nthe bottom exit", 1065, 830, "start"),
              ("tab", "Break-off tab,\nleft in place", 1065, 985, "start")]

ZCUT = 16.5                     # figure 14: everything in front of this plane is removed (front wall, display, board)
def f14():
    """Cable into the wall: reader on the wall with front, display and board removed, seen from the front, a little from above right."""
    cam = cam_look([0.35, 0.42, 0.84], [0, 1, 0], up="y", W=1400, H=1050)
    pts = [[x, y, z] for x in (-48, 48) for y in (-110, -18) for z in (0, ZCUT)]
    s = Scene("f14-wall-route-front", cam, ["wall", "dock", "wall_screws", "lock_screws", "cap", "pcb", "plug", "cable_wall", "dc_wall"], {},
              fit_groups=[], extra_pts=pts, margin=0.03, fit_extra=(0.15, 0.0, 0.15, 0.0))
    s.extra_steps = [{"command": "browser.visibility", "params": {"visible": False, "items": INLAYS + [PCB_BODY]}},
                     {"command": "solid.box", "params": {"length": 300, "width": 420, "height": 100, "center": [0, -26, ZCUT + 50],
                      "operation": "cut", "targets": ["Cap"], "name": "CutawayFront"}},
                     # dark plate behind the 14 mm wall piece, so the hole does not show the bright background
                     {"command": "solid.box", "params": {"length": 30, "width": 30, "height": 1, "center": [-32, -88, -14.4],
                      "operation": "new_body", "name": "HoleBacking", "body_name": "Hole backing (render prop)"}},
                     {"command": "appearance.assign", "params": {"bodies": ["Hole backing (render prop)"], "color": "#1E2125"}}]
    s.build()
    A = {"jack": [-33.8, -32, 16.9], "plug": [-33.8, -58, 14.15], "cable": [-33.8, -83.1, 9.0], "hole": [-27.5, -84, 0], "open_top": [0, -52, 3],
         "opening": [22, -66, 3], "dcplug": [37.3, -70, 15.15], "lead": [6, -91.5, 7.4], "term": [27, -52, 16.9],
         "lockbar": [-10, -99.1, ZCUT], "dock": [-5, -30, 3], "dcjack": [37.3, -50, 16.9], "wall": [-60, -75, 0]}
    s.anchors = {k: s.P(None, v) for k, v in A.items()}
    for (k, text, lx, ly, anchor) in getattr(f14, "labels", []):
        s.label_abs(text, None, A[k], lx, ly, anchor)
    return s

f14.labels = [("jack", "RJ45 jack", 250, 200, "end"),
              ("plug", "Ethernet plug", 250, 420, "end"),
              ("cable", "Ethernet cable\ninto the wall", 250, 640, "end"),
              ("lockbar", "Lock bar", 300, 960, "end"),
              ("open_top", "Opening in the dock", 540, 300, "start"),
              ("term", "DC terminal for\nbare wires", 850, 190, "end"),
              ("hole", "Hole in the wall,\n20 mm", 560, 470, "start"),
              ("lead", "Power lead to\nthe same hole", 750, 620, "start"),
              ("dcjack", "DC jack", 1130, 470, "start"),
              ("dcplug", "Barrel plug", 1130, 660, "start")]

SCENES = {"f13": f13, "f14": f14, "f11": f11, "f12": f12, "f1": f1, "f2": f2, "f3": f3, "f5": f5, "f6a": f6a, "f6b": f6b, "f8": f8, "f9": f9}

if __name__ == "__main__":
    cmd, key = sys.argv[1], sys.argv[2]
    s = SCENES[key]()
    if cmd == "build":
        d = json.load(open(T + f"scene-{s.name}.json"))
        d["commands"] = getattr(s, "pre_steps", []) + d["commands"][:-1] + getattr(s, "extra_steps", []) + d["commands"][-1:]
        if getattr(s, "cut", False):
            hide = ["DC jack (ref)", "WAGO terminal (ref)", "Buzzer (ref)", "Reset button (ref)", "Boot button (ref)",
                    "PCB screw 1", "PCB screw 3", "PCB insert 1", "PCB insert 3", "Wall screw 1", "Wall screw 3", "Wall screw 5",
                    "Wordmark inlay (10)"]
            cut = ["Cap", "Dock", "Wall (render prop)", PCB_BODY, "Display lens (ref)", "LCD module (ref)", "Display frame", "ESP32-C6 module (ref)"]
            pre = [{"command": "browser.visibility", "params": {"visible": False, "items": hide}},
                   {"command": "solid.box", "params": {"length": 300, "width": 420, "height": 300, "center": [170, -26, 0],
                                                       "operation": "cut", "targets": cut, "name": "CutawayX20"}}]
            d["commands"] = d["commands"][:-1] + pre + d["commands"][-1:]
            if key == "f6b": d["commands"] = d["commands"][-1:]
        json.dump(d, open(T + f"scene-{s.name}.json", "w"))
        info = {"scene": T + f"scene-{s.name}.json", "setup": "m-" + s.name, "camera": s.cam.setup()}
        if hasattr(s, "cable"): info["cable"] = s.cable
        if hasattr(s, "anchors"): info["anchors"] = {k: [round(v[0]), round(v[1])] for k, v in s.anchors.items()}
        print(json.dumps(info))
    elif cmd == "compose":
        png = sys.argv[3]; out = sys.argv[4]
        svg = s.compose(png, out)
        subprocess.run(["rsvg-convert", "-o", out, svg], check=True, cwd=os.path.dirname(os.path.abspath(png)))
        print(out)
