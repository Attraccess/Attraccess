#pragma once
#include <string>
#include <lvgl.h>

inline const char *SELECT_FIELD_PLACEHOLDER = "Bitte Option wählen";
inline const char *SELECT_FIELD_NO_OPTIONS = "Keine Optionen verfügbar";
inline const char *SELECT_FIELD_INVALID = "Ungültige Auswahl";
inline const lv_coord_t SELECT_FIELD_OPTION_GAP = 6;

std::string makeLVGLDisplayText(const std::string &input);
