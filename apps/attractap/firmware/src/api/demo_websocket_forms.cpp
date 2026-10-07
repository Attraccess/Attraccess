#ifdef DEMO_MODE

#include "demo_websocket.hpp"
#include "../state/state.hpp"
#include <ArduinoJson.h>
#include <cstring>
#include <cstdio>
#include <ctime>
#include <string>
#include <vector>

#include "demo_websocket_fixtures.hpp"

bool DemoWebsocket::cncFormComplete() const
{
    for (uint32_t i = 0; i < CNC_FIELD_COUNT; i++)
    {
        if (!CNC_FIELDS[i].required)
            continue;
        auto it = _cncDraft.find(CNC_FIELDS[i].id);
        if (it == _cncDraft.end() || it->second.empty())
            return false;
    }
    return true;
}

void DemoWebsocket::respondFormRequest(uint32_t resourceId)
{
    StaticJsonDocument<512> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_REQUEST";
    doc["data"]["payload"]["requestId"] = _actionRequestId;
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["resourceName"] = "CNC Fräse";
    doc["data"]["payload"]["action"] = "start";

    JsonArray forms = doc["data"]["payload"]["forms"].to<JsonArray>();
    JsonObject form = forms.createNestedObject();
    form["id"] = CNC_FORM_ID;
    form["name"] = "CNC Einrichtung";
    form["fieldCount"] = CNC_FIELD_COUNT;

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondFormFields(uint32_t resourceId, const char *action, uint32_t formId, uint32_t offset)
{
    StaticJsonDocument<768> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_FIELDS";
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["action"] = action;
    doc["data"]["payload"]["formId"] = formId;
    doc["data"]["payload"]["offset"] = offset;
    doc["data"]["payload"]["totalFieldCount"] = CNC_FIELD_COUNT;

    JsonArray fields = doc["data"]["payload"]["fields"].to<JsonArray>();
    // The client fetches a one-field window (MAX_FORM_PAGE_FIELDS == 1).
    if (offset < CNC_FIELD_COUNT)
    {
        const CncField &f = CNC_FIELDS[offset];
        JsonObject obj = fields.createNestedObject();
        obj["id"] = f.id;
        obj["name"] = f.name;
        obj["description"] = f.description;
        obj["type"] = f.type;
        obj["isRequired"] = f.required;

        if (strcmp(f.type, "select") == 0)
        {
            JsonArray options = obj["options"].to<JsonArray>();
            for (const char *material : CNC_MATERIALS)
                options.add(material);
        }
        else if (strcmp(f.type, "number") == 0)
        {
            // Doubles: the client parses these via is<double>().
            obj["options"]["min"] = 1.0;
            obj["options"]["max"] = 480.0;
            obj["options"]["step"] = 1.0;
        }
        else if (strcmp(f.type, "text") == 0)
        {
            obj["options"]["placeholder"] = "z.B. 2024-042";
        }

        auto draft = _cncDraft.find(f.id);
        if (draft != _cncDraft.end())
            obj["value"] = draft->second;
    }

    char buf[768];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondFormPageResult(JsonObjectConst data)
{
    JsonObjectConst payload = data["payload"];
    uint32_t resourceId = payload["resourceId"] | 0u;
    const char *action = payload["action"] | "start";
    uint32_t formId = payload["formId"] | 0u;
    uint32_t offset = payload["offset"] | 0u;

    StaticJsonDocument<512> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_PAGE_RESULT";
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["action"] = action;
    doc["data"]["payload"]["formId"] = formId;
    doc["data"]["payload"]["offset"] = offset;
    JsonArray errors = doc["data"]["payload"]["errors"].to<JsonArray>();

    JsonArrayConst answers = payload["answers"];
    for (JsonObjectConst answer : answers)
    {
        uint32_t fieldId = answer["fieldId"] | 0u;

        // Normalize the answer value to a string for the draft / emptiness check.
        std::string value;
        JsonVariantConst v = answer["value"];
        if (v.is<bool>())
            value = v.as<bool>() ? "true" : "false";
        else if (v.is<const char *>())
            value = v.as<const char *>() ? v.as<const char *>() : "";
        else if (v.is<double>())
        {
            char numBuf[32];
            snprintf(numBuf, sizeof(numBuf), "%.0f", v.as<double>());
            value = numBuf;
        }

        // Required-field validation, matching the real server's rejection.
        bool required = false;
        for (uint32_t i = 0; i < CNC_FIELD_COUNT; i++)
        {
            if (CNC_FIELDS[i].id == fieldId)
            {
                required = CNC_FIELDS[i].required;
                break;
            }
        }
        if (required && value.empty())
        {
            JsonObject err = errors.createNestedObject();
            err["fieldId"] = fieldId;
            err["message"] = "Pflichtfeld";
            continue;
        }
        _cncDraft[fieldId] = value;
    }

    doc["data"]["payload"]["valid"] = (errors.size() == 0);

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif
