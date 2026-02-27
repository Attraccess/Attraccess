#pragma once

#include "../../../api/api.hpp"

class AuthController {
public:
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

  bool isCardAuthKeyLengthValid(uint8_t keyLen) const { return keyLen == 16; }
};
