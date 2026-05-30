// Resource usage form request parsing and submission serialization helpers
// FEATURE: api-forms

#include "api.hpp"

void API::setResourceFormsRequestCallback(std::function<void(const ResourceUsageFormRequest &)> callback)
{
    this->resourceFormsRequestCallback = callback;
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
    request.resourceId = 0;
    request.resourceName = "";
    request.action = ResourceUsageFormActionType::UNKNOWN;
    request.formCount = 0;
    for (uint8_t i = 0; i < MAX_FORMS_PER_REQUEST; ++i)
    {
        this->resetResourceUsageForm(request.forms[i]);
    }
    request.resourceId = payload["resourceId"].is<uint32_t>() ? payload["resourceId"].as<uint32_t>() : 0;
    if (payload["resourceName"].is<const char *>())
    {
        request.resourceName = payload["resourceName"].as<const char *>();
    }
    request.action = this->parseFormAction(payload["action"].as<const char *>());

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

            ResourceUsageForm &form = request.forms[formIndex];
            form.id = formObj["id"].is<uint32_t>() ? formObj["id"].as<uint32_t>() : 0;
            if (formObj["name"].is<const char *>())
            {
                form.name = formObj["name"].as<const char *>();
            }

            JsonArray fields = formObj["fields"].as<JsonArray>();
            uint8_t fieldIndex = 0;
            if (!fields.isNull())
            {
                for (JsonObject fieldObj : fields)
                {
                    if (fieldIndex >= MAX_FORM_FIELDS_PER_FORM)
                    {
                        this->logger.info("Field list truncated due to MAX_FORM_FIELDS_PER_FORM");
                        break;
                    }
                    ResourceUsageFormField &field = form.fields[fieldIndex];
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
                    fieldIndex++;
                }
            }
            form.fieldCount = fieldIndex;
            formIndex++;
        }
    }
    request.formCount = formIndex;

    this->resourceFormsRequestCallback(request);
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
                String value = raw;
                value.trim();
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
        if (options["trueLabel"].is<const char *>())
        {
            field.options.boolean.trueLabel = options["trueLabel"].as<const char *>();
        }
        if (options["falseLabel"].is<const char *>())
        {
            field.options.boolean.falseLabel = options["falseLabel"].as<const char *>();
        }
        break;
    default:
        break;
    }
}

void API::resetResourceUsageForm(ResourceUsageForm &form)
{
    form.id = 0;
    form.name = "";
    form.fieldCount = 0;
    for (uint8_t i = 0; i < MAX_FORM_FIELDS_PER_FORM; ++i)
    {
        this->resetResourceUsageFormField(form.fields[i]);
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
}

void API::serializeFormSubmissions(JsonObject payload, const FormSubmissionList *formSubmissions)
{
    if (!formSubmissions || formSubmissions->submissionCount == 0)
    {
        return;
    }

    JsonArray submissions = payload.createNestedArray("formSubmissions");
    for (uint8_t i = 0; i < formSubmissions->submissionCount; ++i)
    {
        const FormSubmission &submission = formSubmissions->submissions[i];
        if (submission.formId == 0)
        {
            continue;
        }
        JsonObject submissionObj = submissions.createNestedObject();
        submissionObj["formId"] = submission.formId;
        JsonArray answers = submissionObj.createNestedArray("answers");
        for (uint8_t j = 0; j < submission.answerCount; ++j)
        {
            const FormSubmissionAnswer &answer = submission.answers[j];
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
}
