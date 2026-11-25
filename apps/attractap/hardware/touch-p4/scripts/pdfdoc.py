"""A minimal PDF writer for the board's drawings (fabrication and assembly drawing).

Vector lines, filled polygons, circles and Helvetica text on pages of any size; coordinates in
millimetres with y down, like the board. The output has no date and no random identifiers, so the same
drawing gives the same bytes (fab/jlcpcb/ is checked against git)."""
import math
import zlib

PT = 72 / 25.4                      # points per millimetre
# Helvetica widths (1/1000 of the size) of the characters the drawings use; others count as 556
_W = {' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '+': 584, '/': 278, '(': 333, ')': 333,
      '%': 889, 'x': 500, '=': 584, "'": 191, 'I': 278, 'i': 222, 'l': 222, 'j': 222, 'f': 278, 't': 278,
      'r': 333, 'J': 500, 'M': 833, 'W': 944, 'm': 833, 'w': 722, '_': 556, '#': 556, '|': 260}


def text_width(s, size):
    """Width in mm of a Helvetica string `size` mm high."""
    return sum(_W.get(c, 667 if c.isupper() else 556) for c in s) * size / 1000


def _esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


class Page:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.ops = []

    def _p(self, x, y):
        return '%.3f %.3f' % (x * PT, (self.h - y) * PT)

    def stroke(self, width=0.25, gray=0.0):
        self.ops.append('%.3f w %.3f G' % (width * PT, gray))

    def line(self, x1, y1, x2, y2, width=0.25, gray=0.0, dash=None):
        d = '[%.2f %.2f] 0 d' % (dash[0] * PT, dash[1] * PT) if dash else '[] 0 d'
        self.ops.append('%s %.3f w %.3f G %s m %s l S' % (d, width * PT, gray, self._p(x1, y1), self._p(x2, y2)))

    def poly(self, pts, width=0.25, gray=0.0, fill=None, close=True):
        if len(pts) < 2:
            return
        path = '%s m ' % self._p(*pts[0]) + ' '.join('%s l' % self._p(x, y) for x, y in pts[1:])
        if fill is not None:
            self.ops.append('[] 0 d %.3f g %s h f' % (fill, path))
        if width:
            self.ops.append('[] 0 d %.3f w %.3f G %s %s' % (width * PT, gray, path, 's' if close else 'S'))

    def rect(self, x1, y1, x2, y2, width=0.25, gray=0.0, fill=None):
        self.poly([(x1, y1), (x2, y1), (x2, y2), (x1, y2)], width, gray, fill)

    def circle(self, cx, cy, r, width=0.25, gray=0.0, fill=None):
        pts = [(cx + r * math.cos(a * math.pi / 18), cy + r * math.sin(a * math.pi / 18)) for a in range(36)]
        self.poly(pts, width, gray, fill)

    def text(self, s, x, y, size=2.5, align='l', gray=0.0, bold=False, angle=0):
        """Text with its baseline at y; align 'l', 'c' or 'r' at x; angle in degrees, counter-clockwise."""
        w = text_width(s, size)
        dx = {'l': 0, 'c': -w / 2, 'r': -w}[align]
        a = math.radians(angle)
        ca, sa = math.cos(a), math.sin(a)
        ox, oy = x + dx * ca, y - dx * sa
        font = '/F2' if bold else '/F1'
        self.ops.append('BT %s %.3f Tf %.3f g %.4f %.4f %.4f %.4f %s Tm (%s) Tj ET' % (
            font, size * PT, gray, ca, sa, -sa, ca, self._p(ox, oy), _esc(s)))

    def arrow(self, x1, y1, x2, y2, width=0.18):
        """A dimension line from (x1, y1) to (x2, y2) with arrow heads at both ends."""
        self.line(x1, y1, x2, y2, width)
        ang = math.atan2(y2 - y1, x2 - x1)
        for (x, y), s in (((x1, y1), 1), ((x2, y2), -1)):
            p = [(x, y)]
            for da in (0.35, -0.35):
                p.append((x + s * 1.8 * math.cos(ang + da), y + s * 1.8 * math.sin(ang + da)))
            self.poly(p, 0, fill=0.0)


class Document:
    def __init__(self, title):
        self.title = title
        self.pages = []

    def page(self, w, h):
        p = Page(w, h)
        self.pages.append(p)
        return p

    def save(self, path):
        objs = []                                   # object bodies, numbered from 1

        def add(body):
            objs.append(body)
            return len(objs)
        f1 = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
        f2 = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
        pages_id = len(objs) + 1 + 2 * len(self.pages)
        kids = []
        for p in self.pages:
            data = zlib.compress('\n'.join(p.ops).encode('latin-1', 'replace'), 9)
            c = add(b'<< /Length %d /Filter /FlateDecode >>\nstream\n' % len(data) + data + b'\nendstream')
            kids.append(add(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.3f %.3f] /Contents %d 0 R '
                             '/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>'
                             % (pages_id, p.w * PT, p.h * PT, c, f1, f2)).encode()))
        assert add(('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids),
                                                                  len(kids))).encode()) == pages_id
        info = add(('<< /Title (%s) /Producer (attractap pdfdoc) >>' % _esc(self.title)).encode())
        cat = add(('<< /Type /Catalog /Pages %d 0 R >>' % pages_id).encode())
        out = bytearray(b'%PDF-1.4\n')
        offsets = []
        for i, body in enumerate(objs, 1):
            offsets.append(len(out))
            out += b'%d 0 obj\n' % i + body + b'\nendobj\n'
        xref = len(out)
        out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
        out += b''.join(b'%010d 00000 n \n' % o for o in offsets)
        out += b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (
            len(objs) + 1, cat, info, xref)
        open(path, 'wb').write(bytes(out))
