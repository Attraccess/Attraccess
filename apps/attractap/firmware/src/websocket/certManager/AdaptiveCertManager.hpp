#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <esp_websocket_client.h>
#include "../../certs/ca_index.hpp"
#include "../../logger/logger.hpp"

class AdaptiveCertManager
{
public:
    AdaptiveCertManager();
    ~AdaptiveCertManager();

    // Initialize the certificate manager
    bool begin();

    // Get certificate data and name
    bool getCertificate(const char **certData);
    bool getCertificate(const char **certData, const char **certName);

    // Mark current certificate as successful
    void markSuccess();

    // Mark current certificate as failed and try next
    void markFailure();

    // Reset to start from first certificate
    void reset();

    // Get current certificate info
    const char *getCurrentCertName() const;
    int getCurrentCertIndex() const;

private:
    Preferences preferences;
    int currentCertIndex;
    int successfulCertIndex;
    bool initialized;
    int rememberedCertFailureCount;
    mutable Logger logger;

    // Preference keys
    static const char *PREF_NAMESPACE;
    static const char *PREF_SUCCESSFUL_CERT;

    // Internal methods
    void loadSuccessfulCertIndexFromPreferences();
    void saveSuccessfulCertIndexToPreferences(int certIndex);
    bool isValidCertIndex(int index) const;
};

// Global instance
extern AdaptiveCertManager adaptiveCertManager;