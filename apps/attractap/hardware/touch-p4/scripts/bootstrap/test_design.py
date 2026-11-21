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


    def test_tamper_sensors(self):
        # hall switch: supply, output to the IO expander's P6 (pin 11), ground. Both versions have it.
        hall = self.d.parts['U703']
        self.assertEqual(hall.nets, {'1': '+3V3', '2': 'DOCK_N', '3': 'GND'})
        self.assertEqual(self.d.parts['U602'].nets['11'], 'DOCK_N')
        # accelerometer: on the touch bus, I2C mode (CS high), address pin pulled up
        acc = self.d.parts['U702']
        self.assertEqual((acc.nets['1'], acc.nets['4'], acc.nets['2']), ('I2C0_SCL', 'I2C0_SDA', '+3V3'))
        self.assertEqual({ref for ref, _pin in self.nets[acc.nets['3']]}, {'U702', 'R706'})
        self.assertEqual({hall.variant, acc.variant}, {''})


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

    def test_room_for_the_plug(self):
        # plug with boot (30 mm) and the cable's bend into the wall (19 mm for a 5.5 mm cable)
        self.assertGreaterEqual(geometry.BOARD_H - geometry.NOTCH_Y, 49.0)


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
