"""Scene tooling for the Attractap installation manual figures.

Builds SolidCraft batch steps (moves + visibility), a render setup with an
auto-fitted camera, and an SVG overlay (labels, leaders, motion arrows) whose
positions are projected with the same camera.
"""
import json, math, os, tempfile

# Folder for the generated step files. SolidCraft's MCP server only reads files from the folders it allows (its
# session temp folder is one), so point SOLIDCRAFT_WORK at such a folder. The default is the system temp folder.
T = os.path.join(os.environ.get("SOLIDCRAFT_WORK") or tempfile.gettempdir(), "")
OUT = os.path.dirname(os.path.abspath(__file__)) + "/"

# ---------- vectors ----------
def add(a, b): return [a[i] + b[i] for i in range(3)]
def sub(a, b): return [a[i] - b[i] for i in range(3)]
def mul(a, s): return [a[i] * s for i in range(3)]
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def unit(a):
    n = math.sqrt(dot(a, a)); return [x / n for x in a]

def rot(p, origin, axis, deg):
    """Rotate p about the line (origin, axis) by deg (right-hand)."""
    a = unit(axis); t = math.radians(deg); c, s = math.cos(t), math.sin(t)
    v = sub(p, origin)
    r = add(add(mul(v, c), mul(cross(a, v), s)), mul(a, dot(a, v) * (1 - c)))
    return add(origin, r)

# ---------- bodies ----------
INLAYS = ["Tap inlay", "Keyhole inlay", "Wordmark inlay"] + [f"Wordmark inlay ({i})" for i in range(2, 11)]
PCB_BODY = "attractap-touch-p4-unsaved-export-lowFx6_PCB"
G = {
    "cap": (["Cap"] + INLAYS, [-47.4, -109.25, 3], [47.4, 57.05, 24.4]),
    "display": (["Display lens (ref)", "LCD module (ref)"], [-42.15, -42.15, 20.5], [42.15, 42.15, 24.3]),
    "frame": (["Display frame"], [-44.5, -42.4, 18.5], [44.5, 41.7, 22.7]),
    "diffusers": (["LED diffuser", "LED diffuser (2)"], [-19.5, -92.85, 18.7], [19.5, -43.6, 24.3]),
    "pcb": ([PCB_BODY, "RJ45 jack (ref)", "PoE module (ref)", "Capacitor C103 (ref)", "USB-C (ref)", "DC jack (ref)",
             "WAGO terminal (ref)", "Buzzer (ref)", "ESP32-C6 module (ref)", "Reset button (ref)", "Boot button (ref)"],
            [-43, -94.35, 3.4], [43, 49.15, 18.5]),
    "pcb_screws": ([f"PCB screw {i}" for i in range(1, 5)], [-41.8, -93.05, 14.7], [41.8, 48.45, 20.9]),
    "pcb_inserts": ([f"PCB insert {i}" for i in range(1, 5)], [-41.4, -92.65, 18.5], [41.4, 48.05, 21.5]),
    "lock_inserts": (["Lock insert R", "Lock insert L"], [-22.4, -102.85, 9.6], [22.4, -97.15, 14.4]),
    "lock_screws": (["Lock screw R", "Lock screw L"], [-22.9, -106.45, 9.1], [22.9, -98.45, 14.9]),
    "wall_screws": ([f"Wall screw {i}" for i in range(1, 6)], [-34, -92, -37.3], [38, 40, 2.7]),
    "stand_screws": ([f"Stand screw {i}" for i in range(1, 5)], [-32.9, -42.9, -6.3], [32.9, 38.9, 1.7]),
    "stand_inserts": ([f"Stand insert {i}" for i in range(1, 5)], [-32.4, -42.4, -5.7], [32.4, 38.4, 0]),
    "dock": (["Dock"], [-46.6, -108.45, 0], [46.6, 56.25, 19]),
    "stand": (["Stand"], [-40, -117.19, -136.99], [40, 43.22, 0]),
    "wall": (["Wall (render prop)"], [-125, -171, -14], [125, 119, 0]),
    "plug": (["Ethernet plug (ref)"], [-39.8, -73.6, 6.15], [-27.8, -43.6, 14.15]),
    "cable_wall": (["Ethernet cable (through wall)"], [-36.55, -94.85, -32], [-31.05, -73.6, 12.9]),
    "cable_bottom": (["Ethernet cable (bottom exit)", "Ethernet cable (bottom exit) 2", "Ethernet cable (bottom exit) knee 1"],
                     [-36.55, -170, 5.5], [-31.05, -73.36, 12.89]),
    "tie_cap": (["Cable tie (cap)", "Cable tie (cap) head"], [-43.0, -102.75, 4.4], [-30.0, -97.95, 15.1]),
    "cable_desk": (["Ethernet cable (desk)"] + [f"Ethernet cable (desk) {i}" for i in (2, 3, 4)] + [f"Ethernet cable (desk) knee {i}" for i in (1, 2, 3)],
                   [-36.55, -90.75, -149], [-0.45, -4, 12.9]),
    "tie_stand": (["Cable tie (stand)", "Cable tie (stand) head"], [-14.8, -28.3, -125.2], [0.55, -19.6, -117.7]),
    "dc_wall": (["DC plug (through wall)", "Power lead (through wall)", "Power lead (through wall) 2", "Power lead (through wall) knee 1",
                 "Power lead (through wall) 3", "Power lead (through wall) knee 2"], [-27.25, -93.25, -32], [42.05, -58.85, 15.15]),
    "desk": (["Desk (render prop)"], None, None),
    "screen": (["Screen image (render prop)"], None, None),
}
READER = ["cap", "display", "frame", "diffusers", "pcb", "pcb_screws", "pcb_inserts", "lock_inserts"]
ALL = list(G.keys())

def corners(lo, hi):
    return [[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]

# ---------- camera ----------
class Cam:
    def __init__(s, target, yaw, pitch, dist, fov=0.30, roll=0.0, up="y", W=1400, H=1050):
        s.target, s.yaw, s.pitch, s.dist, s.fov, s.roll, s.up, s.W, s.H = list(target), yaw, pitch, dist, fov, roll, up, W, H
    def basis(s):
        cy, sy, cp, sp = math.cos(s.yaw), math.sin(s.yaw), math.cos(s.pitch), math.sin(s.pitch)
        if s.up == "z": o, U = [-sy * cp, -cy * cp, sp], [0, 0, 1]
        else: o, U = [-sy * cp, sp, cy * cp], [0, 1, 0]
        f = mul(o, -1); r0 = unit(cross(f, U)); u0 = cross(r0, f)
        c, sn = math.cos(s.roll), math.sin(s.roll)
        r = add(mul(r0, c), mul(u0, sn)); u = sub(mul(u0, c), mul(r0, sn))
        return o, f, r, u
    def project(s, P):
        o, f, r, u = s.basis(); eye = add(s.target, mul(o, s.dist)); d = sub(P, eye); z = dot(d, f)
        F = (s.H / 2) / math.tan(s.fov / 2)
        return (s.W / 2 + F * dot(d, r) / z, s.H / 2 - F * dot(d, u) / z)
    def fit(s, pts, margin=0.07, anchor=(0.5, 0.5), extra=(0, 0, 0, 0)):
        """Choose target and distance so pts fill the frame. extra = (left, top, right, bottom) fractions kept free."""
        lo = [min(p[i] for p in pts) for i in range(3)]; hi = [max(p[i] for p in pts) for i in range(3)]
        s.target = [(lo[i] + hi[i]) / 2 for i in range(3)]
        for _ in range(40):
            o, f, r, u = s.basis()
            xy = [s.project(p) for p in pts]
            x0, x1 = min(p[0] for p in xy), max(p[0] for p in xy); y0, y1 = min(p[1] for p in xy), max(p[1] for p in xy)
            ax0 = s.W * (margin + extra[0]); ax1 = s.W * (1 - margin - extra[2])
            ay0 = s.H * (margin + extra[1]); ay1 = s.H * (1 - margin - extra[3])
            k = max((x1 - x0) / (ax1 - ax0), (y1 - y0) / (ay1 - ay0))
            s.dist *= (1 + (k - 1) * 0.9)
            F = (s.H / 2) / math.tan(s.fov / 2)
            # shift target so the box centre lands on the centre of the free area
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; tx, ty = (ax0 + ax1) / 2, (ay0 + ay1) / 2
            s.target = add(s.target, add(mul(r, (cx - tx) * s.dist / F), mul(u, -(cy - ty) * s.dist / F)))
        return s
    def setup(s):
        return {"distance": round(s.dist, 3), "fov": s.fov, "pitch": s.pitch, "roll": s.roll,
                "target": [round(v, 3) for v in s.target], "up": s.up, "yaw": s.yaw}

def cam_look(o, n, up="z", **kw):
    """Camera with eye direction o (target->eye) and screen-up as close to n as possible."""
    o = unit(o)
    if up == "z": pitch = math.asin(o[2]); yaw = math.atan2(-o[0], -o[1]); U = [0, 0, 1]
    else: pitch = math.asin(o[1]); yaw = math.atan2(-o[0], o[2]); U = [0, 1, 0]
    f = mul(o, -1); r0 = unit(cross(f, U)); u0 = cross(r0, f)
    ud = unit(sub(n, mul(f, dot(n, f))))
    roll = -math.atan2(dot(cross(u0, ud), f), dot(u0, ud))
    return Cam([0, 0, 0], yaw, pitch, 500, roll=roll, up=up, **kw)

# ---------- scene ----------
class Scene:
    def __init__(s, name, cam, show, moves=None, fit_groups=None, fit_extra=(0, 0, 0, 0), margin=0.07, samples=128, extra_pts=None, exposure=-0.3, env=0.65, sun=16.0, light=(0.55, 0.75, -0.45)):
        s.env, s.sun, s.light = env, sun, light
        s.name, s.cam, s.show, s.moves = name, cam, show, moves or {}
        s.fit_groups = fit_groups if fit_groups is not None else [g for g in show if G[g][1]]
        s.fit_extra, s.margin, s.samples, s.exposure = fit_extra, margin, samples, exposure
        s.extra_pts = extra_pts or []
        s.items = []          # overlay items
    # transform of a group: dict(t=[..], rot=(origin, axis, deg))
    def xf(s, group, p):
        m = s.moves.get(group)
        if not m: return list(p)
        q = list(p)
        if m.get("rot"): q = rot(q, *m["rot"])
        return add(q, m.get("t", [0, 0, 0]))
    def pts(s):
        out = []
        for g in s.fit_groups:
            out += [s.xf(g, c) for c in corners(G[g][1], G[g][2])]
        return out + s.extra_pts
    def steps(s):
        st = []
        hide = [b for g in ALL if g not in s.show for b in G[g][0]]
        show = [b for g in s.show for b in G[g][0]]
        st.append({"command": "browser.visibility", "params": {"visible": True, "items": show}})
        st.append({"command": "browser.visibility", "params": {"visible": False, "items": hide}})
        for g, m in s.moves.items():
            p = {"bodies": G[g][0], "name": f"Mv_{s.name}_{g}"}
            if m.get("t"): p["translate"] = m["t"]
            if m.get("rot"):
                o, a, d = m["rot"]; p.update(origin=o, axis=a, angle=f"{d} deg")
            st.append({"command": "solid.move", "params": p})
        return st
    def sun_dir(s):
        o, f, r, u = s.cam.basis()
        a, b, c = s.light
        return [round(v, 4) for v in unit(add(add(mul(o, a), mul(u, b)), mul(r, c)))]
    def render_setup(s):
        return {"name": "m-" + s.name, "set": {
            "backend": "builtin", "mode": "final", "format": "png", "width": s.cam.W, "height": s.cam.H,
            "background": [240, 242, 245], "exposure_ev": s.exposure, "camera": s.cam.setup(), "stage": [], "surfaces": [],
            "job": {"method": "gpu_path", "transparent_background": False, "options": {
                "denoise": True, "samples": s.samples, "seed": 0, "max_depth": 8, "tone_map": "reinhard",
                "linear_exr": False, "nested_media": False, "transmission_samples": 1,
                "lighting": {"area_lights": [], "environment": [s.env] * 3,
                             "sun": {"angular_radius_rad": 0.2, "direction": s.sun_dir(), "radiance": [s.sun] * 3}}}}}}
    def build(s):
        s.cam.fit(s.pts(), margin=s.margin, extra=s.fit_extra)
        json.dump({"commands": s.steps() + [{"command": "render.settings.set", "params": s.render_setup()}]},
                  open(T + f"scene-{s.name}.json", "w"))
        return s
    # ----- overlay -----
    def P(s, group, p): return s.cam.project(s.xf(group, p) if group else p)
    def label(s, text, group, p, dx, dy, anchor="start"):
        s.items.append(("label", text, s.P(group, p), dx, dy, anchor))
    def label_abs(s, text, group, p, lx, ly, anchor="start"):
        x, y = s.P(group, p)
        s.items.append(("label", text, (x, y), lx - x, ly - y, anchor))
    def arrow(s, group_a, a, group_b, b, shorten=(0, 0)):
        s.items.append(("arrow", s.P(group_a, a), s.P(group_b, b), shorten))
    def note(s, text, x, y, anchor="start", size=30, weight="600"):
        s.items.append(("note", text, (x, y), anchor, size, weight))
    def svg(s, png):
        W, H = s.cam.W, s.cam.H
        ink = "#202729"; fs = 30
        o = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
             '<defs><marker id="ah" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker>' % ink,
             '<marker id="ahw" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#fff" stroke="#fff" stroke-width="2.4"/></marker></defs>',
             f'<image href="{png}" xlink:href="{png}" x="0" y="0" width="{W}" height="{H}"/>',
             '<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" stroke-linecap="round" stroke-linejoin="round">']
        for it in s.items:
            if it[0] == "arrow":
                (x1, y1), (x2, y2), (s1, s2) = it[1], it[2], it[3]
                L = math.hypot(x2 - x1, y2 - y1) or 1; ux, uy = (x2 - x1) / L, (y2 - y1) / L
                x1 += ux * s1; y1 += uy * s1; x2 -= ux * s2; y2 -= uy * s2
                o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#fff" stroke-width="13" marker-end="url(#ahw)"/>')
                o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{ink}" stroke-width="7" marker-end="url(#ah)"/>')
        for it in s.items:
            if it[0] == "label":
                text, (x, y), dx, dy, anchor = it[1], it[2], it[3], it[4], it[5]
                lx, ly = x + dx, y + dy
                ex = lx + (-8 if anchor == "start" else 8 if anchor == "end" else 0)
                o.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{ex:.1f}" y2="{ly - fs * 0.32:.1f}" stroke="#fff" stroke-width="6"/>')
                o.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{ex:.1f}" y2="{ly - fs * 0.32:.1f}" stroke="{ink}" stroke-width="2.5"/>')
                o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{ink}" stroke="#fff" stroke-width="2.5"/>')
                lines = text.split("\n")
                for i, ln in enumerate(lines):
                    yy = ly + i * fs * 1.2
                    o.append(f'<text x="{lx:.1f}" y="{yy:.1f}" font-size="{fs}" font-weight="600" text-anchor="{anchor}" fill="#fff" stroke="#fff" stroke-width="8">{ln}</text>')
                    o.append(f'<text x="{lx:.1f}" y="{yy:.1f}" font-size="{fs}" font-weight="600" text-anchor="{anchor}" fill="{ink}">{ln}</text>')
            elif it[0] == "note":
                text, (x, y), anchor, size, weight = it[1], it[2], it[3], it[4], it[5]
                for i, ln in enumerate(text.split("\n")):
                    o.append(f'<text x="{x:.1f}" y="{y + i * size * 1.25:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="#fff" stroke="#fff" stroke-width="8">{ln}</text>')
                    o.append(f'<text x="{x:.1f}" y="{y + i * size * 1.25:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{ink}">{ln}</text>')
        o.append('</g></svg>')
        return "\n".join(o)
    def compose(s, png_path, out_png):
        svg_path = os.path.splitext(out_png)[0] + ".svg"
        open(svg_path, "w").write(s.svg(os.path.basename(png_path)))
        return svg_path
