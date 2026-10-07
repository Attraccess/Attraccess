#include "api.hpp"
#include <functional>
#include <cstdio>
#include <cstring>
#include <string>

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
