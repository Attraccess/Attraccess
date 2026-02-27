#pragma once

#include "../../../api/api.hpp"

class AuthController {
public:
  struct EnrollGetAvailableTransitionDecision {
    bool shouldHandle = false;
    bool shouldPrepareEnrollment = false;
    bool shouldEnterEnrollmentState = false;
    bool shouldTimeout = false;
    bool shouldTryGetAvailableKeyNo = false;
    bool shouldClearExternalState = false;
  };

  struct EnrollNewCardTransitionDecision {
    bool shouldHandle = false;
    bool shouldReturnEarly = false;
    bool shouldEnableCardDetection = false;
    bool shouldEnterEnrollmentState = false;
  };

  struct EnrollAvailableKeyReadDecision {
    bool shouldSendAvailableKeyNo = false;
    bool shouldClearExternalState = false;
  };

  struct EnrollCardWriteDecision {
    bool shouldSuccessBeep = false;
    bool shouldErrorBeep = false;
    bool shouldSendEnrollResult = false;
    bool shouldClearExternalState = false;
  };

  struct CardDetectionDecision {
    bool shouldRequestCardAuthenticationData = false;
    bool shouldHandleEnrollmentCard = false;
    bool shouldProcessCardAuthenticationNow = false;
  };

  struct ExternalAuthTransitionDecision {
    bool shouldReturnEarly = false;
    bool shouldPopulateUserDetails = false;
    bool shouldEnterAuthenticateState = false;
    bool shouldEnableCardDetection = false;
    bool shouldProcessCardAuthenticationNow = false;
  };

  struct CardDetailsDecision {
    bool valid = false;
    bool shouldClearProjectSelection = false;
    bool shouldRequestProjects = false;
    bool shouldSetExternalAuthenticateState = false;
    bool shouldEnableCardDetection = false;
    bool shouldBeepError = false;
    String username;
  };

  struct CardAuthenticationExecutionDecision {
    bool shouldFail = false;
    bool shouldLogInvalidKey = false;
    bool shouldLogAuthFailed = false;
    bool shouldErrorBeep = false;
    bool shouldSuccessBeep = false;
    bool shouldEnableCardDetection = false;
    bool shouldKeepExternalAuthenticateState = false;
    bool shouldClearExternalState = false;
    bool shouldUnlock = false;
  };

  CardDetailsDecision handleCardDetails(
      const API::CardAuthenticationDetailsResponse &response,
      const String &currentProjectsUser) const {
    CardDetailsDecision d;
    if (response.error.length() > 0) {
      d.shouldEnableCardDetection = true;
      d.shouldSetExternalAuthenticateState = true;
      d.shouldBeepError = true;
      return d;
    }
    if (response.keyLen != 16) {
      d.shouldEnableCardDetection = true;
      d.shouldSetExternalAuthenticateState = true;
      d.shouldBeepError = true;
      return d;
    }

    d.valid = true;
    d.username = response.username;
    d.shouldSetExternalAuthenticateState = true;
    d.shouldRequestProjects = true;
    d.shouldClearProjectSelection = currentProjectsUser != response.username;
    return d;
  }

  ExternalAuthTransitionDecision
  evaluateExternalAuthenticateTransition(bool externalAuthenticateRequested,
                                         bool currentlyAuthenticating,
                                         bool hasDisplay) const {
    ExternalAuthTransitionDecision d;
    if (!externalAuthenticateRequested) {
      return d;
    }
    if (currentlyAuthenticating) {
      d.shouldReturnEarly = true;
      return d;
    }
    d.shouldEnterAuthenticateState = true;
    d.shouldPopulateUserDetails = hasDisplay;
    d.shouldEnableCardDetection = hasDisplay;
    d.shouldProcessCardAuthenticationNow = !hasDisplay;
    return d;
  }

  CardDetectionDecision
  evaluateCardDetection(bool hasDisplay, bool currentlyLocked,
                        bool currentlyWaitForCard, bool currentlyEnrollment,
                        bool currentlyAuthenticating) const {
    CardDetectionDecision d;
    bool shouldRequestAuth =
        (hasDisplay && currentlyLocked) || (!hasDisplay && currentlyWaitForCard);
    if (shouldRequestAuth) {
      d.shouldRequestCardAuthenticationData = true;
      return d;
    }
    if (hasDisplay && currentlyEnrollment) {
      d.shouldHandleEnrollmentCard = true;
      return d;
    }
    if (currentlyAuthenticating) {
      d.shouldProcessCardAuthenticationNow = true;
      return d;
    }
    return d;
  }

  EnrollGetAvailableTransitionDecision
  evaluateEnrollGetAvailableTransition(bool enrollGetAvailableRequested,
                                       bool currentlyEnrollment, uint32_t nowMs,
                                       uint32_t startTimeMs,
                                       uint32_t timeoutMs) const {
    EnrollGetAvailableTransitionDecision d;
    if (!enrollGetAvailableRequested) {
      return d;
    }
    d.shouldHandle = true;
    if (currentlyEnrollment) {
      if (nowMs - startTimeMs > timeoutMs) {
        d.shouldTimeout = true;
        d.shouldClearExternalState = true;
        return d;
      }
      d.shouldTryGetAvailableKeyNo = true;
      return d;
    }
    d.shouldPrepareEnrollment = true;
    d.shouldEnterEnrollmentState = true;
    return d;
  }

  EnrollNewCardTransitionDecision
  evaluateEnrollNewCardTransition(bool enrollNewCardRequested,
                                  bool currentlyEnrollment) const {
    EnrollNewCardTransitionDecision d;
    if (!enrollNewCardRequested) {
      return d;
    }
    d.shouldHandle = true;
    if (currentlyEnrollment) {
      d.shouldReturnEarly = true;
      return d;
    }
    d.shouldEnableCardDetection = true;
    d.shouldEnterEnrollmentState = true;
    return d;
  }

  EnrollAvailableKeyReadDecision evaluateEnrollAvailableKeyRead(
      bool readAvailableKeySucceeded) const {
    EnrollAvailableKeyReadDecision d;
    if (readAvailableKeySucceeded) {
      d.shouldSendAvailableKeyNo = true;
      d.shouldClearExternalState = true;
    }
    return d;
  }

  EnrollCardWriteDecision
  evaluateEnrollCardWriteResult(bool writeSucceeded) const {
    EnrollCardWriteDecision d;
    if (writeSucceeded) {
      d.shouldSuccessBeep = true;
    } else {
      d.shouldErrorBeep = true;
    }
    d.shouldSendEnrollResult = true;
    d.shouldClearExternalState = true;
    return d;
  }

  CardAuthenticationExecutionDecision
  evaluateCardAuthenticationExecution(bool keyLenValid, bool authenticated,
                                      bool hasDisplay) const {
    CardAuthenticationExecutionDecision d;
    if (!keyLenValid) {
      d.shouldFail = true;
      d.shouldLogInvalidKey = true;
      d.shouldErrorBeep = true;
      d.shouldEnableCardDetection = true;
      d.shouldKeepExternalAuthenticateState = true;
      return d;
    }
    if (!authenticated) {
      d.shouldFail = true;
      d.shouldLogAuthFailed = true;
      d.shouldErrorBeep = true;
      d.shouldEnableCardDetection = true;
      d.shouldKeepExternalAuthenticateState = true;
      return d;
    }
    d.shouldSuccessBeep = true;
    d.shouldClearExternalState = true;
    d.shouldUnlock = true;
    // Non-display mode needs detection on to catch card removal.
    d.shouldEnableCardDetection = !hasDisplay;
    return d;
  }

  bool isCardAuthKeyLengthValid(uint8_t keyLen) const { return keyLen == 16; }
};
