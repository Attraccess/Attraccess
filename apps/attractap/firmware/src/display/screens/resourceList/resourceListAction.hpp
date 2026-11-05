#pragma once

#include "../../../api/api.hpp"
#include <cstring>

enum class ResourceListAction { None, Start, Stop, OpenDoor, Supervision, Takeover };

// Callers only pass a list personalised for `username` (authenticatedUsername matches), so a known
// access state means the list's own-session info belongs to this card.
inline ResourceListAction resourceListAction(const API::ResourceBrief &resource, const std::string &username) {
    if (username.empty() || !resource.accessKnown) return ResourceListAction::None;
    const bool ownsUsage = resource.isOwnedBy(username, true);
    if (resource.type == 0 && ownsUsage) return ResourceListAction::Stop;
    const bool maintainer = resource.isIntroducer || resource.canManageResource;
    if ((resource.isUnderMaintenance || !resource.isHealthy) && !resource.canManageMaintenance) return ResourceListAction::None;
    const bool canUse = resource.hasIntroduction || maintainer;
    if (resource.type == 1) return canUse ? ResourceListAction::OpenDoor : ResourceListAction::None;
    if (resource.isMultiSession()) {
        // Several people may use the machine: no takeover, a start needs a free slot and no session of one's own.
        if (!resource.canStart) return ResourceListAction::None;
    } else if (resource.hasActiveUsage) {
        // Taking over or stopping another user's usage stays explicit in details.
        return canUse && resource.allowTakeOver ? ResourceListAction::Takeover : ResourceListAction::None;
    }
    if (resource.requiresSupervisor) return ResourceListAction::Supervision;
    return canUse ? ResourceListAction::Start : ResourceListAction::None;
}
