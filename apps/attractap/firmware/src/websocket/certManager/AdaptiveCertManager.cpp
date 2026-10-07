#include "AdaptiveCertManager.hpp"

// Preference keys
const char *AdaptiveCertManager::PREF_NAMESPACE = "cert_mgr";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_CERT = "success_cert";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_CERT_NAME = "success_name";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_HOST = "success_host";

AdaptiveCertManager::AdaptiveCertManager()
    : currentCertIndex(0), currentCertAttemptCount(0), successfulCertIndex(-1), initialized(false), rememberedCertFailureCount(0), logger("AdaptiveCertManager")
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


void AdaptiveCertManager::reset()
{
    currentCertIndex = 0;
    currentCertAttemptCount = 0;
    successfulCertIndex = -1;
    successfulServerKey.clear();
    rememberedCertFailureCount = 0;
    preferences.remove(PREF_SUCCESSFUL_CERT);
    preferences.remove(PREF_SUCCESSFUL_CERT_NAME);
    preferences.remove(PREF_SUCCESSFUL_HOST);
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
