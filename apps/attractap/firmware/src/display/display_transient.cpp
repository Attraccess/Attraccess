#include "display.hpp"

// Transient full-screen layouts (status, confirm, top-up, forms, project
// picker). They are ordinary routed screens that park the screen under them.

bool Display::isActive(const IScreen *screen)
{
    return Display::activeScreen == screen;
}

bool Display::transientActive()
{
    return Display::activeScreen && Display::activeScreen->parksOrigin();
}

bool Display::returnFromTransient()
{
    if (!Display::transientActive() || !Display::parkedOrigin)
    {
        return false;
    }
    Display::transitionToScreen(Display::parkedOrigin);
    return true;
}

void Display::showStatus(StatusScreen::Config config)
{
    if (!config.onDismiss)
    {
        config.onDismiss = [] { Display::returnFromTransient(); };
    }
    Display::statusScreen.configure(std::move(config));
    Display::transitionToScreen(&Display::statusScreen);
}

void Display::showConfirm(ConfirmScreen::Config config)
{
    if (!config.onCancel)
    {
        config.onCancel = [] { Display::returnFromTransient(); };
    }
    Display::confirmScreen.configure(std::move(config));
    Display::transitionToScreen(&Display::confirmScreen);
}
