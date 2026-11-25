"""Field of the dock's magnet at the hall switch U703, for the reader on its dock and while it is lifted off.

The magnet is a disc magnetised through its thickness: the same field as a current that runs round its
rim, Br / mu0 amperes per metre of thickness. That current is cut into rings and the rings into straight
pieces (Biot-Savart)."""
import numpy as np

from board import MU0, geometry

MAGNET_D, MAGNET_T = 10.0, 3.0      # mm, N35
BR = (1.17, 1.21)                   # tesla at 20 degC: N35 from its weakest to its typical
BR_PER_K = -0.0012                  # neodymium loses 0.12 % per kelvin
SENSOR_ABOVE_BOARD = 0.6            # mm: the hall element inside the SOT-23 package
B_ON, B_OFF = 4.8e-3, 0.5e-3        # DRV5032FA: switches on for certain above, off for certain below


def docked_distance():
    """mm from the magnet's face to the hall element with the reader on its dock."""
    return geometry.DOCK_PLATE - MAGNET_T - SENSOR_ABOVE_BOARD


def field(distance, offset=0.0, br=BR[1], warmer=0.0):
    """Flux density along the magnet's axis direction (T) at `distance` mm in front of its face and `offset`
    mm beside its axis."""
    br = br * (1 + BR_PER_K * warmer)
    rings, pieces = 15, 96
    a = np.arange(pieces) * 2 * np.pi / pieces
    r = MAGNET_D / 2 * 1e-3
    x1, y1 = r * np.cos(a), r * np.sin(a)
    x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
    current = br / MU0 * MAGNET_T * 1e-3 / rings
    bz = 0.0
    for k in range(rings):
        z = -(k + 0.5) / rings * MAGNET_T * 1e-3            # the ring lies this far behind the face
        rx, ry, rz = offset * 1e-3 - (x1 + x2) / 2, -(y1 + y2) / 2, distance * 1e-3 - z
        dlx, dly = x2 - x1, y2 - y1
        bz += (MU0 * current / (4 * np.pi) * (dlx * ry - dly * rx) / (rx ** 2 + ry ** 2 + rz ** 2) ** 1.5).sum()
    return bz


def lift(threshold, br=BR[1]):
    """How far the reader has to be lifted (mm) before the field at the switch falls to `threshold`."""
    d = np.arange(0.0, 80.0, 0.1)
    b = np.array([field(docked_distance() + x, br=br) for x in d])
    return float(d[np.argmax(b < threshold)])
