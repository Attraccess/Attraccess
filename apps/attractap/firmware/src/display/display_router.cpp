#include "display.hpp"

// Screen routing: transition between IScreen instances with a fade animation.
// Unloading of the previous screen is deferred until the transition completes
// (handled in Display::loop via pendingDestroyScreens).

void Display::transitionToScreen(IScreen *screen)
{
    Display::transitionToScreen(screen, nullptr);
}

void Display::transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete)
{
    if (!screen)
    {
        Display::logger.error("transitionToScreen called with null screen");
        return;
    }

    Display::logger.infof("Transitioning to screen: %s", screen->getName().c_str());

    if (!screen->isLoaded())
    {
        screen->init();
    }

    lv_obj_t *targetRoot = screen->getScreen();
    if (!targetRoot)
    {
        Display::logger.error("Screen failed to provide lvgl root; aborting transition");
        return;
    }

    IScreen *previousScreen = Display::activeScreen;
    if (Display::activeScreen)
    {
        Display::activeScreen->onScreenLeave();
    }

    Display::activeScreen = screen;

    lv_screen_load_anim(targetRoot, Display::TRANSITION_ANIMATION, Display::TRANSITION_DURATION, 0, false);
    Display::transitionStartTime = millis();
    Display::transitionComplete = false;

    if (onTransitionComplete)
    {
        Display::onTransitionComplete = onTransitionComplete;
    }
    else
    {
        Display::onTransitionComplete = nullptr;
    }

    if (previousScreen && previousScreen != screen && previousScreen->shouldAutoUnload())
    {
        Display::logger.debugf("Queued screen %s for unload", previousScreen->getName().c_str());
        Display::pendingDestroyScreens.push_back(previousScreen);
    }
}
