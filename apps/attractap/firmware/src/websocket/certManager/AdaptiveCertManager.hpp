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

    // Mark current certificate as successful. Locks the decision for the given
    // server (hostname:port): from now on only this certificate is used until
    // reset() is called or the server changes.
    void markSuccess(const std::string &serverKey);

    // Clear the lock when it was established against a different server (the
    // API address changed). Locks from firmware versions that did not track the
    // server adopt the given key instead of being cleared.
    void ensureLockMatchesServer(const std::string &serverKey);

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
    int currentCertAttemptCount;
    int successfulCertIndex;
    std::string successfulServerKey;
    bool initialized;
    int rememberedCertFailureCount;
    mutable Logger logger;

    // How many times a cert is retried before moving to the next one in the sweep.
    static const int ATTEMPTS_PER_CERT = 2;

    // Preference keys
    static const char *PREF_NAMESPACE;
    static const char *PREF_SUCCESSFUL_CERT;
    static const char *PREF_SUCCESSFUL_CERT_NAME;
    static const char *PREF_SUCCESSFUL_HOST;

    // Internal methods
    void loadSuccessfulCertIndexFromPreferences();
    void saveSuccessfulCertIndexToPreferences(int certIndex);
    bool isValidCertIndex(int index) const;
};