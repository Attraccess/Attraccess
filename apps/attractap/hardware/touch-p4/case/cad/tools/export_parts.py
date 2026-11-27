"""Exports the files of the case's parts from the design: cap, faceplate (plain and with the wordmark), tap tile, dock,
display frame, mock display and the whole assembly.

    python3 -I export_parts.py [design.sc] [output folder]

Run it after a change to the design, for example to `disp_gap`, `disp_t`, `lens_t` or the dock's magnet holder. The
stand is not exported here; its files stay as they are. The mock board's files come from `mock_board.py`.

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
    depth = next(p["value"] for p in design["params"] if p["name"] == "D")    # front of the faceplate
    wordmark = sorted((n for n in body if n.startswith("Wordmark inlay")), key=lambda n: (len(n), n))
    faceplate = ["Faceplate", "Faceplate stripe"]
    tile = ["Tile", "Tile top", "Tile inlay", "Tile keyhole"]
    assembly = [n for n in body if n != "Ethernet plug (ref)" and "render prop" not in n and n not in wordmark]
    face_down = {"origin": [0, 0, 0], "axis": [1, 0, 0], "angle": "180 deg"}      # front face down: half a turn about X

    def centred(name):
        x, y, _ = body[name]["center_of_mass"]
        return [-x, -y, -body[name]["bbox"]["min"][2]]

    cap_x, cap_y, _ = body["Cap"]["center_of_mass"]
    plate_y = (body["Faceplate"]["bbox"]["min"][1] + body["Faceplate"]["bbox"]["max"][1]) / 2
    tile_y = (body["Tile"]["bbox"]["min"][1] + body["Tile"]["bbox"]["max"][1]) / 2
    tile_back = body["Tile"]["bbox"]["min"][2]
    # the faceplate with the wordmark: the letters are cut out of it and filled with the inlays
    logo = {"command": "solid.combine", "params": {"name": "FaceplateLogo", "target": "Faceplate", "tools": wordmark,
                                                   "operation": "cut", "keep_tools": True}}
    return [
        [export("attractap-cap.step", ["Cap"]), export("attractap-faceplate.step", faceplate),
         export("attractap-tile.step", tile), export("attractap-display-frame.step", ["Display frame"]),
         export("attractap-dock.step", ["Dock"]), export("attractap-assembly.step", assembly)],
        [logo, export("attractap-faceplate-logo.step", faceplate + wordmark)],
        # the cap lies on its front face, centred
        [move(["Cap"], "CapLay", translate=[0, 0, body["Cap"]["bbox"]["max"][2]], **face_down),
         move(["Cap"], "CapCentre", translate=[-cap_x, cap_y, 0]),
         export("attractap-cap.3mf", ["Cap"], **FINE)],
        # the faceplate lies on its front face, its objects in place for the colours
        [move(faceplate, "PlateLay", translate=[0, 0, depth], **face_down),
         move(faceplate, "PlateCentre", translate=[0, plate_y, 0]),
         export("attractap-faceplate.3mf", faceplate, **FINE)],
        [logo, move(faceplate + wordmark, "PlateLay", translate=[0, 0, depth], **face_down),
         move(faceplate + wordmark, "PlateCentre", translate=[0, plate_y, 0]),
         export("attractap-faceplate-logo.3mf", faceplate + wordmark, **FINE)],
        # the tile lies on its flat back, black top up: printed face down, its white rim would overhang
        [move(tile, "TileLay", translate=[0, -tile_y, -tile_back]),
         export("attractap-tile.3mf", tile, **FINE)],
        # the dock lies on its back, as it is in the design
        [move(["Dock"], "DockCentre", translate=centred("Dock")), export("attractap-dock.3mf", ["Dock"], **FINE)],
        # the frame lies on its board side
        [move(["Display frame"], "FrameLay", translate=centred("Display frame")),
         export("attractap-display-frame.3mf", ["Display frame"], **FINE)],
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
    # record the sources these files were made from (scripts/check-generated.mjs, run before each commit)
    repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), *[".."] * 7))
    subprocess.run(["node", os.path.join(repo, "scripts", "check-generated.mjs"), "--stamp", "case-parts"], check=True)


if __name__ == "__main__":
    main()
