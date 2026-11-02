#pragma once

#include <stddef.h>
#include <stdint.h>

// Reader UI schema v1 constants.
// Hand-written mirror of libs/plugins-backend-sdk/src/lib/reader-ui.ts.
// apps/api/src/resources/forms/reader-ui.schema-parity.spec.ts fails when they drift.
namespace ui {

constexpr int SCHEMA_VERSION = 1;
constexpr size_t MAX_PAYLOAD_BYTES = 3072;
constexpr size_t MAX_FRAME_BYTES = 4096;
constexpr int MAX_NODES = 32;
constexpr int MAX_DEPTH = 5;
constexpr int MAX_LIVE_NODES = 64;
constexpr int MAX_TEXT_CHARS = 80;
constexpr int MAX_LABEL_BYTES = 31;
constexpr int MAX_LIST_ROW_CHARS = 24;
constexpr int MAX_CHOICES = 4;
constexpr int MAX_ID_CHARS = 24;

constexpr int SLOT_BUDGET_LIST_ROW_STATUS = 1;
constexpr int SLOT_BUDGET_DETAILS_HEADER = 6;
constexpr int SLOT_BUDGET_DETAILS_BODY = 8;
constexpr int SLOT_BUDGET_DETAILS_SESSION = 6;

constexpr int STEP_DEFAULT_TTL_SEC = 60;
constexpr int STEP_MAX_TTL_SEC = 120;
constexpr int POST_STOP_DEFAULT_TTL_SEC = 15;
constexpr int POST_STOP_MAX_TTL_SEC = 30;

constexpr const char *SLOT_LIST_ROW_STATUS = "resourceList.row.status";
constexpr const char *SLOT_DETAILS_HEADER = "resource.details.header";
constexpr const char *SLOT_DETAILS_BODY = "resource.details.body";
constexpr const char *SLOT_DETAILS_SESSION = "resource.details.session";

} // namespace ui
