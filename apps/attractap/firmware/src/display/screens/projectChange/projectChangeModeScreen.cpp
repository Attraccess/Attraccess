#include "display/i18n.hpp"
#include "projectChangeModeScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/screenChrome.hpp"

namespace
{
    constexpr int32_t ChoiceHeight = 104;
    constexpr int32_t ChoiceTextWidth = ScreenChrome::ContentWidth - 32;

    // A sentence naming a project, or its wording for "no project".
    FirmwareI18n::Text effectText(FirmwareI18n::Message named, FirmwareI18n::Message unnamed, const std::string &project)
    {
        if (project.empty()) return unnamed;
        return FirmwareI18n::Text::format(named, {FirmwareI18n::Text::literal(project) /* i18n-data: Server-supplied project name; preserve exact contents. */});
    }
}

void ProjectChangeModeScreen::configure(Config next)
{
    config = std::move(next);
    if (screen) build();
}

void ProjectChangeModeScreen::init()
{
    if (screen) return;
    screen = ScreenChrome::createScreen();
    build();
}

void ProjectChangeModeScreen::createChoice(lv_obj_t *parent, FirmwareI18n::Message title, const FirmwareI18n::Text &effect,
                                           bool highlighted, lv_event_cb_t cb)
{
    lv_obj_t *button = lv_button_create(parent);
    if (highlighted) DisplayTheme::button(button, DisplayTheme::primary());
    else DisplayTheme::secondaryButton(button);
    lv_obj_set_size(button, ScreenChrome::ContentWidth, ChoiceHeight);
    lv_obj_set_flex_flow(button, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(button, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(button, 4, 0);
    lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, this);
    const lv_color_t color = lv_obj_get_style_text_color(button, LV_PART_MAIN);
    ResultLayout::createText(button, title, &attractap_font_montserrat_latin1_24, color, 1, ChoiceTextWidth);
    ResultLayout::createText(button, effect, &attractap_font_montserrat_latin1_16, color, 2, ChoiceTextWidth);
}

void ProjectChangeModeScreen::build()
{
    lv_obj_clean(screen);
    lv_obj_t *column = ResultLayout::createColumn(screen);
    lv_obj_set_style_pad_row(column, 12, 0);

    ResultLayout::createText(column, FirmwareI18n::Message::ChangeProject, &attractap_font_montserrat_latin1_28,
                             DisplayTheme::text(), 1);
    ResultLayout::createText(column, FirmwareI18n::Text::literal(config.resourceName) /* i18n-data: Server-supplied resource name; preserve exact contents. */,
                             &attractap_font_montserrat_latin1_18, DisplayTheme::muted(), 1);

    createChoice(column, FirmwareI18n::Message::WholeSession,
                 config.continuation
                     ? effectText(FirmwareI18n::Message::SinceLastChangeGoesTo,
                                  FirmwareI18n::Message::SinceLastChangeGoesToNoProject, config.newProjectName)
                     : effectText(FirmwareI18n::Message::EverythingGoesTo,
                                  FirmwareI18n::Message::EverythingGoesToNoProject, config.newProjectName),
                 true, &ProjectChangeModeScreen::onWholeSession);
    createChoice(column, FirmwareI18n::Message::FromNowOn,
                 effectText(FirmwareI18n::Message::TimeSoFarStaysOn, FirmwareI18n::Message::TimeSoFarStaysWithoutProject,
                            config.currentProjectName),
                 false, &ProjectChangeModeScreen::onFromNowOn);

    ResultLayout::createButton(column, FirmwareI18n::Message::Cancel, DisplayTheme::primary(), true,
                               &ProjectChangeModeScreen::onCancelClick, this);
    lv_obj_update_layout(screen);
}

void ProjectChangeModeScreen::choose(API::ProjectChangeMode mode)
{
    // A copy: the answer leaves the screen, which may be rebuilt while it runs.
    const auto callback = config.onChoose;
    if (callback) callback(mode);
}

void ProjectChangeModeScreen::onWholeSession(lv_event_t *e)
{
    static_cast<ProjectChangeModeScreen *>(lv_event_get_user_data(e))->choose(API::ProjectChangeMode::WHOLE_SESSION);
}

void ProjectChangeModeScreen::onFromNowOn(lv_event_t *e)
{
    static_cast<ProjectChangeModeScreen *>(lv_event_get_user_data(e))->choose(API::ProjectChangeMode::SPLIT);
}

void ProjectChangeModeScreen::onCancelClick(lv_event_t *e)
{
    const auto callback = static_cast<ProjectChangeModeScreen *>(lv_event_get_user_data(e))->config.onCancel;
    if (callback) callback();
}

void ProjectChangeModeScreen::loop() {}
lv_obj_t *ProjectChangeModeScreen::getScreen() { return screen; }
std::string ProjectChangeModeScreen::getName() { return "ProjectChangeModeScreen"; }
void ProjectChangeModeScreen::onScreenLeave() {}

void ProjectChangeModeScreen::destroy()
{
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
}
