#include "reader_workflow.hpp"

int main(int argc, char **argv)
{
    const bool timeouts = argc > 1 && std::string(argv[1]) == "--timeouts";
    ReaderWorkflow workflow(argc > 1 && !timeouts ? argv[1] : "");
    workflow.testListAndAuthentication();
    workflow.testSessionStart();
    workflow.testUsageStats();
    workflow.testFormsAndLogout();
    workflow.testSupervisionAndCorrelation();
    workflow.testIdentityAndPendingAuthentication();
    if (timeouts) workflow.testTimeouts();
    std::filesystem::remove_all(workflow.storage);
    std::cout << "PASS ATT-880 production application journeys\n";
}
