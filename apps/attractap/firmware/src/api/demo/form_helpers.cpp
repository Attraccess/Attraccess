// The demo CNC form's draft check and its image field: like the real server, a link for the QR code and the photos received so far.
// The pretend phone adds one photo on every count poll, so the reader's live count can be watched.

#ifdef DEMO_MODE
#include "websocket.hpp"
#include "fixtures.hpp"
#include <ArduinoJson.h>

void DemoWebsocket::describeImageField(JsonObject field)
{
    field["handoffUrl"] = CNC_IMAGE_URL;
    field["imageCount"] = _cncImageCount;
    field["maxImages"] = CNC_IMAGE_MAX;
    if (_cncImageCount < CNC_IMAGE_MAX)
        _cncImageCount++;
}

bool DemoWebsocket::cncFormComplete() const
{
    for (uint32_t i = 0; i < CNC_FIELD_COUNT; i++)
    {
        if (!CNC_FIELDS_DE[i].required)
            continue;
        auto it = _cncDraft.find(CNC_FIELDS_DE[i].id);
        if (it == _cncDraft.end() || it->second.empty())
            return false;
    }
    return true;
}

#endif
