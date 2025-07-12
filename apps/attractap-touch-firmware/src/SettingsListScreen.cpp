#include "SettingsListScreen.h"

SettingsListScreen::SettingsListScreen()
    : screen(nullptr),
      header(nullptr),
      settingsList(nullptr),
      visible(false),
      onCategorySelected(nullptr),
      onBackToMain(nullptr),
      categoryCount(0)
{
}

SettingsListScreen::~SettingsListScreen()
{
    if (header)
    {
        delete header;
        header = nullptr;
    }

    if (screen)
    {
        lv_obj_del(screen);
        screen = nullptr;
    }
}

void SettingsListScreen::begin()
{
    // UI will be created when first shown
}

void SettingsListScreen::show()
{
    if (!screen)
    {
        createUI();
    }

    populateList();
    lv_scr_load(screen);
    visible = true;

    Serial.printf("SettingsListScreen: Settings list loaded with %d categories\n", categoryCount);
}

void SettingsListScreen::hide()
{
    visible = false;
}

void SettingsListScreen::update()
{
    // No periodic updates needed for settings list
}

void SettingsListScreen::setCategorySelectedCallback(CategorySelectedCallback callback)
{
    onCategorySelected = callback;
}

void SettingsListScreen::setBackToMainCallback(BackToMainCallback callback)
{
    onBackToMain = callback;
}

bool SettingsListScreen::isVisible() const
{
    return visible;
}

void SettingsListScreen::addCategory(const String &id, const String &title, const String &icon,
                                     const String &subtitle, lv_color_t iconColor)
{
    if (categoryCount < MAX_CATEGORIES)
    {
        categories[categoryCount].id = id;
        categories[categoryCount].title = title;
        categories[categoryCount].icon = icon;
        categories[categoryCount].subtitle = subtitle;
        categories[categoryCount].iconColor = iconColor;
        categoryCount++;

        Serial.printf("SettingsListScreen: Added category %s: %s\n", id.c_str(), title.c_str());
    }
}

void SettingsListScreen::clearCategories()
{
    categoryCount = 0;
}

void SettingsListScreen::createUI()
{
    if (screen)
        return;

    screen = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x0F0F0F), 0);

    // Create header using the component
    header = new SettingsHeader();
    header->create(screen, "Settings", [this]()
                   {
        if (onBackToMain) {
            onBackToMain();
        } });

    // Settings list
    settingsList = lv_list_create(screen);
    lv_obj_set_size(settingsList, 240, 255);                                          // Adjusted for header component height
    lv_obj_align(settingsList, LV_ALIGN_TOP_MID, 0, SettingsHeader::getHeight() + 5); // Position below header
    lv_obj_set_style_bg_color(settingsList, lv_color_hex(0x0F0F0F), 0);
    lv_obj_set_style_border_width(settingsList, 0, 0);
    lv_obj_set_style_radius(settingsList, 0, 0);
    lv_obj_set_style_pad_all(settingsList, 0, 0);
    lv_obj_set_scroll_dir(settingsList, LV_DIR_VER);
}

void SettingsListScreen::populateList()
{
    if (!settingsList)
        return;

    // Clear existing items
    lv_obj_clean(settingsList);

    // Add categories to the list
    for (int i = 0; i < categoryCount; i++)
    {
        String itemText = categories[i].icon + " " + categories[i].title + " " + LV_SYMBOL_RIGHT;
        lv_obj_t *item = lv_list_add_text(settingsList, itemText.c_str());
        lv_obj_set_style_text_font(item, &lv_font_montserrat_14, 0);
        lv_obj_set_style_text_align(item, LV_TEXT_ALIGN_LEFT, 0);
        lv_obj_set_style_text_color(item, lv_color_hex(0xFFFFFF), LV_STATE_DEFAULT);
        lv_obj_set_style_text_color(item, lv_color_hex(0xE0E0E0), LV_STATE_PRESSED);
        lv_obj_set_style_pad_all(item, 15, 0);
        lv_obj_set_style_pad_hor(item, 20, 0);
        lv_obj_set_style_bg_color(item, lv_color_hex(0x1A1A1A), LV_STATE_DEFAULT);
        lv_obj_set_style_bg_color(item, lv_color_hex(0x2A2A2A), LV_STATE_PRESSED);
        lv_obj_set_style_bg_color(item, lv_color_hex(0x252525), LV_STATE_FOCUS_KEY);
        lv_obj_set_style_bg_opa(item, LV_OPA_COVER, 0);
        lv_obj_set_style_radius(item, 8, 0);
        lv_obj_set_style_margin_bottom(item, 5, 0);
        lv_obj_set_style_border_width(item, 1, LV_STATE_FOCUS_KEY);
        lv_obj_set_style_border_color(item, lv_color_hex(0x0088FF), LV_STATE_FOCUS_KEY);

        // Make sure the item is clickable
        lv_obj_clear_flag(item, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(item, LV_OBJ_FLAG_CLICKABLE);

        // Store category index as user data and pass SettingsListScreen as event data
        lv_obj_set_user_data(item, (void *)(intptr_t)i);
        lv_obj_add_event_cb(item, onSettingsListItemClicked, LV_EVENT_CLICKED, this);

        Serial.printf("SettingsListScreen: Added category %d: %s\n", i, categories[i].title.c_str());
    }
}

// Event handlers
void SettingsListScreen::onSettingsListItemClicked(lv_event_t *e)
{
    SettingsListScreen *screen = (SettingsListScreen *)lv_event_get_user_data(e);
    lv_obj_t *item = (lv_obj_t *)lv_event_get_target(e);

    if (screen && item)
    {
        // Get the category index from the item's user data
        int categoryIndex = (int)(intptr_t)lv_obj_get_user_data(item);

        Serial.printf("SettingsListScreen: List item clicked, category index: %d\n", categoryIndex);

        if (categoryIndex >= 0 && categoryIndex < screen->categoryCount)
        {
            const String &categoryId = screen->categories[categoryIndex].id;

            Serial.printf("SettingsListScreen: Category selected: %s\n", categoryId.c_str());

            if (screen->onCategorySelected)
            {
                screen->onCategorySelected(categoryId);
            }
        }
        else
        {
            Serial.printf("SettingsListScreen: Invalid category index: %d\n", categoryIndex);
        }
    }
}
