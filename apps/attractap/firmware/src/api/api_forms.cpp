// Paginated resource usage form parsing, field fetch and page submission helpers
// FEATURE: api-forms

#include "api.hpp"
#include <functional>
#include <cstdio>
#include <cstring>
#include <string>

void API::setResourceFormsRequestCallback(std::function<void(const ResourceUsageFormRequest &)> callback)
{
    this->resourceFormsRequestCallback = callback;
}

void API::setResourceFormFieldsCallback(std::function<void(const ResourceUsageFormFieldsPage &)> callback)
{
    this->resourceFormFieldsCallback = callback;
}

void API::setResourceFormPageResultCallback(std::function<void(const ResourceUsageFormPageResult &)> callback)
{
    this->resourceFormPageResultCallback = callback;
}

void API::requestFormFields(uint32_t resourceId, ResourceUsageFormActionType action, uint32_t formId, uint32_t offset, uint32_t limit)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["action"] = API::formActionToString(action);
    payload["formId"] = formId;
    payload["offset"] = offset;
    payload["limit"] = limit;
    this->sendMessage("RESOURCE_USAGE_FORM_GET_FIELDS", payload);
}

void API::submitFormPage(uint32_t resourceId, ResourceUsageFormActionType action, const FormPageSubmission &page)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["action"] = API::formActionToString(action);
    payload["formId"] = page.formId;
    payload["offset"] = page.offset;
    this->serializeFormPageSubmission(payload, page);
    this->sendMessage("RESOURCE_USAGE_FORM_SUBMIT_PAGE", payload);
}

void API::cancelForm(uint32_t resourceId, ResourceUsageFormActionType action)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["action"] = API::formActionToString(action);
    this->sendMessage("RESOURCE_USAGE_FORM_CANCEL", payload);
}

void API::onResourceUsageFormRequest(JsonObject data)
{
    if (!this->resourceFormsRequestCallback)
    {
        this->logger.info("Received RESOURCE_USAGE_FORM_REQUEST but no callback is registered");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload.isNull())
    {
        this->logger.error("RESOURCE_USAGE_FORM_REQUEST missing payload");
        return;
    }

    ResourceUsageFormRequest &request = this->resourceFormsRequestScratch;
    request.requestId = payload["requestId"] | 0u;
    request.resourceId = payload["resourceId"].is<uint32_t>() ? payload["resourceId"].as<uint32_t>() : 0;
    request.resourceName = "";
    if (payload["resourceName"].is<const char *>())
    {
        request.resourceName = payload["resourceName"].as<const char *>();
    }
    request.action = this->parseFormAction(payload["action"].as<const char *>());
    request.formCount = 0;
    for (uint8_t i = 0; i < MAX_FORMS_PER_REQUEST; ++i)
    {
        request.forms[i] = ResourceUsageFormMeta{};
    }

    JsonArray forms = payload["forms"].as<JsonArray>();
    uint8_t formIndex = 0;
    if (!forms.isNull())
    {
        for (JsonObject formObj : forms)
        {
            if (formIndex >= MAX_FORMS_PER_REQUEST)
            {
                this->logger.info("Form request truncated due to MAX_FORMS_PER_REQUEST");
                break;
            }
            ResourceUsageFormMeta &form = request.forms[formIndex];
            form.id = formObj["id"].is<uint32_t>() ? formObj["id"].as<uint32_t>() : 0;
            form.name = formObj["name"].is<const char *>() ? formObj["name"].as<const char *>() : "";
            form.fieldCount = formObj["fieldCount"].is<uint32_t>() ? formObj["fieldCount"].as<uint32_t>() : 0;
            formIndex++;
        }
    }
    request.formCount = formIndex;

    this->resourceFormsRequestCallback(request);
}
