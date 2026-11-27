#pragma once

#include "messages.catalog.session-duration.hpp"

// Texts for image form fields (ATT-879): the user adds photos on their phone after scanning a QR code. They follow
// the session duration texts in the Message enum, in this order.
namespace FirmwareI18n {
inline constexpr Entry formImagesCatalog[] = {
    {Message::FormImageScanHint, "Mit dem Handy scannen, um Fotos hinzuzufügen", "Scan with your phone to add photos"},
    // {0}: photos added so far, {1}: the most the form takes.
    {Message::FormImageCount, "{0} von {1} Fotos", "{0} of {1} photos"},
};
} // namespace FirmwareI18n
