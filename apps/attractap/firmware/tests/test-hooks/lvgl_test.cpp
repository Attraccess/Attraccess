// Widget lookup and injected touches against real LVGL, the way the firmware
// wires them: the injector feeds the pointer indev's read callback.
#include "testhooks/touch_injector.hpp"
#include "testhooks/widget_finder.hpp"

#include <cstdio>
#include <string>
#include <vector>

#include <lvgl.h>

static int failures = 0;

#define CHECK(condition)                                                                  \
    do                                                                                    \
    {                                                                                     \
        if (!(condition))                                                                 \
        {                                                                                 \
            std::fprintf(stderr, "%s:%d: CHECK(%s)\n", __FILE__, __LINE__, #condition); \
            failures++;                                                                   \
        }                                                                                 \
    } while (0)

static uint32_t now = 0;
static TouchInjector injector;
static uint32_t realPanelReads = 0;

static uint32_t tick() { return now; }

static void flush(lv_display_t *display, const lv_area_t *, uint8_t *) { lv_display_flush_ready(display); }

static void touchRead(lv_indev_t *, lv_indev_data_t *data)
{
    TouchInjector::Sample sample;
    if (!injector.sample(now, sample))
    {
        realPanelReads++;
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }
    data->point.x = sample.x;
    data->point.y = sample.y;
    data->state = sample.pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

static void run(uint32_t ms)
{
    for (uint32_t end = now + ms; now < end; now += 5)
    {
        lv_timer_handler();
    }
}

static void runGesture()
{
    for (int i = 0; i < 4000 && injector.busy(); i++)
    {
        run(5);
    }
    CHECK(!injector.busy());
    run(50);
}

struct Counter
{
    int clicked = 0;
    int longPressed = 0;
};

static void countEvent(lv_event_t *event)
{
    auto *counter = static_cast<Counter *>(lv_event_get_user_data(event));
    if (lv_event_get_code(event) == LV_EVENT_CLICKED) counter->clicked++;
    if (lv_event_get_code(event) == LV_EVENT_LONG_PRESSED) counter->longPressed++;
}

static lv_obj_t *button(lv_obj_t *parent, const char *text, int32_t x, int32_t y, int32_t w, int32_t h, Counter *counter)
{
    lv_obj_t *btn = lv_button_create(parent);
    lv_obj_set_pos(btn, x, y);
    lv_obj_set_size(btn, w, h);
    lv_obj_t *label = lv_label_create(btn);
    lv_label_set_text(label, text);
    lv_obj_center(label);
    if (counter) lv_obj_add_event_cb(btn, countEvent, LV_EVENT_ALL, counter);
    return btn;
}

static const WidgetFinder::Widget *find(const std::vector<WidgetFinder::Widget> &widgets, const char *text,
                                        WidgetFinder::Match mode = WidgetFinder::Match::Exact, size_t index = 0)
{
    return WidgetFinder::find(widgets, text, mode, index);
}

static const WidgetFinder::Widget *anyWithText(const std::vector<WidgetFinder::Widget> &widgets, const char *text)
{
    for (const auto &widget : widgets)
    {
        if (WidgetFinder::matches(widget, text, WidgetFinder::Match::Exact)) return &widget;
    }
    return nullptr;
}

static void tapWidget(const WidgetFinder::Widget *widget)
{
    CHECK(widget && injector.tap(static_cast<int16_t>(widget->center.x), static_cast<int16_t>(widget->center.y), 60));
    runGesture();
}

int main()
{
    CHECK(WidgetFinder::normalize("  End\n  session ") == "End session");
    WidgetFinder::Match mode;
    CHECK(WidgetFinder::parseMatch(nullptr, mode) && mode == WidgetFinder::Match::Exact);
    CHECK(WidgetFinder::parseMatch("contains", mode) && mode == WidgetFinder::Match::Contains);
    CHECK(!WidgetFinder::parseMatch("regex", mode));

    lv_init();
    lv_tick_set_cb(tick);
    lv_display_t *display = lv_display_create(480, 480);
    static uint16_t buffer[480 * 40];
    lv_display_set_flush_cb(display, flush);
    lv_display_set_buffers(display, buffer, nullptr, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_indev_t *indev = lv_indev_create();
    lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(indev, touchRead);
    lv_timer_set_period(lv_indev_get_read_timer(indev), 10);

    lv_obj_t *screen = lv_obj_create(nullptr);
    lv_screen_load(screen);
    Counter start, endSession, card, info, ok;
    button(screen, "Start", 20, 20, 120, 50, &start);
    lv_obj_t *end = button(screen, "End", 160, 20, 160, 50, &endSession);
    lv_obj_align(lv_obj_get_child(end, 0), LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_t *second = lv_label_create(end);
    lv_label_set_text(second, "\nsession");
    lv_obj_align(second, LV_ALIGN_RIGHT_MID, 0, 0);
    Counter settings;
    button(screen, LV_SYMBOL_SETTINGS " Settings", 340, 400, 120, 40, &settings);
    lv_obj_add_flag(button(screen, "Ghost", 340, 20, 100, 50, &start), LV_OBJ_FLAG_HIDDEN);
    lv_obj_t *passive = lv_label_create(screen);
    lv_label_set_text(passive, "Title");
    lv_obj_set_pos(passive, 20, 75);

    // A clickable card: its own label is its text, the nested button is separate.
    lv_obj_t *cardObj = lv_obj_create(screen);
    lv_obj_set_pos(cardObj, 20, 90);
    lv_obj_set_size(cardObj, 200, 80);
    lv_obj_remove_flag(cardObj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_event_cb(cardObj, countEvent, LV_EVENT_ALL, &card);
    lv_obj_t *lathe = lv_label_create(cardObj);
    lv_label_set_text(lathe, "Lathe");
    lv_obj_align(lathe, LV_ALIGN_LEFT_MID, 0, 0);
    button(cardObj, "Info", 100, 0, 70, 40, &info);

    // A clickable pager: only the label on the visible page is its text.
    Counter pagerClicks;
    lv_obj_t *pager = lv_obj_create(screen);
    lv_obj_set_pos(pager, 340, 20);
    lv_obj_set_size(pager, 120, 50);
    lv_obj_add_event_cb(pager, countEvent, LV_EVENT_ALL, &pagerClicks);
    lv_obj_t *pageA = lv_label_create(pager);
    lv_label_set_text(pageA, "Page A");
    lv_obj_t *pageB = lv_label_create(pager);
    lv_label_set_text(pageB, "Page B");
    lv_obj_set_pos(pageB, 300, 0);

    // A scroll list taller than its viewport.
    lv_obj_t *list = lv_obj_create(screen);
    lv_obj_set_pos(list, 240, 90);
    lv_obj_set_size(list, 220, 140);
    lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
    std::vector<Counter> items(10);
    for (int i = 0; i < 10; i++)
    {
        std::string text = "Item " + std::to_string(i);
        lv_obj_t *item = button(list, text.c_str(), 0, 0, 180, 50, &items[i]);
        (void)item;
    }

    lv_obj_t *textarea = lv_textarea_create(screen);
    lv_obj_set_pos(textarea, 20, 180);
    lv_obj_set_size(textarea, 200, 50);
    lv_textarea_set_one_line(textarea, true);
    lv_textarea_set_placeholder_text(textarea, "PIN");
    lv_obj_t *keyboard = lv_keyboard_create(screen);
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_keyboard_set_textarea(keyboard, textarea);
    run(100);

    auto widgets = WidgetFinder::collect(display);
    const auto *startWidget = find(widgets, "Start");
    CHECK(startWidget && std::string(startWidget->type) == "lv_button" && startWidget->hittable);
    CHECK(startWidget && startWidget->area.x1 == 20 && startWidget->center.x == 79 && startWidget->center.y == 44);
    const auto *endWidget = find(widgets, "End session");
    CHECK(endWidget && endWidget->texts.size() == 2 && endWidget->text() == "End session");
    CHECK(find(widgets, "session")); // one of its labels
    CHECK(!find(widgets, "Sess") && find(widgets, "nd sess", WidgetFinder::Match::Contains));
    CHECK(!anyWithText(widgets, "Ghost"));
    // Under the keyboard, so not hittable; matching alone ignores the icon.
    CHECK(anyWithText(widgets, "Settings") && anyWithText(widgets, LV_SYMBOL_SETTINGS " Settings"));
    CHECK(!anyWithText(widgets, "Setting"));
    CHECK(find(widgets, "Page A") && find(widgets, "Page A")->text() == "Page A");
    CHECK(!anyWithText(widgets, "Title"));
    const auto *cardWidget = find(widgets, "Lathe");
    CHECK(cardWidget && cardWidget->obj == cardObj && cardWidget->texts.size() == 1);
    CHECK(find(widgets, "Info"));
    CHECK(find(widgets, "Item 0") && find(widgets, "Item 1"));
    CHECK(!anyWithText(widgets, "Item 9")); // scrolled out of the list viewport
    CHECK(find(widgets, "PIN") && std::string(find(widgets, "PIN")->type) == "lv_textarea");
    const auto *key = find(widgets, "7");
    CHECK(key && std::string(key->type) == "key" && key->key >= 0 && key->obj == keyboard);
    // Front to back: the keyboard (created last) precedes the Start button.
    CHECK(key && startWidget && key < startWidget);

    tapWidget(find(widgets, "Start"));
    CHECK(start.clicked == 1);
    CHECK(realPanelReads > 0);
    tapWidget(find(widgets, "Lathe"));
    CHECK(card.clicked == 1 && info.clicked == 0);
    tapWidget(find(widgets, "Info"));
    CHECK(info.clicked == 1 && card.clicked == 1);
    tapWidget(find(widgets, "7"));
    tapWidget(find(widgets, "1"));
    CHECK(std::string(lv_textarea_get_text(textarea)) == "71");

    CHECK(injector.press(79, 44, 1000));
    runGesture();
    CHECK(start.longPressed == 1);

    // Dragging the list scrolls it instead of clicking an item.
    int32_t before = lv_obj_get_scroll_y(list);
    CHECK(injector.swipe(350, 210, 350, 110, 400));
    runGesture();
    run(1000);
    CHECK(lv_obj_get_scroll_y(list) > before + 50);
    int clicks = 0;
    for (const Counter &item : items) clicks += item.clicked;
    CHECK(clicks == 0);
    widgets = WidgetFinder::collect(display);
    CHECK(!find(widgets, "Item 0") && find(widgets, "Item 3"));

    // A modal on the top layer covers the screen: only its button is hittable.
    lv_obj_t *modal = lv_obj_create(lv_layer_top());
    lv_obj_set_size(modal, 480, 480);
    lv_obj_add_event_cb(modal, countEvent, LV_EVENT_ALL, &ok);
    button(modal, "OK", 200, 200, 80, 50, &ok);
    run(50);
    widgets = WidgetFinder::collect(display);
    CHECK(widgets.size() > 0 && widgets.front().text() == "OK");
    const auto *covered = anyWithText(widgets, "Start");
    CHECK(covered && !covered->hittable);
    CHECK(!find(widgets, "Start"));
    int startClicks = start.clicked;
    tapWidget(find(widgets, "OK"));
    CHECK(ok.clicked == 1 && start.clicked == startClicks);
    lv_obj_delete(modal);

    if (failures)
    {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    std::puts("PASS: widget lookup and injected touches on real LVGL");
    return 0;
}
