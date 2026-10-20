import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_localization as audit


class LocalizationAuditTests(unittest.TestCase):
    def check(self, source):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "messages.catalog.hpp").write_text(
                'enum class Message { Greeting, Count };\n'
                '{Message::Greeting, "Hallo", "Hello"}\n'
            )
            (root / "screen.cpp").write_text(source)
            with patch.object(audit, "ROOT", root), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                return audit.main()

    def test_data_ownership_survives_variable_and_expression_refactors(self):
        for value in ["name", "readerName", "resource.name.c_str()"]:
            with self.subTest(value=value):
                self.assertFalse(self.check(
                    f"FirmwareI18n::setDynamicLabel(label, {value}) "
                    "/* i18n-data: Supplied reader or resource name. */;"
                ))

    def test_unexplained_data_write_fails(self):
        self.assertTrue(self.check("FirmwareI18n::setDynamicLabel(label, name);"))

    def test_nested_literal_arguments_each_need_ownership(self):
        self.assertFalse(self.check(
            'FirmwareI18n::Text::literal(name) /* i18n-data: Supplied name. */;'
        ))
        self.assertTrue(self.check(
            'FirmwareI18n::Text::format(Message::Greeting, {FirmwareI18n::Text::literal(name)});'
        ))

    def test_annotation_does_not_allow_raw_lvgl_write(self):
        self.assertTrue(self.check('lv_label_set_text(label, "Hello") /* i18n-data: Name. */;'))

    def test_unknown_message_fails(self):
        self.assertTrue(self.check("FirmwareI18n::setLabel(label, FirmwareI18n::Message::Unknown);"))


if __name__ == "__main__":
    unittest.main()
