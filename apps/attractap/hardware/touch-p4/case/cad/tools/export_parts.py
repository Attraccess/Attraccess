"""Exports the files of the case's parts from the design: cap (plain and multi-colour), dock, display frame, LED
diffuser, mock display and the whole assembly.

    python3 -I export_parts.py [design.sc] [output folder]

Run it after a change to the design, for example to `disp_gap`, `disp_t`, `lens_t` or the dock's magnet holder. The
stand and the mock board are not exported here; their files stay as they are.

STEP files keep the parts where they are in the design. 3MF and STL files are laid on the print face with the centre of
mass over the origin: SolidCraft 0.45.0 ignores `lay_on_print_faces`, so each part is moved before its export. The
moves happen in a copy of the design in memory; the design file is not changed.
"""
import json, os, shutil, subprocess, sys, tempfile

CAD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = shutil.which("solidcraft-cli") or "/Applications/SolidCraft.app/Contents/MacOS/solidcraft-cli"
DESIGN = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(CAD, "attractap-touch-case.sc")
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else CAD
FINE = {"quality": "fine"}          # curved faces: fillets, wordmark, light pills


def cli(*args):
    subprocess.run([CLI, *args], check=True, stdout=subprocess.DEVNULL)


def export(name, bodies, **options):
    return {"command": "file.export", "params": {"path": os.path.join(OUT, name), "bodies": bodies, **options}}


def move(bodies, name, **how):
    return {"command": "solid.move", "params": {"bodies": bodies, "name": name, **how}}


def groups(design):
    """The exports as lists of commands. Each list runs on a fresh copy of the design."""
    body = {b["name"]: b for b in design["bodies"]}
    depth = next(p["value"] for p in design["params"] if p["name"] == "D")
    inlays = ["Tap inlay"] + sorted((n for n in body if n.startswith("Wordmark inlay")), key=lambda n: (len(n), n)) + ["Keyhole inlay"]
    assembly = [n for n in body if n != "Ethernet plug (ref)" and "render prop" not in n]
    face_down = {"origin": [0, 0, 0], "axis": [1, 0, 0], "angle": "180 deg"}      # front face down: half a turn about X

    def centred(name):
        x, y, _ = body[name]["center_of_mass"]
        return [-x, -y, -body[name]["bbox"]["min"][2]]

    cap_x, cap_y, _ = body["Cap"]["center_of_mass"]
    return [
        [export("attractap-cap.step", ["Cap"]), export("attractap-cap-multicolor.step", ["Cap"] + inlays),
         export("attractap-display-frame.step", ["Display frame"]), export("attractap-led-diffuser.step", ["LED diffuser"]),
         export("attractap-dock.step", ["Dock"]), export("attractap-assembly.step", assembly)],
        # the cap lies on its front face; the multi-colour file keeps the inlays in place, the plain one is centred
        [move(["Cap"] + inlays, "CapLay", translate=[0, 0, depth], **face_down),
         export("attractap-cap-multicolor.3mf", ["Cap"] + inlays, **FINE),
         move(["Cap"], "CapCentre", translate=[-cap_x, cap_y, 0]),
         export("attractap-cap.3mf", ["Cap"], **FINE)],
        # the dock lies on its back, as it is in the design
        [move(["Dock"], "DockCentre", translate=centred("Dock")), export("attractap-dock.3mf", ["Dock"], **FINE)],
        # frame and diffuser lie on their board side
        [move(["Display frame"], "FrameLay", translate=centred("Display frame")),
         export("attractap-display-frame.3mf", ["Display frame"], **FINE)],
        [move(["LED diffuser"], "DiffuserLay", translate=centred("LED diffuser")),
         export("attractap-led-diffuser.3mf", ["LED diffuser"], **FINE)],
        # mock display: lens and LCD module as one body, glass down
        [{"command": "solid.combine", "params": {"target": "Display lens (ref)", "tools": ["LCD module (ref)"], "operation": "join"}},
         {"command": "body.rename", "params": {"body": "Display lens (ref)", "name": "Mock display"}},
         move(["Mock display"], "MockDisplayLay", translate=[0, 0, "D - lens_recess"], **face_down),
         export("attractap-mock-display.step", ["Mock display"]), export("attractap-mock-display.3mf", ["Mock display"]),
         export("attractap-mock-display.stl", ["Mock display"])],
    ]


def main():
    with tempfile.TemporaryDirectory() as work:
        measured = os.path.join(work, "design.json")
        cli("eval", DESIGN, "--json-out", measured)
        design = json.load(open(measured, encoding="utf-8"))
        failed = [f["name"] for f in design["timeline"] if f.get("error")]
        if failed:
            sys.exit("features with errors, nothing exported: " + ", ".join(failed))
        for index, commands in enumerate(groups(design)):
            steps = os.path.join(work, f"export-{index}.json")
            json.dump({"commands": commands}, open(steps, "w", encoding="utf-8"))
            cli("run", steps, "--in", DESIGN, "--quiet")
            for command in commands:
                if command["command"] == "file.export":
                    path = command["params"]["path"]
                    print(f"{os.path.getsize(path):>9}  {os.path.relpath(path, OUT)}")


if __name__ == "__main__":
    main()
