#include "AdaptiveCertManager.hpp"

// Preference keys
const char *AdaptiveCertManager::PREF_NAMESPACE = "cert_mgr";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_CERT = "success_cert";

// Global instance
AdaptiveCertManager adaptiveCertManager;

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

    // If we have a remembered successful certificate, start with that
    if (successfulCertIndex >= 0 && isValidCertIndex(successfulCertIndex))
    {
        // Only use remembered cert if we haven't failed too many times
        if (rememberedCertFailureCount < 5)
        {
            currentCertIndex = successfulCertIndex;
            logger.infof("Using remembered certificate (index %d, failure count: %d/5)",
                         currentCertIndex, rememberedCertFailureCount);
        }
        else
        {
            // Too many failures, start iterating from beginning
            currentCertIndex = 0;
            rememberedCertFailureCount = 0; // Reset counter for fresh iteration
            logger.info("Remembered certificate failed too many times, starting fresh iteration");
        }
    }
    else
    {
        // No remembered certificate, start with first certificate
        logger.info("No remembered certificate found, starting fresh search");
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
    *certData = (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].data);

    // Yield to prevent watchdog timeout when accessing PROGMEM
    yield();

    if (certName)
    {
        logger.debug("Writing cert name to pointer");
        *certName = (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].name);
        yield(); // Yield after accessing PROGMEM
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

void AdaptiveCertManager::markFailure()
{
    if (!initialized)
    {
        logger.error("Not initialized, cannot try next certificate");
        return;
    }

    const char *failedCertName = getCurrentCertName();

    // Check if the failed certificate is the remembered one
    if (successfulCertIndex >= 0 && currentCertIndex == successfulCertIndex)
    {
        rememberedCertFailureCount++;
        logger.infof("Remembered certificate failed: %s (index %d/%d, failure count: %d/5)",
                     failedCertName, currentCertIndex, CA_CERT_COUNT - 1, rememberedCertFailureCount);

        // If we haven't hit the failure limit, retry the same certificate
        if (rememberedCertFailureCount < 5)
        {
            logger.infof("Will retry remembered certificate (attempt %d/5)",
                         rememberedCertFailureCount + 1);
            return; // Don't increment currentCertIndex, retry same cert
        }
        else
        {
            // Hit failure limit, start fresh iteration
            logger.info("Remembered certificate failed too many times, starting fresh iteration");
            this->reset();
            // Continue to regular iteration logic below
        }
    }
    else
    {
        // Regular iteration through certificates
        logger.infof("Certificate failed during iteration: %s (index %d/%d)",
                     failedCertName, currentCertIndex, CA_CERT_COUNT - 1);
    }

    // Move to next certificate in iteration
    currentCertIndex++;

    if (!isValidCertIndex(currentCertIndex))
    {
        logger.errorf("No more certificates to try (reached index %d, max %d)",
                      currentCertIndex, CA_CERT_COUNT - 1);
        this->reset();
    }

    const char *nextCertName = getCurrentCertName();
    logger.infof("Trying next certificate: %s (index %d/%d)",
                 nextCertName, currentCertIndex, CA_CERT_COUNT - 1);
}

void AdaptiveCertManager::reset()
{
    currentCertIndex = 0;
    successfulCertIndex = -1;
    rememberedCertFailureCount = 0;
    preferences.remove(PREF_SUCCESSFUL_CERT);
    logger.info("Reset to first certificate");
}

const char *AdaptiveCertManager::getCurrentCertName() const
{
    if (!isValidCertIndex(currentCertIndex))
    {
        return "Invalid";
    }

    const char *name = (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].name);
    yield(); // Yield after accessing PROGMEM
    return name;
}

int AdaptiveCertManager::getCurrentCertIndex() const
{
    return currentCertIndex;
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

    if (successfulCertIndex >= 0)
    {
        logger.infof("Found remembered certificate: index %d", successfulCertIndex);
    }
    else
    {
        logger.info("No remembered certificate found");
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
