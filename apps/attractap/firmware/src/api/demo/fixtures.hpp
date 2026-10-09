#pragma once
#include <string>
#include <ctime>

// ---------------------------------------------------------------------------
// Demo fixtures: fake projects + the CNC start form
// ---------------------------------------------------------------------------

namespace
{
    // A handful of fake projects to pick from in the project selector.
    constexpr uint32_t DEMO_PROJECT_COUNT = 6;
    constexpr uint32_t DEMO_PROJECT_PAGE_SIZE = 4;

    // Start form shown when a session on the CNC (resource id 1) begins.
    constexpr uint32_t CNC_RESOURCE_ID = 1;
    constexpr uint32_t CNC_FORM_ID = 10;

    struct CncField
    {
        uint32_t id;
        const char *name;
        const char *description;
        const char *type; // text | number | boolean | select
        bool required;
    };
    const CncField CNC_FIELDS_DE[] = {
        {101, "Material", "Werkstoff des Werkstücks", "select", true},
        {102, "Auftragsnummer", "Interne Auftrags-ID", "text", true},
        {103, "Geschätzte Laufzeit (Min)", "Optional", "number", false},
        {104, "Absaugung geprüft", "Späneabsaugung aktiv?", "boolean", true},
    };
    const CncField CNC_FIELDS_EN[] = {
        {101, "Material", "Workpiece material", "select", true},
        {102, "Job number", "Internal job ID", "text", true},
        {103, "Estimated runtime (min)", "Estimated runtime", "number", false},
        {104, "Extraction checked", "Is chip extraction active?", "boolean", true},
    };
    constexpr uint32_t CNC_FIELD_COUNT = sizeof(CNC_FIELDS_DE) / sizeof(CNC_FIELDS_DE[0]);
    const char *const CNC_MATERIALS_DE[] = {"Aluminium", "Holz", "Kunststoff", "Messing", "Stahl"};
    const char *const CNC_MATERIALS_EN[] = {"Aluminium", "Wood", "Plastic", "Brass", "Steel"};

    std::string toIso8601(time_t t)
    {
        struct tm tmv;
        gmtime_r(&t, &tmv);
        char buf[24];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tmv);
        return std::string(buf);
    }
} // namespace
