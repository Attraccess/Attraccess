#pragma once

#include "api/api.hpp"
#include <cstring>

enum class ResourceListAction { None, Start, Stop, OpenDoor, Supervision, Takeover };

inline ResourceListAction resourceListAction(const API::ResourceBrief &resource, const std::string &username) {
    if (username.empty() || !resource.accessKnown) return ResourceListAction::None;
    const bool ownsUsage = resource.hasActiveUsage && username == resource.activeUser;
    if (resource.type == 0 && ownsUsage) return ResourceListAction::Stop;
    const bool maintainer = resource.isIntroducer || resource.canManageResource;
    if ((resource.isUnderMaintenance || !resource.isHealthy) && !resource.canManageMaintenance) return ResourceListAction::None;
    const bool canUse = resource.hasIntroduction || maintainer;
    if (resource.type == 1) return canUse ? ResourceListAction::OpenDoor : ResourceListAction::None;
    if (resource.hasActiveUsage) {
        // Taking over or stopping another user's usage stays explicit in details.
        return canUse && resource.allowTakeOver ? ResourceListAction::Takeover : ResourceListAction::None;
    }
    if (resource.requiresSupervisor) return ResourceListAction::Supervision;
    return canUse ? ResourceListAction::Start : ResourceListAction::None;
}
