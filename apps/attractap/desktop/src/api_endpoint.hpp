#pragma once

#include <cstdint>
#include <string>

struct ApiEndpoint
{
    std::string hostname;
    uint16_t port;
    bool useSSL;
};

ApiEndpoint parseApiEndpoint(const std::string &endpoint);
