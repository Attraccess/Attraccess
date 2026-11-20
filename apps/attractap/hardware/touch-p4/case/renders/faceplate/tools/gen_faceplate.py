"""Renders and print files of the face-plate variant (plate covers the whole front, edge to edge).

    python3 -I gen_faceplate.py render <attractap-touch-faceplate.sc> <workdir> <key> [<key> ...] [--size WxH]
    python3 -I gen_faceplate.py export <attractap-touch-faceplate.sc> <outdir>

Render keys are <plate>-<view>: plate is one of white, walnut, birch, alu, black; view is wall, desk or detail.
Everything runs headless through SolidCraft's command-line tool; the design file is not changed.

The design holds one body, "Face plate": the printed plate, 2 mm thick, with hooks and screw tabs on its back.
For sheet materials the script splits it into a printed carrier and a 0.8 mm sheet (parameter fp_sheet). A metal
sheet gets a window over the NFC antenna, filled by a small printed tile on the carrier, and a slit from the window to the
lower edge so the sheet is not a closed ring round the antenna.
"""
import json, os, subprocess, sys

CLI = "/Applications/SolidCraft.app/Contents/MacOS/solidcraft-cli"
HDR = "09a4ff8376eff857fb1c7181e99bdf69310358e4bcc024af37922ec4361f3156"
SCREEN = "cab957b34b4dc3b99d4f4ecb24441d917bc85d4ee445aacd631f4dfb4d54beb8"
WORD = ["Wordmark inlay"] + [f"Wordmark inlay ({i})" for i in range(2, 11)]
TAP = ["Tap inlay", "Keyhole inlay"]
BLUE, WHITE, MARBLE, INK = "#256D7B", "#E9E6DE", "#EFECE4", "#202729"
METAL = {"metallic": 1.0, "roughness": 0.55, "dielectric_ior": 1.5}

# plate: (kind, look of the sheet or plate, library surface, colour of the wordmark, colour of ring and keyhole)
PLATES = {"white": ("printed", {"color": MARBLE, "pbr": None}, None, BLUE, BLUE),
          "walnut": ("sheet", {"color": "#6B4A33", "pbr": None}, "SURF-028", "#22160D", "#22160D"),
          "birch": ("sheet", {"color": "#D9C19A", "pbr": None}, "SURF-030", "#4A3524", "#4A3524"),
          "alu": ("metal", {"color": "#CBD0D6", "pbr": METAL}, None, INK, MARBLE),
          "black": ("metal", {"color": "#2A2C30", "pbr": dict(METAL, roughness=0.5)}, None, "#D9DCE0", MARBLE)}
CAMERA = {"wall": {"distance": 470.0, "fov": 0.45, "pitch": 0.2, "roll": 0.0, "target": [0.0, -26.0, 13.0], "up": "y", "yaw": -0.55},
          "detail": {"distance": 300.0, "fov": 0.45, "pitch": 0.45, "roll": 0.0, "target": [4.0, 12.0, 18.0], "up": "y", "yaw": -0.95},
          "desk": {"distance": 640.0, "fov": 0.45, "pitch": 0.9732, "roll": -0.988, "target": [0.0, -48.0, -38.0], "up": "z", "yaw": -1.2799}}
WALL_STAGE = [{"center_mm": [0.0, -26.0, -0.1], "half_u_mm": [900.0, 0.0, 0.0], "half_v_mm": [0.0, 900.0, 0.0], "id": "wall",
               "reflectance_linear": [0.42, 0.43, 0.45]}]


def step(command, **params):
    return {"command": command, "params": params}


def led_slot_tool():
    """One tool body holding the eight LED slots (7 x 3 mm, round ends), as the cap's own LED windows."""
    s, first = [], True
    for y in (-46.45, -89.85):
        for x in (-15.0, -5.0, 5.0, 15.0):
            op = {"operation": "new_body", "body_name": "LED slot tool"} if first else {"operation": "join", "targets": ["LED slot tool"]}
            s.append(step("solid.box", length=4, width=3, height=6, center=[x, y, 25.0], name=f"LedSlotBox{len(s)}", **op))
            first = False
            for dx in (-2.0, 2.0):
                s.append(step("solid.cylinder", radius=1.5, height=6, base=[x + dx, y, 22.0], axis=[0, 0, 1], operation="join", targets=["LED slot tool"], name=f"LedSlotEnd{len(s)}"))
    return s


def split(kind):
    """Steps that turn the printed plate into carrier plus sheet. Returns (steps, name of the body that shows the material).

    The sheet is drawn as what a laser or a mill would cut: outline, display window, LED slots. The marks are shallow
    (0.4 mm, the inlay bodies squeezed to half their depth), so the disc inside the tap ring stays part of the sheet.
    """
    if kind == "printed":
        return [], "Face plate"
    zs, hs = "D - fp_sheet / 2", "fp_sheet"
    s = [step("solid.scale", bodies=WORD + TAP, factors=[1, 1, 0.5], name="MarksShallow"),            # about the origin ...
         step("solid.move", bodies=WORD + TAP, translate=[0, 0, "0.5 * D"], name="MarksToFront"),       # ... so lift them back to the front
         step("solid.box", length=94.8, width=166.3, height=hs, center=[0, -26.1, zs], operation="new_body", name="PlateSheetBlank", body_name="Plate sheet"),
         step("solid.fillet", edges=[[47.4, 57.05, 25.2], [-47.4, 57.05, 25.2], [47.4, -109.25, 25.2], [-47.4, -109.25, 25.2]], radius=6, body="Plate sheet", name="PlateSheetCorners"),
         step("solid.box", length=84.8, width=84.8, height=4, center=[0, 0, 25.2], operation="cut", targets=["Plate sheet"], name="PlateSheetWindow"),
         step("solid.fillet", edges=[[42.4, 42.4, 25.2], [-42.4, 42.4, 25.2], [42.4, -42.4, 25.2], [-42.4, -42.4, 25.2]], radius=1, body="Plate sheet", tangent_chain=False, name="PlateSheetWindowCorners"),
         step("solid.box", length=110, width=180, height="fp_sheet + 2", center=[0, -26.1, "D - fp_sheet + (fp_sheet + 2) / 2"], operation="cut", targets=["Face plate"], name="CarrierFaceCut"),
         step("body.rename", body="Face plate", name="Plate carrier")]
    if kind == "metal":   # window over the antenna, slit to the lower edge, and an island on the carrier that fills the window
        s += [step("solid.box", length=44, width=49.1, height=4, center=[0, -68.95, 25.2], operation="cut", targets=["Plate sheet"], name="SheetTapWindow"),
              step("solid.fillet", edges=[[22, -93.5, 25.2], [-22, -93.5, 25.2], [22, -44.4, 25.2], [-22, -44.4, 25.2]], radius=4, body="Plate sheet", tangent_chain=False, name="SheetTapWindowCorners"),
              step("solid.box", length=1.0, width=16.5, height=4, center=[0, -101.5, 25.2], operation="cut", targets=["Plate sheet"], name="SheetNfcSlit"),
              step("solid.box", length=43.6, width=48.7, height=hs, center=[0, -68.95, zs], operation="new_body", name="TapIslandBlank", body_name="Tap tile"),
              step("solid.fillet", edges=[[21.8, -93.3, 25.2], [-21.8, -93.3, 25.2], [21.8, -44.6, 25.2], [-21.8, -44.6, 25.2]], radius=3.8, body="Tap tile", name="TapIslandCorners"),
              step("solid.combine", target="Tap tile", tools=TAP, operation="cut", keep_tools=True, name="TapIslandMarks")] + led_slot_tool() + [
              step("solid.combine", target="Tap tile", tools=["LED slot tool"], operation="cut", keep_tools=False, name="TapIslandLedSlots"),
              step("solid.combine", target="Plate sheet", tools=WORD, operation="cut", keep_tools=True, name="SheetWordmark")]
    else:
        s += [step("solid.combine", target="Plate sheet", tools=WORD + TAP, operation="cut", keep_tools=True, name="SheetMarks")] + led_slot_tool() + [
              step("solid.combine", target="Plate sheet", tools=["LED slot tool"], operation="cut", keep_tools=False, name="SheetLedSlots")]
    return s, "Plate sheet"


def render_steps(key, size, ordinal=None):
    plate, view = key.split("-")
    kind, look, surf, word, tap = PLATES[plate]
    desk = view == "desk"
    cut, face = split(kind)
    s = [step("browser.visibility", visible=desk, items=["Stand", "Desk (render prop)"]),
         step("browser.visibility", visible=True, items=["Screen image (render prop)"])] + cut
    s += [step("appearance.assign", bodies=["Cap"] + {"printed": [], "sheet": ["Plate carrier"], "metal": ["Plate carrier", "Tap tile"]}[kind], color=BLUE, pbr=None),
          step("appearance.assign", bodies=["Stand", "Dock"], color=WHITE, pbr=None),
          step("appearance.assign", bodies=WORD, color=word), step("appearance.assign", bodies=TAP, color=tap),
          step("appearance.assign", bodies=[face], **look)]
    job = {"method": "gpu_path", "transparent_background": False,
           "options": {"denoise": True, "hdr": {"assume_linear_srgb": False, "intensity": 1.0, "resource": HDR, "rotation_rad": 0.35},
                       "lighting": {"area_lights": [], "environment": [0, 0, 0], "sun": None}, "linear_exr": False, "max_depth": 8,
                       "nested_media": False, "samples": 320, "seed": 0, "tone_map": "reinhard", "transmission_samples": 1}}
    surfaces = [{"local_frame": {"origin": [-35.95, -35.95, 25.56], "u": [71.9, 0.0, 0.0], "v": [0.0, 71.9, 0.0]}, "normal_strength": 1.0,
                 "source": {"base_color": SCREEN, "flip_v": True, "kind": "embedded"},
                 "target": {"component": 0, "definition": "Screen image (render prop)", "feature": 144, "occurrence_path": []}}]
    s.append(step("render.settings.set", name="fp", set={"camera": CAMERA[view], "width": size[0], "height": size[1], "mode": "final", "exposure_ev": -0.9,
                                                         "job": job, "surfaces": surfaces, "optics": [], "stage": [] if desk else WALL_STAGE}))
    if surf and ordinal is None:
        s.append(step("render.library.targets", query=face))          # first pass: where the sheet sits in the render scene
    elif surf:
        s.append(step("render.library.surface.bind", name="fp", surface={"id": surf, "body_index": ordinal, "body_name": face, "plane": "xy", "scale": 2.5}))
    return s, bool(surf)


def run(steps, design, sc=None, out=None):
    script = (sc or out) + ".steps.json"
    json.dump(steps, open(script, "w"))
    cmd = [CLI, "run", script, "--in", design] + (["--save", sc] if sc else []) + (["--results", "--json-out", out] if out else ["--quiet"])
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stderr or r.stdout).strip()[-500:]


def render(design, work, keys, size):
    os.makedirs(work, exist_ok=True)
    for key in keys:
        sc, png, probe = (os.path.join(work, key + e) for e in (".sc", ".png", ".probe.json"))
        steps, needs_surface = render_steps(key, size)
        if needs_surface:
            code, msg = run(steps, design, out=probe)
            if code:
                print(key, "PROBE FAILED:", msg, flush=True)
                continue
            res = json.load(open(probe))
            res = res if isinstance(res, list) else res.get("results", [])
            steps, _ = render_steps(key, size, res[-1]["items"][0]["ordinal"])
        code, msg = run(steps, design, sc=sc)
        if code:
            print(key, "BUILD FAILED:", msg, flush=True)
            continue
        if os.path.exists(png):
            os.remove(png)
        r = subprocess.run([CLI, "render", sc, "--setup", "fp", "--out", png, "--overwrite", "--timeout", "3000"], capture_output=True, text=True)
        err = " ".join(ln for ln in (r.stderr + r.stdout).splitlines() if ln.startswith("error"))
        print(key, "ok" if os.path.exists(png) and not r.returncode else "RENDER FAILED: " + err[:400], flush=True)


def export(design, out):
    """3MF (front face down on Z 0) and STEP of every printed part, one headless run per plate kind."""
    os.makedirs(out, exist_ok=True)
    def lay(bodies, z, name):
        return step("solid.move", bodies=bodies, origin=[0, 0, 0], axis=[1, 0, 0], angle="180 deg", translate=[0, 0, z], name=name)
    def p(name):
        return os.path.join(out, name)
    jobs = {"printed": [step("file.export_step", path=p("attractap-fp-cap.step"), bodies=["Cap"]),
                        step("file.export_step", path=p("attractap-fp-plate-printed.step"), bodies=["Face plate"]),
                        step("file.export_step", path=p("attractap-fp-assembly.step"),
                             bodies=["Cap", "Face plate", "Dock", "Stand", "Display frame", "LED diffuser", "LED diffuser (2)"] + WORD + TAP),
                        lay(["Cap"], "D - fp_t", "TmpCapLay"), lay(["Face plate"] + WORD + TAP, "D", "TmpPlateLay"),
                        step("file.save_mesh", path=p("attractap-fp-cap.3mf"), bodies=["Cap"], quality="fine"),
                        step("file.save_mesh", path=p("attractap-fp-plate-printed.3mf"), bodies=["Face plate"], quality="fine"),
                        step("file.save_mesh", path=p("attractap-fp-plate-printed-multicolor.3mf"), bodies=["Face plate"] + WORD + TAP, quality="fine")],
            "sheet": [step("file.export_step", path=p("attractap-fp-carrier.step"), bodies=["Plate carrier"]),
                      lay(["Plate carrier"], "D - fp_sheet", "TmpCarrierLay"),
                      step("file.save_mesh", path=p("attractap-fp-carrier.3mf"), bodies=["Plate carrier"], quality="fine")],
            "metal": [step("file.export_step", path=p("attractap-fp-tap-tile.step"), bodies=["Tap tile"]),
                      lay(["Tap tile"] + TAP, "D", "TmpTileLay"),
                      step("file.save_mesh", path=p("attractap-fp-tap-tile.3mf"), bodies=["Tap tile"], quality="fine"),
                      step("file.save_mesh", path=p("attractap-fp-tap-tile-multicolor.3mf"), bodies=["Tap tile"] + TAP, quality="fine")]}
    for kind, steps in jobs.items():
        code, msg = run(split(kind)[0] + steps, design, out=p(f".export-{kind}.json"))
        print(kind, "exported" if not code else "EXPORT FAILED: " + msg, flush=True)
        for f in (p(f".export-{kind}.json"), p(f".export-{kind}.json.steps.json")):
            if os.path.exists(f):
                os.remove(f)


if __name__ == "__main__":
    args = sys.argv[1:]
    size = [1024, 768]
    if "--size" in args:
        i = args.index("--size")
        size = [int(v) for v in args[i + 1].split("x")]
        del args[i:i + 2]
    if args[0] == "render":
        render(args[1], args[2], args[3:], size)
    else:
        export(args[1], args[2])
