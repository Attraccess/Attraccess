#pragma once

// Modal for host-owned plugin steps (confirm / choose / info) and the post-stop question. Built in the forms
// modal layout: title, body, optional countdown; header X cancels; footer Cancel (secondary, left) and the
// primary action (right). `choose` stacks up to 4 full-width buttons. Runs with lv_lock() held.

#include <lvgl.h>

#include <functional>
#include <string>

#include "ui_step.hpp"

namespace ui
{
    class StepModal
    {
    public:
        // action: "cancel", "confirm", "ok" or a choice id; isChoice marks a choice id.
        using ActionCallback = std::function<void(const std::string &stepId, const std::string &action, bool isChoice)>;

        void setActionCallback(ActionCallback cb) { callback_ = std::move(cb); }
        // The overlay goes on the top layer directly below `anchor` (the device footer), so the anchor stays visible
        // over the step while everything created above it (the drawer) stays above the step. Null: the very top.
        void placeBelow(lv_obj_t *anchor) { anchor_ = anchor; }
        void show(const StepRequest &step, uint32_t nowMillis);
        void hide();
        bool isOpen() const { return overlay_ != nullptr; }
        lv_obj_t *root() const { return overlay_; }
        const std::string &stepId() const { return stepId_; }

    private:
        struct Binding
        {
            StepModal *self;
            std::string action;
            bool isChoice;
        };
        static void onClicked(lv_event_t *e);
        lv_obj_t *addButton(lv_obj_t *parent, const char *action, bool isChoice, bool primary,
                            const std::string &label, int grow);

        lv_obj_t *overlay_ = nullptr;
        lv_obj_t *anchor_ = nullptr;
        std::string stepId_;
        ActionCallback callback_;
        Binding bindings_[8];
        size_t bindingCount_ = 0;
    };
}
