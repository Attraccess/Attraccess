#pragma once

#include "api_resources_types.hpp"

struct ApiForms : public ApiResources
{
enum class ResourceUsageFormActionType : uint8_t
    {
        UNKNOWN,
        START,
        END,
        TAKEOVER,
    };

enum class ResourceUsageFormFieldType : uint8_t
    {
        UNKNOWN,
        TEXT,
        NUMBER,
        BOOLEAN,
        SELECT,
    };

struct ResourceUsageFormFieldOptions
    {
        struct
        {
            bool hasPlaceholder = false;
            std::string placeholder;
            bool multiline = false;
        } text;
        struct
        {
            bool hasMin = false;
            double min = 0;
            bool hasMax = false;
            double max = 0;
            bool hasStep = false;
            double step = 0;
        } number;
        struct
        {
            uint8_t count = 0;
            std::string values[MAX_SELECT_OPTIONS];
        } select;
    };

struct ResourceUsageFormField
    {
        uint32_t id = 0;
        ResourceUsageFormFieldType type = ResourceUsageFormFieldType::UNKNOWN;
        bool isRequired = false;
        std::string name;
        std::string description;
        ResourceUsageFormFieldOptions options;
        bool hasValue = false;
        std::string value;
    };

struct ResourceUsageFormMeta
    {
        uint32_t id = 0;
        std::string name;
        uint32_t fieldCount = 0;
    };

struct ResourceUsageFormRequest
    {
        uint32_t requestId = 0;
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        std::string resourceName;
        uint8_t formCount = 0;
        ResourceUsageFormMeta forms[MAX_FORMS_PER_REQUEST];
    };

struct ResourceUsageFormFieldsPage
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        uint32_t formId = 0;
        uint32_t offset = 0;
        uint32_t totalFieldCount = 0;
        uint8_t fieldCount = 0;
        ResourceUsageFormField fields[MAX_FORM_PAGE_FIELDS];
    };

struct FormSubmissionAnswer
    {
        uint32_t fieldId = 0;
        enum class ValueType : uint8_t
        {
            STRING,
            NUMBER,
            BOOLEAN,
        } type = ValueType::STRING;
        std::string stringValue;
        double numberValue = 0;
        bool boolValue = false;
    };

struct FormPageSubmission
    {
        uint32_t formId = 0;
        uint32_t offset = 0;
        uint8_t answerCount = 0;
        FormSubmissionAnswer answers[MAX_FORM_PAGE_FIELDS];
    };

struct ResourceUsageFormPageResult
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        uint32_t formId = 0;
        uint32_t offset = 0;
        bool valid = false;
        uint8_t errorCount = 0;
        struct Error
        {
            uint32_t fieldId = 0;
            std::string message;
        } errors[MAX_FORM_PAGE_ERRORS];
    };
};
