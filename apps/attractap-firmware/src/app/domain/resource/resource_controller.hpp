#pragma once

#include <stdint.h>

class ResourceController {
public:
  struct ResourceAvailabilityDecision {
    bool shouldShowNoResources = false;
    bool shouldAutoSelectSingleResource = false;
    bool shouldUpdateResourceListUi = false;
    bool shouldShowResourceList = false;
    bool shouldReturnEarly = false;
  };

  ResourceAvailabilityDecision
  evaluateResourceAvailability(uint8_t resourceCount, bool resourceIsSelected,
                               bool resourceListUpdated,
                               bool currentlyNoResources,
                               bool currentlyResourceList) const {
    ResourceAvailabilityDecision d;

    if (resourceCount == 0) {
      if (currentlyNoResources) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldShowNoResources = true;
      return d;
    }

    if (resourceCount == 1 && !resourceIsSelected) {
      d.shouldAutoSelectSingleResource = true;
      return d;
    }

    if (resourceCount > 0 && !resourceIsSelected) {
      d.shouldUpdateResourceListUi = resourceListUpdated;
      if (currentlyResourceList) {
        d.shouldReturnEarly = true;
        return d;
      }
      d.shouldShowResourceList = true;
      return d;
    }

    return d;
  }
};
