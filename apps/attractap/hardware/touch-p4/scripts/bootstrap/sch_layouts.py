"""The arrangement of every schematic sheet: which layout draws it and on which paper."""
import sch_io
import sch_mcu
import sch_periph
import sch_power

LAYOUTS = {
    'power': sch_power.power,
    'mcu': sch_mcu.mcu,
    'mcu_power': sch_mcu.mcu_power,
    'wifi': sch_periph.wifi,
    'eth': sch_periph.eth,
    'nfc': sch_io.nfc,
    'display': sch_io.display,
    'ui': sch_io.ui,
    'mech': sch_io.mech,
}


PAPERS = [('A4', 297.0, 210.0), ('A3', 420.0, 297.0), ('A2', 594.0, 420.0), ('A1', 841.0, 594.0)]
TITLE_BLOCK = (112.0, 36.0)            # KiCad's title block in the lower right corner, inside the 10 mm border


def draw(key, cv, parts, top):
    """Draw sheet `key` below y = top."""
    LAYOUTS[key](cv, parts, top)


def paper(items):
    """The smallest paper that holds every item (x1, y1, x2, y2) inside its border and off the title block."""
    x2 = max(b[2] for b in items)
    y2 = max(b[3] for b in items)
    for name, w, h in PAPERS:
        tb = (w - 12 - TITLE_BLOCK[0], h - 12 - TITLE_BLOCK[1])
        if x2 < w - 12 and y2 < h - 12 and not any(b[2] > tb[0] and b[3] > tb[1] for b in items):
            return name
    raise SystemExit('the drawing does not fit on A1')
