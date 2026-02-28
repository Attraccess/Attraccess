#pragma once

#include <Arduino.h>
#include <cstdint>

namespace app::contracts {

static constexpr size_t MAX_RESOURCES = 10;
static constexpr size_t MAX_RESOURCE_NAME_LEN = 64;
static constexpr size_t MAX_DESC_LEN = 128;
static constexpr size_t MAX_USERNAME_LEN = 32;
static constexpr size_t MAX_INTRODUCERS = 8;
static constexpr size_t MAX_FLOW_BUTTONS = 7;
static constexpr size_t MAX_FLOW_BUTTON_LABEL_LEN = 32;
static constexpr size_t MAX_FLOW_BUTTON_ID_LEN = 48;
static constexpr size_t MAX_PROJECTS_PER_PAGE = 4;
static constexpr size_t MAX_FORMS_PER_REQUEST = 1;
static constexpr size_t MAX_FORM_FIELDS_PER_FORM = 16;
static constexpr size_t MAX_FORM_SUBMISSIONS = MAX_FORMS_PER_REQUEST;
static constexpr size_t MAX_FORM_FIELD_ANSWERS = MAX_FORM_FIELDS_PER_FORM;
static constexpr size_t MAX_SELECT_OPTIONS = 12;

struct FlowButton {
  char id[MAX_FLOW_BUTTON_ID_LEN];
  char label[MAX_FLOW_BUTTON_LABEL_LEN];
};

struct ResourceBrief {
  uint32_t id = 0;
  uint8_t type = 0;
  bool separateUnlockAndUnlatch = false;
  bool allowTakeOver = false;
  char name[MAX_RESOURCE_NAME_LEN];
  char description[MAX_DESC_LEN];
  bool hasActiveUsage = false;
  char activeUser[MAX_USERNAME_LEN];
  uint32_t activeStartEpoch = 0;
  uint8_t introducerCount = 0;
  char introducers[MAX_INTRODUCERS][MAX_USERNAME_LEN];
  uint8_t flowButtonCount = 0;
  FlowButton flowButtons[MAX_FLOW_BUTTONS];
};

struct ResourceList {
  uint16_t count = 0;
  ResourceBrief items[MAX_RESOURCES];
};

struct Project {
  uint32_t id = 0;
  String name;
};

struct ProjectsOfUserResponse {
  uint16_t count = 0;
  uint32_t page = 1;
  uint32_t limit = MAX_PROJECTS_PER_PAGE;
  uint32_t total = 0;
  bool hasMore = false;
  Project items[MAX_PROJECTS_PER_PAGE];
};

enum class ResourceUsageFormActionType : uint8_t {
  UNKNOWN,
  START,
  END,
  TAKEOVER,
};

enum class ResourceUsageFormFieldType : uint8_t {
  UNKNOWN,
  TEXT,
  NUMBER,
  BOOLEAN,
  SELECT,
};

struct ResourceUsageFormFieldOptions {
  struct {
    bool hasPlaceholder = false;
    String placeholder;
    bool multiline = false;
  } text;
  struct {
    bool hasMin = false;
    double min = 0;
    bool hasMax = false;
    double max = 0;
    bool hasStep = false;
    double step = 0;
  } number;
  struct {
    String trueLabel;
    String falseLabel;
  } boolean;
  struct {
    uint8_t count = 0;
    String values[MAX_SELECT_OPTIONS];
  } select;
};

struct ResourceUsageFormField {
  uint32_t id = 0;
  ResourceUsageFormFieldType type = ResourceUsageFormFieldType::UNKNOWN;
  bool isRequired = false;
  String name;
  String description;
  ResourceUsageFormFieldOptions options;
};

struct ResourceUsageForm {
  uint32_t id = 0;
  String name;
  uint8_t fieldCount = 0;
  ResourceUsageFormField fields[MAX_FORM_FIELDS_PER_FORM];
};

struct ResourceUsageFormRequest {
  uint32_t resourceId = 0;
  ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
  String resourceName;
  uint8_t formCount = 0;
  ResourceUsageForm forms[MAX_FORMS_PER_REQUEST];
};

struct FormSubmissionAnswer {
  uint32_t fieldId = 0;
  enum class ValueType : uint8_t {
    STRING,
    NUMBER,
    BOOLEAN,
  } type = ValueType::STRING;
  String stringValue;
  double numberValue = 0;
  bool boolValue = false;
};

struct FormSubmission {
  uint32_t formId = 0;
  uint8_t answerCount = 0;
  FormSubmissionAnswer answers[MAX_FORM_FIELD_ANSWERS];
};

struct FormSubmissionList {
  uint8_t submissionCount = 0;
  FormSubmission submissions[MAX_FORM_SUBMISSIONS];
};

struct CardAuthenticationDetails {
  uint8_t keyNo = 0;
  uint8_t keyBytes[16];
  uint8_t keyLen = 0;
  String error;
  String username;
  bool canManageResource = false;
  bool hasIntroduction = false;
  bool isIntroducer = false;
};

} // namespace app::contracts
