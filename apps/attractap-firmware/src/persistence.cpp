#include "persistence.hpp"

PersistSettings<PersistenceData> Settings(PersistenceData::version);

void Persistence::setup()
{
    Settings.Begin();

    if (!Settings.Valid())
    {
        Serial.println("[Persistence] Settings are invalid, resetting to default.");
        Settings.ResetToDefault();
    }
    else
    {
        Serial.println("[Persistence] Settings loaded successfully.");
        Serial.print("[Persistence] API hostname: ");
        Serial.println(Settings.Config.api.hostname);
        Serial.print("[Persistence] API port: ");
        Serial.println(Settings.Config.api.port);
    }
}

PersistSettings<PersistenceData> Persistence::getSettings()
{
    return Settings;
}

void Persistence::saveSettings(PersistSettings<PersistenceData> settings)
{
    Serial.println("[Persistence] Saving settings to flash...");
    Settings = settings;
    Settings.Write();

    Serial.println("[Persistence] Settings saved to flash");
    Serial.print("[Persistence] API hostname: ");
    Serial.println(Settings.Config.api.hostname);
    Serial.print("[Persistence] API port: ");
    Serial.println(Settings.Config.api.port);
}

bool Persistence::isWiFiConfigured()
{
    return Settings.Config.wifi.configured;
}

void Persistence::saveWiFiCredentials(const char *ssid, const char *password)
{
    strncpy(Settings.Config.wifi.ssid, ssid, sizeof(Settings.Config.wifi.ssid) - 1);
    Settings.Config.wifi.ssid[sizeof(Settings.Config.wifi.ssid) - 1] = '\0';

    strncpy(Settings.Config.wifi.password, password, sizeof(Settings.Config.wifi.password) - 1);
    Settings.Config.wifi.password[sizeof(Settings.Config.wifi.password) - 1] = '\0';

    Settings.Config.wifi.configured = true;
    Settings.Write();
}

const char *Persistence::getWiFiSSID()
{
    return Settings.Config.wifi.ssid;
}

const char *Persistence::getWiFiPassword()
{
    return Settings.Config.wifi.password;
}

const char *Persistence::getAdminPassword()
{
    return Settings.Config.web.admin_password;
}

void Persistence::saveAdminPassword(const char *password)
{
    strncpy(Settings.Config.web.admin_password, password, sizeof(Settings.Config.web.admin_password) - 1);
    Settings.Config.web.admin_password[sizeof(Settings.Config.web.admin_password) - 1] = '\0';
    Settings.Write();
}
