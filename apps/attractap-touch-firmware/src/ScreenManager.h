#ifndef SCREEN_MANAGER_H
#define SCREEN_MANAGER_H

#include <lvgl.h>

class ScreenManager
{
public:
    enum ScreenType
    {
        SCREEN_MAIN,
        SCREEN_SETTINGS_PIN,
        SCREEN_SETTINGS_LIST,
        SCREEN_SETTINGS_WIFI,
        SCREEN_SETTINGS_SYSTEM,
        SCREEN_WIFI_SELECTION,
        SCREEN_WIFI_CREDENTIALS
    };

    ScreenManager();
    ~ScreenManager();

    void init();
    void showScreen(ScreenType screen);
    ScreenType getCurrentScreen() const { return currentScreen; }

    // Screen registration - UI classes register their screens
    void registerScreen(ScreenType type, lv_obj_t *screen);
    void unregisterScreen(ScreenType type);

    // Navigation stack for proper back button handling
    void pushScreen(ScreenType screen);
    bool popScreen(); // Returns true if there was a screen to pop
    void clearStack();

    // Debugging
    void dumpScreenInfo();

private:
    ScreenType currentScreen;
    lv_obj_t *screens[8]; // Array to hold registered screens

    // Navigation stack for back button handling
    static const int MAX_STACK_SIZE = 5;
    ScreenType screenStack[MAX_STACK_SIZE];
    int stackTop;

    const char *getScreenName(ScreenType type);
};

#endif // SCREEN_MANAGER_H