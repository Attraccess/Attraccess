#pragma once

#include "api_forms_types.hpp"

struct ApiCards : public ApiForms
{
struct CardAuthenticationDetailsResponse
    {
        uint8_t keyNo;
        uint8_t keyBytes[16];
        uint8_t keyLen;
        std::string error;
        std::string username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
        // Two-card supervision (ATT-493). supervisionMode is the resource policy; requiresSupervisor
        // is the server's verdict for this user (true => starting a session requires supervisor
        // approval; authentication itself still unlocks the resource details screen).
        std::string supervisionMode;
        bool requiresSupervisor;
    };

struct SupervisionRequestResult
    {
        bool success = false;
        std::string error;
        uint32_t timeoutMs = 0;
        uint8_t supervisorCount = 0;
        std::string supervisorNames[MAX_INTRODUCERS];
    };

struct SupervisorCardAuthenticationResponse
    {
        uint8_t keyNo = 0;
        uint8_t keyBytes[16] = {0};
        uint8_t keyLen = 0;
        std::string error;
        std::string username;
    };

struct SupervisionResolvedResult
    {
        bool success = false;
        std::string error;
        std::string supervisorUsername;
    };

struct SupervisionStartCommand
    {
        uint32_t resourceId = 0;
        uint32_t timeoutMs = 0;
        std::string requesterUsername;
    };
};
