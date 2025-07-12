#include "WiFiPasswordDialog.h"

WiFiPasswordDialog::WiFiPasswordDialog()
    : dialog(nullptr),
      passwordNetworkLabel(nullptr),
      passwordTextArea(nullptr),
      passwordConnectButton(nullptr),
      passwordCancelButton(nullptr),
      visible(false),
      selectedNetworkSSID(""),
      keyboardManager(nullptr),
      onConnect(nullptr),
      onCancel(nullptr)
{
}

WiFiPasswordDialog::~WiFiPasswordDialog()
{
    if (dialog)
    {
        lv_obj_del(dialog);
        dialog = nullptr;
    }
}

void WiFiPasswordDialog::begin(KeyboardManager *keyboardMgr)
{
    keyboardManager = keyboardMgr;
    // UI will be created when first shown
}

void WiFiPasswordDialog::show(const String &ssid)
{
    // Create dialog if it doesn't exist
    if (!dialog)
    {
        createUI();
    }

    // Store the selected network
    selectedNetworkSSID = ssid;

    // Update network name in dialog
    if (passwordNetworkLabel)
    {
        lv_label_set_text(passwordNetworkLabel, ssid.c_str());
    }

    // Clear password field
    if (passwordTextArea)
    {
        lv_textarea_set_text(passwordTextArea, "");
    }

    // Show dialog
    lv_obj_clear_flag(dialog, LV_OBJ_FLAG_HIDDEN);
    visible = true;

    Serial.printf("WiFiPasswordDialog: Showing password dialog for network '%s'\n", ssid.c_str());
}

void WiFiPasswordDialog::hide()
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
        if (passwordTextArea)
        {
            lv_textarea_set_text(passwordTextArea, "");
        }
        selectedNetworkSSID = "";
    }

    Serial.println("WiFiPasswordDialog: Password dialog hidden");
}

void WiFiPasswordDialog::update()
{
    // No periodic updates needed for password dialog
}

void WiFiPasswordDialog::setConnectCallback(ConnectCallback callback)
{
    onConnect = callback;
}

void WiFiPasswordDialog::setCancelCallback(CancelCallback callback)
{
    onCancel = callback;
}

bool WiFiPasswordDialog::isVisible() const
{
    return visible;
}

void WiFiPasswordDialog::createUI()
{
    if (dialog)
        return;

    Serial.println("WiFiPasswordDialog: Creating WiFi password dialog");

    // Create modal dialog overlay
    dialog = lv_obj_create(lv_scr_act());
    lv_obj_set_size(dialog, 240, 320);
    lv_obj_set_pos(dialog, 0, 0);
    lv_obj_set_style_bg_color(dialog, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(dialog, LV_OPA_80, 0);
    lv_obj_clear_flag(dialog, LV_OBJ_FLAG_SCROLLABLE);

    // Dialog container - positioned higher to avoid keyboard overlap
    lv_obj_t *dialogContainer = lv_obj_create(dialog);
    lv_obj_set_size(dialogContainer, 200, 160);
    lv_obj_align(dialogContainer, LV_ALIGN_CENTER, 0, -40); // Move up 40px from center
    lv_obj_set_style_bg_color(dialogContainer, lv_color_hex(0x1A1A1A), 0);
    lv_obj_set_style_border_color(dialogContainer, lv_color_hex(0x555555), 0);
    lv_obj_set_style_border_width(dialogContainer, 1, 0);
    lv_obj_set_style_radius(dialogContainer, 10, 0);
    lv_obj_set_style_pad_all(dialogContainer, 15, 0);

    // Title
    lv_obj_t *titleLabel = lv_label_create(dialogContainer);
    lv_label_set_text(titleLabel, "Enter Password");
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(titleLabel, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(titleLabel, LV_ALIGN_TOP_MID, 0, 0);

    // Network name label
    passwordNetworkLabel = lv_label_create(dialogContainer);
    lv_label_set_text(passwordNetworkLabel, "Network Name");
    lv_obj_set_style_text_font(passwordNetworkLabel, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(passwordNetworkLabel, lv_color_hex(0x00AAFF), 0);
    lv_obj_set_style_text_align(passwordNetworkLabel, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_width(passwordNetworkLabel, 170);
    lv_obj_align(passwordNetworkLabel, LV_ALIGN_TOP_MID, 0, 25);

    // Password input
    passwordTextArea = lv_textarea_create(dialogContainer);
    lv_textarea_set_placeholder_text(passwordTextArea, "WiFi Password");
    lv_textarea_set_password_mode(passwordTextArea, true);
    lv_textarea_set_one_line(passwordTextArea, true);
    lv_obj_set_size(passwordTextArea, 170, 35);
    lv_obj_align(passwordTextArea, LV_ALIGN_TOP_MID, 0, 50); // Adjusted for smaller dialog
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
    passwordCancelButton = lv_btn_create(buttonContainer);
    lv_obj_set_size(passwordCancelButton, 75, 30);
    lv_obj_set_style_bg_color(passwordCancelButton, lv_color_hex(0x666666), 0);
    lv_obj_set_style_bg_color(passwordCancelButton, lv_color_hex(0x777777), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(passwordCancelButton, 0, 0);
    lv_obj_set_style_radius(passwordCancelButton, 6, 0);
    lv_obj_add_event_cb(passwordCancelButton, onPasswordCancelClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *cancelLabel = lv_label_create(passwordCancelButton);
    lv_label_set_text(cancelLabel, "Cancel");
    lv_obj_set_style_text_font(cancelLabel, &lv_font_montserrat_10, 0);
    lv_obj_center(cancelLabel);

    // Connect button
    passwordConnectButton = lv_btn_create(buttonContainer);
    lv_obj_set_size(passwordConnectButton, 75, 30);
    lv_obj_set_style_bg_color(passwordConnectButton, lv_color_hex(0x0066CC), 0);
    lv_obj_set_style_bg_color(passwordConnectButton, lv_color_hex(0x0088FF), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(passwordConnectButton, 0, 0);
    lv_obj_set_style_radius(passwordConnectButton, 6, 0);
    lv_obj_add_event_cb(passwordConnectButton, onPasswordConnectClicked, LV_EVENT_CLICKED, this);

    lv_obj_t *connectLabel = lv_label_create(passwordConnectButton);
    lv_label_set_text(connectLabel, "Connect");
    lv_obj_set_style_text_font(connectLabel, &lv_font_montserrat_10, 0);
    lv_obj_center(connectLabel);

    // Initially hidden
    lv_obj_add_flag(dialog, LV_OBJ_FLAG_HIDDEN);

    Serial.println("WiFiPasswordDialog: WiFi password dialog created");
}

// Event handlers
void WiFiPasswordDialog::onPasswordConnectClicked(lv_event_t *e)
{
    WiFiPasswordDialog *dialog = (WiFiPasswordDialog *)lv_event_get_user_data(e);
    if (dialog && dialog->passwordTextArea)
    {
        const char *password = lv_textarea_get_text(dialog->passwordTextArea);
        String passwordStr = String(password);

        if (passwordStr.length() == 0)
        {
            Serial.println("WiFiPasswordDialog: Password is empty");
            return;
        }

        Serial.printf("WiFiPasswordDialog: Connect button clicked for '%s'\n", dialog->selectedNetworkSSID.c_str());

        if (dialog->onConnect)
        {
            dialog->onConnect(dialog->selectedNetworkSSID, passwordStr);
        }

        // Hide dialog after connecting
        dialog->hide();
    }
}

void WiFiPasswordDialog::onPasswordCancelClicked(lv_event_t *e)
{
    WiFiPasswordDialog *dialog = (WiFiPasswordDialog *)lv_event_get_user_data(e);
    if (dialog)
    {
        Serial.println("WiFiPasswordDialog: Cancel button clicked");

        if (dialog->onCancel)
        {
            dialog->onCancel();
        }

        dialog->hide();
    }
}

void WiFiPasswordDialog::onPasswordTextAreaClicked(lv_event_t *e)
{
    WiFiPasswordDialog *dialog = (WiFiPasswordDialog *)lv_event_get_user_data(e);
    if (dialog && dialog->keyboardManager && dialog->passwordTextArea)
    {
        Serial.println("WiFiPasswordDialog: Password text area clicked - showing keyboard");
        dialog->keyboardManager->attachToTextArea(dialog->dialog, dialog->passwordTextArea);
        dialog->keyboardManager->show();
    }
}