"""How warm the board gets inside the closed case: a first estimate.

The board is a plate that spreads heat through its copper (taken layer by layer from the filled zones) and
loses it through both faces: through the air gap to the display and out of the front, through the air
behind it to the dock plate and the wall. Each part's loss is put in where the part sits. The surface
figures are textbook values for still air, so read the result as +-40 %: it shows which part runs warmest
and whether anything is near a limit, not a temperature to a degree."""
import numpy as np

from board import OX, OY, geometry
from nfc_loop import copper_mask

CELL = 1.0                  # mm
K_CU, K_FR4 = 390.0, 0.3    # W/(m K)
# W/(m2 K) from the board to the surroundings, each a chain of steps in series:
# display side under the LCD: 1.5 mm of air and radiation (24), LCD and glass (330), front to the room (10)
# display side below it: 4.7 mm of air and radiation (12), front wall of the case (83), front to the room (10)
# component side: 13.9 mm of air and radiation (8), dock plate (80), into the wall or the air behind (10)
U_FRONT_LCD = 1 / (1 / 24 + 1 / 330 + 1 / 10)
U_FRONT_CASE = 1 / (1 / 12 + 1 / 83 + 1 / 10)
U_BACK = 1 / (1 / 8 + 1 / 80 + 1 / 10)
DISPLAY_W = 0.6             # backlight and panel logic
# watts lost in each part: (typical use, everything on for a long time). The 3.3 V load is 1.5 W / 3.3 W.
COMMON = {'U201': (0.60, 1.00), 'U202': (0.05, 0.08), 'U301': (0.30, 0.80), 'U501': (0.30, 0.35), 'U601': (0.10, 0.10),
          'U103': (0.12, 0.25), 'L101': (0.05, 0.10), 'R702': (0.00, 0.10),
          **{'D%d' % (701 + i): (0.03, 0.11) for i in range(8)}}
SUPPLY = {
    'USB': {'D102': (0.22, 0.42), 'F101': (0.02, 0.07)},
    'DC, 12 V': {'D107': (0.22, 0.42), 'U104': (0.20, 0.38), 'L102': (0.08, 0.17), 'D105': (0.09, 0.16), 'F102': (0.01, 0.04)},
    'PoE': {'D104': (0.22, 0.42), 'U401': (0.30, 0.30)},
}
# The PoE module stands on a part of the board without copper and gives its loss to the air around its
# own body, not to the board: it warms the inside of the case as a whole, like the display does.
INTO_THE_AIR = {'USB': (DISPLAY_W, DISPLAY_W), 'DC, 12 V': (DISPLAY_W, DISPLAY_W), 'PoE': (DISPLAY_W + 0.68, DISPLAY_W + 1.20)}
MODULE_AIR_MAX = 85         # degC of the air around the PoE module, from its data sheet
# K/W from the part's inside to the board under it, and what its inside stands (degC)
JUNCTION = {'U201': (8, 105), 'U103': (40, 125), 'U104': (40, 125), 'D102': (20, 125), 'D104': (20, 125), 'D107': (20, 125),
            'U102': (10, 85), 'U301': (15, 85), 'U501': (10, 125)}
DISPLAY_MAX = 70            # degC the panel is specified for when it works
# hold current of the DC input's fuse (1.1 A at 25 degC) against its own temperature, from its data sheet
FUSE_DERATING = ((25, 1.00), (40, 0.87), (50, 0.79), (60, 0.70), (70, 0.61), (85, 0.48))


def plate(board):
    """(mask of board cells, sheet conductance of every cell in W/K, loss of every cell to the surroundings
    in W/K, mask of the cells behind the LCD)."""
    nx, ny = int(geometry.BOARD_W / CELL), int(round(geometry.BOARD_H / CELL))
    X, Y = np.meshgrid((np.arange(nx) + 0.5) * CELL, (np.arange(ny) + 0.5) * CELL)
    on = ~((X > geometry.NOTCH_X) & (Y > geometry.NOTCH_Y)) & ~((X < geometry.POCKET_X) & (Y > geometry.POCKET_Y))
    sx1, sy1, sx2, sy2 = geometry.SLOT
    on &= ~((X > sx1) & (X < sx2) & (Y > sy1) & (Y < sy2))
    sheet = np.full((ny, nx), K_FR4 * 1.6e-3)
    for layer, t in board.copper.items():
        sheet += K_CU * t * copper_mask(board, OX, OY, nx, ny, CELL, sub=2, layer=layer, share=True)
    lx1, ly1, lx2, ly2 = geometry.LCM
    under_lcd = (X > lx1) & (X < lx2) & (Y > ly1) & (Y < ly2)
    loss = (np.where(under_lcd, U_FRONT_LCD, U_FRONT_CASE) + U_BACK) * (CELL * 1e-3) ** 2
    return on, sheet, loss, under_lcd


def solve(board, supply, column, cached={}):
    """(temperature rise of every cell over the room in K, {part: rise of the board under it}, the parts'
    losses, mask of the board, mask of the cells behind the LCD)."""
    if id(board) not in cached:
        cached[id(board)] = plate(board)
    on, sheet, loss, under_lcd = cached[id(board)]
    ny, nx = on.shape
    # conductance between neighbouring cells: two half cells in series; none across the board's edge
    def faces(a, b, both):
        return np.where(both, 2 * a * b / (a + b), 0.0)
    cx = faces(sheet[:, :-1], sheet[:, 1:], on[:, :-1] & on[:, 1:])
    cy = faces(sheet[:-1, :], sheet[1:, :], on[:-1, :] & on[1:, :])
    q = np.zeros(on.shape)
    parts = dict(COMMON, **SUPPLY[supply])
    where = {}
    for ref, watts in parts.items():
        pads = [p for p in board.pads if p['ref'] == ref]
        x1, x2 = min(p['x'] for p in pads) - OX, max(p['x'] for p in pads) - OX
        y1, y2 = min(p['y'] for p in pads) - OY, max(p['y'] for p in pads) - OY
        ix1, ix2 = max(int(x1 / CELL), 0), min(int(x2 / CELL), nx - 1)
        iy1, iy2 = max(int(y1 / CELL), 0), min(int(y2 / CELL), ny - 1)
        cells = np.zeros(on.shape, dtype=bool)
        cells[iy1:iy2 + 1, ix1:ix2 + 1] = True
        cells &= on
        q[cells] += watts[column] / cells.sum()
        where[ref] = cells
    q[on] += INTO_THE_AIR[supply][column] / on.sum()

    def apply(t):
        out = loss * t
        dx, dy = cx * (t[:, :-1] - t[:, 1:]), cy * (t[:-1, :] - t[1:, :])
        out[:, :-1] += dx; out[:, 1:] -= dx
        out[:-1, :] += dy; out[1:, :] -= dy
        return np.where(on, out, 0.0)

    # conjugate gradients, preconditioned with the diagonal
    diag = loss.copy()
    diag[:, :-1] += cx; diag[:, 1:] += cx
    diag[:-1, :] += cy; diag[1:, :] += cy
    t = np.zeros(on.shape)
    r = np.where(on, q, 0.0)
    z = r / diag
    p = z.copy()
    rz = (r * z).sum()
    for _ in range(20000):
        ap = apply(p)
        alpha = rz / (p * ap).sum()
        t += alpha * p
        r -= alpha * ap
        if np.abs(r).max() < 1e-9:
            break
        z = r / diag
        rz, old = (r * z).sum(), rz
        p = z + rz / old * p
    return t, {ref: float(t[cells].max()) for ref, cells in where.items()}, parts, on, under_lcd


def display_rise(board_rise):
    """The LCD sits between the board and the front: its share of the board's rise behind it."""
    return board_rise * (1 / 330 + 1 / 10) / (1 / 24 + 1 / 330 + 1 / 10)


def fuse_hold(temp):
    t, f = zip(*FUSE_DERATING)
    return 1.1 * float(np.interp(temp, t, f))
