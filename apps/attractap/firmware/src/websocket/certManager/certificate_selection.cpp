#include "AdaptiveCertManager.hpp"

bool AdaptiveCertManager::getCertificate(const char **certData)
{
    return getCertificate(certData, nullptr);
}

bool AdaptiveCertManager::getCertificate(const char **certData, const char **certName)
{
    if (!initialized || !certData)
    {
        logger.error("Invalid parameters");
        return false;
    }

    logger.infof("Available certificates: %d", CA_CERT_COUNT);

    // A locked (once-successful) certificate is always used, no matter how often
    // it failed since: connect failures with a known-good cert mean the server is
    // unreachable, not that another CA would help. Only reset() unlocks it.
    if (successfulCertIndex >= 0 && isValidCertIndex(successfulCertIndex))
    {
        currentCertIndex = successfulCertIndex;
        logger.infof("Using locked certificate (index %d, failure count: %d)",
                     currentCertIndex, rememberedCertFailureCount);
    }
    else
    {
        // No locked certificate, iterate the list
        logger.info("No locked certificate found, continuing sweep");
    }

    if (!isValidCertIndex(currentCertIndex))
    {
        logger.errorf("No certificates available (index %d, max %d)",
                      currentCertIndex, CA_CERT_COUNT);
        currentCertIndex = 0;
        rememberedCertFailureCount = 0;
        return false;
    }

    logger.debug("Writing cert data to pointer");
    // Configure WebSocket with current certificate
    *certData = ca_certificates[currentCertIndex].data;

    if (certName)
    {
        logger.debug("Writing cert name to pointer");
        *certName = ca_certificates[currentCertIndex].name;
    }

    const char *currentCertName = getCurrentCertName();
    logger.infof("Configured with certificate: %s (index %d/%d)",
                 currentCertName, currentCertIndex, CA_CERT_COUNT - 1);

    return true;
}

void AdaptiveCertManager::markSuccess(const std::string &serverKey)
{
    if (!initialized)
    {
        return;
    }

    const char *certName = getCurrentCertName();
    logger.infof("Certificate successful: %s (index %d, server %s)",
                 certName, currentCertIndex, serverKey.c_str());

    successfulCertIndex = currentCertIndex;
    successfulServerKey = serverKey;
    rememberedCertFailureCount = 0; // Reset failure counter on success
    currentCertAttemptCount = 0;

    saveSuccessfulCertIndexToPreferences(currentCertIndex);
    // The name guards the lock against the CA list being reordered by a
    // firmware update: an index alone would silently point at a different CA.
    preferences.putString(PREF_SUCCESSFUL_CERT_NAME, certName);
    preferences.putString(PREF_SUCCESSFUL_HOST, serverKey);
}

void AdaptiveCertManager::ensureLockMatchesServer(const std::string &serverKey)
{
    if (!initialized || successfulCertIndex < 0)
    {
        return;
    }

    if (successfulServerKey.empty())
    {
        // Lock from a firmware that did not track the server yet: it was
        // successful against the currently configured server, so adopt the key
        // instead of forcing the whole fleet through a fresh sweep after OTA.
        successfulServerKey = serverKey;
        preferences.putString(PREF_SUCCESSFUL_HOST, serverKey);
        logger.infof("Adopted server %s for existing certificate lock", serverKey.c_str());
        return;
    }

    if (successfulServerKey != serverKey)
    {
        logger.infof("API server changed (%s -> %s), clearing certificate lock",
                     successfulServerKey.c_str(), serverKey.c_str());
        this->reset();
    }
}

bool AdaptiveCertManager::markFailure()
{
    if (!initialized)
    {
        logger.error("Not initialized, cannot try next certificate");
        return false;
    }

    const char *failedCertName = getCurrentCertName();

    // A locked certificate is never given up on: the lock only clears via reset().
    // Report the sweep as "exhausted" so the caller applies its regular backoff.
    if (successfulCertIndex >= 0)
    {
        rememberedCertFailureCount++;
        logger.infof("Locked certificate failed: %s (index %d, failure count: %d); keeping it",
                     failedCertName, currentCertIndex, rememberedCertFailureCount);
        return true;
    }

    // Regular iteration through certificates
    logger.infof("Certificate failed during iteration: %s (index %d/%d, attempt %d/%d)",
                 failedCertName, currentCertIndex, CA_CERT_COUNT - 1,
                 currentCertAttemptCount + 1, ATTEMPTS_PER_CERT);

    currentCertAttemptCount++;
    if (currentCertAttemptCount < ATTEMPTS_PER_CERT)
    {
        // Give the same cert another try before moving on.
        return false;
    }

    // Move to next certificate in iteration
    currentCertAttemptCount = 0;
    currentCertIndex++;

    bool exhausted = false;
    if (!isValidCertIndex(currentCertIndex))
    {
        logger.errorf("No more certificates to try (reached index %d, max %d)",
                      currentCertIndex, CA_CERT_COUNT - 1);
        this->reset();
        exhausted = true;
    }

    const char *nextCertName = getCurrentCertName();
    logger.infof("Trying next certificate: %s (index %d/%d)",
                 nextCertName, currentCertIndex, CA_CERT_COUNT - 1);

    return exhausted;
}
