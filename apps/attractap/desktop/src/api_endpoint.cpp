#include "api_endpoint.hpp"

#include <algorithm>
#include <stdexcept>

namespace
{
uint16_t parsePort(const std::string &value)
{
    if (value.empty() || !std::all_of(value.begin(), value.end(), [](unsigned char character) { return character >= '0' && character <= '9'; }))
        throw std::invalid_argument("Reader endpoint port must be a number");

    unsigned long port = 0;
    for (const char character : value)
    {
        port = port * 10 + static_cast<unsigned long>(character - '0');
        if (port > 65535)
            throw std::invalid_argument("Reader endpoint port must be between 1 and 65535");
    }
    if (port == 0)
        throw std::invalid_argument("Reader endpoint port must be between 1 and 65535");
    return static_cast<uint16_t>(port);
}
}

ApiEndpoint parseApiEndpoint(const std::string &endpoint)
{
    const auto schemeEnd = endpoint.find("://");
    const std::string scheme = schemeEnd == std::string::npos ? "https" : endpoint.substr(0, schemeEnd);
    const bool useSSL = scheme == "https" || scheme == "wss";
    if (!useSSL && scheme != "http" && scheme != "ws")
        throw std::invalid_argument("Reader endpoint must use http, https, ws, or wss");

    const size_t authorityStart = schemeEnd == std::string::npos ? 0 : schemeEnd + 3;
    const size_t authorityEnd = endpoint.find_first_of("/?#", authorityStart);
    const std::string authority = endpoint.substr(authorityStart, authorityEnd - authorityStart);
    if (authority.empty() || authority.find('@') != std::string::npos)
        throw std::invalid_argument("Reader endpoint must contain a host and no credentials");

    std::string hostname;
    std::string portText;
    bool hasPort = false;
    if (authority.front() == '[')
    {
        const size_t closingBracket = authority.find(']');
        if (closingBracket == std::string::npos || closingBracket == 1)
            throw std::invalid_argument("Reader endpoint has an invalid IPv6 host");
        hostname = authority.substr(0, closingBracket + 1);
        if (closingBracket + 1 < authority.size())
        {
            if (authority[closingBracket + 1] != ':')
                throw std::invalid_argument("Reader endpoint has an invalid IPv6 authority");
            portText = authority.substr(closingBracket + 2);
            hasPort = true;
        }
    }
    else
    {
        const size_t separator = authority.find(':');
        if (separator != std::string::npos)
        {
            if (authority.find(':', separator + 1) != std::string::npos)
                throw std::invalid_argument("Reader endpoint IPv6 hosts must be bracketed");
            hostname = authority.substr(0, separator);
            portText = authority.substr(separator + 1);
            hasPort = true;
        }
        else
            hostname = authority;
    }
    if (hostname.empty())
        throw std::invalid_argument("Reader endpoint must contain a host");

    return {std::move(hostname), hasPort ? parsePort(portText) : static_cast<uint16_t>(useSSL ? 443 : 80), useSSL};
}
