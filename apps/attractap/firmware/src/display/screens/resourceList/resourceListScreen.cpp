#include "resourceListScreen.hpp"
#include "display/images/logo_40h.hpp"
#include "display/images/lockscreen_background_image.hpp"

namespace {
lv_obj_t *text(lv_obj_t *parent, const char *value, const lv_font_t *font, lv_color_t color) {
    auto *label = lv_label_create(parent);
    lv_label_set_text(label, value);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_style_text_color(label, color, 0);
    lv_obj_set_width(label, lv_pct(100));
    lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
    return label;
}
}

void ResourceListScreen::init() {
    if (screen) return;
    screen = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(screen);
    lv_obj_set_style_bg_image_src(screen, &lockscreen_background_image, 0);
    lv_obj_set_style_pad_all(screen, 20, 0);
    lv_obj_set_style_pad_row(screen, 16, 0);
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);
    logo = lv_image_create(screen);
    lv_image_set_src(logo, &logo_40h);
    lv_obj_set_size(logo, lv_pct(100), 46);
    loginContainer = sessionHeader.create(screen, [this] {
        if (!busy && logoutCallback) logoutCallback();
    });
    sessionHeader.setUser(username);
    resourceContainer = lv_obj_create(screen);
    lv_obj_remove_style_all(resourceContainer);
    lv_obj_set_size(resourceContainer, lv_pct(100), 0);
    lv_obj_set_flex_grow(resourceContainer, 1);
    lv_obj_set_flex_flow(resourceContainer, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(resourceContainer, 10, 0);
    lv_obj_set_scroll_dir(resourceContainer, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(resourceContainer, LV_SCROLLBAR_MODE_AUTO);
    footerShowsSuccess = false;
    footer = text(screen, "", &attractap_font_montserrat_latin1_14, DisplayTheme::muted());
    lv_obj_set_height(footer, 18);
    renderRows();
    if (busy) overlay.show(screen, actionTitle.c_str(), actionResource.c_str());
    loop();
}

void ResourceListScreen::setResourceList(const API::ResourceList &resources) {
    cachedResourceList = resources;
    renderRows();
}

void ResourceListScreen::setAuthenticatedUser(const std::string &value) {
    if (username == value) return;
    username = value;
    sessionHeader.setUser(username);
    successMessage.clear();
    renderRows();
    loop();
}

void ResourceListScreen::renderRows() {
    if (!screen) return;
    lv_obj_set_flag(logo, LV_OBJ_FLAG_HIDDEN, !username.empty());
    lv_obj_set_flag(loginContainer, LV_OBJ_FLAG_HIDDEN, username.empty());
    const auto scroll = lv_obj_get_scroll_y(resourceContainer);
    lv_obj_clean(resourceContainer);
    for (uint16_t i = 0; i < cachedResourceList.count; ++i) addResourceListItem(cachedResourceList.items[i]);
    lv_obj_update_layout(resourceContainer);
    lv_obj_scroll_to_y(resourceContainer, scroll, LV_ANIM_OFF);
}

void ResourceListScreen::addResourceListItem(const API::ResourceBrief &resource) {
    const bool signedIn = !username.empty();
    auto *row = lv_obj_create(resourceContainer);
    lv_obj_remove_style_all(row);
    lv_obj_set_size(row, lv_pct(100), 72);
    lv_obj_set_style_radius(row, DisplayTheme::Radius, 0);
    lv_obj_set_style_clip_corner(row, true, 0);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    auto makeButton = [&](bool action, lv_color_t color) {
        auto *button = lv_button_create(row);
        DisplayTheme::button(button, color, DisplayTheme::text());
        lv_obj_set_style_radius(button, 0, 0);
        lv_obj_set_style_pad_all(button, 12, 0);
        lv_obj_set_style_border_width(button, 0, 0);
        lv_obj_set_size(button, 0, lv_pct(100));
        lv_obj_set_flex_grow(button, 1);
        auto *data = new EventData{this, resource.id, action};
        lv_obj_add_event_cb(button, onClicked, LV_EVENT_CLICKED, data);
        lv_obj_add_event_cb(button, [](lv_event_t *event) {
            delete static_cast<EventData *>(lv_event_get_user_data(event));
        }, LV_EVENT_DELETE, data);
        return button;
    };
    auto *details = makeButton(false, DisplayTheme::surfaceSecondary());
    auto *name = text(details, resource.name, &attractap_font_montserrat_latin1_20, DisplayTheme::text());
    lv_obj_set_height(name, 26);
    lv_obj_align(name, LV_ALIGN_TOP_LEFT, 0, 0);
    std::string status = resource.description;
    if (resource.hasActiveUsage) status = signedIn && username == resource.activeUser ? "Von dir verwendet" : std::string("In Verwendung: ") + resource.activeUser;
    else if (resource.isUnderMaintenance) status = "Wartung";
    else if (!resource.isHealthy) status = "Nicht betriebsbereit";
    else if (signedIn && resource.accessKnown && !resource.hasIntroduction && !resource.requiresSupervisor && !resource.isIntroducer && !resource.canManageResource) status = "Einweisung fehlt";
    else if (status.empty()) status = "Verfügbar";
    auto *description = text(details, status.c_str(), &attractap_font_montserrat_latin1_14, DisplayTheme::muted());
    lv_obj_set_height(description, 18);
    lv_obj_align(description, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    if (!signedIn) {
        lv_obj_set_style_border_side(details, LV_BORDER_SIDE_RIGHT, 0);
        lv_obj_set_style_border_width(details, 20, 0);
        lv_obj_set_style_border_color(details, resource.hasActiveUsage ? DisplayTheme::danger() : resource.isUnderMaintenance || !resource.isHealthy ? DisplayTheme::warning() : DisplayTheme::success(), 0);
        return;
    }
    const bool accessMatches = username == cachedResourceList.authenticatedUsername;
    const auto action = accessMatches ? resourceListAction(resource, username) : ResourceListAction::None;
    const char *caption = "Einweisung";
    auto color = DisplayTheme::warning();
    switch (action) {
    case ResourceListAction::Start: caption = "Start"; color = DisplayTheme::success(); break;
    case ResourceListAction::Stop: caption = "Stop"; color = DisplayTheme::danger(); break;
    case ResourceListAction::OpenDoor: caption = "Öffnen"; color = DisplayTheme::primary(); break;
    case ResourceListAction::Supervision: caption = "Aufsicht"; break;
    case ResourceListAction::Takeover: caption = "Übernehmen"; break;
    default:
        if (!accessMatches || !resource.accessKnown) { caption = "Laden ..."; color = DisplayTheme::muted(); }
        else if (resource.hasActiveUsage) { caption = "Belegt"; color = DisplayTheme::muted(); }
        else if (resource.isUnderMaintenance || !resource.isHealthy) caption = "Gesperrt";
        break;
    }
    auto *primary = makeButton(true, color);
    auto *actionLabel = text(primary, caption, &attractap_font_montserrat_latin1_20, DisplayTheme::onPrimary());
    lv_obj_set_style_text_align(actionLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(actionLabel);
    if (action == ResourceListAction::None) {
        // This half explains availability; the adjacent details half remains usable.
        lv_obj_remove_flag(primary, LV_OBJ_FLAG_CLICKABLE);
    }
}

void ResourceListScreen::onClicked(lv_event_t *event) {
    auto *data = static_cast<EventData *>(lv_event_get_user_data(event));
    auto *self = data->self;
    if (self->busy) return;
    for (uint16_t i = 0; i < self->cachedResourceList.count; ++i) {
        const auto &resource = self->cachedResourceList.items[i];
        if (resource.id != data->id) continue;
        if (!data->action) {
            if (self->selectionCallback) self->selectionCallback(resource);
        } else if (self->username == self->cachedResourceList.authenticatedUsername) {
            const auto action = resourceListAction(resource, self->username);
            if (action != ResourceListAction::None && self->actionCallback) self->actionCallback(resource, action);
        }
        return;
    }
}

void ResourceListScreen::showActionProgress(const char *title, const char *resource) {
    busy = true;
    actionTitle = title ? title : "Bitte warten";
    actionResource = resource ? resource : "";
    overlay.show(screen, actionTitle.c_str(), actionResource.c_str());
}
void ResourceListScreen::hideActionProgress() { busy = false; overlay.hide(); }
void ResourceListScreen::showSuccessToast(const char *message) {
    successMessage = message ? message : "Erfolgreich";
    successUntil = millis() + 3000;
    loop();
}
void ResourceListScreen::loop() {
    sessionHeader.update();
    if (!footer) return;
    if (!successMessage.empty() && static_cast<int32_t>(successUntil - millis()) <= 0) successMessage.clear();
    setLabelTextIfChanged(footer, !successMessage.empty() ? successMessage.c_str() : username.empty() ? "NFC-Karte auflegen oder Ressource öffnen" : "Ressource links: Details · Aktion rechts");
    if (footerShowsSuccess != !successMessage.empty()) {
        footerShowsSuccess = !successMessage.empty();
        lv_obj_set_style_text_color(footer, footerShowsSuccess ? DisplayTheme::success() : DisplayTheme::muted(), 0);
    }
}
void ResourceListScreen::onScreenLeave() { overlay.hide(); }
void ResourceListScreen::destroy() {
    if (screen) lv_obj_delete(screen);
    screen = logo = loginContainer = resourceContainer = footer = nullptr;
    sessionHeader.detach();
    overlay.detach();
}
