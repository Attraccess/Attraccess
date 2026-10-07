#include "api.hpp"
#include <functional>
#include <cstdio>
#include <cstring>
#include <string>

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
