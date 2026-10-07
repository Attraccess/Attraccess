#include "api.hpp"
#include <functional>
#include <cstdio>
#include <cstring>
#include <string>

void API::onResourceUsageFormFields(JsonObject data)
{
    if (!this->resourceFormFieldsCallback)
    {
        this->logger.info("Received RESOURCE_USAGE_FORM_FIELDS but no callback is registered");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload.isNull())
    {
        this->logger.error("RESOURCE_USAGE_FORM_FIELDS missing payload");
        return;
    }

    ResourceUsageFormFieldsPage &page = this->resourceFormFieldsScratch;
    page.resourceId = payload["resourceId"].is<uint32_t>() ? payload["resourceId"].as<uint32_t>() : 0;
    page.action = this->parseFormAction(payload["action"].as<const char *>());
    page.formId = payload["formId"].is<uint32_t>() ? payload["formId"].as<uint32_t>() : 0;
    page.offset = payload["offset"].is<uint32_t>() ? payload["offset"].as<uint32_t>() : 0;
    page.totalFieldCount = payload["totalFieldCount"].is<uint32_t>() ? payload["totalFieldCount"].as<uint32_t>() : 0;
    page.fieldCount = 0;
    for (uint8_t i = 0; i < MAX_FORM_PAGE_FIELDS; ++i)
    {
        this->resetResourceUsageFormField(page.fields[i]);
    }

    JsonArray fields = payload["fields"].as<JsonArray>();
    uint8_t fieldIndex = 0;
    if (!fields.isNull())
    {
        for (JsonObject fieldObj : fields)
        {
            if (fieldIndex >= MAX_FORM_PAGE_FIELDS)
            {
                this->logger.info("Field page truncated due to MAX_FORM_PAGE_FIELDS");
                break;
            }
            ResourceUsageFormField &field = page.fields[fieldIndex];
            field.id = fieldObj["id"].is<uint32_t>() ? fieldObj["id"].as<uint32_t>() : 0;
            if (fieldObj["name"].is<const char *>())
            {
                field.name = fieldObj["name"].as<const char *>();
            }
            if (fieldObj["description"].is<const char *>())
            {
                field.description = fieldObj["description"].as<const char *>();
            }
            field.isRequired = fieldObj["isRequired"].is<bool>() ? fieldObj["isRequired"].as<bool>() : false;
            field.type = this->parseFormFieldType(fieldObj["type"].as<const char *>());
            this->parseFormFieldOptions(field, fieldObj["options"]);

            JsonVariantConst valueVariant = fieldObj["value"];
            field.hasValue = false;
            field.value = "";
            if (!valueVariant.isNull())
            {
                field.hasValue = true;
                if (valueVariant.is<bool>())
                {
                    field.value = valueVariant.as<bool>() ? "true" : "false";
                }
                else if (valueVariant.is<const char *>())
                {
                    field.value = valueVariant.as<const char *>();
                }
                else if (valueVariant.is<double>())
                {
                    // Match Arduino String(double): 2 decimal places
                    char numBuf[32];
                    snprintf(numBuf, sizeof(numBuf), "%.2f", valueVariant.as<double>());
                    field.value = numBuf;
                }
                else
                {
                    field.hasValue = false;
                }
            }
            fieldIndex++;
        }
    }
    page.fieldCount = fieldIndex;

    this->resourceFormFieldsCallback(page);
}

void API::onResourceUsageFormPageResult(JsonObject data)
{
    if (!this->resourceFormPageResultCallback)
    {
        this->logger.info("Received RESOURCE_USAGE_FORM_PAGE_RESULT but no callback is registered");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload.isNull())
    {
        this->logger.error("RESOURCE_USAGE_FORM_PAGE_RESULT missing payload");
        return;
    }

    ResourceUsageFormPageResult &result = this->resourceFormPageResultScratch;
    result.resourceId = payload["resourceId"].is<uint32_t>() ? payload["resourceId"].as<uint32_t>() : 0;
    result.action = this->parseFormAction(payload["action"].as<const char *>());
    result.formId = payload["formId"].is<uint32_t>() ? payload["formId"].as<uint32_t>() : 0;
    result.offset = payload["offset"].is<uint32_t>() ? payload["offset"].as<uint32_t>() : 0;
    result.valid = payload["valid"].is<bool>() ? payload["valid"].as<bool>() : false;
    result.errorCount = 0;

    JsonArray errors = payload["errors"].as<JsonArray>();
    uint8_t errorIndex = 0;
    if (!errors.isNull())
    {
        for (JsonObject errorObj : errors)
        {
            if (errorIndex >= MAX_FORM_PAGE_ERRORS)
            {
                break;
            }
            ResourceUsageFormPageResult::Error &error = result.errors[errorIndex];
            error.fieldId = errorObj["fieldId"].is<uint32_t>() ? errorObj["fieldId"].as<uint32_t>() : 0;
            error.message = errorObj["message"].is<const char *>() ? errorObj["message"].as<const char *>() : "";
            errorIndex++;
        }
    }
    result.errorCount = errorIndex;

    this->resourceFormPageResultCallback(result);
}
