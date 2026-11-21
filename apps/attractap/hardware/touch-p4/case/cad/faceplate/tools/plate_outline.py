"""Cutting outlines of the decorative sheet as SVG and DXF (mm), for laser cutting or routing from 0.8 mm sheet.

    python3 -I plate_outline.py

Writes next to the `tools` folder:
    attractap-faceplate-sheet.svg / .dxf          wood, acrylic and other non-metals: outline, display window, eight LED slots
    attractap-faceplate-sheet-metal.svg / .dxf    metals: outline, display window, a window over the NFC antenna and a 1 mm
                                                  slit from that window to the lower edge

The sheet covers the whole front of the reader and is bonded to the printed carrier. The numbers repeat the case design
(attractap-touch-faceplate.sc: cap outline, ScreenWindow, LedWindows) and the sheet features in
renders/faceplate/tools/gen_faceplate.py. Origin: centre of the display. Y points up. The wordmark, tap ring and keyhole
are engraved marks and are not part of these files.
"""
import math, os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
X0, X1, Y0, Y1, R = -47.4, 47.4, -109.25, 57.05, 6.0     # outline 94.8 x 166.3, corner radius 6
W, WR = 42.4, 1.0                                         # display window 84.8 square, corner radius 1
LED_X, LED_Y = (-15.0, -5.0, 5.0, 15.0), (-46.45, -89.85)  # LED slots 7 x 3 with round ends
TX, TY0, TY1, TR = 22.0, -93.5, -44.4, 4.0                # metal: window over the antenna, 44 x 49.1, corner radius 4
SLIT = 1.0


def rounded(x0, y0, x1, y1, r):
    """A rounded rectangle, counter-clockwise, as line and arc segments."""
    return [("M", x0 + r, y0), ("L", x1 - r, y0), ("A", x1 - r, y0 + r, r, 270, 360, x1, y0 + r), ("L", x1, y1 - r),
            ("A", x1 - r, y1 - r, r, 0, 90, x1 - r, y1), ("L", x0 + r, y1), ("A", x0 + r, y1 - r, r, 90, 180, x0, y1 - r),
            ("L", x0, y0 + r), ("A", x0 + r, y0 + r, r, 180, 270, x0 + r, y0)]


def contours(metal):
    c = [rounded(-W, -W, W, W, WR)]
    if not metal:
        c.insert(0, rounded(X0, Y0, X1, Y1, R))
        c += [rounded(x - 3.5, y - 1.5, x + 3.5, y + 1.5, 1.5) for y in LED_Y for x in LED_X]
        return c
    h = SLIT / 2
    # the slit joins the outline and the window into one contour: down the right side of the slit, round the sheet, up the left side
    one = [("M", h, TY0), ("L", TX - TR, TY0), ("A", TX - TR, TY0 + TR, TR, 270, 360, TX, TY0 + TR), ("L", TX, TY1 - TR),
           ("A", TX - TR, TY1 - TR, TR, 0, 90, TX - TR, TY1), ("L", -TX + TR, TY1), ("A", -TX + TR, TY1 - TR, TR, 90, 180, -TX, TY1 - TR),
           ("L", -TX, TY0 + TR), ("A", -TX + TR, TY0 + TR, TR, 180, 270, -TX + TR, TY0), ("L", -h, TY0), ("L", -h, Y0),
           ("L", X0 + R, Y0), ("C", X0 + R, Y0 + R, R, 270, 180, X0, Y0 + R), ("L", X0, Y1 - R), ("C", X0 + R, Y1 - R, R, 180, 90, X0 + R, Y1),
           ("L", X1 - R, Y1), ("C", X1 - R, Y1 - R, R, 90, 0, X1, Y1 - R), ("L", X1, Y0 + R), ("C", X1 - R, Y0 + R, R, 360, 270, X1 - R, Y0),
           ("L", h, Y0), ("L", h, TY0)]
    return [one] + c


def write_svg(path, metal):
    def X(x): return x - X0 + 2
    def Y(y): return Y1 + 2 - y                    # SVG y runs down; 2 mm margin
    paths = []
    for con in contours(metal):
        d = []
        for seg in con:
            if seg[0] in ("M", "L"):
                d.append(f"{seg[0]}{X(seg[1]):.3f},{Y(seg[2]):.3f}")
            else:                                  # 'A' runs counter-clockwise, 'C' clockwise (in model space, y up)
                d.append(f"A{seg[3]},{seg[3]} 0 0 {0 if seg[0] == 'A' else 1} {X(seg[6]):.3f},{Y(seg[7]):.3f}")
        paths.append(f'<path d="{" ".join(d)} Z" fill="none" stroke="#000" stroke-width="0.1"/>')
    w, h = X1 - X0 + 4, Y1 - Y0 + 4
    open(path, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h:.2f}mm" viewBox="0 0 {w} {h:.2f}">' + "".join(paths) + "</svg>")


def write_dxf(path, metal):
    e = []
    for con in contours(metal):
        cur = None
        for seg in con:
            if seg[0] == "M":
                cur = (seg[1], seg[2])
            elif seg[0] == "L":
                e.append(f"0\nLINE\n8\nCUT\n10\n{cur[0]:.4f}\n20\n{cur[1]:.4f}\n11\n{seg[1]:.4f}\n21\n{seg[2]:.4f}")
                cur = (seg[1], seg[2])
            else:                                  # DXF arcs always run counter-clockwise from the first angle to the second
                a0, a1 = (seg[4], seg[5]) if seg[0] == "A" else (seg[5], seg[4])
                e.append(f"0\nARC\n8\nCUT\n10\n{seg[1]:.4f}\n20\n{seg[2]:.4f}\n40\n{seg[3]:.4f}\n50\n{a0 % 360:.4f}\n51\n{a1 % 360:.4f}")
                cur = (seg[6], seg[7])
    open(path, "w").write("0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n" + "\n".join(e) + "\n0\nENDSEC\n0\nEOF\n")


def check():
    """Every segment must start where the one before ended, and every contour must close."""
    for metal in (False, True):
        for con in contours(metal):
            cur = start = None
            for seg in con:
                if seg[0] == "M":
                    cur = start = (seg[1], seg[2])
                elif seg[0] == "L":
                    cur = (seg[1], seg[2])
                else:
                    cx, cy, r, a0, a1, x, y = seg[1:]
                    sx, sy = cx + r * math.cos(math.radians(a0)), cy + r * math.sin(math.radians(a0))
                    ex, ey = cx + r * math.cos(math.radians(a1)), cy + r * math.sin(math.radians(a1))
                    assert abs(sx - cur[0]) < 1e-6 and abs(sy - cur[1]) < 1e-6, (seg, cur)
                    assert abs(ex - x) < 1e-6 and abs(ey - y) < 1e-6, seg
                    cur = (x, y)
            assert abs(cur[0] - start[0]) < 1e-6 and abs(cur[1] - start[1]) < 1e-6, (cur, start)


if __name__ == "__main__":
    check()
    for name, metal in (("attractap-faceplate-sheet", False), ("attractap-faceplate-sheet-metal", True)):
        write_svg(os.path.join(OUT, name + ".svg"), metal)
        write_dxf(os.path.join(OUT, name + ".dxf"), metal)
    print("ok")
