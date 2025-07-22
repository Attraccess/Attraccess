#include "WiFiHiddenNetworkDialog.h"

WiFiHiddenNetworkDialog::WiFiHiddenNetworkDialog()
    : dialog(nullptr),
      ssidTextArea(nullptr),
      passwordTextArea(nullptr),
      connectButton(nullptr),
      cancelButton(nullptr),
      visible(false),
      currentTextArea(nullptr),
      keyboardManager(nullptr),
      onConnect(nullptr),
      onCancel(nullptr)
{
}

WiFiHiddenNetworkDialog::~WiFiHiddenNetworkDialog()
{
    if (dialog)
    {
        lv_obj_del(dialog);
        dialog = nullptr;
    }
}

void WiFiHiddenNetworkDialog::begin(KeyboardManager *keyboardMgr)
{
    keyboardManager = keyboardMgr;
    // UI will be created when first shown
}

void WiFiHiddenNetworkDialog::show()
{
    // Create dialog if it doesn't exist
    if (!dialog)
    {
        createUI();
    }

    // Clear input fields
    if (ssidTextArea)
    {
        lv_textarea_set_text(ssidTextArea, "");
    }
    if (passwordTextArea)
    {
        lv_textarea_set_text(passwordTextArea, "");
    }

    // Show dialog
    lv_obj_clear_flag(dialog, LV_OBJ_FLAG_HIDDEN);
    visible = true;

    Serial.println("WiFiHiddenNetworkDialog: Showing hidden network dialog");
}

void WiFiHiddenNetworkDialog::hide()
{
    if (dialog)
    {
        lv_obj_add_flag(dialog, LV_OBJ_FLAG_HIDDEN);
        visible = false;

        // Hide keyboard if it's showing
        if (keyboardManager)
        {
            keyboardManager->hide();
        }

        // Clear sensitive data
        if (ssidTextArea)
        {
            lv_textarea_set_text(ssidTextArea, "");
        }
        if (passwordTextArea)
        {
            lv_textarea_set_text(passwordTextArea, "");
        }
        currentTextArea = nullptr;
    }

    Serial.println("WiFiHiddenNetworkDialog: Hidden network dialog hidden");
}

void WiFiHiddenNetworkDialog::update()
{
    // No periodic updates needed for dialog
}

void WiFiHiddenNetworkDialog::setConnectCallback(ConnectCallback callback)
{
    onConnect = callback;
}

void WiFiHiddenNetworkDialog::setCancelCallback(CancelCallback callback)
{
    onCancel = callback;
}

bool WiFiHiddenNetworkDialog::isVisible() const
{
    return visible;
}

void WiFiHiddenNetworkDialog::createUI()
{
    if (dialog)
        return;

    Serial.println("WiFiHiddenNetworkDialog: Creating hidden network dialog");

    // Create modal dialog overlay
    dialog = lv_obj_create(lv_scr_act());
    lv_obj_set_size(dialog, 240, 320);
    lv_obj_set_pos(dialog, 0, 0);
    lv_obj_set_style_bg_color(dialog, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(dialog, LV_OPA_80, 0);
    lv_obj_clear_flag(dialog, LV_OBJ_FLAG_SCROLLABLE);

    // Dialog container - positioned higher to avoid keyboard overlap
    lv_obj_t *dialogContainer = lv_obj_create(dialog);
    lv_obj_set_size(dialogContainer, 200, 200);             // Taller for two input fields
    lv_obj_align(dialogContainer, LV_ALIGN_CENTER, 0, -40); // Move up 40px from center
    lv_obj_set_style_bg_color(dialogContainer, lv_color_hex(0x1A1A1A), 0);
    lv_obj_set_style_border_color(dialogContainer, lv_color_hex(0x555555), 0);
    lv_obj_set_style_border_width(dialogContainer, 1, 0);
    lv_obj_set_style_radius(dialogContainer, 10, 0);
    lv_obj_set_style_pad_all(dialogContainer, 15, 0);

    // Title
    lv_obj_t *titleLabel = lv_label_create(dialogContainer);
    lv_label_set_text(titleLabel, "Add Hidden Network");
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(titleLabel, LV_ALIGN_TOP_MID, 0, 0);

    // SSID label
    lv_obj_t *ssidLabel = lv_label_create(dialogContainer);
    lv_label_set_text(ssidLabel, "Network Name (SSID):");
    lv_obj_set_style_text_font(ssidLabel, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_color(ssidLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(ssidLabel, LV_ALIGN_TOP_LEFT, 0, 25);

    // SSID input
    ssidTextArea = lv_textarea_create(dialogContainer);
    lv_textarea_set_placeholder_text(ssidTextArea, "Enter network name");
    lv_textarea_set_one_line(ssidTextArea, true);
    lv_obj_set_size(ssidTextArea, 170, 35);
    lv_obj_align(ssidTextArea, LV_ALIGN_TOP_MID, 0, 45);
    lv_obj_set_style_text_font(ssidTextArea, &lv_font_montserrat_12, 0);
    lv_obj_set_style_bg_color(ssidTextArea, lv_color_hex(0x2A2A2A), 0);
    lv_obj_set_style_border_color(ssidTextArea, lv_color_hex(0x444444), 0);
    lv_obj_add_event_cb(ssidTextArea, onSSIDTextAreaClicked, LV_EVENT_CLICKED, this);

    // Password label
    lv_obj_t *passwordLabel = lv_label_create(dialogContainer);
    lv_label_set_text(passwordLabel, "Password (leave empty if open):");
    lv_obj_set_style_text_font(passwordLabel, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_color(passwordLabel, lv_color_hex(0xCCCCCC), 0);
    lv_obj_align(passwordLabel, LV_ALIGN_TOP_LEFT, 0, 85);

    // Password input
    passwordTextArea = lv_textarea_create(dialogContainer);
    lv_textarea_set_placeholder_text(passwordTextArea, "Enter password");
    lv_textarea_set_password_mode(passwordTextArea, true);
    lv_textarea_set_one_line(passwordTextArea, true);
    lv_obj_set_size(passwordTextArea, 170, 35);
    lv_obj_align(passwordTextArea, LV_ALIGN_TOP_MID, 0, 105);
    lv_obj_set_style_text_font(passwordTextArea, &lv_font_montserrat_12, 0);
    lv_obj_set_style_bg_color(passwordTextArea, lv_color_hex(0x2A2A2A), 0);
    lv_obj_set_style_border_color(passwordTextArea, lv_color_hex(0x444444), 0);
    lv_obj_add_event_cb(passwordTextArea, onPasswordTextAreaClicked, LV_EVENT_CLICKED, this);

    // Button container
    lv_obj_t *buttonContainer = lv_obj_create(dialogContainer);
    lv_obj_set_size(buttonContainer, 170, 35);
    lv_obj_align(buttonContainer, LV_ALIGN_BOTTOM_MID, 0, -5); // Small margin from bottom
    lv_obj_set_style_bg_opa(buttonContainer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(buttonContainer, 0, 0);
    lv_obj_set_style_pad_all(buttonContainer, 0, 0);
    lv_obj_set_flex_flow(buttonContainer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(buttonContainer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    // Cancel button
    cancelButton = lv_btn_create(buttonContainer);
    lv_obj_set_size(cancelButton, 75, 30);
    lv_obj_set_style_bg_color(cancelButton, lv_color_hex(0x666666), 0);
    lv_obj_set_style_bg_color(cancelButton, lv_color_hex(0x777777), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(cancelButton, 0, 0);
    lv_obj_set_style_radius(cancelButton, 6, 0);
    lv_obj_add_event_cb(cancelButton, onCancelClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *cancelLabel = lv_label_create(cancelButton);
    lv_label_set_text(cancelLabel, "Cancel");
    lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_10, 0);
    lv_obj_center(cancelLabel);

    // Connect button
    connectButton = lv_btn_create(buttonContainer);
    lv_obj_set_size(connectButton, 75, 30);
    lv_obj_set_style_bg_color(connectButton, lv_color_hex(0x0066CC), 0);
    lv_obj_set_style_bg_color(connectButton, lv_color_hex(0x0088FF), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(connectButton, 0, 0);
    lv_obj_set_style_radius(connectButton, 6, 0);
    lv_obj_add_event_cb(connectButton, onConnectClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *connectLabel = lv_label_create(connectButton);
    lv_label_set_text(connectLabel, "Connect");
    lv_obj_set_style_text_font(connectLabel, &lv_font_montserrat_10, 0);
    lv_obj_center(connectLabel);

    // Initially hidden
    lv_obj_add_flag(dialog, LV_OBJ_FLAG_HIDDEN);

    Serial.println("WiFiHiddenNetworkDialog: Hidden network dialog created");
}

// Event handlers
void WiFiHiddenNetworkDialog::onConnectClicked(lv_event_t *e)
{
    WiFiHiddenNetworkDialog *dialog = (WiFiHiddenNetworkDialog *)lv_event_get_user_data(e);
    if (dialog && dialog->ssidTextArea && dialog->passwordTextArea)
    {
        const char *ssid = lv_textarea_get_text(dialog->ssidTextArea);
        const char *password = lv_textarea_get_text(dialog->passwordTextArea);

        String ssidStr = String(ssid);
        String passwordStr = String(password);

        // Validate SSID is not empty
        if (ssidStr.length() == 0)
        {
            Serial.println("WiFiHiddenNetworkDialog: SSID is empty");
            return;
        }

        Serial.printf("WiFiHiddenNetworkDialog: Connect button clicked for hidden network '%s'\n", ssidStr.c_str());

        if (dialog->onConnect)
        {
            dialog->onConnect(ssidStr, passwordStr);
        }

        // Hide dialog after connecting
        dialog->hide();
    }
}

void WiFiHiddenNetworkDialog::onCancelClicked(lv_event_t *e)
{
    WiFiHiddenNetworkDialog *dialog = (WiFiHiddenNetworkDialog *)lv_event_get_user_data(e);
    if (dialog)
    {
        Serial.println("WiFiHiddenNetworkDialog: Cancel button clicked");

        if (dialog->onCancel)
        {
            dialog->onCancel();
        }

        dialog->hide();
    }
}

void WiFiHiddenNetworkDialog::onSSIDTextAreaClicked(lv_event_t *e)
{
    WiFiHiddenNetworkDialog *dialog = (WiFiHiddenNetworkDialog *)lv_event_get_user_data(e);
    if (dialog && dialog->keyboardManager && dialog->ssidTextArea)
    {
        Serial.println("WiFiHiddenNetworkDialog: SSID text area clicked - showing keyboard");
        dialog->currentTextArea = dialog->ssidTextArea;
        dialog->keyboardManager->attachToTextArea(dialog->dialog, dialog->ssidTextArea);
        dialog->keyboardManager->show();
    }
}

void WiFiHiddenNetworkDialog::onPasswordTextAreaClicked(lv_event_t *e)
{
    WiFiHiddenNetworkDialog *dialog = (WiFiHiddenNetworkDialog *)lv_event_get_user_data(e);
    if (dialog && dialog->keyboardManager && dialog->passwordTextArea)
    {
        Serial.println("WiFiHiddenNetworkDialog: Password text area clicked - showing keyboard");
        dialog->currentTextArea = dialog->passwordTextArea;
        dialog->keyboardManager->attachToTextArea(dialog->dialog, dialog->passwordTextArea);
        dialog->keyboardManager->show();
    }
}