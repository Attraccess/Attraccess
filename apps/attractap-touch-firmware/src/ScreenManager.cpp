#include "ScreenManager.h"
#include <Arduino.h>

ScreenManager::ScreenManager()
    : currentScreen(SCREEN_MAIN), stackTop(-1)
{
    // Initialize screen array to nulls
    for (int i = 0; i < 8; i++)
    {
        screens[i] = nullptr;
    }
}

ScreenManager::~ScreenManager()
{
    // Screens are owned by their respective UI classes
    // We just clear our references
    for (int i = 0; i < 8; i++)
    {
        screens[i] = nullptr;
    }
}

void ScreenManager::init()
{
    Serial.println("ScreenManager: Initializing...");
    currentScreen = SCREEN_MAIN;
    stackTop = -1;
    Serial.println("ScreenManager: Ready");
}

void ScreenManager::showScreen(ScreenType screen)
{
    if (screen >= 8 || screens[screen] == nullptr)
    {
        Serial.printf("ScreenManager: ERROR - Screen %s not registered\n", getScreenName(screen));
        return;
    }

    Serial.printf("ScreenManager: Switching from %s to %s\n",
                  getScreenName(currentScreen), getScreenName(screen));

    currentScreen = screen;
    lv_scr_load(screens[screen]);

    // Force display refresh to ensure clean transition
    lv_refr_now(NULL);

    Serial.printf("ScreenManager: Screen %s loaded (ptr: %p)\n",
                  getScreenName(screen), screens[screen]);
}

void ScreenManager::registerScreen(ScreenType type, lv_obj_t *screen)
{
    if (type >= 8)
    {
        Serial.printf("ScreenManager: ERROR - Invalid screen type %d\n", type);
        return;
    }

    screens[type] = screen;
    Serial.printf("ScreenManager: Registered %s screen (ptr: %p)\n",
                  getScreenName(type), screen);
}

void ScreenManager::unregisterScreen(ScreenType type)
{
    if (type >= 8)
        return;

    Serial.printf("ScreenManager: Unregistered %s screen\n", getScreenName(type));
    screens[type] = nullptr;
}

void ScreenManager::pushScreen(ScreenType screen)
{
    // Push current screen to stack before switching
    if (stackTop < MAX_STACK_SIZE - 1)
    {
        stackTop++;
        screenStack[stackTop] = currentScreen;
        Serial.printf("ScreenManager: Pushed %s to stack (depth: %d)\n",
                      getScreenName(currentScreen), stackTop + 1);
    }
    else
    {
        Serial.println("ScreenManager: WARNING - Navigation stack full");
    }

    showScreen(screen);
}

bool ScreenManager::popScreen()
{
    if (stackTop >= 0)
    {
        ScreenType previousScreen = screenStack[stackTop];
        stackTop--;

        Serial.printf("ScreenManager: Popping back to %s (depth: %d)\n",
                      getScreenName(previousScreen), stackTop + 1);

        showScreen(previousScreen);
        return true;
    }

    Serial.println("ScreenManager: No screens to pop from stack");
    return false;
}

void ScreenManager::clearStack()
{
    stackTop = -1;
    Serial.println("ScreenManager: Navigation stack cleared");
}

void ScreenManager::dumpScreenInfo()
{
    Serial.println("=== ScreenManager Debug Info ===");
    Serial.printf("Current screen: %s\n", getScreenName(currentScreen));
    Serial.printf("Stack depth: %d\n", stackTop + 1);

    Serial.println("Registered screens:");
    for (int i = 0; i < 8; i++)
    {
        if (screens[i] != nullptr)
        {
            Serial.printf("  %s: %p\n", getScreenName((ScreenType)i), screens[i]);
        }
    }

    if (stackTop >= 0)
    {
        Serial.println("Navigation stack:");
        for (int i = 0; i <= stackTop; i++)
        {
            Serial.printf("  [%d]: %s\n", i, getScreenName(screenStack[i]));
        }
    }
    Serial.println("===============================");
}

const char *ScreenManager::getScreenName(ScreenType type)
{
    switch (type)
    {
    case SCREEN_MAIN:
        return "Main";
    case SCREEN_SETTINGS_PIN:
        return "Settings PIN";
    case SCREEN_SETTINGS_LIST:
        return "Settings List";
    case SCREEN_SETTINGS_WIFI:
        return "Settings WiFi";
    case SCREEN_SETTINGS_SYSTEM:
        return "Settings System";
    case SCREEN_WIFI_SELECTION:
        return "WiFi Selection";
    case SCREEN_WIFI_CREDENTIALS:
        return "WiFi Credentials";
    default:
        return "Unknown";
    }
}