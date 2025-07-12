#ifndef TYPES_H
#define TYPES_H

#include <Arduino.h>

struct ResourceUser
{
    String id;
    String username;
};

struct UsageSession
{
    String startTime;
    String endTime;
    ResourceUser user;
};

struct Resource
{
    String id;
    String name;
};

#endif // TYPES_H