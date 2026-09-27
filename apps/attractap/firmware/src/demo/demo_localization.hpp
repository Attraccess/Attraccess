#pragma once

#include <cstddef>

namespace DemoLocalization
{
inline const char *resourceName(unsigned id, bool english)
{
    static constexpr const char *german[] = {"", "CNC Fraese", "3D Drucker", "Haupteingang"};
    static constexpr const char *englishNames[] = {"", "CNC Router", "3D Printer", "Main Entrance"};
    constexpr size_t count = sizeof(german) / sizeof(german[0]);
    if (id >= count) return "";
    return english ? englishNames[id] : german[id];
}

inline const char *projectName(unsigned index, bool english)
{
    static constexpr const char *german[] = {
        "Möbelbau Eiche", "Prototyp Gehäuse", "Reparatur Fahrradrahmen",
        "Weihnachtsgeschenke", "CNC Schild Gravur", "Ersatzteil Drucker",
    };
    static constexpr const char *englishNames[] = {
        "Oak Furniture", "Enclosure Prototype", "Bicycle Frame Repair",
        "Christmas Gifts", "CNC Sign Engraving", "Printer Spare Part",
    };
    constexpr size_t count = sizeof(german) / sizeof(german[0]);
    if (index >= count) return "";
    return english ? englishNames[index] : german[index];
}
}
