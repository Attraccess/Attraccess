"""Report footprints whose bodies (pads + fab outline) overlap, and parts off the board."""
import sys
import pcbnew
import geometry as G
from board import OX, OY, PCB

MARGIN = -0.02  # courtyards may touch
SKIP_PAIRS = set()


def body_box(fp):
    xs, ys = [], []
    for pad in fp.Pads():
        bb = pad.GetBoundingBox()
        xs += [bb.GetLeft(), bb.GetRight()]; ys += [bb.GetTop(), bb.GetBottom()]
    for g in fp.GraphicalItems():
        if g.GetLayer() in (pcbnew.F_Fab, pcbnew.F_CrtYd) and g.GetClass() == 'PCB_SHAPE':
            bb = g.GetBoundingBox()
            xs += [bb.GetLeft(), bb.GetRight()]; ys += [bb.GetTop(), bb.GetBottom()]
    if not xs:
        bb = fp.GetBoundingBox(False)
        xs = [bb.GetLeft(), bb.GetRight()]; ys = [bb.GetTop(), bb.GetBottom()]
    t = pcbnew.ToMM
    return (t(min(xs)) - OX, t(min(ys)) - OY, t(max(xs)) - OX, t(max(ys)) - OY)


def main():
    b = pcbnew.LoadBoard(PCB)
    boxes = {fp.GetReference(): body_box(fp) for fp in b.GetFootprints()}
    refs = sorted(boxes)
    bad = 0
    for i, a in enumerate(refs):
        if a.startswith('ANT'):
            continue
        ax1, ay1, ax2, ay2 = boxes[a]
        for c in refs[i + 1:]:
            if c.startswith('ANT'):
                continue
            bx1, by1, bx2, by2 = boxes[c]
            ox = min(ax2, bx2) - max(ax1, bx1)
            oy = min(ay2, by2) - max(ay1, by1)
            if ox > -MARGIN and oy > -MARGIN:
                bad += 1
                print('OVERLAP %-7s %-7s by %.2f x %.2f   x %.1f..%.1f y %.1f..%.1f | x %.1f..%.1f y %.1f..%.1f' % (
                    a, c, ox, oy, ax1, ax2, ay1, ay2, bx1, bx2, by1, by2))
    for r, (x1, y1, x2, y2) in boxes.items():
        if x1 < 0.3 or y1 < 0.3 or x2 > G.BOARD_W - 0.3 or y2 > G.BOARD_H - 0.3:
            if not r.startswith(('J', 'U301')):
                print('EDGE    %-7s (%.1f..%.1f, %.1f..%.1f)' % (r, x1, x2, y1, y2))
    print(bad, 'overlaps')
    if len(sys.argv) > 1:
        for r in sys.argv[1:]:
            x1, y1, x2, y2 = boxes[r]
            print(r, 'x %.2f..%.2f  y %.2f..%.2f' % (x1, x2, y1, y2))


if __name__ == '__main__':
    main()
