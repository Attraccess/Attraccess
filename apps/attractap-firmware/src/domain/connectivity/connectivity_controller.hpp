#pragma once

class ConnectivityController {
public:
  struct ConnectionConfigurationDecision {
    bool shouldHandle = false;
    bool shouldEnterConfigurationRequiredState = false;
    bool shouldDisableConnectionAttempts = false;
    bool shouldDisablePinLock = false;
    bool shouldTransitionToConnectionConfigurationScreen = false;
    bool shouldReturnEarly = false;
  };

  struct ConnectivityStateDecision {
    bool shouldHandleDisconnectedState = false;
    bool shouldResetSessionOnDisconnect = false;
    bool shouldReturnEarly = false;
    bool shouldEnterInitState = false;
    bool shouldTransitionToInitScreen = false;
  };

  struct OpenSettingsDecision {
    bool shouldEnterConfigurationRequiredState = false;
    bool shouldDisableConnectionAttempts = false;
    bool shouldEnablePinLock = false;
    bool shouldTransitionToConnectionConfigurationScreen = false;
  };

  struct CancelPinLockDecision {
    bool shouldTransitionToInitScreen = false;
    bool shouldEnterBootState = false;
    bool shouldEnableConnectionAttempts = false;
  };

  ConnectionConfigurationDecision evaluateConnectionConfiguration(
      bool connectionIsConfigured, bool currentlyConfigurationRequired,
      bool hasDisplay) const {
    ConnectionConfigurationDecision d;
    if (!connectionIsConfigured) {
      d.shouldHandle = true;
      if (currentlyConfigurationRequired) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldEnterConfigurationRequiredState = true;
      d.shouldDisableConnectionAttempts = true;
      d.shouldDisablePinLock = hasDisplay;
      d.shouldTransitionToConnectionConfigurationScreen = hasDisplay;
      return d;
    }

    if (currentlyConfigurationRequired) {
      d.shouldHandle = true;
      d.shouldReturnEarly = true;
    }
    return d;
  }

  ConnectivityStateDecision evaluateConnectivityState(
      bool apiAuthenticated, bool networkConnected, bool websocketConnected,
      bool currentlyInit, bool currentlyConfigurationRequired,
      bool hasDisplay) const {
    ConnectivityStateDecision d;
    bool disconnected =
        !apiAuthenticated || !networkConnected || !websocketConnected;
    if (!disconnected) {
      return d;
    }

    d.shouldHandleDisconnectedState = true;
    d.shouldResetSessionOnDisconnect = hasDisplay;
    if (currentlyInit || currentlyConfigurationRequired) {
      d.shouldReturnEarly = true;
      return d;
    }
    d.shouldEnterInitState = true;
    d.shouldTransitionToInitScreen = hasDisplay;
    return d;
  }

  OpenSettingsDecision evaluateOpenSettingsRequest(bool hasDisplay) const {
    OpenSettingsDecision d;
    d.shouldEnterConfigurationRequiredState = true;
    d.shouldDisableConnectionAttempts = true;
    d.shouldEnablePinLock = hasDisplay;
    d.shouldTransitionToConnectionConfigurationScreen = hasDisplay;
    return d;
  }

  CancelPinLockDecision evaluateCancelPinLock(bool hasDisplay) const {
    CancelPinLockDecision d;
    d.shouldTransitionToInitScreen = hasDisplay;
    d.shouldEnterBootState = true;
    d.shouldEnableConnectionAttempts = true;
    return d;
  }
};
