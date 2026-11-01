#include "display/i18n.hpp"
#pragma once
#include <string>
#include <lvgl.h>

inline constexpr auto SELECT_FIELD_NO_OPTIONS = FirmwareI18n::Message::NoOptionsAvailable;
inline constexpr auto SELECT_FIELD_INVALID = FirmwareI18n::Message::InvalidSelection;
inline const lv_coord_t SELECT_FIELD_OPTION_GAP = 6;

std::string makeLVGLDisplayText(const std::string &input);
