#pragma once

#include <cstring>
#include <cstdio>
#include <lvgl.h>

#include "state/language.hpp"
#include "state/state.hpp"

namespace FirmwareI18n
{
struct Entry { const char *de; const char *en; };
inline constexpr Entry catalog[] = {
        {"Wartung", "Maintenance"}, {"Einstellungen", "Settings"},
        {"Gerät neu starten?", "Reboot device?"}, {"Das Lesegerät wird jetzt neu gestartet.", "The reader will restart now."},
        {"Wartung", "Maintenance"}, {"Projekt auswählen", "Select project"},
        {"Projekt wählen", "Choose project"}, {"Zurück", "Back"}, {"Weiter", "Next"},
        {"Lade Projekte ...", "Loading projects ..."}, {"Lade...", "Loading..."},
        {"Keine Projekte verfügbar", "No projects available"}, {"Unbenanntes Projekt", "Untitled project"},
        {"Seite 1", "Page 1"}, {"Bitte Option wählen", "Please choose an option"},
        {"Keine Optionen verfügbar", "No options available"}, {"Ungültige Auswahl", "Invalid selection"},
        {"Laden...", "Loading..."}, {"Absenden", "Submit"}, {"Bitte Eingabe korrigieren.", "Please correct your input."},
        {"Eingabe ungültig.", "Invalid input."}, {"Bitte Formular ausfüllen", "Please complete the form"},
        {"Bitte vor dem Start ausfüllen", "Please complete before starting"},
        {"Bitte vor dem Ende ausfüllen", "Please complete before ending"},
        {"Bitte vor der Übernahme ausfüllen", "Please complete before taking over"},
        {"Bitte markierte Felder ausfüllen.", "Please complete the highlighted fields."},
        {"Pflichtfeld", "Required field"}, {"Antippen zum Eingeben", "Tap to enter"},
        {"Startzeit", "Start time"}, {"Nutzer", "User"}, {"Dauer", "Duration"},
        {"Ressource verwenden", "Use resource"},
        {"Achtung: Sie beenden die laufende Sitzung eines anderen Nutzers.", "Warning: You are ending another user's active session."},
        {"Sitzung beenden", "End session"}, {"Abschliessen", "Lock"}, {"Aufschliessen", "Unlock"},
        {"Falle öffnen", "Release latch"},
        {"Sie benötigen eine Einweisung, bevor Sie diese Ressource nutzen können. Bitte wenden Sie sich an einen der unten aufgeführten Einweiser.", "You need an introduction before using this resource. Please contact one of the introducers listed below."},
        {"Diese Ressource ist derzeit nicht betriebsbereit und kann nicht verwendet werden.", "This resource is currently unavailable and cannot be used."},
        {"Kein Grund angegeben.", "No reason provided."}, {"Aufsicht erforderlich", "Supervision required"},
        {"Abbrechen", "Cancel"}, {"Aufsichts-Karte auflegen", "Tap supervisor card"},
        {"Karte gelesen...\nbitte nicht bewegen", "Card read...\nplease keep it still"}, {"Freigegeben!", "Approved!"},
        {"Demo Einstellungen", "Demo settings"}, {"Karte hinzufügen", "Add card"},
        {"Noch keine Karten registriert.", "No cards registered yet."}, {"Löschen", "Delete"},
        {"Karte ans Lesegerät halten...", "Hold card to reader..."}, {"Karte zurücksetzen", "Reset card"},
        {"verbinde WLAN", "Connecting to Wi-Fi"}, {"verbinde Ethernet", "Connecting to Ethernet"},
        {"verbinde API", "Connecting to API"}, {"authentifiziere an API", "Authenticating with API"},
        {"API verbunden", "API connected"}, {"suche Zertifikat", "Searching for certificate"},
        {"Server: nicht konfiguriert", "Server: not configured"}, {"Abmelden", "Sign out"},
        {"Pausiert", "Paused"}, {"Geräte-PIN", "Device PIN"}, {"Gerät ausschalten?", "Power off device?"},
        {"Erfolgreich", "Success"},
        {"Keine Ressourcen mit diesem Lesegerät verknüpft, bitte konfigurieren Sie das Lesegerät in der Attraccess Administration", "No resources are linked to this reader. Configure it in Attraccess administration."},
        {"Unzureichendes Guthaben", "Insufficient balance"},
        {"Ihr Guthaben reicht nicht aus, um die Aktion auszuführen. Bitte laden Sie Ihr Guthaben auf.", "Your balance is too low for this action. Please top up your balance."},
        {"Betrag (EUR)", "Amount (EUR)"}, {"Aufladen", "Top up"},
        {"Bitte Betrag eingeben.", "Please enter an amount."}, {"Bitte gültigen Betrag eingeben.", "Please enter a valid amount."},
        {"Bitte am Zahlungsterminal fortfahren ...", "Please continue at the payment terminal ..."},
        {"NFC-Karte auflegen oder Ressource öffnen", "Tap NFC card or open a resource"},
        {"Einweisung fehlt", "Introduction required"}, {"Nicht betriebsbereit", "Unavailable"},
        {"Verfügbar", "Available"}, {"In Wartung", "Under maintenance"},
        {"Neue Karte registrieren", "Register new card"}, {"Karte wird beschrieben...\nbitte nicht bewegen", "Writing card...\nplease keep it still"},
        {"Karte registriert!", "Card registered!"}, {"Fehler", "Error"},
        {"Karte wird zurückgesetzt...\nbitte nicht bewegen", "Resetting card...\nplease keep it still"},
        {"Karte zurückgesetzt!", "Card reset!"}, {"Karte an den Leser halten", "Hold card to reader"},
        {"WLAN Netzwerk", "Wi-Fi network"}, {"Suche WLANs...", "Searching for Wi-Fi networks..."},
        {"Passwort*", "Password*"}, {"SSL verwenden", "Use SSL"},
        {"Selbst-Signierte Zertifikate werden (aktuell) nicht unterstützt. Eine Verbindung ohne SSL ist sehr unsicher und sollte vermieden werden.", "Self-signed certificates are not currently supported. A connection without SSL is very insecure and should be avoided."},
        {"Diese Ressource ist wegen Wartungsarbeiten nicht verfügbar. Wartungsarbeiten dürfen nur von den unten aufgeführten Personen durchgeführt werden.", "This resource is unavailable during maintenance. Only the people listed below may perform maintenance."},
        {"Zertifikat zurücksetzen", "Reset certificate"}, {"Geräte PIN*", "Device PIN*"},
        {"Speichern", "Save"}, {"Zurückgesetzt", "Reset"}, {"Karte zurücksetzen", "Reset card"},
        {"Karte mit NFC Karte/Tag anmelden", "Tap NFC card/tag to sign in"},
        {"Bitte mit NFC Karte/Tag anmelden", "Tap NFC card/tag to sign in"},
        {"In Verwendung: ", "In use: "}, {"Von dir verwendet", "In use by you"},
        {"Wartung", "Maintenance"}, {"Gesperrt", "Unavailable"}, {"Belegt", "In use"},
        {"Öffnen", "Open"}, {"Übernehmen", "Take over"}, {"Einweisung", "Introduction"},
        {"Kein Benutzer ausgewählt", "No user selected"}, {"Nutzer abmelden", "Sign out"},
        {"Bitte warten", "Please wait"}, {"Karte wird geprüft", "Checking card"},
        {"Karte registrieren", "Register card"}, {"Karte ans Lesegerät halten...", "Hold card to reader..."},
        {"Demo Einstellungen", "Demo settings"}, {"Karte löschen?", "Delete card?"},
        {"Projekt: ", "Project: "}, {"Start", "Start"}, {"Stop", "Stop"},
        {"Fremde Sitzung beenden", "End other user's session"},
        {"Ressource links: Details · Aktion rechts", "Resource on the left: details · action on the right"},
        {"Ausschalten", "Power off"}, {"Neustart", "Reboot"},
        {"Berührung nicht verfügbar", "Touch unavailable"},
        {"Das Touch-Panel wurde nicht erkannt.\nBitte Hardware prüfen und neu starten.", "Touch panel not detected.\nCheck hardware and reboot."},
        {"Anmeldung fehlgeschlagen", "Sign-in failed"},
        {"Bitte eine gültige NFC-Karte auflegen.", "Please tap a valid NFC card."},
        {"Bitte NFC-Karte erneut auflegen.", "Please tap the NFC card again."},
        {"Aktion nicht bestätigt", "Action not confirmed"},
        {"Der Ressourcenstatus wird neu geladen. Bitte vor einem erneuten Versuch prüfen.", "Resource status is being refreshed. Check it before trying again."},
        {"Status nicht verfügbar", "Status unavailable"},
        {"Bitte erneut anmelden, um den aktuellen Ressourcenstatus zu laden.", "Sign in again to load the current resource status."},
        {"Aktion fehlgeschlagen", "Action failed"}, {"Bitte erneut versuchen.", "Please try again."},
        {"Attraccess API URL", "Attraccess API URL"}, {"Beeper", "Beeper"},
        {"NFC-Karte auflegen oder Ressource öffnen", "Tap NFC card or open a resource"},
        {"Aufsichts-Karte auflegen oder per\nApp/Web bestätigen", "Tap supervisor card or approve in the\napp/web interface"},
        {"Karte nicht als Aufsicht\nberechtigt", "Card is not authorized as a\nsupervisor"},
        {"Keine Aufsicht verfügbar", "No supervisor available"},
        {"Aufsicht abgelehnt", "Supervision denied"},
        {"Karte konnte nicht\ngelesen werden", "Could not\nread card"},
        {"Karte konnte nicht\nvorbereitet werden", "Could not\nprepare card"},
        {"Karte konnte nicht\ngeschrieben werden", "Could not\nwrite card"},
        {"Karte konnte nicht\nzurückgesetzt werden", "Could not\nreset card"},
        {"Entsperren mit PIN", "Unlock with PIN"},
        {"WLAN Netzwerk", "Wi-Fi network"},
        {"Keine Netzwerke gefunden", "No networks found"},
        {"WLAN Scan fehlgeschlagen", "Wi-Fi scan failed"},
        {"Passwort", "Password"}, {"Geräte PIN", "Device PIN"},
        {"Nutzung wird gestartet", "Starting usage"}, {"Nutzung wird beendet", "Ending usage"},
        {"Sperre Tür", "Locking door"}, {"Entsperre Tür", "Unlocking door"},
        {"Öffne Tür-Riegel", "Releasing door latch"}, {"Aktion Ausführen", "Running action"},
        {"Übernehme Sitzung", "Taking over session"}, {"Starte Sitzung", "Starting session"},
        {"Nutzung gestartet", "Usage started"}, {"Nutzung beendet", "Usage ended"},
        {"Aktion bestätigt", "Action confirmed"}, {"Sende Formular", "Submitting form"},
        {"Status wird geladen", "Loading status"},
        {"Speichern", "Save"}, {"Neustart", "Reboot"}, {"Einstellungen", "Settings"},
        {"Keine Ressourcen verfügbar", "No resources available"},
        {"In Wartung", "Under maintenance"}, {"Nicht betriebsbereit", "Unavailable"},
        {"Wartung", "Maintenance"}, {"Gesperrt", "Unavailable"}, {"Belegt", "In use"},
        {"Einweisung", "Introduction"}, {"Aufsicht", "Supervision"}, {"Übernehmen", "Take over"},
        {"Laden ...", "Loading ..."}, {"Status: ", "Status: "},
        {"verbinde WLAN", "Connecting to Wi-Fi"}, {"verbinde Ethernet", "Connecting to Ethernet"},
        {"verbinde API", "Connecting to API"}, {"API verbunden", "API connected"},
        {"authentifiziere an API", "Authenticating with API"}, {"suche Zertifikat", "Searching for certificate"},
        {"Server: nicht konfiguriert", "Server: not configured"},
        {"Bitte warten", "Please wait"}, {"Erfolgreich", "Success"}, {"Fehler", "Error"},
        {"Löschen", "Delete"}, {"Karte hinzufügen", "Add card"},
        {"Karte ans Lesegerät halten...", "Hold card to reader..."},
        {"Softwareaktualiesierung", "Software update"}, {"Einstellungen öffnen", "Open settings"},
        {"Zur Verbindung mit dem Server konfigurieren Sie die Netzwerkeinstellungen.", "Configure network settings to connect to the server."},
        {"Aufsicht", "Supervision"}, {"Laden ...", "Loading ..."},
        {"Seite %u von %u", "Page %u of %u"},
        {"bsp.: deine-domain.de oder 192.168.1.100:3000", "e.g. your-domain.com or 192.168.1.100:3000"},
        {"Mind. 4 Ziffern", "At least 4 digits"}, {"Gerät", "Device"}, {"WLAN", "Wi-Fi"},
        {"Kein Zugang", "No access"}, {"Eingewiesen", "Introduced"},
        {"Keine Netzwerke gefunden", "No networks found"}, {"WLAN Scan fehlgeschlagen", "Wi-Fi scan failed"},
        {"bsp.: deine-domain.de oder 192.168.1.100:3000", "e.g. your-domain.com or 192.168.1.100:3000"},
        {"SSID*", "SSID*"}, {"SSID", "SSID"}, {"Password", "Password"},
};

// Shared catalog for labels used by display screens, setup, dialogs and the
// demo UI. Unknown/dynamic values are passed through because they may be names,
// resource data or values supplied by the server rather than translatable UI.
inline const char *translateForLocale(const char *value, const std::string &locale);
inline const char *translate(const char *value)
{
    if (!value) return value;
    return translateForLocale(value, State::getActiveLanguage());
}

inline const char *translateForLocale(const char *value, const std::string &locale)
{
    if (!value) return value;
    const bool english = Language::supported(locale) == "en";
    for (const auto &entry : catalog)
    {
        if (english && std::strcmp(value, entry.de) == 0) return entry.en;
        if (!english && std::strcmp(value, entry.en) == 0) return entry.de;
    }
    // The displayed value contains numbers/IDs, so it cannot be an exact
    // catalog key. Translate the fixed UI prefix while preserving its data.
    constexpr size_t germanRolePrefixLength = sizeof("Rolle für Karte ") - 1;
    constexpr size_t englishRolePrefixLength = sizeof("Role for card ") - 1;
    const bool germanRoleTitle = std::strncmp(value, "Rolle für Karte ", germanRolePrefixLength) == 0;
    const bool englishRoleTitle = std::strncmp(value, "Role for card ", englishRolePrefixLength) == 0;
    if (germanRoleTitle || englishRoleTitle)
    {
        static char roleTitle[80];
        const bool english = Language::supported(locale) == "en";
        snprintf(roleTitle, sizeof(roleTitle), "%s%s", english ? "Role for card " : "Rolle für Karte ",
                 value + (englishRoleTitle ? englishRolePrefixLength : germanRolePrefixLength));
        return roleTitle;
    }
    unsigned currentPage = 0, totalPages = 0;
    if (std::sscanf(value, "Seite %u von %u", &currentPage, &totalPages) == 2 ||
        std::sscanf(value, "Page %u of %u", &currentPage, &totalPages) == 2)
    {
        static char pageText[40];
        snprintf(pageText, sizeof(pageText), Language::supported(locale) == "en" ? "Page %u of %u" : "Seite %u von %u",
                 currentPage, totalPages);
        return pageText;
    }
    return value;
}

inline void refreshTree(lv_obj_t *root, const std::string &locale)
{
    if (!root) return;
    if (lv_obj_check_type(root, &lv_label_class))
    {
        const char *current = lv_label_get_text(root);
        const char *translated = translateForLocale(current, locale);
        if (translated != current) lv_label_set_text(root, translated);
    }
    else if (lv_obj_check_type(root, &lv_textarea_class))
    {
        const char *current = lv_textarea_get_placeholder_text(root);
        const char *translated = translateForLocale(current, locale);
        if (translated != current) lv_textarea_set_placeholder_text(root, translated);
    }
    else if (lv_obj_check_type(root, &lv_dropdown_class))
    {
        const char *current = lv_dropdown_get_options(root);
        if (current && std::strchr(current, '\n') == nullptr)
        {
            const char *translated = translateForLocale(current, locale);
            if (translated != current) lv_dropdown_set_options(root, translated);
        }
    }
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        refreshTree(lv_obj_get_child(root, i), locale);
}

inline void setLabel(lv_obj_t *label, const char *value)
{
    lv_label_set_text(label, translate(value));
}
}
