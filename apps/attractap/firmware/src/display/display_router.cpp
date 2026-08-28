#include "display.hpp"
#include <functional>

#include <algorithm>
#include <utility>
#include "platform.hpp"

// Screen routing owns the complete transaction, including its deferred
// retirement. Display::loop only asks this router to advance it.

IScreen *Display::activeScreen = nullptr;
std::vector<IScreen *> Display::pendingDestroyScreens;
uint32_t Display::transitionStartTime = 0;
bool Display::transitionComplete = true;
std::function<void()> Display::onTransitionComplete = nullptr;

void Display::transitionToScreen(IScreen *screen)
{
    Display::transitionToScreen(screen, nullptr);
}

void Display::transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete)
{
    if (!screen)
    {
        // Rejecting a request does not replace an in-flight transaction. Its
        // supplied callback is discarded with the rejected request.
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
        // Initialization failures likewise leave the active transaction and
        // its callback untouched; this request never becomes a transition.
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
    if (previousScreen)
    {
        previousScreen->onScreenLeave();
    }

    Display::activeScreen = screen;

    lv_screen_load_anim(targetRoot, Display::TRANSITION_ANIMATION, Display::TRANSITION_DURATION, 0, false);
    Display::transitionStartTime = millis();
    Display::transitionComplete = false;

    // An accepted transition supersedes the previous unfinished transaction:
    // its callback is cancelled rather than being invoked for the wrong screen.
    Display::onTransitionComplete = onTransitionComplete;

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

void Display::advanceScreenRouter()
{
    if (Display::activeScreen)
    {
        Display::activeScreen->loop();
    }

    if (Display::transitionComplete ||
        millis() - Display::transitionStartTime < Display::TRANSITION_DURATION)
    {
        return;
    }

    Display::transitionComplete = true;

    // Retire before notifying clients, so a completion callback always observes
    // the finished transaction. Re-entered screens have already been dequeued;
    // the active-screen check remains the final safety invariant.
    for (IScreen *screen : Display::pendingDestroyScreens)
    {
        if (screen && screen != Display::activeScreen)
        {
            Display::logger.debugf("Destroying screen: %s", screen->getName().c_str());
            screen->destroy();
        }
    }
    Display::pendingDestroyScreens.clear();

    std::function<void()> completion = std::move(Display::onTransitionComplete);
    Display::onTransitionComplete = nullptr;
    if (completion)
    {
        completion();
    }
}
