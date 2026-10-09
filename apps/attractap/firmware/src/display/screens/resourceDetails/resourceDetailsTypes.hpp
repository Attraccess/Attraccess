#pragma once
#include "../../../api/api.hpp"
#include <string>
class ResourceDetailsScreen;

struct ResourceDetailsTypes
{
enum resource_type_t
    {
        RESOURCE_TYPE_MACHINE,
        RESOURCE_TYPE_DOOR,
    };

enum button_click_type_t
    {
        BUTTON_CLICK_TYPE_START_SESSION,
        BUTTON_CLICK_TYPE_STOP_SESSION,
        BUTTON_CLICK_TYPE_LOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLATCH_DOOR,
        BUTTON_CLICK_TYPE_FLOW_BUTTON,
        BUTTON_CLICK_TYPE_LOGOUT,
        BUTTON_CLICK_TYPE_BACK,
    };

struct UserDetails
    {
        std::string username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
        bool requiresSupervisor;
    };

struct ButtonClickEventData
    {
        ResourceDetailsScreen *self;
        button_click_type_t buttonClickType;
        char flowButtonId[API::MAX_FLOW_BUTTON_ID_LEN]; // valid when buttonClickType == BUTTON_CLICK_TYPE_FLOW_BUTTON
    };
};
