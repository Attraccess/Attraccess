#include "display.hpp"

// Screen-owned notices. The notice itself is a child of the active screen's
// root (shared/screenNotice.*); this file decides which screen that is.

void Display::showNotice(ScreenNotice::Kind kind, const FirmwareI18n::Text &title, const FirmwareI18n::Text &message, uint32_t durationMs)
{
    Display::lastNotice = PendingNotice{kind, title, message, durationMs};
    Display::noticeRaisedThisTick = true;

    lv_obj_t *root = Display::activeScreen ? Display::activeScreen->getScreen() : nullptr;
    if (!root)
    {
        // No screen yet: the first transition shows it.
        Display::noticeAwaitsScreen = true;
        return;
    }
    Display::noticeAwaitsScreen = false;
    Display::notice.show(root, kind, title, message, durationMs);
}

void Display::showErrorNotice(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message)
{
    Display::showNotice(ScreenNotice::Kind::Error, title, message);
}

void Display::showBillingSummary(const std::string &total)
{
    Display::showNotice(ScreenNotice::Kind::Success, FirmwareI18n::Message::SessionTotal,
                        FirmwareI18n::Text::literal(total) /* i18n-data: Server-supplied formatted billing total; preserve exact amount and currency. */);
}

void Display::clearNotice()
{
    Display::notice.clear();
    Display::noticeRaisedThisTick = false;
    Display::noticeAwaitsScreen = false;
}
