"""Checks of the circuit description that need no KiCad. Run: python3 -I scripts/bootstrap/test_design.py"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import check_netlist  # noqa: E402
import design  # noqa: E402
import geometry  # noqa: E402


class DesignTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = design.build()
        cls.nets = {}
        for part in cls.d.parts.values():
            for pin, net in part.nets.items():
                cls.nets.setdefault(net, []).append((part.ref, pin))

    def test_every_net_has_two_pins(self):
        self.assertEqual([n for n, pins in self.nets.items() if len(pins) < 2], [])

    def test_fitted_parts_have_a_part_number(self):
        missing = [p.ref for p in self.d.parts.values()
                   if not p.dnp and not p.ref.startswith(design.NOT_FITTED) and not p.lcsc]
        self.assertEqual(missing, [])

    def test_variants(self):
        self.assertEqual({p.variant for p in self.d.parts.values()}, {'', 'lan'})
        # the Wi-Fi version must work without the lan parts: none of them may sit on a supply path
        lan = {p.ref for p in self.d.parts.values() if p.variant == 'lan'}
        self.assertIn('U401', lan)
        self.assertNotIn('U201', lan)

    def test_boot_button_is_decoupled_from_the_ethernet_line(self):
        on_txd1 = {ref for ref, _pin in self.nets['RMII_TXD1']}
        self.assertNotIn('SW202', on_txd1)
        self.assertEqual({ref for ref, _pin in self.nets['BOOT']}, {'R217', 'SW202', 'TP807'})

    def test_ethernet_pair_polarity_at_the_jack(self):
        jack = self.d.parts['J401'].nets
        self.assertEqual([jack[n] for n in ('1', '2', '5', '6')], ['MDI_RP', 'MDI_RN', 'MDI_TP', 'MDI_TN'])

    def test_buzzer_coil_is_between_its_two_pads(self):
        # pads 1 and 2 are the coil, pads 3 and 4 only hold the part: both ends on one net stay silent
        buzzer = self.d.parts['BZ701']
        self.assertEqual(buzzer.nets, {'1': 'BUZ_P', '2': 'BUZ_N'})
        self.assertEqual(buzzer.nc, {'3', '4'})

    def test_diodes_point_from_their_source_to_the_5v_rail(self):
        # KiCad's diode symbols: pin 1 = cathode
        for ref, source in (('D102', '+5V_USB'), ('D104', '+5V_POE'), ('D107', '+5V_DC')):
            self.assertEqual(self.d.parts[ref].nets, {'1': '+5V', '2': source})

    def test_dc_input_capacitors_keep_their_capacitance_at_24_v(self):
        # The 10 uF / 50 V X5R part of this size (a basic part, so tempting) keeps 1.35 uF at 24 V. Large at
        # low voltage and small at high voltage, it lets the input swing to 45 V when a live 24 V supply is
        # plugged in; the converter stands 40 V. The 100 V X7R part keeps 1.53 uF and swings to 37.5 V.
        for ref in ('C112', 'C113', 'C117'):
            part = self.d.parts[ref]
            self.assertEqual((part.value, part.lcsc, part.fp), ('2.2u/100V', 'C170101', design.STD_FP['C1206']))

    def test_unpowered_sources_have_a_bleed_resistor(self):
        for net in ('+5V_USB', '+5V_DC'):
            to_ground = [ref for ref, _pin in self.nets[net] if ref.startswith('R') and
                         'GND' in self.d.parts[ref].nets.values()]
            self.assertEqual(len(to_ground), 1, net)


    def test_tamper_sensors(self):
        # hall switch: supply, output to the IO expander's P6 (pin 11), ground. Both versions have it.
        hall = self.d.parts['U703']
        self.assertEqual(hall.nets, {'1': '+3V3', '2': 'DOCK_N', '3': 'GND'})
        self.assertEqual(self.d.parts['U602'].nets['11'], 'DOCK_N')
        # accelerometer: on the touch bus, I2C mode (CS high), address pin pulled up
        acc = self.d.parts['U702']
        self.assertEqual((acc.nets['1'], acc.nets['4'], acc.nets['2']), ('I2C0_SCL', 'I2C0_SDA', '+3V3'))
        self.assertEqual({ref for ref, _pin in self.nets[acc.nets['3']]}, {'U702', 'R706'})
        # proximity sensor: on the touch bus, the two cathode pins joined and on nothing else, emitter
        # and receiver on 3.3 V, the open-drain interrupt with a pull-up and a test point
        prox = self.d.parts['U704']
        self.assertEqual((prox.nets['8'], prox.nets['7'], prox.nets['1']), ('I2C0_SCL', 'I2C0_SDA', 'GND'))
        self.assertEqual((prox.nets['3'], prox.nets['4']), ('+3V3', '+3V3'))
        self.assertEqual(sorted(self.nets[prox.nets['2']]), [('U704', '2'), ('U704', '5')])
        self.assertEqual({ref for ref, _pin in self.nets[prox.nets['6']]}, {'U704', 'R707', 'TP815'})
        self.assertEqual({hall.variant, acc.variant, prox.variant}, {''})


class GeometryTest(unittest.TestCase):
    def behind_metal_back(self, pin, margin=0.0):
        x, y = geometry.JACK_X + pin[0], geometry.JACK_Y + pin[1]
        x1, y1, x2, y2 = geometry.LCM
        return x1 - margin < x < x2 + margin and y1 - margin < y < y2 + margin

    def test_no_48_v_pin_behind_the_display(self):
        # The jack's pins stand out of the display side of the board, behind the lower right corner of
        # the display. The two 48 V pins must be beside the LCD module's metal back, not behind it
        # (0.3 mm: half the pin).
        for pin in geometry.JACK_PINS_48V:
            self.assertFalse(self.behind_metal_back(pin, 0.3), pin)
        # the others are behind it: this is why DISPLAY_GAP has a lower limit
        self.assertTrue(any(self.behind_metal_back(pin) for pin in geometry.JACK_PINS_OTHER))

    def test_display_clears_the_clipped_pins(self):
        self.assertGreaterEqual(geometry.DISPLAY_GAP[0] - geometry.JACK_PIN_CLIPPED, 0.5)
        self.assertLessEqual(geometry.DISPLAY_GAP[1], 2.0)      # the display's flex reaches no further

    def test_jack_opens_into_the_cut_away(self):
        front = geometry.JACK_Y + 13.32
        self.assertGreaterEqual(front, geometry.NOTCH_Y)
        self.assertLess(front - geometry.NOTCH_Y, 0.5)

    def test_proximity_sensor_sees_plain_dock_plate(self):
        # the emitter's light on the dock's plate ends before the holder of the dock's magnet
        ex, ey = geometry.PROX[0], geometry.PROX[1] + geometry.PROX_EMITTER_DY
        spot = geometry.DOCK_PLATE * math.tan(math.radians(geometry.PROX_BEAM_DEG))
        holder = math.hypot(ex - geometry.HALL[0], ey - geometry.HALL[1]) - geometry.MAGNET_RING_R
        self.assertGreater(holder, spot)

    def test_bare_mounting_hole_is_the_one_in_the_gap_around_the_nfc_loop(self):
        # board_setup.py keeps the copper around the loop open between the loop's right edge and the Ethernet
        # cut-away, 2 mm above to 0.5 mm below the loop's centre. The screw that stands there must find no
        # copper under its head: on both sides of the gap it would close the copper into a shorted turn.
        hx, hy = geometry.NFC_GAP_HOLE
        ax, ay = geometry.ANT_C
        self.assertIn(geometry.NFC_GAP_HOLE, geometry.MOUNT_HOLES)
        self.assertTrue(ax + geometry.ANT_W / 2 - 1.0 < hx < geometry.NOTCH_X)
        self.assertTrue(ay - 2.0 - geometry.MOUNT_KEEPOUT_R < hy < ay + 0.5 + geometry.MOUNT_KEEPOUT_R)

    def test_stack_up_matches_the_layer_count(self):
        # one dielectric between every two copper layers, and a board of 1.6 mm (JLCPCB: +-10 %)
        layers = geometry.COPPER_LAYERS
        self.assertIn(layers, geometry.STACKUP)
        for count, (_name, dielectrics) in geometry.STACKUP.items():
            self.assertEqual(len(dielectrics), count - 1)
            total = (sum(d[1] for d in dielectrics) + 2 * geometry.COPPER_OUTER + (count - 2) * geometry.COPPER_INNER)
            self.assertAlmostEqual(total, 1.6, delta=0.16)

    def test_no_pour_within_2_mm_of_the_48_v_pad_of_the_barrier_capacitor(self):
        # C102 bridges the PoE barrier. Its 48 V pad is the right one (the part is turned by 180 degrees);
        # the pours of the other layers must end 2 mm from it, which only the keep-out can see to.
        import placement
        placed = {}
        placement.place(type('B', (), {'put': lambda self, ref, x, y, rot=0: placed.__setitem__(ref, (x, y, rot)),
                                       'row': lambda *a: None})())
        x, y, rot = placed['C102']
        self.assertEqual(rot, 180)
        (w, h), px = geometry.BARRIER_CAP_PAD, geometry.BARRIER_CAP_PAD_X
        pad = (x + px - w / 2, y - h / 2, x + px + w / 2, y + h / 2)
        x1, y1, x2, y2 = geometry.POE_PRIMARY[1]
        self.assertLessEqual(y1, pad[1] - 2.0)
        self.assertLessEqual(x1, pad[0] - 2.0)
        self.assertGreaterEqual(x2, geometry.BOARD_W)

    def test_room_for_the_plug(self):
        # plug with boot (30 mm) and the cable's bend into the wall (19 mm for a 5.5 mm cable)
        self.assertGreaterEqual(geometry.BOARD_H - geometry.NOTCH_Y, 49.0)


class FootprintLibraryTest(unittest.TestCase):
    """The project's footprints: what the converter delivered, after the repairs in make_lib.py."""

    FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kicad', 'lib', 'attractap.pretty')

    @staticmethod
    def pads(path):
        """[(x1, y1, x2, y2)] of the solder paste openings and [(x, y, radius)] of the plated holes."""
        from sexpr import find, first, loads
        paste, holes = [], []
        with open(path, encoding='utf-8') as file:
            tree = loads(file.read())
        for pad in find(tree, 'pad'):
            at, size = first(pad, 'at'), first(pad, 'size')
            x, y, w, h = float(at[1]), float(at[2]), float(size[1]), float(size[2])
            if len(at) > 3 and float(at[3]) % 180 == 90:
                w, h = h, w
            if any(str(v).endswith('.Paste') for v in first(pad, 'layers')[1:]):
                paste.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))
            if pad[2] == 'thru_hole':
                drill = [float(v) for v in first(pad, 'drill')[1:] if str(v).replace('.', '').isdigit()]
                holes.append((x, y, max(drill) / 2))
        return paste, holes

    def test_no_solder_paste_on_a_plated_hole(self):
        # Paste printed over a hole runs into it. The converted PN532 footprint had one opening over its
        # whole exposed pad and one more on each of the four thermal vias in it, on both sides of the board.
        found = []
        for file in sorted(os.listdir(self.FOLDER)):
            paste, holes = self.pads(os.path.join(self.FOLDER, file))
            for x, y, r in holes:
                for x1, y1, x2, y2 in paste:
                    if math.hypot(x - min(max(x, x1), x2), y - min(max(y, y1), y2)) < r:
                        found.append((file, x, y))
        self.assertEqual(found, [])

    def test_nfc_chip_has_paste_on_half_of_its_exposed_pad(self):
        paste, holes = self.pads(os.path.join(self.FOLDER, 'QFN-40_L6.0-W6.0-P0.50-BL-EP.kicad_mod'))
        self.assertEqual(len(holes), 4)
        windows = [p for p in paste if p[2] - p[0] > 1.0]        # the pins' openings are 0.28 mm wide
        covered = sum((x2 - x1) * (y2 - y1) for x1, y1, x2, y2 in windows) / 4.42 ** 2
        self.assertEqual(len(windows), 8)
        self.assertTrue(0.45 < covered < 0.75, covered)


class I2cBusTest(unittest.TestCase):
    """The address check must catch what happened on an earlier reader: two devices at 0x24."""

    values = {'U1': 'TCA9554PWR', 'U2': 'PN5321A3HN/C106', 'R1': '2.2k', 'U3': 'ESP32-P4NRW32X', 'U9': 'SHT40'}

    def bus(self, a0, a1, a2, extra=()):
        got = {('U1', '1'): a0, ('U1', '2'): a1, ('U1', '3'): a2, ('U1', '14'): 'BUS_SCL',
               ('U2', '27'): 'BUS_SCL', ('R1', '2'): 'BUS_SCL', ('U3', '5'): 'BUS_SCL'}
        got = {pin: net for pin, net in got.items() if net is not None}     # None: pin not connected
        got.update(extra)
        return check_netlist.i2c_buses(got, self.values)

    def test_distinct_addresses_pass(self):
        self.assertEqual(self.bus('GND', 'GND', 'GND'), 0)

    def test_address_clash_is_reported(self):
        self.assertEqual(self.bus('GND', 'GND', '+3V3'), 1)          # expander strapped to 0x24

    def test_floating_address_pin_is_reported(self):
        self.assertEqual(self.bus('GND', 'GND', None), 1)

    def test_unlisted_device_is_reported(self):
        self.assertEqual(self.bus('GND', 'GND', 'GND', {('U9', '1'): 'BUS_SCL'}), 1)


if __name__ == '__main__':
    unittest.main()
