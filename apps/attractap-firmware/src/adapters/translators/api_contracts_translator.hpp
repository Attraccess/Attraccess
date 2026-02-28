#pragma once

#include "../../api/api.hpp"
#include "../../contracts/api_contracts.hpp"
#include <cstring>

namespace app::adapters::translators {

inline void toContract(const API::ResourceList &in,
                       app::contracts::ResourceList &out);

template <size_t N> inline void copyChars(char (&dst)[N], const char *src) {
  if (!src) {
    dst[0] = '\0';
    return;
  }
  std::strncpy(dst, src, N - 1);
  dst[N - 1] = '\0';
}

inline app::contracts::ResourceBrief toContract(const API::ResourceBrief &in) {
  app::contracts::ResourceBrief out;
  out.id = in.id;
  out.type = in.type;
  out.separateUnlockAndUnlatch = in.separateUnlockAndUnlatch;
  out.allowTakeOver = in.allowTakeOver;
  copyChars(out.name, in.name);
  copyChars(out.description, in.description);
  out.hasActiveUsage = in.hasActiveUsage;
  copyChars(out.activeUser, in.activeUser);
  out.activeStartEpoch = in.activeStartEpoch;
  out.introducerCount =
      in.introducerCount > app::contracts::MAX_INTRODUCERS
          ? app::contracts::MAX_INTRODUCERS
          : in.introducerCount;
  for (uint8_t i = 0; i < out.introducerCount; ++i) {
    copyChars(out.introducers[i], in.introducers[i]);
  }
  out.flowButtonCount = in.flowButtonCount > app::contracts::MAX_FLOW_BUTTONS
                            ? app::contracts::MAX_FLOW_BUTTONS
                            : in.flowButtonCount;
  for (uint8_t i = 0; i < out.flowButtonCount; ++i) {
    copyChars(out.flowButtons[i].id, in.flowButtons[i].id);
    copyChars(out.flowButtons[i].label, in.flowButtons[i].label);
  }
  return out;
}

inline API::ResourceBrief toLegacy(const app::contracts::ResourceBrief &in) {
  API::ResourceBrief out{};
  out.id = in.id;
  out.type = in.type;
  out.separateUnlockAndUnlatch = in.separateUnlockAndUnlatch;
  out.allowTakeOver = in.allowTakeOver;
  copyChars(out.name, in.name);
  copyChars(out.description, in.description);
  out.hasActiveUsage = in.hasActiveUsage;
  copyChars(out.activeUser, in.activeUser);
  out.activeStartEpoch = in.activeStartEpoch;
  out.introducerCount =
      in.introducerCount > API::MAX_INTRODUCERS ? API::MAX_INTRODUCERS
                                                : in.introducerCount;
  for (uint8_t i = 0; i < out.introducerCount; ++i) {
    copyChars(out.introducers[i], in.introducers[i]);
  }
  out.flowButtonCount =
      in.flowButtonCount > API::MAX_FLOW_BUTTONS ? API::MAX_FLOW_BUTTONS
                                                 : in.flowButtonCount;
  for (uint8_t i = 0; i < out.flowButtonCount; ++i) {
    copyChars(out.flowButtons[i].id, in.flowButtons[i].id);
    copyChars(out.flowButtons[i].label, in.flowButtons[i].label);
  }
  return out;
}

inline app::contracts::ResourceList toContract(const API::ResourceList &in) {
  app::contracts::ResourceList out;
  toContract(in, out);
  return out;
}

inline void toContract(const API::ResourceList &in,
                       app::contracts::ResourceList &out) {
  out.count =
      in.count > app::contracts::MAX_RESOURCES ? app::contracts::MAX_RESOURCES
                                               : in.count;
  for (uint16_t i = 0; i < out.count; ++i) {
    out.items[i] = toContract(in.items[i]);
  }
}

inline API::ResourceList toLegacy(const app::contracts::ResourceList &in) {
  API::ResourceList out{};
  out.count = in.count > API::MAX_RESOURCES ? API::MAX_RESOURCES : in.count;
  for (uint16_t i = 0; i < out.count; ++i) {
    out.items[i] = toLegacy(in.items[i]);
  }
  return out;
}

inline app::contracts::ProjectsOfUserResponse
toContract(const API::ProjectsOfUserResponse &in) {
  app::contracts::ProjectsOfUserResponse out;
  out.count = in.count > app::contracts::MAX_PROJECTS_PER_PAGE
                  ? app::contracts::MAX_PROJECTS_PER_PAGE
                  : in.count;
  out.page = in.page;
  out.limit = in.limit;
  out.total = in.total;
  out.hasMore = in.hasMore;
  for (uint16_t i = 0; i < out.count; ++i) {
    out.items[i].id = in.items[i].id;
    out.items[i].name = in.items[i].name;
  }
  return out;
}

inline API::ProjectsOfUserResponse
toLegacy(const app::contracts::ProjectsOfUserResponse &in) {
  API::ProjectsOfUserResponse out{};
  out.count =
      in.count > API::MAX_PROJECTS_PER_PAGE ? API::MAX_PROJECTS_PER_PAGE
                                            : in.count;
  out.page = in.page;
  out.limit = in.limit;
  out.total = in.total;
  out.hasMore = in.hasMore;
  for (uint16_t i = 0; i < out.count; ++i) {
    out.items[i].id = in.items[i].id;
    out.items[i].name = in.items[i].name;
  }
  return out;
}

inline app::contracts::ResourceUsageFormRequest
toContract(const API::ResourceUsageFormRequest &in) {
  app::contracts::ResourceUsageFormRequest out;
  out.resourceId = in.resourceId;
  out.action = static_cast<app::contracts::ResourceUsageFormActionType>(in.action);
  out.resourceName = in.resourceName;
  out.formCount = in.formCount > app::contracts::MAX_FORMS_PER_REQUEST
                      ? app::contracts::MAX_FORMS_PER_REQUEST
                      : in.formCount;
  for (uint8_t i = 0; i < out.formCount; ++i) {
    out.forms[i].id = in.forms[i].id;
    out.forms[i].name = in.forms[i].name;
    out.forms[i].fieldCount =
        in.forms[i].fieldCount > app::contracts::MAX_FORM_FIELDS_PER_FORM
            ? app::contracts::MAX_FORM_FIELDS_PER_FORM
            : in.forms[i].fieldCount;
    for (uint8_t j = 0; j < out.forms[i].fieldCount; ++j) {
      out.forms[i].fields[j].id = in.forms[i].fields[j].id;
      out.forms[i].fields[j].type =
          static_cast<app::contracts::ResourceUsageFormFieldType>(
              in.forms[i].fields[j].type);
      out.forms[i].fields[j].isRequired = in.forms[i].fields[j].isRequired;
      out.forms[i].fields[j].name = in.forms[i].fields[j].name;
      out.forms[i].fields[j].description = in.forms[i].fields[j].description;
      out.forms[i].fields[j].options.text.hasPlaceholder =
          in.forms[i].fields[j].options.text.hasPlaceholder;
      out.forms[i].fields[j].options.text.placeholder =
          in.forms[i].fields[j].options.text.placeholder;
      out.forms[i].fields[j].options.text.multiline =
          in.forms[i].fields[j].options.text.multiline;
      out.forms[i].fields[j].options.number.hasMin =
          in.forms[i].fields[j].options.number.hasMin;
      out.forms[i].fields[j].options.number.min =
          in.forms[i].fields[j].options.number.min;
      out.forms[i].fields[j].options.number.hasMax =
          in.forms[i].fields[j].options.number.hasMax;
      out.forms[i].fields[j].options.number.max =
          in.forms[i].fields[j].options.number.max;
      out.forms[i].fields[j].options.number.hasStep =
          in.forms[i].fields[j].options.number.hasStep;
      out.forms[i].fields[j].options.number.step =
          in.forms[i].fields[j].options.number.step;
      out.forms[i].fields[j].options.boolean.trueLabel =
          in.forms[i].fields[j].options.boolean.trueLabel;
      out.forms[i].fields[j].options.boolean.falseLabel =
          in.forms[i].fields[j].options.boolean.falseLabel;
      out.forms[i].fields[j].options.select.count =
          in.forms[i].fields[j].options.select.count >
                  app::contracts::MAX_SELECT_OPTIONS
              ? app::contracts::MAX_SELECT_OPTIONS
              : in.forms[i].fields[j].options.select.count;
      for (uint8_t k = 0; k < out.forms[i].fields[j].options.select.count; ++k) {
        out.forms[i].fields[j].options.select.values[k] =
            in.forms[i].fields[j].options.select.values[k];
      }
    }
  }
  return out;
}

inline API::ResourceUsageFormRequest
toLegacy(const app::contracts::ResourceUsageFormRequest &in) {
  API::ResourceUsageFormRequest out{};
  out.resourceId = in.resourceId;
  out.action = static_cast<API::ResourceUsageFormActionType>(in.action);
  out.resourceName = in.resourceName;
  out.formCount =
      in.formCount > API::MAX_FORMS_PER_REQUEST ? API::MAX_FORMS_PER_REQUEST
                                                : in.formCount;
  for (uint8_t i = 0; i < out.formCount; ++i) {
    out.forms[i].id = in.forms[i].id;
    out.forms[i].name = in.forms[i].name;
    out.forms[i].fieldCount = in.forms[i].fieldCount > API::MAX_FORM_FIELDS_PER_FORM
                                  ? API::MAX_FORM_FIELDS_PER_FORM
                                  : in.forms[i].fieldCount;
    for (uint8_t j = 0; j < out.forms[i].fieldCount; ++j) {
      out.forms[i].fields[j].id = in.forms[i].fields[j].id;
      out.forms[i].fields[j].type =
          static_cast<API::ResourceUsageFormFieldType>(in.forms[i].fields[j].type);
      out.forms[i].fields[j].isRequired = in.forms[i].fields[j].isRequired;
      out.forms[i].fields[j].name = in.forms[i].fields[j].name;
      out.forms[i].fields[j].description = in.forms[i].fields[j].description;
      out.forms[i].fields[j].options.text.hasPlaceholder =
          in.forms[i].fields[j].options.text.hasPlaceholder;
      out.forms[i].fields[j].options.text.placeholder =
          in.forms[i].fields[j].options.text.placeholder;
      out.forms[i].fields[j].options.text.multiline =
          in.forms[i].fields[j].options.text.multiline;
      out.forms[i].fields[j].options.number.hasMin =
          in.forms[i].fields[j].options.number.hasMin;
      out.forms[i].fields[j].options.number.min =
          in.forms[i].fields[j].options.number.min;
      out.forms[i].fields[j].options.number.hasMax =
          in.forms[i].fields[j].options.number.hasMax;
      out.forms[i].fields[j].options.number.max =
          in.forms[i].fields[j].options.number.max;
      out.forms[i].fields[j].options.number.hasStep =
          in.forms[i].fields[j].options.number.hasStep;
      out.forms[i].fields[j].options.number.step =
          in.forms[i].fields[j].options.number.step;
      out.forms[i].fields[j].options.boolean.trueLabel =
          in.forms[i].fields[j].options.boolean.trueLabel;
      out.forms[i].fields[j].options.boolean.falseLabel =
          in.forms[i].fields[j].options.boolean.falseLabel;
      out.forms[i].fields[j].options.select.count =
          in.forms[i].fields[j].options.select.count > API::MAX_SELECT_OPTIONS
              ? API::MAX_SELECT_OPTIONS
              : in.forms[i].fields[j].options.select.count;
      for (uint8_t k = 0; k < out.forms[i].fields[j].options.select.count; ++k) {
        out.forms[i].fields[j].options.select.values[k] =
            in.forms[i].fields[j].options.select.values[k];
      }
    }
  }
  return out;
}

inline app::contracts::FormSubmissionList
toContract(const API::FormSubmissionList &in) {
  app::contracts::FormSubmissionList out;
  out.submissionCount =
      in.submissionCount > app::contracts::MAX_FORM_SUBMISSIONS
          ? app::contracts::MAX_FORM_SUBMISSIONS
          : in.submissionCount;
  for (uint8_t i = 0; i < out.submissionCount; ++i) {
    out.submissions[i].formId = in.submissions[i].formId;
    out.submissions[i].answerCount =
        in.submissions[i].answerCount > app::contracts::MAX_FORM_FIELD_ANSWERS
            ? app::contracts::MAX_FORM_FIELD_ANSWERS
            : in.submissions[i].answerCount;
    for (uint8_t j = 0; j < out.submissions[i].answerCount; ++j) {
      out.submissions[i].answers[j].fieldId = in.submissions[i].answers[j].fieldId;
      out.submissions[i].answers[j].type =
          static_cast<app::contracts::FormSubmissionAnswer::ValueType>(
              in.submissions[i].answers[j].type);
      out.submissions[i].answers[j].stringValue =
          in.submissions[i].answers[j].stringValue;
      out.submissions[i].answers[j].numberValue =
          in.submissions[i].answers[j].numberValue;
      out.submissions[i].answers[j].boolValue =
          in.submissions[i].answers[j].boolValue;
    }
  }
  return out;
}

inline API::FormSubmissionList
toLegacy(const app::contracts::FormSubmissionList &in) {
  API::FormSubmissionList out{};
  out.submissionCount = in.submissionCount > API::MAX_FORM_SUBMISSIONS
                            ? API::MAX_FORM_SUBMISSIONS
                            : in.submissionCount;
  for (uint8_t i = 0; i < out.submissionCount; ++i) {
    out.submissions[i].formId = in.submissions[i].formId;
    out.submissions[i].answerCount =
        in.submissions[i].answerCount > API::MAX_FORM_FIELD_ANSWERS
            ? API::MAX_FORM_FIELD_ANSWERS
            : in.submissions[i].answerCount;
    for (uint8_t j = 0; j < out.submissions[i].answerCount; ++j) {
      out.submissions[i].answers[j].fieldId = in.submissions[i].answers[j].fieldId;
      out.submissions[i].answers[j].type =
          static_cast<API::FormSubmissionAnswer::ValueType>(
              in.submissions[i].answers[j].type);
      out.submissions[i].answers[j].stringValue =
          in.submissions[i].answers[j].stringValue;
      out.submissions[i].answers[j].numberValue =
          in.submissions[i].answers[j].numberValue;
      out.submissions[i].answers[j].boolValue =
          in.submissions[i].answers[j].boolValue;
    }
  }
  return out;
}

inline app::contracts::CardAuthenticationDetails
toContract(const API::CardAuthenticationDetailsResponse &in) {
  app::contracts::CardAuthenticationDetails out;
  out.keyNo = in.keyNo;
  std::memcpy(out.keyBytes, in.keyBytes, sizeof(out.keyBytes));
  out.keyLen = in.keyLen;
  out.error = in.error;
  out.username = in.username;
  out.canManageResource = in.canManageResource;
  out.hasIntroduction = in.hasIntroduction;
  out.isIntroducer = in.isIntroducer;
  return out;
}

} // namespace app::adapters::translators
