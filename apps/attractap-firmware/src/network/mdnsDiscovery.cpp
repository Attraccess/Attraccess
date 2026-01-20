#include "mdnsDiscovery.hpp"

Logger MdnsDiscovery::logger("MdnsDiscovery");
bool MdnsDiscovery::started = false;
bool MdnsDiscovery::discovered = false;
uint32_t MdnsDiscovery::lastQueryMs = 0;
const uint32_t MdnsDiscovery::QUERY_INTERVAL_MS = 15000;

void MdnsDiscovery::setup()
{
    // No-op for now; discovery is driven from loop()
}

bool MdnsDiscovery::parseTxtBool(const String &value)
{
    if (value.length() == 0)
    {
        return false;
    }
    String normalized = value;
    normalized.toLowerCase();
    return normalized == "1" || normalized == "true" || normalized == "yes";
}

bool MdnsDiscovery::parseUrl(const String &url, String &hostOut, uint16_t &portOut, bool &sslOut)
{
    if (url.length() == 0)
    {
        return false;
    }

    String working = url;
    sslOut = false;

    if (working.startsWith("https://"))
    {
        sslOut = true;
        working.remove(0, 8);
    }
    else if (working.startsWith("http://"))
    {
        sslOut = false;
        working.remove(0, 7);
    }
    else
    {
        return false;
    }

    int slashIndex = working.indexOf('/');
    if (slashIndex >= 0)
    {
        working = working.substring(0, slashIndex);
    }

    int colonIndex = working.indexOf(':');
    if (colonIndex >= 0)
    {
        hostOut = working.substring(0, colonIndex);
        String portStr = working.substring(colonIndex + 1);
        long parsedPort = portStr.toInt();
        if (parsedPort > 0 && parsedPort <= 65535)
        {
            portOut = static_cast<uint16_t>(parsedPort);
        }
    }
    else
    {
        hostOut = working;
    }

    return hostOut.length() > 0;
}

String MdnsDiscovery::normalizeHostname(const String &hostname)
{
    if (hostname.length() == 0)
    {
        return hostname;
    }

    // If it's already an IP address or contains a dot, keep as-is.
    if (hostname.indexOf('.') >= 0)
    {
        return hostname;
    }

    return hostname + ".local";
}

bool MdnsDiscovery::ensureStarted()
{
    if (started)
    {
        return true;
    }

    String hostname = Settings::getHostname();
    if (hostname.length() == 0)
    {
        logger.error("Cannot start mDNS: hostname not available");
        return false;
    }

    bool ok = MDNS.begin(hostname.c_str());
    if (!ok)
    {
        logger.warn("Failed to start mDNS responder");
        return false;
    }

    started = true;
    logger.infof("mDNS responder started as %s", hostname.c_str());
    return true;
}

bool MdnsDiscovery::shouldAttemptDiscovery()
{
    AttraccessApiConfig config = Settings::getAttraccessApiConfig();
    bool configured = !config.hostname.isEmpty() && config.port > 0;
    if (configured)
    {
        discovered = true;
        return false;
    }

    discovered = false;

    State::NetworkState networkState = State::getNetworkState();
    if (!networkState.wifi_connected && !networkState.ethernet_connected)
    {
        return false;
    }

    uint32_t now = millis();
    if (now - lastQueryMs < QUERY_INTERVAL_MS)
    {
        return false;
    }

    return true;
}

void MdnsDiscovery::loop()
{
    if (!shouldAttemptDiscovery())
    {
        return;
    }

    if (!ensureStarted())
    {
        return;
    }

    lastQueryMs = millis();

    logger.info("Searching for Attraccess API via mDNS...");
    int serviceCount = MDNS.queryService("attraccess", "tcp");
    if (serviceCount <= 0)
    {
        logger.debug("No Attraccess services found via mDNS");
        return;
    }

    for (int i = 0; i < serviceCount; ++i)
    {
        String txtScheme = MDNS.txt(i, "scheme");
        String txtSsl = MDNS.txt(i, "ssl");
        String txtHostname = MDNS.txt(i, "hostname");
        String txtBaseUrl = MDNS.txt(i, "baseUrl");
        String txtSelfSigned = MDNS.txt(i, "selfSigned");

        bool useSSL = false;
        if (txtSsl.length() > 0)
        {
            useSSL = parseTxtBool(txtSsl);
        }
        else if (txtScheme == "https")
        {
            useSSL = true;
        }

        uint16_t port = MDNS.port(i);
        String hostname = "";

        String parsedHost = "";
        uint16_t parsedPort = 0;
        bool parsedSsl = false;
        if (parseUrl(txtBaseUrl, parsedHost, parsedPort, parsedSsl))
        {
            hostname = parsedHost;
            if (parsedPort > 0)
            {
                port = parsedPort;
            }
            if (txtSsl.length() == 0 && txtScheme.length() == 0)
            {
                useSSL = parsedSsl;
            }
        }

        if (hostname.length() == 0 && txtHostname.length() > 0)
        {
            hostname = txtHostname;
        }

        if (hostname.length() == 0)
        {
            String mdnsHost = MDNS.hostname(i);
            hostname = normalizeHostname(mdnsHost);
        }

        if (hostname.length() == 0)
        {
            hostname = MDNS.IP(i).toString();
        }

        if (port == 0)
        {
            port = useSSL ? 443 : 80;
        }

        if (hostname.length() == 0 || port == 0)
        {
            logger.warn("Discovered mDNS entry without valid host/port, skipping");
            continue;
        }

        if (useSSL && parseTxtBool(txtSelfSigned))
        {
            logger.warn("Discovered API uses self-signed TLS; connection may fail without trusted cert");
        }

        Settings::saveAttraccessApiConfig(hostname, port, useSSL);
        discovered = true;
        logger.infof("Discovered Attraccess API at %s:%u (ssl=%d)", hostname.c_str(), port, useSSL);
        return;
    }
}
