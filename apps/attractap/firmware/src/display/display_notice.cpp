#include "display.hpp"
#include "../platform.hpp"

// Screen-owned notices. The notice itself is a child of the active screen's
// root (shared/screenNotice.*); this file decides which screen that is.
//
// One rule decides what a transition does with the current notice: routing to
// the screen already shown keeps it. Otherwise it moves to the destination if
// it is still shown and was raised since the last application render pass (it
// explains the event behind this transition), or if it follows screens until
// it expires. Every other notice belonged to the screen being left.

namespace
{
    constexpr uint32_t TOUCH_WARNING_DURATION_MS = 8000;
}

void Display::presentNotice()
{
    lv_obj_t *root = Display::activeScreen ? Display::activeScreen->getScreen() : nullptr;
    if (!root)
    {
        // No screen yet: the first transition shows it.
        Display::noticeAwaitsScreen = true;
        return;
    }
    Display::noticeAwaitsScreen = false;

    uint32_t durationMs = 0; // the default for its kind
    if (Display::lastNotice.followsScreens)
    {
        const int32_t remaining = static_cast<int32_t>(Display::lastNotice.expiresAt - millis());
        if (remaining <= 0)
            return;
        durationMs = static_cast<uint32_t>(remaining);
    }
    Display::notice.show(root, Display::lastNotice.kind, Display::lastNotice.title, Display::lastNotice.message, durationMs);
}

void Display::routeNotice(bool sameScreen)
{
    if (sameScreen)
        return;
    const bool stillShown = Display::notice.visible();
    Display::notice.clear();
    if (Display::noticeAwaitsScreen ||
        (stillShown && (Display::noticeRaisedThisPass || Display::lastNotice.followsScreens)))
    {
        Display::presentNotice();
    }
}

void Display::showNotice(ScreenNotice::Kind kind, const FirmwareI18n::Text &title, const FirmwareI18n::Text &message)
{
    Display::lastNotice = PendingNotice{kind, title, message};
    Display::noticeRaisedThisPass = true;
    Display::presentNotice();
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

void Display::showTouchUnavailableNotice()
{
    // Touch may be what is missing, so it relies on the auto-hide rather than a tap.
    Display::lastNotice = PendingNotice{ScreenNotice::Kind::Error, FirmwareI18n::Message::TouchUnavailable,
                                        FirmwareI18n::Message::TouchPanelNotDetectedCheckHardwareAndReboot,
                                        true, millis() + TOUCH_WARNING_DURATION_MS};
    Display::noticeRaisedThisPass = true;
    Display::presentNotice();
}

void Display::clearNotice()
{
    Display::notice.clear();
    Display::lastNotice.followsScreens = false;
    Display::noticeRaisedThisPass = false;
    Display::noticeAwaitsScreen = false;
}

void Display::endNoticeRenderPass()
{
    Display::noticeRaisedThisPass = false;
}
