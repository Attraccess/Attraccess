#include "display.hpp"
#include <functional>

#include <algorithm>
#include "platform.hpp"

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

    // The incoming screen is being (re)activated, so it must never be torn down
    // by the deferred-destroy queue. A previous transition may have queued it for
    // unload (e.g. InitScreen <-> Lockscreen churn during websocket reconnect);
    // if it stayed queued the later destroy would free the LVGL tree of the now
    // active screen, leaving widget pointers NULL -> lv_obj_get_screen(NULL)
    // assert -> loopTask hang -> task watchdog reboot. Dequeue it here.
    Display::pendingDestroyScreens.erase(
        std::remove(Display::pendingDestroyScreens.begin(),
                    Display::pendingDestroyScreens.end(), screen),
        Display::pendingDestroyScreens.end());

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
        bool alreadyQueued =
            std::find(Display::pendingDestroyScreens.begin(),
                      Display::pendingDestroyScreens.end(),
                      previousScreen) != Display::pendingDestroyScreens.end();
        if (!alreadyQueued)
        {
            Display::logger.debugf("Queued screen %s for unload", previousScreen->getName().c_str());
            Display::pendingDestroyScreens.push_back(previousScreen);
        }
    }
}
