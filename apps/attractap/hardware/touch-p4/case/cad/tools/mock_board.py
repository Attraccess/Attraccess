# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy>=1.26", "scipy>=1.11", "manifold3d==3.2.1"]
# ///
"""Makes the printable mock board, the board with the bodies of all its components, from the KiCad board.

    bash tools/pcb.sh export-3d <folder>                           (in the KiCad 10 container, see below)
    uv run case/cad/tools/mock_board.py <folder> [output folder]   (from apps/attractap/hardware/touch-p4)

`pcb.sh export-3d` writes `board.stl`, the board with every component's 3D model, and `board-only.step`, the bare board.
The board file holds every footprint, which is the `lan` variant (Ethernet and PoE): the `wifi` variant only leaves parts
out. This script then

- thickens the board body to the board's 1.6 mm (KiCad's body is the dielectric only, 1.47 mm, and the parts sit at
  1.55 mm: without the overlap they would float),
- closes the few component shells that are open (their convex hull) and drops the flat ones (silkscreen-like faces),
- unites everything into one body and cuts it at the board's back face, z = 0: only pin ends reach below it,
- bridges parts that stand on legs or stand-offs to the board with their own outline (the PoE module, the RJ45 jack),
  so the print is one piece,
- simplifies the mesh (by at most 0.02 mm) and places it as the earlier mock was: lying on its back face (the display
  side) with the components up, in the case's X and Y turned over about X: X = 103 - x, Y = y - 79.15 in KiCad
  coordinates (y down),
- writes `attractap-mock-pcb.3mf` and `.stl` (one closed mesh) and `attractap-mock-pcb.step`: the board with a box
  round each part, from the board up, unioned in SolidCraft. The full models as STEP would be over 40 MB.

The script needs numpy, scipy and manifold3d (the header above lets `uv run` fetch them) and SolidCraft's command-line
tool for the STEP file. The KiCad step runs where KiCad 10 is: on the host with `bash tools/pcb.sh export-3d`, or in the
`kicad10-np` container (see docs/en/hardware/touch-p4/case.md, "Mock board").
"""
import json, os, shutil, subprocess, sys, tempfile, zipfile

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
import manifold3d as mf

CAD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = shutil.which("solidcraft-cli") or "/Applications/SolidCraft.app/Contents/MacOS/solidcraft-cli"
NAME = "attractap-mock-pcb"
BOARD_T = 1.6           # the board's thickness; KiCad seats the parts at 1.55 mm (stackup 1.5634 mm)
CASE_X, CASE_Y = 103.0, -79.15   # the STL's (x, y), y up, to the mock's: X = 103 - x, Y = -79.15 - y
SIMPLIFY = 0.02         # mm, the mesh may move this far when it is simplified


def read_stl(path):
    """Triangles (n, 3, 3) of an ASCII or binary STL."""
    data = open(path, "rb").read()
    if data[:5] == b"solid" and b"facet" in data[:300]:
        words = data.split()
        idx = [i for i, w in enumerate(words) if w == b"vertex"]
        xyz = np.array([[float(words[i + 1]), float(words[i + 2]), float(words[i + 3])] for i in idx])
        return xyz.reshape(-1, 3, 3)
    n = int(np.frombuffer(data, "<u4", 1, 80)[0])
    rec = np.frombuffer(data, np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), n, 84)
    return rec["v"].astype(np.float64)


def shells(tris):
    """The connected shells of a triangle soup as (vertices, faces, closed)."""
    keys = np.round(tris.reshape(-1, 3) * 1e5).astype(np.int64)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    verts = uniq / 1e5
    faces = inv.reshape(-1, 3)
    faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
    rows = np.repeat(np.arange(len(faces)), 3)
    graph = coo_matrix((np.ones(len(rows)), (rows, faces.ravel())), shape=(len(faces), len(verts))).tocsr()
    _, label = connected_components(graph @ graph.T, directed=False)
    out = []
    for k in np.unique(label):
        f = faces[label == k]
        used, local = np.unique(f, return_inverse=True)
        f = local.reshape(-1, 3)
        edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
        undirected, count = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
        directed = np.unique(edges, axis=0)
        closed = bool(np.all(count == 2) and len(directed) == len(edges))
        out.append((verts[used], f, closed))
    return out


def manifold(verts, faces):
    return mf.Manifold(mf.Mesh(np.asarray(verts, np.float32), np.asarray(faces, np.uint32)))


def solids(path):
    """The board and every component body as manifolds; the board first."""
    board, parts, hulls, flat = None, [], 0, 0
    for verts, faces, closed in shells(read_stl(path)):
        lo, hi = verts.min(0), verts.max(0)
        if lo[2] == 0 and hi[2] < BOARD_T and hi[0] - lo[0] > 50:          # the board body
            verts = verts.copy()
            verts[:, 2] *= BOARD_T / hi[2]
            board = manifold(verts, faces)
            continue
        man = manifold(verts, faces) if closed else None
        if man is None or man.status() != mf.Error.NoError or man.volume() <= 0:
            if np.min(hi - lo) < 1e-3:
                flat += 1
                continue
            man = mf.Manifold.hull_points(np.asarray(verts, np.float32))
            hulls += 1
        # grown by 5 µm about its centre: parts that touch along an edge then overlap and unite
        x0, y0, z0, x1, y1, z1 = man.bounding_box()
        centre = np.array([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
        grow = [1 + 0.005 / max(size, 0.01) for size in (x1 - x0, y1 - y0, z1 - z0)]
        parts.append(man.translate(-centre).scale(grow).translate(centre))
    print(f"{len(parts)} component bodies, {hulls} closed with their hull, {flat} flat shells dropped")
    return board, parts


def bridge(body, board):
    """Joins pieces that stand above the board on legs or pins to it: their shadow on the board, filled from the board
    up to their lowest point over it. Slivers under 0.01 mm3 are dropped."""
    footprint = board.project().offset(-0.05, mf.JoinType.Miter)       # not flush with the board's edges either
    for _ in range(3):
        pieces = sorted(body.decompose(), key=lambda m: -m.volume())
        if len(pieces) == 1:
            return body
        keep, feet = [pieces[0]], []
        for piece in pieces[1:]:
            if piece.volume() < 0.01:
                continue
            keep.append(piece)
            # its lowest point over the board's solid area: pins in their holes do not count
            over = piece ^ mf.Manifold.extrude(footprint, 100).translate((0, 0, BOARD_T))
            top = (over.bounding_box()[2] if not over.is_empty() else BOARD_T) + 0.047
            # 0.05 mm inside its outline, so that no wall of the bridge is flush with one of the part
            shadow = piece.project().offset(-0.05, mf.JoinType.Miter) ^ footprint
            print(f"  bridging a piece of {piece.volume():.0f} mm3 at {np.round(piece.bounding_box(), 1).tolist()}, "
                  f"{shadow.area():.0f} mm2 up to z = {top:.2f}")
            # odd depths, so that the bridge's faces meet none of the board's or the part's
            feet.append(mf.Manifold.extrude(shadow, top - BOARD_T + 0.113).translate((0, 0, BOARD_T - 0.113)))
        body = mf.Manifold.batch_boolean([*keep, *feet], mf.OpType.Add)
    sys.exit(f"the mock is still {len(body.decompose())} pieces")


def write_stl(path, verts, faces):
    tri = verts[faces].astype("<f4")
    normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(faces), np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]))
    rec["n"], rec["v"] = normal, tri
    with open(path, "wb") as f:
        f.write(NAME.encode().ljust(80, b"\0") + np.uint32(len(faces)).tobytes() + rec.tobytes())


def write_3mf(path, verts, faces):
    v = "".join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in verts)
    t = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in faces)
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             f'<metadata name="Title">{NAME}</metadata><resources><object id="1" name="Mock board" type="model">'
             f'<mesh><vertices>{v}</vertices><triangles>{t}</triangles></mesh></object></resources>'
             '<build><item objectid="1"/></build></model>')
    types = ('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/'
             'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
             'relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-'
             '3dmodel+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/'
            '2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/'
            '3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in (("[Content_Types].xml", types), ("_rels/.rels", rels), ("3D/3dmodel.model", model)):
            z.writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), text, zipfile.ZIP_DEFLATED)


def to_case(body):
    """The STL's coordinates to the mock's: half a turn about Z."""
    return body.rotate((0, 0, 180)).translate((CASE_X, CASE_Y, 0))


def step_file(folder, parts, out):
    """The STEP file: the bare board with a box round each part, from the board up, in SolidCraft."""
    boxes = []
    for part in parts:
        x0, y0, z0, x1, y1, z1 = to_case(part).bounding_box()
        if min(x1 - x0, y1 - y0, z1 - max(z0, 0.0)) > 0.02:
            boxes.append([x0, y0, max(z0, 0.0), x1, y1, z1])
    # each box reaches down into the board, also under a part that stands on legs
    boxes = [[x0, y0, min(z0, BOARD_T - 0.05), x1, y1, z1] for x0, y0, z0, x1, y1, z1 in boxes]
    # the bodies of one part touch or overlap (pins in the body, a shield over it): one box for each group
    boxes = np.array(boxes)
    touch = (np.all(boxes[:, None, :3] <= boxes[None, :, 3:] + 0.01, axis=2)
             & np.all(boxes[None, :, :3] <= boxes[:, None, 3:] + 0.01, axis=2))
    _, group = connected_components(coo_matrix(touch), directed=False)
    boxes = [np.concatenate([boxes[group == g, :3].min(0), boxes[group == g, 3:].max(0)]) for g in np.unique(group)]
    board = "attractap-touch-p4_PCB"
    commands = [
        {"command": "solid.scale", "params": {"bodies": [board], "factors": [1, 1, 1], "factor": 1,
                                              "origin": [0, 0, 0], "name": "BoardThickness"}},
        {"command": "solid.move", "params": {"bodies": [board], "origin": [0, 0, 0], "axis": [0, 0, 1],
                                             "angle": "180 deg", "translate": [CASE_X, CASE_Y, 0], "name": "BoardToCase"}},
    ]
    names = []
    for i, (x0, y0, z0, x1, y1, z1) in enumerate(boxes):
        names.append(f"Part {i + 1}")
        commands.append({"command": "solid.box", "params": {
            "center": [round((x0 + x1) / 2, 4), round((y0 + y1) / 2, 4), round((z0 + z1) / 2, 4)],
            "length": round(x1 - x0, 4), "width": round(y1 - y0, 4), "height": round(z1 - z0, 4),
            "name": names[-1], "body_name": names[-1]}})
    commands += [
        {"command": "solid.combine", "params": {"target": board, "tools": names, "operation": "join",
                                                "touching": "one_body", "name": "Populate"}},
        {"command": "body.rename", "params": {"body": board, "name": "Mock PCB"}},
        {"command": "file.export", "params": {"path": out, "bodies": ["Mock PCB"]}},
    ]
    with tempfile.TemporaryDirectory() as work:
        source = os.path.join(folder, "board-only.step")
        measured = os.path.join(work, "board.json")
        subprocess.run([CLI, "eval", "--in", source, "--json-out", measured, "--quiet"], check=True)
        bbox = json.load(open(measured, encoding="utf-8"))["bodies"][0]["bbox"]
        commands[0]["params"]["factors"][2] = BOARD_T / bbox["max"][2]      # the dielectric only, as in the STL
        steps = os.path.join(work, "steps.json")
        json.dump({"commands": commands}, open(steps, "w", encoding="utf-8"))
        subprocess.run([CLI, "run", steps, "--in", source, "--quiet"], check=True, stdout=subprocess.DEVNULL)
    print(f"STEP: the board and {len(boxes)} boxes")
    return len(boxes)


def main():
    folder = os.path.abspath(sys.argv[1])
    out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else CAD
    board, parts = solids(os.path.join(folder, "board.stl"))
    body = mf.Manifold.batch_boolean([board, *parts], mf.OpType.Add).trim_by_plane((0, 0, 1), 0.0)
    # simplified first, as that can cut thin links; the bridges then join what came apart
    body = to_case(bridge(body.simplify(SIMPLIFY), board))
    assert len(body.decompose()) == 1 and body.status() == mf.Error.NoError
    mesh = body.to_mesh()
    verts, faces = np.asarray(mesh.vert_properties[:, :3], np.float64), np.asarray(mesh.tri_verts)
    write_stl(os.path.join(out, NAME + ".stl"), verts, faces)
    write_3mf(os.path.join(out, NAME + ".3mf"), verts, faces)
    print(f"mesh: {len(faces)} triangles, {body.volume():.0f} mm3, box {np.round(body.bounding_box(), 2).tolist()}")
    step_file(folder, parts, os.path.join(out, NAME + ".step"))
    repo = os.path.abspath(os.path.join(CAD, *[".."] * 6))
    subprocess.run(["node", os.path.join(repo, "scripts", "check-generated.mjs"), "--stamp", "mock-board"], check=True)


if __name__ == "__main__":
    main()
