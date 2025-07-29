#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <esp_websocket_client.h>
#include "data/cert/individual/ca_index.h"

class AdaptiveCertManager
{
public:
    AdaptiveCertManager();
    ~AdaptiveCertManager();

    // Initialize the certificate manager
    bool begin();

    // Configure WebSocket client with adaptive certificate
    bool configureWebSocketSSL(esp_websocket_client_config_t *config);

    // Mark current certificate as successful
    void markSuccess();

    // Mark current certificate as failed and try next
    bool tryNextCertificate();

    // Reset to start from first certificate
    void reset();

    // Reset for a new connection attempt (different from retry reset)
    void resetForNewConnection();

    // Get current certificate info
    const char *getCurrentCertName() const;
    int getCurrentCertIndex() const;

    // Debug method to show saved certificates
    void debugShowSavedCertificates();

private:
    Preferences preferences;
    int currentCertIndex;
    int successfulCertIndex;
    bool initialized;
    String currentHostname;         // Store current hostname for saving successful certs
    int rememberedCertFailureCount; // Track consecutive failures of remembered cert

    // Preference keys
    static const char *PREF_NAMESPACE;
    static const char *PREF_SUCCESSFUL_CERT;

    // Internal methods
    void loadSuccessfulCert();
    void saveSuccessfulCert(int certIndex);
    bool isValidCertIndex(int index) const;
};

// Global instance
extern AdaptiveCertManager adaptiveCertManager;