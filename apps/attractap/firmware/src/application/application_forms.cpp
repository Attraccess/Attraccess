// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
void Application::handleFormsRequest(
    const API::ResourceUsageFormRequest &request) {
  // 'request' aliases this->pendingFormRequest (filled by the callback).
  (void)request;
  // The server retries un-acked messages (RETRY_COUNT in the gateway). A duplicate
  // RESOURCE_USAGE_FORM_REQUEST must not reset an in-progress form, nor reopen one
  // that was already submitted while the START/STOP result is in flight (ATT-545).
  if (this->hasPendingFormRequest || this->formFlowSubmitted) {
    return;
  }
  this->hasPendingFormRequest = true;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  this->clearFormPageCache();
  this->awaitingFieldRender = false;
  // List actions normally stay on the resource list. A required form needs the
  // existing details-screen modal, so reveal it only when the server requests one.
  if (this->state == APPLICATION_STATE_RESOURCE_LIST) {
    this->resourceIsSelected = true;
    this->state = APPLICATION_STATE_UNLOCKED;
    Display::transitionToScreen(&Display::resourceDetailsScreen);
  }
  Display::resourceDetailsScreen.hideActionProgress();
  Display::resourceDetailsScreen.showFormsModal(this->pendingFormRequest);
  this->requestCurrentFormField();
}

uint32_t Application::totalFormFields() const {
  uint32_t total = 0;
  for (uint8_t i = 0;
       i < this->pendingFormRequest.formCount && i < API::MAX_FORMS_PER_REQUEST;
       ++i) {
    total += this->pendingFormRequest.forms[i].fieldCount;
  }
  return total;
}

uint32_t Application::globalFormFieldNumber() const {
  uint32_t number = 0;
  for (uint8_t i = 0;
       i < this->formCursorFormIdx && i < API::MAX_FORMS_PER_REQUEST; ++i) {
    number += this->pendingFormRequest.forms[i].fieldCount;
  }
  return number + this->formCursorOffset + 1;
}

bool Application::isLastFormField() const {
  // Last when no later field exists in this or any subsequent form.
  if (this->formCursorFormIdx >= this->pendingFormRequest.formCount) {
    return true;
  }
  if (this->formCursorOffset + 1 <
      this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount) {
    return false;
  }
  for (uint8_t i = this->formCursorFormIdx + 1;
       i < this->pendingFormRequest.formCount && i < API::MAX_FORMS_PER_REQUEST;
       ++i) {
    if (this->pendingFormRequest.forms[i].fieldCount > 0) {
      return false;
    }
  }
  return true;
}

void Application::requestCurrentFormField() {
  // Skip forms that carry no fields, finish when the cursor runs past the end.
  while (this->formCursorFormIdx < this->pendingFormRequest.formCount &&
         this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount ==
             0) {
    this->formCursorFormIdx++;
    this->formCursorOffset = 0;
  }
  if (this->formCursorFormIdx >= this->pendingFormRequest.formCount) {
    this->finishFormFlow();
    return;
  }
  const API::ResourceUsageFormMeta &form =
      this->pendingFormRequest.forms[this->formCursorFormIdx];

  // Serve from cache when available (instant); otherwise fetch and wait.
  FormPageCacheEntry *cached =
      this->findFormPageCache(form.id, this->formCursorOffset);
  if (cached) {
    this->awaitingFieldRender = false;
    this->renderFormFieldPage(cached->page);
    this->prefetchNextFormField();
    return;
  }

  this->awaitingFieldRender = true;
  this->api.requestFormFields(this->pendingFormRequest.resourceId,
                              this->pendingFormRequest.action, form.id,
                              this->formCursorOffset, API::MAX_FORM_PAGE_FIELDS);
}

void Application::advanceFormCursor() {
  this->formCursorOffset += API::MAX_FORM_PAGE_FIELDS;
  if (this->formCursorFormIdx < this->pendingFormRequest.formCount &&
      this->formCursorOffset >=
          this->pendingFormRequest.forms[this->formCursorFormIdx].fieldCount) {
    this->formCursorFormIdx++;
    this->formCursorOffset = 0;
  }
}

void Application::retreatFormCursor() {
  if (this->formCursorOffset > 0) {
    this->formCursorOffset--;
  } else {
    if (this->formCursorFormIdx == 0) {
      return;
    }
    int16_t idx = static_cast<int16_t>(this->formCursorFormIdx) - 1;
    while (idx >= 0 && this->pendingFormRequest.forms[idx].fieldCount == 0) {
      idx--;
    }
    if (idx < 0) {
      return;
    }
    this->formCursorFormIdx = static_cast<uint8_t>(idx);
    this->formCursorOffset = this->pendingFormRequest.forms[idx].fieldCount - 1;
  }
  this->requestCurrentFormField();
}

void Application::handleFormFields(const API::ResourceUsageFormFieldsPage &page) {
  if (!this->hasPendingFormRequest) {
    return;
  }

  // Always cache the page (covers both the awaited current field and prefetched
  // neighbours). renderFormFieldPage reads from the stable cache slot, never the
  // shared scratch buffer, so the displayed page survives later prefetch traffic.
  FormPageCacheEntry *entry = this->storeFormPageCache(page);
  if (!entry) {
    return;
  }

  // Render only when this page is the one the user is actually waiting on.
  if (this->awaitingFieldRender &&
      this->formCursorFormIdx < this->pendingFormRequest.formCount) {
    uint32_t currentFormId =
        this->pendingFormRequest.forms[this->formCursorFormIdx].id;
    if (page.formId == currentFormId && page.offset == this->formCursorOffset) {
      this->awaitingFieldRender = false;
      this->renderFormFieldPage(entry->page);
      this->prefetchNextFormField();
    }
  }
}

void Application::handleFormPageNext(const API::FormPageSubmission &page) {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->api.submitFormPage(this->pendingFormRequest.resourceId,
                           this->pendingFormRequest.action, page);
}

void Application::handleFormPageResult(
    const API::ResourceUsageFormPageResult &result) {
  if (!this->hasPendingFormRequest) {
    return;
  }
  if (result.valid) {
    // The submitted field's draft value changed server-side; drop its cached copy
    // so navigating back re-fetches the persisted answer instead of a stale one.
    this->invalidateFormPageCache(result.formId, result.offset);
    this->advanceFormCursor();
    this->requestCurrentFormField();
  } else {
    Display::resourceDetailsScreen.showFormPageErrors(result);
  }
}

void Application::handleFormPageBack() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->retreatFormCursor();
}

void Application::finishFormFlow() {
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = true;
  Display::resourceDetailsScreen.hideFormsModal();
  Display::resourceDetailsScreen.showActionProgress("Sende Formular");

  if (this->pendingActionType == PENDING_ACTION_START_SESSION) {
    this->api.startResourceUsageSession(this->pendingActionResourceId,
                                        this->pendingActionProjectId);
  } else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION) {
    this->api.stopResourceUsageSession(this->pendingActionResourceId);
  } else {
    this->handleFormsCancel();
  }
}

void Application::handleFormsCancel() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  this->hasPendingFormRequest = false;
  this->formFlowSubmitted = false;
  this->pendingActionType = PENDING_ACTION_NONE;
  this->formCursorFormIdx = 0;
  this->formCursorOffset = 0;
  this->clearFormPageCache();
  this->awaitingFieldRender = false;
  Display::resourceDetailsScreen.hideFormsModal();
  Display::resourceDetailsScreen.hideActionProgress();
  this->endActionPause();
}

void Application::onActionResult(const std::string &eventType) {
  if (eventType == "START_RESOURCE_USAGE_SESSION" ||
      eventType == "STOP_RESOURCE_USAGE_SESSION") {
    this->pendingActionType = PENDING_ACTION_NONE;
    this->hasPendingFormRequest = false;
    this->formFlowSubmitted = false;
    Display::resourceDetailsScreen.hideFormsModal();
  }
}

Application::FormPageCacheEntry *Application::findFormPageCache(uint32_t formId,
                                                               uint32_t offset) {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    FormPageCacheEntry &entry = this->formPageCache[i];
    if (entry.valid && entry.formId == formId && entry.offset == offset) {
      entry.lru = ++this->formCacheTick;
      return &entry;
    }
  }
  return nullptr;
}

Application::FormPageCacheEntry *
Application::storeFormPageCache(const API::ResourceUsageFormFieldsPage &page) {
  FormPageCacheEntry *slot = this->findFormPageCache(page.formId, page.offset);
  if (!slot) {
    // Reuse an empty slot, else evict the least-recently-used entry.
    slot = &this->formPageCache[0];
    for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
      if (!this->formPageCache[i].valid) {
        slot = &this->formPageCache[i];
        break;
      }
      if (this->formPageCache[i].lru < slot->lru) {
        slot = &this->formPageCache[i];
      }
    }
  }
  slot->valid = true;
  slot->formId = page.formId;
  slot->offset = page.offset;
  slot->lru = ++this->formCacheTick;
  slot->page = page;
  return slot;
}

void Application::invalidateFormPageCache(uint32_t formId, uint32_t offset) {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    FormPageCacheEntry &entry = this->formPageCache[i];
    if (entry.valid && entry.formId == formId && entry.offset == offset) {
      entry.valid = false;
    }
  }
}

void Application::clearFormPageCache() {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    this->formPageCache[i].valid = false;
  }
  this->formCacheTick = 0;
}

void Application::renderFormFieldPage(
    const API::ResourceUsageFormFieldsPage &page) {
  bool canGoBack = this->globalFormFieldNumber() > 1;
  Display::resourceDetailsScreen.renderFormField(
      page, canGoBack, this->isLastFormField(), this->globalFormFieldNumber(),
      this->totalFormFields());
}

bool Application::computeNextFormCursor(uint8_t &formIdx,
                                        uint32_t &offset) const {
  formIdx = this->formCursorFormIdx;
  offset = this->formCursorOffset + API::MAX_FORM_PAGE_FIELDS;
  if (formIdx < this->pendingFormRequest.formCount &&
      offset >= this->pendingFormRequest.forms[formIdx].fieldCount) {
    formIdx++;
    offset = 0;
  }
  while (formIdx < this->pendingFormRequest.formCount &&
         this->pendingFormRequest.forms[formIdx].fieldCount == 0) {
    formIdx++;
    offset = 0;
  }
  return formIdx < this->pendingFormRequest.formCount;
}

void Application::prefetchNextFormField() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  // Never issue a prefetch while the current field's GET is still outstanding —
  // a second in-flight request could overwrite the shared scratch buffer and the
  // awaited render would be lost.
  if (this->awaitingFieldRender) {
    return;
  }
  uint8_t nextFormIdx = 0;
  uint32_t nextOffset = 0;
  if (!this->computeNextFormCursor(nextFormIdx, nextOffset)) {
    return; // current field is the last one
  }
  uint32_t formId = this->pendingFormRequest.forms[nextFormIdx].id;
  if (this->findFormPageCache(formId, nextOffset)) {
    return; // already cached
  }
  this->api.requestFormFields(this->pendingFormRequest.resourceId,
                              this->pendingFormRequest.action, formId, nextOffset,
                              API::MAX_FORM_PAGE_FIELDS);
}
#endif
