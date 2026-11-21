"""Third batch for the manual's scene file: the through-wall cable route.
Moves the wall prop's cable hole to the recommended drilling position and adds a
barrel plug with its lead running from the DC jack to that hole (illustration only)."""
import json, math, os, tempfile
# Folder for the generated step files. SolidCraft's MCP server only reads files from the folders it allows (its
# session temp folder is one), so point SOLIDCRAFT_WORK at such a folder. The default is the system temp folder.
T = os.path.join(os.environ.get("SOLIDCRAFT_WORK") or tempfile.gettempdir(), "")
steps = []
def add(cmd, **p): steps.append({"command": cmd, "params": p})

HOLE = (-32.0, -88.0)          # recommended cable hole: 32 left of centre, level with the fifth wall screw, 20 mm
add("timeline.edit", feature="HwWallCableHole", set={"base": [HOLE[0], HOLE[1], -15.0]})

# barrel plug in the DC jack (jack face at Y -58.85, barrel axis 6.5 above the board)
AX, AZ = 37.3, 10.4
P = "DC plug (through wall)"
add("solid.cylinder", radius=4.75, height=20, base=[AX, -58.85, AZ], axis=[0, -1, 0], operation="new_body", name="HwDcPlugBody", body_name=P)
add("solid.cylinder", radius=3.0, height=8, base=[AX, -78.85, AZ], axis=[0, -1, 0], operation="join", targets=[P], name="HwDcPlugBoot")

dark = [P]
def run(name, pts, r):
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ax = [b[k] - a[k] for k in range(3)]; ln = math.sqrt(sum(v * v for v in ax))
        bn = name if i == 0 else f"{name} {i + 1}"; dark.append(bn)
        add("solid.cylinder", radius=r, height=round(ln, 4), base=list(a), axis=ax, operation="new_body", name=f"HwPowerLeadRun{i + 1}", body_name=bn)
        if i > 0:
            kn = f"{name} knee {i}"; dark.append(kn)
            add("solid.sphere", radius=r, center=list(a), operation="new_body", name=f"HwPowerLeadKnee{i}", body_name=kn)

# lead: out of the boot, turns left above the lock bar (its top face is at Y -95.35), into the wall hole beside the Ethernet cable
run("Power lead (through wall)", [(AX, -86.85, AZ), (35.0, -91.5, 6.5), (-25.5, -91.5, 5.5), (-25.5, -91.5, -32.0)], 1.75)
add("appearance.assign", bodies=dark, color="#2B2F36")
json.dump({"commands": steps}, open(T + "wall-route-steps.json", "w"))
print(len(steps), "steps;", dark)
