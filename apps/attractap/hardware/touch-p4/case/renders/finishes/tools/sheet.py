"""Comparison sheets of the study renders: crops each render and lays them out in rows with captions.

    python3 -I sheet.py

Writes `renders/finishes/finish-comparison.png` and `renders/faceplate/faceplate-comparison.png` (needs rsvg-convert).
A row shares the sheet width equally among its cells; a missing image leaves its cell empty.
"""
import base64, os, struct, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERS = os.path.dirname(os.path.dirname(HERE))
ink, soft, paper, card = "#202729", "#5E6A72", "#F0F2F5", "#FFFFFF"

# crops as fractions x0, y0, x1, y1 of the render
DESK = (0.20, 0.03, 0.80, 0.78)
WALL = (0.27, 0.06, 0.73, 0.96)
DETAIL = (0.10, 0.02, 0.90, 0.98)

FINISHES = ("finishes", "finish-comparison.png", "Attractap Touch · finish study",
            "Renders of the current case geometry with different materials. Materials only: no part was redesigned for milling, sheet metal or resin.",
            [[("A-aluminium-desk.png", "A · Aluminium", "Cap, dock and stand in bead-blasted aluminium", DESK),
              ("B-resin-desk.png", "B · Translucent resin, as printed", "Frosted: supports removed, not sanded", DESK),
              ("B-resin-clear-desk.png", "B · Clear resin, polished", "Sanded and clear-coated by the print service", DESK)],
             [("C-resin-on-aluminium-desk.png", "C · Resin cap on aluminium", "Frosted cap, aluminium stand", DESK),
              ("D-aluminium-on-resin-desk.png", "D · Aluminium cap on resin", "Aluminium cap, frosted stand", DESK),
              ("E-abs-on-aluminium-desk.png", "E · Printed cap on aluminium", "RAL 5021 printed cap, aluminium stand", DESK)],
             [("A-aluminium-wall.png", "A · Aluminium", "", WALL), ("B-resin-wall.png", "B · Resin, as printed", "", WALL),
              ("B-resin-clear-wall.png", "B · Resin, polished", "", WALL), None, None]])

FACEPLATE = ("faceplate", "faceplate-comparison.png", "Attractap Touch · swappable face plate, edge to edge",
             "The plate covers the whole front. Sheet materials are 0.8 mm on a printed carrier; a metal sheet gets a plastic window over the NFC antenna and a slit to the edge.",
             [[("walnut-wall.png", "Walnut", "Veneer plywood, laser-cut and engraved", WALL), ("birch-wall.png", "Birch plywood", "Laser-cut and engraved", WALL),
               ("alu-wall.png", "Aluminium", "Bead-blasted, plastic tap window", WALL), ("black-wall.png", "Black anodised", "Aluminium, plastic tap window", WALL),
               ("white-wall.png", "Printed", "One piece, marble white", WALL)],
              [("walnut-desk.png", "Walnut plate on the desk stand", "", DESK), ("alu-desk.png", "Aluminium plate on the desk stand", "", DESK),
               ("walnut-detail.png", "Edge of the walnut plate", "Cap, printed carrier and sheet", DETAIL)]])


def size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def cell(o, path, x, y, w, crop, title, note):
    """Draw one cropped render with its caption; returns the height used."""
    pw, ph = size(path)
    cx0, cy0, cx1, cy1 = crop
    sw, sh = (cx1 - cx0) * pw, (cy1 - cy0) * ph
    h = w * sh / sw
    data = base64.b64encode(open(path, "rb").read()).decode()
    o.append(f'<rect x="{x - 1:.1f}" y="{y - 1:.1f}" width="{w + 2:.1f}" height="{h + 2:.1f}" fill="{card}" stroke="#D5DADF"/>')
    o.append(f'<svg x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" viewBox="{cx0 * pw:.1f} {cy0 * ph:.1f} {sw:.1f} {sh:.1f}" preserveAspectRatio="xMidYMid slice">'
             f'<image width="{pw}" height="{ph}" href="data:image/png;base64,{data}"/></svg>')
    o.append(f'<text x="{x:.1f}" y="{y + h + 32:.1f}" font-size="23" font-weight="700" fill="{ink}">{title}</text>')
    if note:
        o.append(f'<text x="{x:.1f}" y="{y + h + 58:.1f}" font-size="18" font-weight="400" fill="{soft}">{note}</text>')
    return h + (76 if note else 50)


def sheet(folder, out, title, footer, rows):
    W, M, G = 2000, 50, 30
    base = os.path.join(RENDERS, folder)
    o, y = [], M + 54
    o.append(f'<text x="{M}" y="{M + 20}" font-size="36" font-weight="700" fill="{ink}">{title}</text>')
    for row in rows:
        cw = (W - 2 * M - (len(row) - 1) * G) / len(row)
        used = 0
        for i, c in enumerate(row):
            if c is None or not os.path.exists(os.path.join(base, c[0])):
                continue
            used = max(used, cell(o, os.path.join(base, c[0]), M + i * (cw + G), y, cw, c[3], c[1], c[2]))
        y += used + 24
    o.append(f'<text x="{M}" y="{y + 6:.1f}" font-size="18" fill="{soft}">{footer}</text>')
    H = y + 40
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H:.0f}" viewBox="0 0 {W} {H:.0f}">'
           f'<rect width="{W}" height="{H:.0f}" fill="{paper}"/>'
           '<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">' + "".join(o) + '</g></svg>')
    p = os.path.join(base, out.replace(".png", ".svg"))
    open(p, "w").write(svg)
    subprocess.run(["rsvg-convert", "-o", os.path.join(base, out), p], check=True)
    os.remove(p)
    print("ok", os.path.join(base, out))


if __name__ == "__main__":
    for spec in (FINISHES, FACEPLATE):
        sheet(*spec)
