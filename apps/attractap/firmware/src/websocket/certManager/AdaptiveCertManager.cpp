#include "AdaptiveCertManager.hpp"

// Preference keys
const char *AdaptiveCertManager::PREF_NAMESPACE = "cert_mgr";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_CERT = "success_cert";

AdaptiveCertManager::AdaptiveCertManager()
    : currentCertIndex(0), successfulCertIndex(-1), initialized(false), rememberedCertFailureCount(0), logger("AdaptiveCertManager")
{
}

AdaptiveCertManager::~AdaptiveCertManager()
{
    if (initialized)
    {
        preferences.end();
    }
}

bool AdaptiveCertManager::begin()
{
    if (initialized)
    {
        return true;
    }

    bool success = preferences.begin(PREF_NAMESPACE, false);
    if (success)
    {
        initialized = true;
        logger.infof("Initialized with namespace '%s'", PREF_NAMESPACE);

        loadSuccessfulCertIndexFromPreferences();
    }
    else
    {
        logger.errorf("Failed to initialize preferences with namespace '%s'", PREF_NAMESPACE);
    }

    return success;
}

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

void AdaptiveCertManager::markSuccess()
{
    if (!initialized)
    {
        return;
    }

    const char *certName = getCurrentCertName();
    logger.infof("Certificate successful: %s (index %d)",
                 certName, currentCertIndex);

    successfulCertIndex = currentCertIndex;
    rememberedCertFailureCount = 0; // Reset failure counter on success

    saveSuccessfulCertIndexToPreferences(currentCertIndex);
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
    logger.infof("Certificate failed during iteration: %s (index %d/%d)",
                 failedCertName, currentCertIndex, CA_CERT_COUNT - 1);

    // Move to next certificate in iteration
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

void AdaptiveCertManager::reset()
{
    currentCertIndex = 0;
    successfulCertIndex = -1;
    rememberedCertFailureCount = 0;
    preferences.remove(PREF_SUCCESSFUL_CERT);
    logger.info("Certificate lock cleared, reset to first certificate");
}

bool AdaptiveCertManager::isLocked() const
{
    return successfulCertIndex >= 0;
}

const char *AdaptiveCertManager::getCurrentCertName() const
{
    if (!isValidCertIndex(currentCertIndex))
    {
        return "Invalid";
    }

    return ca_certificates[currentCertIndex].name;
}

int AdaptiveCertManager::getCurrentCertIndex() const
{
    return currentCertIndex;
}

int AdaptiveCertManager::getCertCount() const
{
    return CA_CERT_COUNT;
}

int AdaptiveCertManager::getRememberedFailureCount() const
{
    return rememberedCertFailureCount;
}

void AdaptiveCertManager::loadSuccessfulCertIndexFromPreferences()
{
    if (!initialized)
    {
        logger.error("Cannot load - not initialized");
        return;
    }

    logger.info("Loading certificate");

    successfulCertIndex = preferences.getInt(PREF_SUCCESSFUL_CERT, -1);

    // Sanitize here, the only place a locked index enters: a firmware update may
    // have shrunk the CA list, and an out-of-range lock would otherwise be kept
    // forever (markFailure never unlocks). Drop it and sweep fresh instead.
    if (successfulCertIndex >= 0 && !isValidCertIndex(successfulCertIndex))
    {
        logger.errorf("Stored certificate index %d is out of range (max %d), clearing lock",
                      successfulCertIndex, CA_CERT_COUNT - 1);
        this->reset();
        return;
    }

    if (successfulCertIndex >= 0)
    {
        logger.infof("Found locked certificate: index %d", successfulCertIndex);
    }
    else
    {
        logger.info("No locked certificate found");
    }
}

void AdaptiveCertManager::saveSuccessfulCertIndexToPreferences(int certIndex)
{
    if (!initialized || !isValidCertIndex(certIndex))
    {
        logger.errorf("Cannot save - initialized:%d, validIndex:%d",
                      initialized, isValidCertIndex(certIndex));
        return;
    }

    logger.infof("Saving certificate, index %d", certIndex);

    size_t bytesWritten = preferences.putInt(PREF_SUCCESSFUL_CERT, certIndex);

    if (bytesWritten > 0)
    {
        logger.infof("Successfully saved certificate: index %d (%d bytes)",
                     certIndex, bytesWritten);
    }
    else
    {
        logger.errorf("ERROR - Failed to save certificate: index %d",
                      certIndex);
    }
}

bool AdaptiveCertManager::isValidCertIndex(int index) const
{
    logger.debugf("isValidCertIndex: %d", index);
    return index >= 0 && index < CA_CERT_COUNT;
}
