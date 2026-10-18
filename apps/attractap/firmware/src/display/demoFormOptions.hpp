#pragma once

#include <cstdint>
#include <optional>
#include "messages.hpp"

namespace FirmwareI18n {
// Only the built-in demo CNC material field owns these option captions.
// Other forms, including identical supplied words, retain literal ownership.
inline std::optional<Message> demoMaterialCaption(uint32_t resourceId, uint32_t formId, uint32_t fieldId,
                                                const std::string &value)
{
    if (resourceId != 1 || formId != 10 || fieldId != 101) return std::nullopt;
    struct Material { const char *value; Message caption; };
    static constexpr Material materials[] = {
        {"Aluminium", Message::DemoMaterialAluminium},
        {"Holz", Message::DemoMaterialWood},
        {"Kunststoff", Message::DemoMaterialPlastic},
        {"Messing", Message::DemoMaterialBrass},
        {"Stahl", Message::DemoMaterialSteel},
    };
    for (const auto &material : materials)
        if (value == material.value) return material.caption;
    return std::nullopt;
}
}
