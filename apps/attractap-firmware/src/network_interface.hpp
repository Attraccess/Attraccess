#pragma once

#include <IPAddress.h>
#include <Client.h>

class NetworkInterface
{
public:
    virtual void setup() = 0;
    virtual bool isHealthy() = 0;
    virtual void loop() = 0;
    virtual IPAddress getCurrentIp() = 0;
    virtual void end() = 0;
    virtual Client &getClient() = 0;
};