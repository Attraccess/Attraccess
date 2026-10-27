// Paginated projects-of-user request and response parsing handlers
// FEATURE: api-projects

#include "../api.hpp"
#include <string>
#include <functional>
#include <mutex>

void API::requestProjectsOfUser(uint32_t page, const std::string &search)
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
    {
        std::lock_guard<std::mutex> lock(this->lastRequestedProjectsOfUserMutex);
        this->lastRequestedProjectsOfUserPage = page;
        this->lastRequestedProjectsOfUserSearch = search;
    }
    this->sendMessage("PROJECTS_OF_USER", payload);
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

    uint32_t receivedPage = data["payload"]["page"].is<uint32_t>() ? data["payload"]["page"].as<uint32_t>() : 0;
    uint32_t requestedPage;
    std::string requestedSearch;
    {
        std::lock_guard<std::mutex> lock(this->lastRequestedProjectsOfUserMutex);
        requestedPage = this->lastRequestedProjectsOfUserPage;
        requestedSearch = this->lastRequestedProjectsOfUserSearch;
    }

    if (receivedPage != requestedPage)
    {
        this->logger.infof("Received projects of user response for page %u, but last requested page was %u", receivedPage, requestedPage);
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    // Servers without search support do not echo the query; keep their results.
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
