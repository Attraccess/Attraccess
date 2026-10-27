// Paginated projects-of-user request and response parsing handlers
// FEATURE: api-projects

#include "../api.hpp"
#include <string>
#include <functional>
#include <mutex>

bool API::requestProjectsOfUser(uint32_t page, const std::string &search)
{
    this->logger.info("Requesting projects of user");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["page"] = page;
    payload["limit"] = MAX_PROJECTS_PER_PAGE;
    if (!search.empty())
    {
        payload["search"] = search;
    }

    uint32_t previousPage;
    uint32_t previousId;
    std::string previousSearch;
    uint32_t requestId;
    {
        std::lock_guard<std::recursive_mutex> lock(this->lastRequestedProjectsOfUserMutex);
        previousPage = this->lastRequestedProjectsOfUserPage;
        previousId = this->lastRequestedProjectsOfUserId;
        previousSearch = this->lastRequestedProjectsOfUserSearch;
        requestId = previousId + 1;
        this->lastRequestedProjectsOfUserPage = page;
        this->lastRequestedProjectsOfUserId = requestId;
        this->lastRequestedProjectsOfUserSearch = search;
    }
    payload["requestId"] = requestId;
    if (this->sendMessage("PROJECTS_OF_USER", payload))
    {
        return true;
    }

    // Nothing was sent, so the previous request's reply is still the one to accept.
    std::lock_guard<std::recursive_mutex> lock(this->lastRequestedProjectsOfUserMutex);
    if (this->lastRequestedProjectsOfUserId == requestId)
    {
        this->lastRequestedProjectsOfUserPage = previousPage;
        this->lastRequestedProjectsOfUserId = previousId;
        this->lastRequestedProjectsOfUserSearch = previousSearch;
    }
    return false;
}

void API::setProjectsOfUserResponseCallback(std::function<void(const ProjectsOfUserResponse &)> callback)
{
    this->projectsOfUserResponseCallback = callback;
}

void API::onProjectsOfUserResponse(JsonObject data)
{
    this->logger.info("Received projects of user response");
    if (this->projectsOfUserResponseCallback == nullptr)
    {
        this->logger.error("Projects of user response callback is not set");
        return;
    }

    // Held until the callback returns, so a newer request cannot slip in between.
    // The LVGL task requests while holding lv_lock, so the callback must not take it.
    std::lock_guard<std::recursive_mutex> lock(this->lastRequestedProjectsOfUserMutex);
    const uint32_t requestedPage = this->lastRequestedProjectsOfUserPage;
    const std::string requestedSearch = this->lastRequestedProjectsOfUserSearch;

    uint32_t receivedPage = data["payload"]["page"].is<uint32_t>() ? data["payload"]["page"].as<uint32_t>() : 0;
    if (receivedPage != requestedPage)
    {
        this->logger.infof("Received projects of user response for page %u, but last requested page was %u", receivedPage, requestedPage);
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    // Servers without search support echo neither the query nor the request ID; keep their results.
    if (payload["requestId"].is<uint32_t>() && payload["requestId"].as<uint32_t>() != this->lastRequestedProjectsOfUserId)
    {
        this->logger.info("Received projects of user response for a superseded request");
        return;
    }
    if (payload["search"].is<const char *>() && requestedSearch != payload["search"].as<const char *>())
    {
        this->logger.info("Received projects of user response for a superseded search");
        return;
    }

    JsonArray arr = payload["projects"].as<JsonArray>();
    if (arr.isNull())
    {
        ProjectsOfUserResponse result;
        result.count = 0;
        result.page = payload["page"].is<uint32_t>() ? payload["page"].as<uint32_t>() : 1;
        result.limit = payload["limit"].is<uint32_t>() ? payload["limit"].as<uint32_t>() : MAX_PROJECTS_PER_PAGE;
        result.total = payload["total"].is<uint32_t>() ? payload["total"].as<uint32_t>() : 0;
        result.hasMore = (result.page * result.limit) < result.total;
        result.search = requestedSearch;
        this->projectsOfUserResponseCallback(result);
        return;
    }

    ProjectsOfUserResponse &result = this->projectsOfUserResponseScratch;
    // Don't use memset here because Project struct contains std::string objects!
    result.count = 0;
    result.page = payload["page"].is<uint32_t>() ? payload["page"].as<uint32_t>() : 1;
    result.limit = payload["limit"].is<uint32_t>() ? payload["limit"].as<uint32_t>() : MAX_PROJECTS_PER_PAGE;
    result.total = payload["total"].is<uint32_t>() ? payload["total"].as<uint32_t>() : 0;

    uint16_t count = 0;
    for (JsonObject resource : arr)
    {
        if (count >= MAX_PROJECTS_PER_PAGE)
        {
            break;
        }

        Project &dst = result.items[count];
        dst.id = resource["id"].is<uint32_t>() ? resource["id"].as<uint32_t>() : 0;
        const char *name = resource["name"].as<const char *>();
        if (name)
        {
            dst.name = name;
        }
        else
        {
            dst.name = "";
        }

        count++;
    }

    result.count = count;
    result.hasMore = (result.page * result.limit) < result.total;
    result.search = requestedSearch;
    this->projectsOfUserResponseCallback(result);
}
