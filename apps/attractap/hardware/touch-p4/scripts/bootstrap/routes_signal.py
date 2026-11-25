"""Fixed routes of signals that need a defined impedance: the USB pair as a coupled pair on the back layer.

Widths and gaps from JLCPCB's impedance calculator for its stack-up JLC06161H-3313 (outer layer over the
first plane, 0.0994 mm prepreg 3313, er 4.1, 1 oz, solder mask 1.0/0.6 mil, er 3.8), read 25 November 2026:
90 ohm differential at 0.14 mm width and 0.15 mm gap (90.4 ohm). The stack-up is symmetric, so the back layer
over the fifth plane (In4) is the same line as the component side over In1. The closed form of TI's LVDS
Owner's Manual (SNLA187, fig. 5-1) gives 91.8 ohm for the same line.
"""
import math

from board import B_, F

USB_W, USB_GAP = 0.14, 0.15


def offset(points, d):
    """The polyline `points` shifted by d to its left (in the board's y-down frame: left of the direction of
    travel), corners mitred."""
    out = []
    n = len(points)
    for i in range(n):
        normals = []
        for a, b in ((points[i - 1], points[i]) if i > 0 else (None, None), (points[i], points[i + 1]) if i < n - 1 else (None, None)):
            if a is None:
                continue
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            normals.append((dy / L, -dx / L))
        if len(normals) == 1:
            nx, ny = normals[0]
            out.append((points[i][0] + d * nx, points[i][1] + d * ny))
        else:
            (ax, ay), (bx, by) = normals
            mx, my = ax + bx, ay + by
            k = d / (1 + ax * bx + ay * by)              # mitre: d / cos^2(half the turn), along the bisector
            out.append((points[i][0] + k * mx, points[i][1] + k * my))
    return out


def length(points):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))


def usb_pair(B):
    """USB D+/D- from the 22 ohm resistors beside the MCU to the ESD part U101: one via each at each end, the
    rest a coupled pair on the back layer, clear of the 3.3 V converter's vias and of the display's bare
    ground pads. D+ runs on the left of the pair as it travels from the MCU to the connector. Returns the
    length of each line."""
    p = B.pad
    dp_r, dn_r = p('R216', '1'), p('R215', '1')
    dp_u, dn_u = p('U101', '4'), p('U101', '6')
    h = (USB_W + USB_GAP) / 2
    # centre line: up from the resistors, 45 degrees up and right past the converter, along to the ESD part
    x0, ys = dp_r[0] + 2.7, dp_r[1] - 0.7
    x1, y1, y2 = x0 + 9.0, dp_r[1] - 10.2, dp_r[1] - 19.2
    xe, ye = dp_u[0] - 3.35, dn_u[1] + 2.0
    centre = [(x0, ys), (x0, y1), (x1, y2), (xe, y2), (xe, ye)]
    left, right = offset(centre, h), offset(centre, -h)
    va_p, va_n = (dp_r[0] + 0.84, dp_r[1]), (dn_r[0] + 0.84, dn_r[1])
    vb_p, vb_n = (dp_u[0] - 1.25, dp_u[1]), (dn_u[0] - 1.25, dn_u[1])
    # into the pair at the start: east, then 45 degrees onto the line; out of it at the end the same way
    def into(v, line0):
        run = line0[0] - (v[1] - line0[1]) if v[1] > line0[1] else line0[0]
        return [v, (line0[0] - (v[1] - line0[1]), v[1]), line0]
    def out(line1, v):
        return [line1, (line1[0], v[1] + (v[0] - line1[0]) * 0 + 0.7), (line1[0] + 0.7, v[1]), v]
    paths = {'USB_DP': into(va_p, left[0])[:-1] + left + out(left[-1], vb_p)[1:],
             'USB_DN': into(va_n, (right[0][0], right[0][1] + 0.8))[:-1] + [(right[0][0], right[0][1] + 0.8)] +
             right + out(right[-1], vb_n)[1:]}
    for net, path, pads, (va, vb) in (('USB_DP', paths['USB_DP'], (dp_r, dp_u), (va_p, vb_p)),
                                       ('USB_DN', paths['USB_DN'], (dn_r, dn_u), (va_n, vb_n))):
        B.track([pads[0], va], net, USB_W)
        B.via(*va, net)
        B.track(path, net, USB_W, layer=B_)
        B.via(*vb, net)
        B.track([vb, pads[1]], net, USB_W)
    return {net: length(path) + 0.84 + 1.25 for net, path in paths.items()}


def usb_connector(B):
    """USB D+/D- from the ESD part to the USB-C receptacle without a via: through under U101 (its pins 4 and 3,
    6 and 1 are the same lines), then D+ joins its two receptacle pads (B6, A6) with a loop round the left
    ends of the pads and D- its two (B7, A7) round the right ends, under the receptacle's body."""
    p = B.pad
    w = USB_W
    dp4, dp3, dn6, dn1 = p('U101', '4'), p('U101', '3'), p('U101', '6'), p('U101', '1')
    b6, a6, b7, a7 = p('J101', 'B6'), p('J101', 'A6'), p('J101', 'B7'), p('J101', 'A7')
    half = 0.65                                           # half the receptacle pads' length
    xl, xr = b6[0] - half - 0.38, b6[0] + half + 0.27
    B.track([dp4, dp3], 'USB_DP', w)
    B.track([dn6, dn1], 'USB_DN', w)
    B.track([dp3, (xl - 0.2, dp3[1]), (xl, b6[1]), b6], 'USB_DP', w)
    B.track([(xl, b6[1]), (xl, a6[1]), a6], 'USB_DP', w)
    B.track([dn1, (xl - 0.2, dn1[1]), (xl, b7[1]), b7], 'USB_DN', w)
    B.track([b7, (xr, b7[1]), (xr, a7[1]), a7], 'USB_DN', w)

