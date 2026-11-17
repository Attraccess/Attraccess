"""The HIL reset treats every signed-out idle screen as idle, including a reader with no resources."""

from pathlib import Path
import sys

import pytest

HIL = Path(__file__).parents[1] / "hil"
pytestmark = pytest.mark.skipif(not (HIL / "reader_reset.py").is_file(), reason="hil/ is not part of this package build")


class Hooks:
    """Stands in for ReaderTestHooks: shows ``screen`` with ``texts`` and records taps."""

    def __init__(self, screen, texts=()):
        self.screen = screen
        self.texts = list(texts)
        self.taps = []

    def widgets(self):
        return {"screen": self.screen, "widgets": [{"text": text} for text in self.texts]}

    def tap_text(self, text):
        self.taps.append(text)
        self.texts.remove(text)


@pytest.fixture
def reader_reset(monkeypatch):
    monkeypatch.syspath_prepend(str(HIL))
    import reader_reset

    yield reader_reset
    sys.modules.pop("reader_reset", None)


@pytest.mark.parametrize("screen", ["ResourceListScreen", "NoResourcesScreen"])
def test_signed_out_idle_screen_needs_no_cleanup(reader_reset, screen):
    hooks = Hooks(screen)

    assert reader_reset.leave_to_idle(hooks, timeout=0) == []
    assert hooks.taps == []


def test_signs_out_before_calling_the_reader_idle(reader_reset):
    hooks = Hooks("ResourceListScreen", ["Sign out"])

    assert reader_reset.leave_to_idle(hooks, timeout=5) == ["signed out on ResourceListScreen"]


def test_other_screens_are_not_idle(reader_reset):
    with pytest.raises(reader_reset.ReaderNotIdle, match="PendingApprovalScreen"):
        reader_reset.leave_to_idle(Hooks("PendingApprovalScreen"), timeout=0)
