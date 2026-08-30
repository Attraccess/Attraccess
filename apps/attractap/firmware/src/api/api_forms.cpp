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

API::ResourceUsageFormActionType API::parseFormAction(const char *action)
{
    if (!action)
    {
        return ResourceUsageFormActionType::UNKNOWN;
    }
    if (strcmp(action, "start") == 0)
    {
        return ResourceUsageFormActionType::START;
    }
    if (strcmp(action, "end") == 0)
    {
        return ResourceUsageFormActionType::END;
    }
    if (strcmp(action, "takeover") == 0)
    {
        return ResourceUsageFormActionType::TAKEOVER;
    }
    return ResourceUsageFormActionType::UNKNOWN;
}

const char *API::formActionToString(ResourceUsageFormActionType action)
{
    switch (action)
    {
    case ResourceUsageFormActionType::START:
        return "start";
    case ResourceUsageFormActionType::END:
        return "end";
    case ResourceUsageFormActionType::TAKEOVER:
        return "takeover";
    default:
        return "";
    }
}

API::ResourceUsageFormFieldType API::parseFormFieldType(const char *type)
{
    if (!type)
    {
        return ResourceUsageFormFieldType::UNKNOWN;
    }
    if (strcmp(type, "text") == 0)
    {
        return ResourceUsageFormFieldType::TEXT;
    }
    if (strcmp(type, "number") == 0)
    {
        return ResourceUsageFormFieldType::NUMBER;
    }
    if (strcmp(type, "boolean") == 0)
    {
        return ResourceUsageFormFieldType::BOOLEAN;
    }
    if (strcmp(type, "select") == 0)
    {
        return ResourceUsageFormFieldType::SELECT;
    }
    return ResourceUsageFormFieldType::UNKNOWN;
}

void API::parseFormFieldOptions(ResourceUsageFormField &field, JsonVariantConst optionsVariant)
{
    field.options = ResourceUsageFormFieldOptions{};

    if (field.type == ResourceUsageFormFieldType::SELECT)
    {
        auto loadOptionsFromArray = [&](JsonArrayConst arr)
        {
            for (JsonVariantConst optionVariant : arr)
            {
                if (!optionVariant.is<const char *>())
                {
                    continue;
                }
                const char *raw = optionVariant.as<const char *>();
                if (!raw)
                {
                    continue;
                }
                std::string value = raw;
                trimString(value);
                if (value.length() == 0)
                {
                    continue;
                }
                bool duplicate = false;
                for (uint8_t i = 0; i < field.options.select.count; ++i)
                {
                    if (field.options.select.values[i] == value)
                    {
                        duplicate = true;
                        break;
                    }
                }
                if (duplicate)
                {
                    continue;
                }
                if (field.options.select.count >= API::MAX_SELECT_OPTIONS)
                {
                    break;
                }
                field.options.select.values[field.options.select.count++] = value;
            }
        };

        if (optionsVariant.is<JsonArrayConst>())
        {
            loadOptionsFromArray(optionsVariant.as<JsonArrayConst>());
            return;
        }
        if (optionsVariant.is<JsonObjectConst>())
        {
            JsonObjectConst obj = optionsVariant.as<JsonObjectConst>();
            if (obj["options"].is<JsonArrayConst>())
            {
                loadOptionsFromArray(obj["options"].as<JsonArrayConst>());
            }
        }
        return;
    }

    if (!optionsVariant.is<JsonObjectConst>())
    {
        return;
    }
    JsonObjectConst options = optionsVariant.as<JsonObjectConst>();

    switch (field.type)
    {
    case ResourceUsageFormFieldType::TEXT:
        if (options["placeholder"].is<const char *>())
        {
            field.options.text.placeholder = options["placeholder"].as<const char *>();
            field.options.text.hasPlaceholder = true;
        }
        if (options["multiline"].is<bool>())
        {
            field.options.text.multiline = options["multiline"].as<bool>();
        }
        break;
    case ResourceUsageFormFieldType::NUMBER:
        if (options["min"].is<double>())
        {
            field.options.number.min = options["min"].as<double>();
            field.options.number.hasMin = true;
        }
        if (options["max"].is<double>())
        {
            field.options.number.max = options["max"].as<double>();
            field.options.number.hasMax = true;
        }
        if (options["step"].is<double>())
        {
            field.options.number.step = options["step"].as<double>();
            field.options.number.hasStep = true;
        }
        break;
    case ResourceUsageFormFieldType::BOOLEAN:
        // Boolean fields use a plain yes/no switch and carry no options.
        break;
    default:
        break;
    }
}

void API::resetResourceUsageFormField(ResourceUsageFormField &field)
{
    field.id = 0;
    field.type = ResourceUsageFormFieldType::UNKNOWN;
    field.isRequired = false;
    field.name = "";
    field.description = "";
    field.options = ResourceUsageFormFieldOptions{};
    field.hasValue = false;
    field.value = "";
}

void API::serializeFormPageSubmission(JsonObject payload, const FormPageSubmission &page)
{
    JsonArray answers = payload.createNestedArray("answers");
    for (uint8_t j = 0; j < page.answerCount; ++j)
    {
        const FormSubmissionAnswer &answer = page.answers[j];
        if (answer.fieldId == 0)
        {
            continue;
        }
        JsonObject answerObj = answers.createNestedObject();
        answerObj["fieldId"] = answer.fieldId;
        switch (answer.type)
        {
        case FormSubmissionAnswer::ValueType::NUMBER:
            answerObj["value"] = answer.numberValue;
            break;
        case FormSubmissionAnswer::ValueType::BOOLEAN:
            answerObj["value"] = answer.boolValue;
            break;
        case FormSubmissionAnswer::ValueType::STRING:
        default:
            answerObj["value"] = answer.stringValue.c_str();
            break;
        }
    }
}
