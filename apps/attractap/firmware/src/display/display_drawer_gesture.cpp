#include "display.hpp"
#include "display/theme.hpp"
#include <functional>
#include "shared/powerOff/powerOffButton.hpp"

namespace
{
constexpr int16_t DRAWER_EDGE_BAND_PX = 45;
constexpr int16_t DRAWER_OPEN_THRESHOLD_PX = 90;
}
void Display::handleGestureSample(int16_t x, int16_t y, bool pressed)
{
    (void)x;

#ifdef HAS_POWER_BUTTON
    // The power-off confirm modal also lives on the top layer, above the drawer.
    // This gesture is not LVGL hit-tested, so without this check a top-edge
    // swipe would open the drawer behind the modal, completely invisibly.
    if (PowerOffButton::isConfirmVisible())
    {
        Display::gesturePrevPressed = pressed;
        Display::gestureCandidate = false;
        return;
    }
#endif

    if (!pressed)
    {
        Display::gesturePrevPressed = false;
        Display::gestureCandidate = false;
        return;
    }

    if (!Display::gesturePrevPressed)
    {
        // Rising edge: a new touch just started. It only counts as a drawer
        // gesture if it began inside the top edge band and the drawer is closed.
        Display::gesturePrevPressed = true;
        Display::gestureStartY = y;
        Display::gestureCandidate = !Display::drawerOpen && (y <= DRAWER_EDGE_BAND_PX);
        return;
    }

    if (Display::gestureCandidate && !Display::drawerOpen &&
        ((int)y - (int)Display::gestureStartY) >= DRAWER_OPEN_THRESHOLD_PX)
    {
        Display::gestureCandidate = false;
        Display::openDrawer();
    }
}
