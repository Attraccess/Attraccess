"""Checks of the circuit description that need no KiCad. Run: python3 -I scripts/bootstrap/test_design.py"""
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

    def test_unpowered_sources_have_a_bleed_resistor(self):
        for net in ('+5V_USB', '+5V_DC'):
            to_ground = [ref for ref, _pin in self.nets[net] if ref.startswith('R') and
                         'GND' in self.d.parts[ref].nets.values()]
            self.assertEqual(len(to_ground), 1, net)


class GeometryTest(unittest.TestCase):
    def test_no_jack_pin_behind_the_display(self):
        # The jack's through-hole pins stand out of the display side of the board; the display's metal
        # back lies flat on that side. The first pin row (6.49 mm behind the jack's origin, pads 1.5 mm)
        # must be below the lower edge of the cover lens.
        first_row = geometry.JACK_Y - 6.49
        self.assertGreater(first_row - 0.75, geometry.LENS[3])

    def test_jack_opens_into_the_cut_away(self):
        front = geometry.JACK_Y + 13.32
        self.assertGreaterEqual(front, geometry.NOTCH_Y)
        self.assertLess(front - geometry.NOTCH_Y, 0.5)


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
