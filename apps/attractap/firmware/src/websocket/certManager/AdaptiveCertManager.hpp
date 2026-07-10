#pragma once

#include <string>
#include "../../settings/kvstore.hpp"

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

    // Mark current certificate as successful. Locks the decision: from now on
    // only this certificate is used until reset() is called.
    void markSuccess();

    // Mark current certificate as failed and try next.
    // Returns true when the full certificate list was exhausted (a complete sweep failed).
    // Once a certificate is locked, no iteration happens and this always returns true.
    bool markFailure();

    // Clear the locked certificate and restart the sweep from the first one.
    void reset();

    // Whether a certificate is locked (successfully used at least once).
    bool isLocked() const;

    // Get current certificate info
    const char *getCurrentCertName() const;
    int getCurrentCertIndex() const;
    // Total number of available CA certificates.
    int getCertCount() const;
    // How many times the locked certificate has failed in a row.
    int getRememberedFailureCount() const;

private:
    KVStore preferences;
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