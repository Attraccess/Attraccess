"""Checks of the circuit description that need no KiCad. Run: python3 -I scripts/bootstrap/test_design.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import check_netlist  # noqa: E402
import design  # noqa: E402


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
