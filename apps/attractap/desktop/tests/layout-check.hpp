#pragma once

#include <lvgl.h>

#include "display/display.hpp"

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// Geometry check for a rendered screen. No visible label, button, field, bar, image or other
// widget may
// - intersect another one (other than its own container or content),
// - intersect the chrome on the top layer (drawer grabber, network badge, device footer),
// - leave the display, or
// - be cut off by a container that does not scroll (a wrapping label is also cut off when its
//   text is taller than the label; dot truncation is the intended way to shorten a label).
namespace LayoutCheck
{
    struct Item
    {
        lv_obj_t *object;
        lv_area_t box;     // what the widget paints, unclipped
        lv_area_t visible; // the part its ancestors and the display let through
        bool onScreen;     // false: scrolled out of view or cut away entirely
        std::string name;
    };

    inline bool contains(lv_obj_t *outer, lv_obj_t *inner)
    {
        for (; inner; inner = lv_obj_get_parent(inner))
            if (inner == outer) return true;
        return false;
    }

    inline bool intersects(const lv_area_t &a, const lv_area_t &b)
    {
        // One pixel of slack: boxes that merely touch are not overlapping.
        return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
    }

    inline bool inside(const lv_area_t &inner, const lv_area_t &outer)
    {
        return inner.x1 >= outer.x1 && inner.y1 >= outer.y1 && inner.x2 <= outer.x2 && inner.y2 <= outer.y2;
    }

    inline bool clipTo(lv_area_t &box, const lv_area_t &clip)
    {
        const lv_area_t result = {std::max(box.x1, clip.x1), std::max(box.y1, clip.y1),
                                  std::min(box.x2, clip.x2), std::min(box.y2, clip.y2)};
        if (result.x1 > result.x2 || result.y1 > result.y2) return false;
        box = result;
        return true;
    }

    inline std::string at(const lv_area_t &box)
    {
        return " [" + std::to_string(box.x1) + "," + std::to_string(box.y1) + " to " + std::to_string(box.x2) + "," + std::to_string(box.y2) + "]";
    }

    inline bool singleLine(lv_label_long_mode_t mode)
    {
        // LVGL 9.3 expands these to one line; WRAP and DOTS wrap at the label's width.
        return mode == LV_LABEL_LONG_MODE_SCROLL || mode == LV_LABEL_LONG_MODE_SCROLL_CIRCULAR || mode == LV_LABEL_LONG_MODE_CLIP;
    }

    struct TextBox
    {
        lv_area_t box;
        bool overflows; // a wrapping label whose text is taller than the label: the rest is cut off
    };

    // Area the text of a label really paints, not its (often full-width) box.
    inline TextBox textBox(lv_obj_t *label)
    {
        lv_area_t box;
        lv_obj_get_coords(label, &box);
        // The text lives in the padded content area.
        box.x1 += lv_obj_get_style_pad_left(label, LV_PART_MAIN);
        box.x2 -= lv_obj_get_style_pad_right(label, LV_PART_MAIN);
        box.y1 += lv_obj_get_style_pad_top(label, LV_PART_MAIN);
        box.y2 -= lv_obj_get_style_pad_bottom(label, LV_PART_MAIN);
        const char *text = lv_label_get_text(label);
        const lv_font_t *font = lv_obj_get_style_text_font(label, LV_PART_MAIN);
        const int32_t letter = lv_obj_get_style_text_letter_space(label, LV_PART_MAIN);
        const int32_t line = lv_obj_get_style_text_line_space(label, LV_PART_MAIN);
        const auto mode = lv_label_get_long_mode(label);
        const int32_t boxWidth = lv_area_get_width(&box);
        const int32_t boxHeight = lv_area_get_height(&box);
        lv_point_t size;
        // A dot-truncated label holds its shortened text, which is what it paints.
        lv_text_get_size(&size, text, font, letter, line, singleLine(mode) ? LV_COORD_MAX : boxWidth,
                         singleLine(mode) ? LV_TEXT_FLAG_EXPAND : LV_TEXT_FLAG_NONE);
        int32_t width = std::min<int32_t>(size.x, boxWidth);
        int32_t height = singleLine(mode) ? std::min<int32_t>(size.y, lv_font_get_line_height(font)) : size.y;
        const bool overflows = mode == LV_LABEL_LONG_MODE_WRAP && height > boxHeight + 1;
        height = std::min<int32_t>(height, boxHeight);
        lv_area_t out = box;
        switch (lv_obj_get_style_text_align(label, LV_PART_MAIN))
        {
        case LV_TEXT_ALIGN_CENTER: out.x1 = box.x1 + (boxWidth - width) / 2; break;
        case LV_TEXT_ALIGN_RIGHT: out.x1 = box.x2 - width + 1; break;
        default: break;
        }
        out.x2 = out.x1 + width - 1;
        out.y2 = out.y1 + height - 1;
        // The line box is taller than the ink (ascender and descender room): keep the rows the
        // glyphs of this text really cover, in the first and in the last line.
        const int32_t lineHeight = lv_font_get_line_height(font);
        const int32_t baseline = lineHeight - font->base_line;
        int32_t inkTop = lineHeight, inkBottom = -1;
        uint32_t index = 0;
        while (text[index])
        {
            const auto byte = static_cast<uint8_t>(text[index]);
            const uint32_t length = byte < 0x80 ? 1 : byte < 0xE0 ? 2 : byte < 0xF0 ? 3 : 4;
            uint32_t letter = length == 1 ? byte : byte & (0x7F >> length);
            uint32_t i = 1;
            for (; i < length && text[index + i]; ++i) letter = (letter << 6) | (static_cast<uint8_t>(text[index + i]) & 0x3F);
            index += i;
            lv_font_glyph_dsc_t glyph{};
            if (!lv_font_get_glyph_dsc(font, &glyph, letter, 0) || glyph.box_h == 0) continue;
            inkTop = std::min<int32_t>(inkTop, baseline - glyph.box_h - glyph.ofs_y);
            inkBottom = std::max<int32_t>(inkBottom, baseline - glyph.ofs_y - 1);
        }
        if (inkBottom >= inkTop && height >= lineHeight)
        {
            const int32_t lastLine = out.y1 + height - lineHeight;
            out.y1 += std::max<int32_t>(inkTop, 0);
            out.y2 = std::min<int32_t>(out.y2, lastLine + inkBottom);
        }
        return {out, overflows};
    }

    // Area an image paints: its source, placed and scaled inside the widget like LVGL draws it.
    inline lv_area_t imageBox(lv_obj_t *image)
    {
        lv_area_t own;
        lv_obj_get_coords(image, &own);
        const lv_image_align_t align = lv_image_get_inner_align(image);
        const int32_t w = lv_image_get_src_width(image), h = lv_image_get_src_height(image);
        if (align > LV_IMAGE_ALIGN_AUTO_TRANSFORM || w <= 0 || h <= 0) return own;
        lv_area_t placed = {own.x1, own.y1, own.x1 + w - 1, own.y1 + h - 1};
        lv_area_align(&own, &placed, static_cast<lv_align_t>(align), lv_image_get_offset_x(image), lv_image_get_offset_y(image));
        lv_area_t painted = placed;
        // Transparent margins of an RGB565A8 asset paint nothing: keep only the inked rows and columns.
        const void *src = lv_image_get_src(image);
        if (lv_image_src_get_type(src) == LV_IMAGE_SRC_VARIABLE)
        {
            const auto *dsc = static_cast<const lv_image_dsc_t *>(src);
            if (dsc->header.cf == LV_COLOR_FORMAT_RGB565A8 && dsc->header.w == w && dsc->header.h == h)
            {
                const uint8_t *alpha = dsc->data + dsc->header.stride * h;
                int32_t x1 = w, y1 = h, x2 = -1, y2 = -1;
                for (int32_t y = 0; y < h; ++y)
                    for (int32_t x = 0; x < w; ++x)
                        if (alpha[y * (dsc->header.stride / 2) + x] > 24)
                            x1 = std::min(x1, x), x2 = std::max(x2, x), y1 = std::min(y1, y), y2 = std::max(y2, y);
                if (x2 >= x1) painted = {placed.x1 + x1, placed.y1 + y1, placed.x1 + x2, placed.y1 + y2};
            }
        }
        // Scaling happens around the pivot, which defaults to the centre of the image.
        const int32_t scale = lv_image_get_scale(image);
        if (scale != LV_SCALE_NONE)
        {
            const int32_t cx = (placed.x1 + placed.x2) / 2, cy = (placed.y1 + placed.y2) / 2;
            painted = {cx + (painted.x1 - cx) * scale / LV_SCALE_NONE, cy + (painted.y1 - cy) * scale / LV_SCALE_NONE,
                       cx + (painted.x2 - cx) * scale / LV_SCALE_NONE, cy + (painted.y2 - cy) * scale / LV_SCALE_NONE};
        }
        return painted;
    }

    inline std::string describe(lv_obj_t *object)
    {
        if (!lv_obj_get_parent(object)) return "the display";
        if (lv_obj_check_type(object, &lv_label_class)) return std::string("label '") + lv_label_get_text(object) + "'";
        if (lv_obj_check_type(object, &lv_button_class))
        {
            for (uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
                if (lv_obj_check_type(lv_obj_get_child(object, i), &lv_label_class))
                    return std::string("button '") + lv_label_get_text(lv_obj_get_child(object, i)) + "'";
            return "button";
        }
        if (lv_obj_check_type(object, &lv_textarea_class)) return "text field";
        if (lv_obj_check_type(object, &lv_keyboard_class)) return "keyboard";
        if (lv_obj_check_type(object, &lv_bar_class)) return "bar";
        if (lv_obj_check_type(object, &lv_image_class)) return "image";
        if (lv_obj_check_type(object, &lv_spinner_class)) return "spinner";
        if (lv_obj_check_type(object, &lv_switch_class)) return "switch";
        // A plain container: name it by its first caption.
        for (uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
            if (lv_obj_check_type(lv_obj_get_child(object, i), &lv_label_class))
                return std::string("widget '") + lv_label_get_text(lv_obj_get_child(object, i)) + "'";
        return "widget";
    }

    // Widgets with a box of their own. Plain objects count when someone listens to their taps
    // (field previews, the search field).
    inline bool isBoxWidget(lv_obj_t *object)
    {
        if (lv_obj_check_type(object, &lv_button_class) || lv_obj_check_type(object, &lv_textarea_class) ||
            lv_obj_check_type(object, &lv_keyboard_class) || lv_obj_check_type(object, &lv_bar_class) ||
            lv_obj_check_type(object, &lv_image_class) || lv_obj_check_type(object, &lv_spinner_class) ||
            lv_obj_check_type(object, &lv_switch_class) || lv_obj_check_type(object, &lv_checkbox_class) ||
            lv_obj_check_type(object, &lv_dropdown_class) || lv_obj_check_type(object, &lv_roller_class) ||
            lv_obj_check_type(object, &lv_slider_class))
            return true;
        // The pages of a tab view are content, not widgets.
        lv_obj_t *parent = lv_obj_get_parent(object);
        if (!parent || lv_obj_check_type(parent, &lv_tabview_class)) return false;
        return lv_obj_check_type(object, &lv_obj_class) &&
               lv_obj_has_flag(object, LV_OBJ_FLAG_CLICKABLE) && lv_obj_get_event_count(object) > 0;
    }

    // Walks up from `object`: the first ancestor that does not hold `box` either scrolls (the
    // rest is scrolled out of view, which is fine) or cuts the widget off.
    inline void place(Item &item, std::vector<std::string> &out)
    {
        item.visible = item.box;
        item.onScreen = true;
        bool settled = false;
        for (lv_obj_t *parent = lv_obj_get_parent(item.object); parent; parent = lv_obj_get_parent(parent))
        {
            lv_area_t area;
            lv_obj_get_coords(parent, &area);
            const bool root = !lv_obj_get_parent(parent);
            if (!root && lv_obj_has_flag(parent, LV_OBJ_FLAG_OVERFLOW_VISIBLE)) continue;
            if (!settled && !inside(item.box, area))
            {
                settled = true;
                if (root)
                    out.push_back(item.name + at(item.box) + " leaves the display");
                else if (!lv_obj_has_flag(parent, LV_OBJ_FLAG_SCROLLABLE))
                    out.push_back(item.name + at(item.box) + " is cut off by " + describe(parent) + at(area));
            }
            if (!clipTo(item.visible, area))
            {
                item.onScreen = false;
                return;
            }
        }
        const lv_area_t display = {0, 0, 479, 479};
        if (!clipTo(item.visible, display)) item.onScreen = false;
    }

    inline void collect(lv_obj_t *root, std::vector<Item> &items, std::vector<std::string> &out)
    {
        if (!root || lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN)) return;
        if (lv_obj_check_type(root, &lv_label_class))
        {
            if (!lv_label_get_text(root)[0]) return;
            const TextBox text = textBox(root);
            Item item{root, text.box, text.box, true, describe(root)};
            if (text.overflows) out.push_back(item.name + at(text.box) + " is cut off: its text is taller than the label");
            // Dots or a scrolling caption already shorten the text inside the label itself.
            place(item, out);
            if (item.onScreen) items.push_back(item);
            return;
        }
        if (isBoxWidget(root))
        {
            lv_area_t own;
            if (lv_obj_check_type(root, &lv_image_class))
                own = imageBox(root);
            else
                lv_obj_get_coords(root, &own);
            Item item{root, own, own, true, describe(root)};
            place(item, out);
            if (!item.onScreen) return;
            items.push_back(item);
            // A button in its error state wears a skin that covers its own caption.
            for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            {
                lv_obj_t *child = lv_obj_get_child(root, i);
                if (!lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) && lv_obj_has_flag(child, LV_OBJ_FLAG_FLOATING))
                {
                    collect(child, items, out);
                    return;
                }
            }
        }
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) collect(lv_obj_get_child(root, i), items, out);
    }

    // A visible full-size child that ignores the layout (the action overlay, a text editor) covers
    // the screen under it.
    inline lv_obj_t *effectiveRoot(lv_obj_t *screen)
    {
        lv_obj_t *root = screen;
        for (uint32_t i = 0; i < lv_obj_get_child_count(screen); ++i)
        {
            lv_obj_t *child = lv_obj_get_child(screen, i);
            if (!lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) && (lv_obj_has_flag(child, LV_OBJ_FLAG_FLOATING) || lv_obj_has_flag(child, LV_OBJ_FLAG_IGNORE_LAYOUT)) &&
                lv_obj_get_width(child) >= 400 && lv_obj_get_height(child) >= 400)
                root = child;
        }
        return root;
    }

    // Problems found on the active screen; empty when the layout is clean.
    inline std::vector<std::string> problems(lv_obj_t *screen = lv_screen_active())
    {
        lv_obj_update_layout(screen);
        lv_obj_update_layout(lv_layer_top());
        std::vector<std::string> out;
        std::vector<Item> items;
        lv_obj_t *root = effectiveRoot(screen);
        if (root == screen)
            collect(screen, items, out);
        else
            for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i) collect(lv_obj_get_child(root, i), items, out);
        // The chrome the firmware keeps on the top layer (the session summary hides it).
        for (const auto &part : Display::chromeParts())
        {
            if (!part.object || lv_obj_has_flag(part.object, LV_OBJ_FLAG_HIDDEN)) continue;
            lv_area_t box;
            lv_obj_get_coords(part.object, &box);
            for (const auto &item : items)
                if (intersects(item.visible, box)) out.push_back(item.name + at(item.visible) + " overlaps the " + part.name + at(box));
        }
        for (size_t a = 0; a < items.size(); ++a)
            for (size_t b = a + 1; b < items.size(); ++b)
            {
                if (contains(items[a].object, items[b].object) || contains(items[b].object, items[a].object)) continue;
                if (intersects(items[a].visible, items[b].visible))
                    out.push_back(items[a].name + at(items[a].visible) + " overlaps " + items[b].name + at(items[b].visible));
            }
        return out;
    }
}
