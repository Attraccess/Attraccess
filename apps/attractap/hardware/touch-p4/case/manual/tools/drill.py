"""Drilling template / dock front view as an SVG drawing (dimensions in mm)."""
import subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__)) + "/"
W, H, S = 1500, 1380, 6.0
OX, OY = 720, 450
ink, soft, blue, paper, plate = "#202729", "#6B7680", "#256D7B", "#F0F2F5", "#FBFAF7"
X = lambda x: OX + x * S
Y = lambda y: OY - y * S
o = []
def rect(x0, y0, x1, y1, r=0, **kw):
    a = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    o.append(f'<rect x="{X(x0):.1f}" y="{Y(y1):.1f}" width="{(x1 - x0) * S:.1f}" height="{(y1 - y0) * S:.1f}" rx="{r * S:.1f}" {a}/>')
def line(x0, y0, x1, y1, px=False, **kw):
    a = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    p = (x0, y0, x1, y1) if px else (X(x0), Y(y0), X(x1), Y(y1))
    o.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" %s/>' % (*p, a))
def text(x, y, t, size=28, anchor="middle", weight="600", fill=ink, px=False, rot=None):
    px_, py_ = (x, y) if px else (X(x), Y(y))
    tr = f' transform="rotate({rot} {px_:.1f} {py_:.1f})"' if rot is not None else ""
    for i, ln in enumerate(t.split("\n")):
        o.append(f'<text x="{px_:.1f}" y="{py_ + i * size * 1.22:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{paper}" stroke="{paper}" stroke-width="7"{tr}>{ln}</text>')
        o.append(f'<text x="{px_:.1f}" y="{py_ + i * size * 1.22:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{fill}"{tr}>{ln}</text>')
def dim_h(x0, x1, y, yref, label):          # horizontal dimension at height y (mm), extension lines from yref
    for x in (x0, x1): line(x, yref, x, y + (2.5 if y > yref else -2.5), stroke=soft, stroke_width=1.6)
    line(x0, y, x1, y, stroke=ink, stroke_width=2.2, marker_start="url(#a)", marker_end="url(#a)")
    text((x0 + x1) / 2, y + 2.2, label, 28)
def dim_v(y0, y1, x, xref, label, side=1):  # vertical dimension at x (mm), extension lines from xref
    for y in (y0, y1): line(xref, y, x + 2.5 * side, y, stroke=soft, stroke_width=1.6)
    line(x, y0, x, y1, stroke=ink, stroke_width=2.2, marker_start="url(#a)", marker_end="url(#a)")
    text(x + 3.2 * side, (y0 + y1) / 2 - 1.6, label, 28, anchor="start" if side > 0 else "end")
def lead(x, y, lx, ly, t, anchor="start"):  # leader from model point (mm) to label at pixel offset
    px, py = X(x), Y(y)
    line(px, py, px + lx, py + ly, px=True, stroke=ink, stroke_width=2.2)
    o.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="5.5" fill="{ink}"/>')
    text(px + lx + (8 if anchor == "start" else -8), py + ly + 9, t, 28, anchor=anchor, px=True)

o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
o.append(f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1.5 L10,5 L0,8.5 z" fill="{ink}"/></marker></defs>')
o.append(f'<rect width="{W}" height="{H}" fill="{paper}"/>')
o.append('<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" stroke-linecap="round">')
# reader outline (dashed), dock plate, features
rect(-47.4, -109.25, 47.4, 57.05, 6, fill="none", stroke=blue, stroke_width=2.4, stroke_dasharray="10 8")
rect(-46.6, -108.45, 46.6, 56.25, 5.2, fill=plate, stroke=ink, stroke_width=3)
rect(-31, 46.5, 31, 54.35, 0.6, fill="#E3E0D8", stroke=ink, stroke_width=2.2)            # cleat
rect(-27, -106.45, 27, -102.85, 0.4, fill="#E3E0D8", stroke=ink, stroke_width=2.2)       # tongue
rect(-42, -97, 22, -54, 4, fill=paper, stroke=ink, stroke_width=2.6)                     # cable opening
# under the Ethernet jack and the PoE module: recesses 0.8 mm deep, and a window through the plate for the jack's
# two shield springs
rect(-42.6, -44.45, -25.0, -21.25, 0.5, fill="#EDEBE5", stroke=ink, stroke_width=1.6, stroke_dasharray="6 5")
rect(-41.5, -7.85, -25.5, 15.35, 0.5, fill="#EDEBE5", stroke=ink, stroke_width=1.6, stroke_dasharray="6 5")
rect(-38.57, -42.87, -29.03, -35.97, 0.5, fill=paper, stroke=ink, stroke_width=2.2)
# recommended hole for a cable that comes out of the wall: below the Ethernet plug, level with the fifth screw
HX, HY, HR = -32.0, -88.0, 10.0
o.append(f'<circle cx="{X(HX):.1f}" cy="{Y(HY):.1f}" r="{HR * S:.1f}" fill="#DCE0E5" stroke="{ink}" stroke-width="2.6" stroke-dasharray="9 7"/>')
for (a, b, c, d) in [(HX - 3, HY, HX + 3, HY), (HX, HY - 3, HX, HY + 3)]: line(a, b, c, d, stroke=ink, stroke_width=2.2)
line(HX + 3, HY, 34 - 4.3, HY, stroke=soft, stroke_width=1.6, stroke_dasharray="18 6 3 6")
for cx in (-33.8, 36.8):                                                                  # break-off tabs
    rect(cx - 3.8, -108.45, cx + 3.8, -106.95, 0.3, fill=blue, stroke=ink, stroke_width=1.6)
for (hx, hy) in [(30, 36), (-30, 36), (30, -48.5), (-30, -48.5), (34, -88)]:
    o.append(f'<circle cx="{X(hx):.1f}" cy="{Y(hy):.1f}" r="{4.3 * S:.1f}" fill="#E3E0D8" stroke="{ink}" stroke-width="2"/>')
    o.append(f'<circle cx="{X(hx):.1f}" cy="{Y(hy):.1f}" r="{2.25 * S:.1f}" fill="{paper}" stroke="{ink}" stroke-width="2.4"/>')
# centre line and display centre
line(0, 66, 0, -118, stroke=soft, stroke_width=1.6, stroke_dasharray="18 6 3 6")
for (a, b, c, d) in [(-5, 0, 5, 0), (0, -5, 0, 5)]: line(a, b, c, d, stroke=ink, stroke_width=2.4)
o.append(f'<circle cx="{X(0):.1f}" cy="{Y(0):.1f}" r="{2.2 * S:.1f}" fill="none" stroke="{ink}" stroke-width="2"/>')
# dimensions
dim_h(-30, 30, 66, 36, "60")
dim_h(-30, 30, -58, -48.5, "60")
dim_h(0, 34, -116.5, -88, "34")
dim_h(-46.6, 46.6, -137, -108.45, "93.2")
dim_v(56.25, 36, 60, 30, "20.3")
dim_v(36, -48.5, 60, 30, "84.5")
dim_v(-48.5, -88, 60, 34, "39.5")
dim_v(56.25, -108.45, 84, 46.6, "164.7")
dim_v(36, 0, -60, -30, "36", side=-1)
dim_h(HX, 0, -76, HY + 3, "32")
# callouts
lead(-20, 50.4, -330, -70, "Cleat, at the top", "end")
lead(0, 0, -390, 40, "Middle of the display", "end")
lead(-42, -60, -210, 10, "Cable opening\n64 × 43", "end")
lead(HX - 7.4, HY - 6.7, -190, 24, "Hole for a cable\nfrom the wall, Ø 20", "end")
lead(-33.8, -107.7, -240, 60, "Break-off tab,\nEthernet", "end")
lead(36.8, -107.7, 150, 150, "Break-off tab,\npower", "start")
lead(-12, -104.6, -150, 118, "Tongue", "end")
lead(-42.6, -26, -150, -40, "Recess and window\nunder the Ethernet jack", "end")
lead(-25.5, 12, 70, -75, "Recess under the\nPoE module", "start")
lead(-47.4, 20, -180, -60, "Outline of\nthe reader", "end")
text(40, H - 34, "Dock seen from the front · mm · screw holes 4.5 mm, countersunk to 8.6 mm", 26, anchor="start", weight="500", fill=soft, px=True)
o.append('</g></svg>')
open(HERE + "fig-f4.svg", "w").write("\n".join(o))
subprocess.run(["rsvg-convert", "-o", HERE + "fig-f4.png", HERE + "fig-f4.svg"], check=True)
print("ok")
