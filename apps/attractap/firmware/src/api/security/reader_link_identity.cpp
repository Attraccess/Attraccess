// Digital Signature identity of ReaderLink (ATT-1207): which key a boot uses, the identity upgrade
// from the P-256 software key to the DS key, and the eFuse report. Plain builds compile only the
// no-op versions at the bottom; nothing of this changes their behaviour.
#include "reader_link.hpp"

#include <cstring>

#include "../../state/state.hpp"
#include "build_profile.hpp"
#include "session_certificates.hpp"

#ifdef ATTRACTAP_SECURE_BUILD
#include "ds_reader_key.hpp"
#include "ds_storage.hpp"
#include "efuse_report.hpp"
#include "efuse_snapshot.hpp"
#include "identity_upgrade.hpp"
#include "nvs_erase_gate.hpp"

namespace
{
    // The DS signature (RSA-3072 on the peripheral) runs on the main loop; it takes well under a second.
    bool signWith(const std::shared_ptr<IReaderKey> &key, const std::vector<uint8_t> &message,
                  std::vector<uint8_t> &signature)
    {
        const DsReaderKey *ds = static_cast<const DsReaderKey *>(key.get());
        return ds->signPss(message, signature);
    }
}

bool ReaderLink::selectSecureIdentity()
{
    dsKey.reset();
    softwareKey.reset();
    upgradeCandidate = false;
    usingDsKey = false;
    if (!NvsEraseGate::initialized())
    {
        State::setSessionProblem(State::SESSION_PROBLEM_STORAGE_FAILED);
        return false;
    }
    const DsReaderKeyStore::Status status = DsReaderKeyStore::status();
    const char *statusText = DsReaderKeyStore::statusName(status);
    logger.infof("DS identity: %s", statusText);
    if (status != DsReaderKeyStore::Status::Available)
    {
        // "DS params missing" falls back to the software identity; KEY3 is never burned again.
        return false;
    }
    dsKey = DsReaderKeyStore().load();
    if (!dsKey)
    {
        return false;
    }
    softwareKey = keyStore.load();
#ifdef ATTRACTAP_TEST_HOOKS
    if (CredentialStore::consumeForceSoftwareIdentity())
    {
        // HIL: pair with a fresh P-256 key although the DS key exists, so the upgrade can run again.
        logger.info("Test hook: pairing with a fresh P-256 key");
        softwareKey = keyStore.createNew();
        credentials = CredentialStore::load();
        key = softwareKey;
        // Once this pairing has its certificate, the next session runs the identity upgrade again.
        upgradeCandidate = key != nullptr;
        return key != nullptr;
    }
#endif
    if (!credentials.paired())
    {
        key = dsKey;
        usingDsKey = true;
        return true;
    }
    std::vector<uint8_t> certificateSpki;
    if (credentials.hasCertificate() && SessionCertificates::certificateSpki(credentials.certificate, certificateSpki))
    {
        if (certificateSpki == dsKey->publicKeySpki())
        {
            key = dsKey;
        }
        else if (softwareKey && certificateSpki == softwareKey->publicKeySpki())
        {
            key = softwareKey;
            upgradeCandidate = true;
        }
    }
    if (!key)
    {
        // Paired but no certificate yet (or an unknown one): the recorded kind decides, software by default.
        const bool ds = CredentialStore::identityKind() == CredentialStore::IdentityKind::Ds || !softwareKey;
        key = ds ? dsKey : softwareKey;
        upgradeCandidate = !ds && credentials.hasCertificate();
    }
    usingDsKey = key == dsKey;
    return true;
}

bool ReaderLink::newSecureIdentity()
{
    if (!dsKey)
    {
        return false;
    }
    // A DS reader pairs again with its DS key; there is nothing to create.
    CredentialStore::clearPairing();
    credentials = CredentialStore::load();
    key = dsKey;
    usingDsKey = true;
    upgradeCandidate = false;
    logger.info("Re-pairing with the DS key");
    return true;
}

bool ReaderLink::sendControl(const std::string &json)
{
    if (!sessionReady.load())
    {
        return false;
    }
    std::lock_guard<std::mutex> lock(sessionMutex);
    if (!tls.sendFrame(SessionFraming::FrameType::CONTROL, reinterpret_cast<const uint8_t *>(json.data()),
                       json.size()))
    {
        return false;
    }
    if (flushOutbox())
    {
        return true;
    }
    closeSessionLocked();
    socket.forceReconnect("session send failed");
    return false;
}

void ReaderLink::resetSessionIdentityState()
{
    upgradeRequested = false;
    upgradeProofSent = false;
    efuseReportSent = false;
}

void ReaderLink::startIdentityUpgrade()
{
    if (!upgradeCandidate || upgradeRequested || upgradeBlocked || !dsKey || !key || key == dsKey ||
        !credentials.hasCertificate() || !NvsEraseGate::initialized())
    {
        return;
    }
    upgradeRequested = true;
    logger.info("Requesting the identity upgrade to the DS key");
    sendControl(IdentityUpgrade::requestMessage());
}

void ReaderLink::onIdentityChallenge(const std::string &nonceBase64)
{
    if (!upgradeRequested || upgradeProofSent || !dsKey || !key || key == dsKey)
    {
        return;
    }
    IdentityUpgrade::Context context;
    context.installationId = credentials.installationId;
    context.readerId = credentials.readerId;
    context.oldSpki = key->publicKeySpki();
    context.newSpki = dsKey->publicKeySpki();
    const std::shared_ptr<IReaderKey> signer = dsKey;
    context.sign = [signer](const std::vector<uint8_t> &message, std::vector<uint8_t> &signature) {
        return signWith(signer, message, signature);
    };
    std::string message;
    if (!IdentityUpgrade::upgradeMessage(context, nonceBase64, message))
    {
        logger.error("Identity upgrade: could not build the proof");
        return;
    }
    upgradeProofSent = true;
    sendControl(message);
}

void ReaderLink::onIdentityUpgraded(const char *certificatePem)
{
    std::vector<uint8_t> certificate;
    if (!upgradeProofSent || !dsKey ||
        !SessionCertificates::pemToDer(certificatePem, certificate) ||
        !SessionCertificates::isReaderCertificate(certificate, dsKey->publicKeySpki(), credentials.caSpki,
                                                  credentials.readerId))
    {
        logger.error("Identity upgrade: the certificate is invalid");
        return;
    }
    // Stored BEFORE reconnecting with the DS key. The software key stays until a DS session worked.
    if (!CredentialStore::saveUpgradedCertificate(certificate))
    {
        logger.error("Identity upgrade: could not store the certificate");
        return;
    }
    credentials.certificate = certificate;
    upgradeCandidate = false;
    upgradeProofSent = false;
    logger.info("Identity upgraded; reconnecting with the DS key");
    sessionEpoch++;
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        closeSessionLocked();
        outbox.clear();
    }
    key = dsKey;
    usingDsKey = true;
    socket.forceReconnect("identity upgraded");
}

void ReaderLink::onIdentityRejected(const char *reason)
{
    // Keep the P-256 identity. The reason is a short code from the server; bound it anyway.
    logger.errorf("Identity upgrade rejected: %.32s", reason);
    upgradeProofSent = false;
    if (strcmp(reason, "not-allowed") == 0)
    {
        upgradeBlocked = true;
    }
}

void ReaderLink::onDsSessionConfirmed()
{
    if (softwareKeyDropped || !key || key != dsKey)
    {
        return;
    }
    softwareKeyDropped = true;
    // A DS session worked: the P-256 software key is not needed any more.
    if (softwareKey)
    {
        keyStore.erase();
        softwareKey.reset();
        logger.info("Software key removed after a successful DS session");
    }
}

void ReaderLink::sendEfuseReportAfter(const char *message, size_t length)
{
    if (efuseReportSent || !message || length < 20)
    {
        return;
    }
    static const char NEEDLE[] = "READER_FIRMWARE_INFO";
    bool found = false;
    for (size_t i = 0; !found && i + sizeof(NEEDLE) - 1 <= length; i++)
    {
        found = memcmp(message + i, NEEDLE, sizeof(NEEDLE) - 1) == 0;
    }
    if (!found)
    {
        return;
    }
    efuseReportSent = true;
    std::string json;
    if (!EfuseReport::toJson(EfuseSnapshot::read(), json))
    {
        logger.error("eFuse report too large");
        return;
    }
    sendControl(json);
}

#else // plain builds: the software key is the only identity

bool ReaderLink::selectSecureIdentity()
{
    return false;
}
bool ReaderLink::newSecureIdentity()
{
    return false;
}
bool ReaderLink::sendControl(const std::string &)
{
    return false;
}
void ReaderLink::resetSessionIdentityState() {}
void ReaderLink::startIdentityUpgrade() {}
void ReaderLink::onIdentityChallenge(const std::string &) {}
void ReaderLink::onIdentityUpgraded(const char *) {}
void ReaderLink::onIdentityRejected(const char *) {}
void ReaderLink::onDsSessionConfirmed() {}
void ReaderLink::sendEfuseReportAfter(const char *, size_t) {}

#endif
