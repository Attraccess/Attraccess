#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include <lvgl.h>

// Finds the touchable widgets currently on screen, for the ui.widgets.* test
// hooks. Callers hold lv_lock.
namespace WidgetFinder
{
    struct Widget
    {
        lv_obj_t *obj;
        // Keyboard/button-matrix key index, or -1 for a whole widget.
        int32_t key;
        const char *type;
        // Visible label texts inside the widget, whitespace-normalized. Labels
        // of nested touchable widgets belong to those widgets instead. Empty
        // text areas report their placeholder, dropdowns their selection.
        std::vector<std::string> texts;
        lv_area_t area;
        // Center of the part not clipped by parents or the display.
        lv_point_t center;
        // A touch at `center` reaches this widget (nothing covers it).
        bool hittable;
        bool disabled;
        bool checked;

        std::string text() const;
    };

    enum class Match
    {
        Exact,    // one label text or the joined text equals the query
        Contains, // the joined text contains the query
    };

    // Touchable, visible widgets front to back (the order LVGL hit-tests:
    // system layer, top layer, then the active screen; later children first).
    std::vector<Widget> collect(lv_display_t *display);

    std::string normalize(const char *text);
    bool parseMatch(const char *name, Match &out);
    bool matches(const Widget &widget, const std::string &query, Match mode);

    // The index-th hittable widget matching the query, or nullptr.
    const Widget *find(const std::vector<Widget> &widgets, const std::string &query, Match mode, size_t index);
}
