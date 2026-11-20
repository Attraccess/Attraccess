"""Figures that explain the face plate: how it clips in (sections through hook and screw tab) and how a wood front is built up.

    python3 -I clip_figure.py <attractap-touch-faceplate.sc> <workdir>

Writes `how-it-clips-in.png` and `wood-front-build-up.png` next to the `tools` folder. Each panel is a real cut of the
model rendered with SolidCraft's command-line path tracer; the labels are placed by projecting model points with the
same camera, then drawn as an SVG overlay (needs rsvg-convert).
"""
import base64, json, math, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # `python3 -I` leaves the script's folder off the path
import gen_faceplate as g

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1024, 768
INL = g.WORD + g.TAP
PCB = "attractap-touch-p4-unsaved-export-lowFx6_PCB"
REFS = ["RJ45 jack (ref)", "PoE module (ref)", "Capacitor C103 (ref)", "USB-C (ref)", "DC jack (ref)", "WAGO terminal (ref)", "Buzzer (ref)",
        "ESP32-C6 module (ref)", "Reset button (ref)", "Boot button (ref)"]
HINGE = (57.05, 23.6)                      # the plate turns about its upper back edge (Y, Z)
ink, soft, paper = "#202729", "#5E6A72", "#F0F2F5"
SIDE = {"distance": 150.0, "fov": 0.40, "pitch": 0.0, "roll": 0.0, "up": "y", "yaw": -math.pi / 2}   # looking along -X at a cut face


def project(p, cam):
    """Model point to pixel, for a camera with up = y (see the manual tooling for where the formulas come from)."""
    yaw, pitch, d, t = cam["yaw"], cam["pitch"], cam["distance"], cam["target"]
    off = (-math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch))
    eye = [t[i] + d * off[i] for i in range(3)]
    f = [-o for o in off]
    r = (f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0)
    n = math.sqrt(sum(c * c for c in r))
    r = [c / n for c in r]
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    v = [p[i] - eye[i] for i in range(3)]
    xc, yc, zc = (sum(v[i] * a[i] for i in range(3)) for a in (r, u, f))
    s = (H / 2) / math.tan(cam["fov"] / 2)
    return W / 2 + xc / zc * s, H / 2 - yc / zc * s


def turned(y, z, deg):
    """Where a point of the plate is after the plate swings out by `deg` degrees."""
    a = math.radians(-deg)
    dy, dz = y - HINGE[0], z - HINGE[1]
    return HINGE[0] + dy * math.cos(a) - dz * math.sin(a), HINGE[1] + dy * math.sin(a) + dz * math.cos(a)


def scene(cam, tilt=0, cut_x=None, screw=False, wall_stage=False):
    s = [g.step("browser.visibility", visible=False, items=["Stand", "Desk (render prop)", "Screen image (render prop)"]),
         g.step("appearance.assign", bodies=["Cap"], color=g.BLUE, pbr=None), g.step("appearance.assign", bodies=["Face plate"], color=g.MARBLE, pbr=None),
         g.step("appearance.assign", bodies=["Dock"], color="#9AA0A6", pbr=None), g.step("appearance.assign", bodies=["Display frame"], color="#D9DCE0", pbr=None),
         g.step("appearance.assign", bodies=INL, color=g.BLUE)]
    if tilt:
        s.append(g.step("solid.move", bodies=["Face plate"] + INL, origin=[0, HINGE[0], HINGE[1]], axis=[1, 0, 0], angle=f"-{tilt} deg", name="FigSwing"))
    if cut_x is not None:
        targets = ["Cap", "Face plate", "Dock", "Display lens (ref)", "LCD module (ref)", "Display frame", PCB, "LED diffuser", "LED diffuser (2)"]
        s += [g.step("browser.visibility", visible=False, items=REFS + INL),
              g.step("solid.box", length=200, width=60, height=14, center=[cut_x - 100, -26, -7], operation="new_body", name="FigWall", body_name="Wall (figure)"),
              g.step("solid.box", length=200, width=340, height=14, center=[cut_x - 100, -26, -7], operation="join", targets=["Wall (figure)"], name="FigWallTall"),
              g.step("appearance.assign", bodies=["Wall (figure)"], color="#C3C7CC")]
        if screw:
            s += [g.step("solid.cylinder", radius=1.0, height=12, base=[cut_x, -109.25, 22.3], axis=[0, 1, 0], operation="new_body", name="FigScrew", body_name="Pin screw"),
                  g.step("solid.cylinder", radius=1.9, height=1.3, base=[cut_x, -110.55, 22.3], axis=[0, 1, 0], operation="join", targets=["Pin screw"], name="FigScrewHead"),
                  g.step("appearance.assign", bodies=["Pin screw"], color="#3A3D42", pbr={"metallic": 1.0, "roughness": 0.4, "dielectric_ior": 1.5})]
            targets.append("Pin screw")
        s.append(g.step("solid.box", length=200, width=400, height=200, center=[cut_x + 100, -26, 10], operation="cut", targets=targets, name="FigCut"))
    job = {"method": "gpu_path", "transparent_background": False,
           "options": {"denoise": True, "hdr": {"assume_linear_srgb": False, "intensity": 1.0, "resource": g.HDR, "rotation_rad": 0.35},
                       "lighting": {"area_lights": [], "environment": [0, 0, 0], "sun": None}, "linear_exr": False, "max_depth": 8,
                       "nested_media": False, "samples": 256, "seed": 0, "tone_map": "reinhard", "transmission_samples": 1}}
    s.append(g.step("render.settings.set", name="fp", set={"camera": cam, "width": W, "height": H, "mode": "final", "exposure_ev": -0.6, "job": job,
                                                           "surfaces": [], "optics": [], "stage": g.WALL_STAGE if wall_stage else []}))
    return s


def render(design, work, name, steps):
    sc, png = os.path.join(work, name + ".sc"), os.path.join(work, name + ".png")
    if "--reuse" in sys.argv and os.path.exists(png):      # keep a picture that an earlier run already rendered
        print(name, "reused", flush=True)
        return png
    code, msg = g.run(steps, design, sc=sc)
    if code:
        sys.exit(f"{name}: build failed: {msg}")
    r = subprocess.run([g.CLI, "render", sc, "--setup", "fp", "--out", png, "--overwrite", "--timeout", "3000"], capture_output=True, text=True)
    if r.returncode or not os.path.exists(png):
        sys.exit(f"{name}: render failed: " + " ".join(ln for ln in (r.stderr + r.stdout).splitlines() if ln.startswith("error"))[:400])
    print(name, "ok", flush=True)
    return png


def panel(o, png, x, y, w, title, labels, cam):
    """One picture with a title above and labels joined to model points; labels = [(model point, text, pixel x, pixel y, anchor)]."""
    k = w / W
    h = H * k
    data = base64.b64encode(open(png, "rb").read()).decode()
    o.append(f'<text x="{x:.0f}" y="{y - 14:.0f}" font-size="26" font-weight="700" fill="{ink}">{title}</text>')
    o.append(f'<image x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" href="data:image/png;base64,{data}"/>')
    o.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" fill="none" stroke="#D5DADF"/>')
    for pt, text, lx, ly, anchor in labels:
        px, py = project(pt, cam)
        px, py, lx, ly = x + px * k, y + py * k, x + lx * k, y + ly * k
        o.append(f'<line x1="{px:.1f}" y1="{py:.1f}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="{ink}" stroke-width="1.8"/><circle cx="{px:.1f}" cy="{py:.1f}" r="4.5" fill="{ink}"/>')
        for i, ln in enumerate(text.split("\n")):
            tx, ty = lx + (7 if anchor == "start" else -7), ly + 7 + i * 24
            o.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="20" font-weight="600" text-anchor="{anchor}" fill="{paper}" stroke="{paper}" stroke-width="6">{ln}</text>')
            o.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="20" font-weight="600" text-anchor="{anchor}" fill="{ink}">{ln}</text>')
    return h


def write(name, width, height, o, footer):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height:.0f}" viewBox="0 0 {width} {height:.0f}"><rect width="{width}" height="{height:.0f}" fill="{paper}"/>'
           '<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" stroke-linecap="round">' + "".join(o) +
           f'<text x="50" y="{height - 26:.0f}" font-size="18" fill="{soft}">{footer}</text></g></svg>')
    p = os.path.join(OUT, name + ".svg")
    open(p, "w").write(svg)
    subprocess.run(["rsvg-convert", "-o", os.path.join(OUT, name + ".png"), p], check=True)
    os.remove(p)
    print("ok", os.path.join(OUT, name + ".png"))


def main():
    design, work = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    X_HOOK, X_TAB, TILT = 30.0, 12.0, 22
    over = {"distance": 520.0, "fov": 0.45, "pitch": 0.22, "roll": 0.0, "target": [0.0, -30.0, 24.0], "up": "y", "yaw": -1.0}
    top = dict(SIDE, target=[X_HOOK, 42.0, 14.0])
    bot = dict(SIDE, target=[X_TAB, -98.0, 14.0])
    a = render(design, work, "fig-overall", scene(over, tilt=TILT, wall_stage=True))
    b = render(design, work, "fig-hook-open", scene(top, tilt=TILT, cut_x=X_HOOK))
    c = render(design, work, "fig-hook-closed", scene(top, cut_x=X_HOOK))
    d = render(design, work, "fig-tab", scene(bot, cut_x=X_TAB, screw=True))
    # --- figure 1: how it clips in
    def t(y, z):                      # a point on the swung-out plate, on the hook's cut face
        yy, zz = turned(y, z, TILT)
        return [X_HOOK, yy, zz]
    o, pw, m, gap = [], 930, 50, 40
    o.append(f'<text x="{m}" y="{m + 22}" font-size="36" font-weight="700" fill="{ink}">Attractap Touch · how the face plate goes on</text>')
    y0 = m + 96
    h = panel(o, a, m, y0, pw, "1 · Hold the plate tilted and hook its top edge in", [
        ([0, *turned(-109.25, 25.6, TILT)], "Bottom edge of the plate,\nswung out about 60 mm", 300, 690, "end"),
        ([30, 53.0, 23.6], "Two hooks behind\nthe top edge", 760, 90, "start"),
        ([0, -60, 23.6], "Flat front of the cap", 300, 520, "end")], over)
    panel(o, b, m + pw + gap, y0, pw, "Section through one hook, plate still tilted", [
        (t(54.9, 19.9), "Hook on the back\nof the plate", 300, 150, "end"),
        ([X_HOOK, 55.9, 12.0], "Top wall of the cap", 760, 110, "start"),
        ([X_HOOK, 55.3, 19.9], "Pocket in the top wall", 760, 200, "start"),
        ([X_HOOK, 47.0, 22.8], "Front wall of the cap,\nslot for the hook", 760, 420, "start"),
        (t(46.5, 24.6), "Plate", 200, 330, "end"),
        ([X_HOOK, 30.0, 24.8], "Display glass", 330, 640, "end"),
        ([X_HOOK, 40.0, 17.7], "Board", 760, 520, "start"),
        ([X_HOOK, 16.0, -7.0], "Wall", 900, 720, "start")], top)
    y1 = y0 + h + 84
    panel(o, c, m, y1, pw, "2 · Swing it shut: the hook sits in its pocket", [
        ([X_HOOK, 54.9, 20.2], "Hook, caught behind the\nsloped face of the pocket", 300, 150, "end"),
        ([X_HOOK, 50.0, 24.6], "Plate, flat on the cap", 300, 330, "end"),
        ([X_HOOK, 30.0, 24.8], "Display glass, flush\nwith the plate", 300, 640, "end"),
        ([X_HOOK, 55.9, 12.0], "Top wall of the cap", 760, 110, "start"),
        ([X_HOOK, 50.0, 1.5], "Dock on the wall", 760, 330, "start")], top)
    h = panel(o, d, m + pw + gap, y1, pw, "3 · Two screws from below lock the bottom edge", [
        ([X_TAB, -105.6, 20.6], "Tab on the back of the plate", 300, 250, "end"),
        ([X_TAB, -110.2, 22.3], "M2 x 12 screw, from below", 300, 700, "end"),
        ([X_TAB, -100.0, 22.3], "Screw thread in the\ncap's lock bar", 300, 120, "end"),
        ([X_TAB, -99.0, 12.0], "Lock bar of the cap", 760, 110, "start"),
        ([X_TAB, -104.6, 12.0], "Tongue of the dock", 760, 330, "start"),
        ([X_TAB, -108.0, 10.0], "Bottom wall of the cap", 760, 560, "start"),
        ([X_TAB, -90.0, 24.6], "Plate", 150, 400, "end")], bot)
    write("how-it-clips-in", 2 * m + 2 * pw + gap, y1 + h + 70, o,
          "Sections cut through the real model. Collision-checked in CAD at six angles of the swing; not yet printed or tried by hand.")
    # --- figure 2: the wood front, pulled apart
    ex = {"distance": 600.0, "fov": 0.45, "pitch": 0.28, "roll": 0.0, "target": [0.0, -26.0, 34.0], "up": "y", "yaw": -0.9}
    cut, face = g.split("sheet")
    look, surf = g.PLATES["walnut"][1], g.PLATES["walnut"][2]
    base = [g.step("browser.visibility", visible=False, items=["Stand", "Desk (render prop)", "Screen image (render prop)"])] + cut + [
        g.step("appearance.assign", bodies=["Cap", "Plate carrier"], color=g.BLUE, pbr=None), g.step("appearance.assign", bodies=["Dock"], color=g.WHITE, pbr=None),
        g.step("appearance.assign", bodies=INL, color="#22160D"), g.step("appearance.assign", bodies=[face], **look),
        g.step("solid.move", bodies=["Plate carrier"], translate=[0, 0, 22], name="FigCarrierOut"),
        g.step("solid.move", bodies=[face] + INL, translate=[0, 0, 50], name="FigSheetOut")]
    probe = os.path.join(work, "fig-wood.probe.json")
    code, msg = g.run(base + [g.step("render.library.targets", query=face)], design, out=probe)
    if code:
        sys.exit("wood probe failed: " + msg)
    res = json.load(open(probe))
    res = res if isinstance(res, list) else res.get("results", [])
    steps = base + scene(ex, wall_stage=True)[-1:]
    steps.append(g.step("render.library.surface.bind", name="fp", surface={"id": surf, "body_index": res[-1]["items"][0]["ordinal"], "body_name": face, "plane": "xy", "scale": 2.5}))
    e = render(design, work, "fig-wood", steps)
    o = [f'<text x="{m}" y="{m + 22}" font-size="36" font-weight="700" fill="{ink}">Attractap Touch · how a wood front is built up</text>']
    h = panel(o, e, m, m + 96, 1300, "Three layers: cap, printed carrier, wood sheet", [
        ([-36, -78, 75.4], "Wood sheet, 0.8 mm: laser-cut outline, display\nwindow and LED slots, marks engraved", 330, 110, "end"),
        ([40, -92, 46.6], "Printed carrier, 1.2 mm, with the hooks and tabs\non its back. The sheet is bonded onto it.", 330, 700, "end"),
        ([30, 52.4, 23.6], "Slot for one of the two hooks", 830, 70, "start"),
        ([42, -80, 14.0], "Cap, printed, flat front", 860, 640, "start"),
        ([0, 0, 25.0], "Display glass", 860, 380, "start")], ex)
    write("wood-front-build-up", 2 * m + 1300, m + 96 + h + 70, o, "The carrier and the sheet are pulled forward for the picture; bonded together they are the 2 mm face plate.")


if __name__ == "__main__":
    main()
