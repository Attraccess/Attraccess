"""Finish study: builds material variants of the case and renders them with SolidCraft's command-line GPU path tracer.

    python3 -I gen_finishes.py <study.sc> <workdir> <key> [<key> ...] [--size WxH] [--glass-samples N] [--scatter S]

<study.sc> is a copy of the case design with the render props (desk, screen image) and the saved screen-image
surface binding. Keys: A-wall A-desk B-wall B-desk C-desk D-desk E-desk. Each key writes <workdir>/<key>.sc and <key>.png.

Why the small moves in the translucent variants: the path tracer refuses a see-through body that touches another body
("inconsistent glass medium paths"). So the cap is lifted 0.05 mm, the dock, stand and desk are nudged apart by the same
amount, and the logo inlays are turned into 0.2 mm marks floating 0.02 mm above the cap. None of this is visible, and
none of it belongs in the print files.
"""
import json, os, subprocess, sys

CLI = "/Applications/SolidCraft.app/Contents/MacOS/solidcraft-cli"
HDR = "09a4ff8376eff857fb1c7181e99bdf69310358e4bcc024af37922ec4361f3156"
SCREEN = "cab957b34b4dc3b99d4f4ecb24441d917bc85d4ee445aacd631f4dfb4d54beb8"
INLAYS = ["Wordmark inlay"] + [f"Wordmark inlay ({i})" for i in range(2, 11)] + ["Tap inlay", "Keyhole inlay"]
MARKS = INLAYS[:-1]                       # wordmark and tap ring; the keyhole keeps the brand blue
PCB = "attractap-touch-p4-unsaved-export-lowFx6_PCB"

ALU = {"color": "#CBD0D6", "pbr": {"metallic": 1.0, "roughness": 0.55, "dielectric_ior": 1.5}}
BLUE = {"color": "#256D7B", "pbr": None}
WHITE = {"color": "#E9E6DE", "pbr": None}
PALE = {"color": "#DDE3E6", "pbr": None}      # stands in for a resin dock, which sits wholly inside the cap
INK, WATER, MARBLE = "#202729", "#256D7B", "#EFECE4"

# (cap, stand, dock, colour of wordmark and tap ring)
VARIANTS = {"A": (ALU, ALU, ALU, INK), "B": ("resin", "resin", PALE, INK), "C": ("resin", ALU, ALU, INK),
            "D": (ALU, "resin", ALU, INK), "E": (BLUE, ALU, ALU, MARBLE)}
FEATURE = {"Cap": 7, "Stand": 102}

CAMERA = {"wall": {"distance": 470.0, "fov": 0.45, "pitch": 0.2, "roll": 0.0, "target": [0.0, -26.0, 12.0], "up": "y", "yaw": -0.55},
          "desk": {"distance": 640.0, "fov": 0.45, "pitch": 0.9732, "roll": -0.988, "target": [0.0, -48.0, -38.0], "up": "z", "yaw": -1.2799}}
WALL_STAGE = [{"center_mm": [0.0, -26.0, -0.1], "half_u_mm": [900.0, 0.0, 0.0], "half_v_mm": [0.0, 900.0, 0.0], "id": "wall",
               "reflectance_linear": [0.42, 0.43, 0.45]}]


def step(command, **params):
    return {"command": command, "params": params}


def build(key, size, glass_samples, scatter, seed=0, attempt=0, rough=0.4, absorb=(0.004, 0.003, 0.002)):
    var, view = key.split("-")
    cap, stand, dock, mark = VARIANTS[var]
    glass = [n for n, m in (("Cap", cap), ("Stand", stand)) if m == "resin" and (n != "Stand" or view == "desk")]
    s = [step("browser.visibility", visible=view == "desk", items=["Stand", "Desk (render prop)"]),
         step("browser.visibility", visible=True, items=["Screen image (render prop)"])]
    for name, m in (("Cap", cap), ("Stand", stand), ("Dock", dock)):
        s.append(step("appearance.assign", bodies=[name], **(m if m != "resin" else {"color": "#E9EEF0", "pbr": None})))
    s.append(step("appearance.assign", bodies=MARKS, color=mark))
    s.append(step("appearance.assign", bodies=["Keyhole inlay"], color=WATER if mark == INK else MARBLE))
    if "Cap" in glass:
        s.append(step("solid.move", bodies=["Cap"], translate=[0, 0, 0.05], name="FinCapLift"))
        s.append(step("solid.scale", bodies=INLAYS, factors=[1, 1, 0.25], origin=[0, 0, 23.6], name="FinMarksThin"))
        s.append(step("solid.move", bodies=INLAYS, translate=[0, 0, 0.87], name="FinMarksProud"))
        s.append(step("solid.move", bodies=["Dock"], translate=[0, -0.05, 0], name="FinDockNudge"))
    if "Stand" in glass:
        # the desk plane runs along d = (-0.57353, 0.81918) in (Y, Z); its normal is n = (0.81918, 0.57353)
        s.append(step("solid.move", bodies=["Stand"], translate=[0, 0.0344, -0.0491], name="FinStandNudge"))
        s.append(step("solid.move", bodies=["Desk (render prop)"], translate=[0, -0.041, -0.0287], name="FinDeskNudge"))
    sss = {"scattering_per_mm": scatter, "anisotropy": 0.3} if scatter > 0 else None
    optics = [{"optics": {"ior": 1.5, "absorption_per_mm": list(absorb), "boundary": "closed_mesh", "model": {"roughness": rough},
                          "shadow_transmission": False, "subsurface": sss, "thickness_mm": 0.0},
               "target": {"component": 0, "definition": n, "feature": FEATURE[n], "occurrence_path": []}} for n in glass]
    job = {"method": "gpu_path", "transparent_background": False,
           "options": {"denoise": not (glass and scatter > 0), "hdr": {"assume_linear_srgb": False, "intensity": 1.0, "resource": HDR, "rotation_rad": 0.35},
                       "lighting": {"area_lights": [], "environment": [0, 0, 0], "sun": None}, "linear_exr": False,
                       "max_depth": 32 if glass else 8, "nested_media": False, "samples": glass_samples if glass else 256,
                       "seed": seed, "tone_map": "reinhard", "transmission_samples": 1}}
    surfaces = [{"local_frame": {"origin": [-35.95, -35.95, 24.36], "u": [71.9, 0.0, 0.0], "v": [0.0, 71.9, 0.0]}, "normal_strength": 1.0,
                 "source": {"base_color": SCREEN, "flip_v": True, "kind": "embedded"},
                 "target": {"component": 0, "definition": "Screen image (render prop)", "feature": 144, "occurrence_path": []}}]
    camera = dict(CAMERA[view])
    camera["distance"] = camera["distance"] * (1 + 0.0015 * attempt)   # a retry also shifts every camera ray a little
    s.append(step("render.settings.set", name="fin", set={"camera": camera, "width": size[0], "height": size[1], "mode": "final",
                                                          "exposure_ev": -0.9, "job": job, "surfaces": surfaces, "optics": optics,
                                                          "stage": WALL_STAGE if view == "wall" else []}))
    if glass:
        others = ["Dock", "Display lens (ref)", "LCD module (ref)", "Display frame", "LED diffuser", "LED diffuser (2)", PCB] + INLAYS
        if view == "desk":
            others += ["Stand", "Desk (render prop)"]
        for g in glass:
            s.append(step("inspect.clearance", bodies=[g], against=[o for o in others if o != g], clearance=0.015))
    return s, len(glass)


def main():
    args = sys.argv[1:]
    opt = {"--size": "1024x768", "--glass-samples": "768", "--scatter": "0.2", "--rough": "0.4", "--absorb": "0.004,0.003,0.002"}
    for k in list(opt):
        if k in args:
            i = args.index(k)
            opt[k] = args[i + 1]
            del args[i:i + 2]
    study, work, keys = args[0], args[1], args[2:]
    size = [int(v) for v in opt["--size"].split("x")]
    os.makedirs(work, exist_ok=True)
    for key in keys:
        # A see-through render can stop on one path ("inconsistent glass medium paths") although nothing touches. The bad path
        # belongs to a fixed random stream, numbered pixel index + seed: seeds 0, 1, 2 only move it one pixel along. So each
        # retry jumps to a fresh block of streams (a seed a million apart) and also moves the camera back by 0.15 %.
        for attempt in range(12):
            seed = attempt * 1000003
            steps, nglass = build(key, size, int(opt["--glass-samples"]), float(opt["--scatter"]), seed, attempt,
                                   float(opt["--rough"]), tuple(float(v) for v in opt["--absorb"].split(",")))
            script, sc, png, res = (os.path.join(work, key + e) for e in (".json", ".sc", ".png", ".results.json"))
            json.dump(steps, open(script, "w"))
            r = subprocess.run([CLI, "run", script, "--in", study, "--save", sc, "--results", "--json-out", res], capture_output=True, text=True)
            if r.returncode:
                print(key, "BUILD FAILED:", (r.stderr or r.stdout).strip()[-600:], flush=True)
                break
            if nglass and attempt == 0:
                out = json.load(open(res))
                out = out if isinstance(out, list) else out.get("results", [])
                for c in out[-nglass:]:
                    near = [(n["a"], n["b"], round(n["distance_mm"], 3)) for n in c.get("near", [])]
                    over = [(o.get("a"), o.get("b")) for o in c.get("overlaps", [])]
                    if near or over:
                        print(key, "CONTACT LEFT:", near, over, flush=True)
            if os.path.exists(png):
                os.remove(png)
            r = subprocess.run([CLI, "render", sc, "--setup", "fin", "--out", png, "--overwrite", "--timeout", "3000"], capture_output=True, text=True)
            err = " ".join(ln for ln in (r.stderr + r.stdout).splitlines() if ln.startswith("error"))
            if os.path.exists(png) and not r.returncode:
                print(key, "ok, seed", seed, flush=True)
                break
            print(key, "seed", seed, "RENDER FAILED:", err[:260], flush=True)
            if not nglass or "inconsistent glass medium paths" not in err:
                break


if __name__ == "__main__":
    main()
