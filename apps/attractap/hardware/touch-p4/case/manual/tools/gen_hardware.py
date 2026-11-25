"""First batch for the manual's scene file: brass inserts, screws and the wall piece (illustration only)."""
import json, math, os, tempfile
# Folder for the generated step files. SolidCraft's MCP server only reads files from the folders it allows (its
# session temp folder is one), so point SOLIDCRAFT_WORK at such a folder. The default is the system temp folder.
T = os.path.join(os.environ.get("SOLIDCRAFT_WORK") or tempfile.gettempdir(), "")
steps = []
def add(cmd, **p): steps.append({"command": cmd, "params": p})

pcb = [(39.0, 45.65), (-39.0, 45.65), (25.1, -90.25), (-23.3, -67.85)]
wallh = [(30, 36), (-30, 36), (30, -40), (-30, -40), (34, -88)]
standh = [(30, 36), (-30, 36), (30, -40), (-30, -40)]
brass, steel = [], []

# PCB inserts (short, 3 mm) and screws M3x4
for i, (x, y) in enumerate(pcb, 1):
    n = f"PCB insert {i}"; brass.append(n)
    add("solid.cylinder", radius=2.4, height=3, base=[x, y, 18.5], axis="Z", operation="new_body", name=f"HwPcbInsert{i}", body_name=n)
    add("solid.cylinder", radius=1.25, height=3.4, base=[x, y, 18.3], axis="Z", operation="cut", targets=[n], name=f"HwPcbInsertBore{i}")
    s = f"PCB screw {i}"; steel.append(s)
    add("solid.cylinder", radius=2.8, height=2.2, base=[x, y, 14.7], axis="Z", operation="new_body", name=f"HwPcbScrewHead{i}", body_name=s)
    add("solid.cylinder", radius=1.5, height=4.1, base=[x, y, 16.8], axis="Z", operation="join", targets=[s], name=f"HwPcbScrewShank{i}")

# lock inserts + lock screws (axis Y)
for tag, x in (("R", 20.0), ("L", -20.0)):
    n = f"Lock insert {tag}"; brass.append(n)
    add("solid.cylinder", radius=2.4, height=5.7, base=[x, -102.85, 12], axis="Y", operation="new_body", name=f"HwLockInsert{tag}", body_name=n)
    add("solid.cylinder", radius=1.25, height=6.1, base=[x, -103.05, 12], axis="Y", operation="cut", targets=[n], name=f"HwLockInsertBore{tag}")
    s = f"Lock screw {tag}"; steel.append(s)
    add("solid.cone", radius=2.9, top_radius=1.5, height=1.5, base=[x, -106.45, 12], axis="Y", operation="new_body", name=f"HwLockScrewHead{tag}", body_name=s)
    add("solid.cylinder", radius=1.5, height=6.6, base=[x, -105.05, 12], axis="Y", operation="join", targets=[s], name=f"HwLockScrewShank{tag}")

# wall screws 4x40 countersunk (axis -Z)
for i, (x, y) in enumerate(wallh, 1):
    s = f"Wall screw {i}"; steel.append(s)
    add("solid.cone", radius=4.0, top_radius=2.0, height=2.0, base=[x, y, 2.7], axis=[0, 0, -1], operation="new_body", name=f"HwWallScrewHead{i}", body_name=s)
    add("solid.cylinder", radius=2.0, height=38.1, base=[x, y, -37.3], axis="Z", operation="join", targets=[s], name=f"HwWallScrewShank{i}")

# stand inserts + screws M3x8 countersunk
for i, (x, y) in enumerate(standh, 1):
    n = f"Stand insert {i}"; brass.append(n)
    add("solid.cylinder", radius=2.4, height=5.7, base=[x, y, -5.7], axis="Z", operation="new_body", name=f"HwStandInsert{i}", body_name=n)
    add("solid.cylinder", radius=1.25, height=6.1, base=[x, y, -5.9], axis="Z", operation="cut", targets=[n], name=f"HwStandInsertBore{i}")
    s = f"Stand screw {i}"; steel.append(s)
    add("solid.cone", radius=2.9, top_radius=1.5, height=1.5, base=[x, y, 1.7], axis=[0, 0, -1], operation="new_body", name=f"HwStandScrewHead{i}", body_name=s)
    add("solid.cylinder", radius=1.5, height=6.6, base=[x, y, -6.3], axis="Z", operation="join", targets=[s], name=f"HwStandScrewShank{i}")

# wall piece with plug holes and a cable hole
W = "Wall (render prop)"
add("solid.box", length=250, width=290, height=14, center=[0, -26, -7], operation="new_body", name="HwWall", body_name=W)
for i, (x, y) in enumerate(wallh, 1):
    add("solid.cylinder", radius=3.0, height=16, base=[x, y, -15], axis="Z", operation="cut", targets=[W], name=f"HwWallPlugHole{i}")
add("solid.cylinder", radius=10, height=16, base=[-30, -84, -15], axis="Z", operation="cut", targets=[W], name="HwWallCableHole")

# bottom-exit cable: two straight runs with a ball at the kink
C = "Ethernet cable (bottom exit)"
A = (-33.8, -73.6, 10.15); B = (-33.8, -110.0, 7.0)
d = [B[k] - A[k] for k in range(3)]; L = math.sqrt(sum(v * v for v in d))
add("solid.cylinder", radius=2.75, height=round(L, 4), base=list(A), axis=d, operation="new_body", name="HwCableBottomA", body_name=C)
add("solid.sphere", radius=2.75, center=list(B), operation="new_body", name="HwCableBottomKnee", body_name=C + " knee")
add("solid.cylinder", radius=2.75, height=60, base=list(B), axis=[0, -1, 0], operation="new_body", name="HwCableBottomB", body_name=C + " run")

add("appearance.assign", bodies=brass, color="#C8A03C", pbr={"metallic": 1.0, "roughness": 0.35})
add("appearance.assign", bodies=steel, color="#B4B9C0", pbr={"metallic": 1.0, "roughness": 0.4})
add("appearance.assign", bodies=[W], color="#D6D2CA")
add("appearance.assign", bodies=[C, C + " knee", C + " run"], color="#2B2F36")
json.dump({"commands": steps}, open(T + "hw-steps.json", "w"))
print(len(steps), "steps")
