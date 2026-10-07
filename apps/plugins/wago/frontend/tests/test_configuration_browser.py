import unittest
from configuration_browser_fixture import ConfigurationBrowserFixture
from configuration_isolation_contract import IsolationContract
from configuration_modbus_cases import ConfigurationModbusCases
from configuration_setup_cases import ConfigurationSetupCases
from configuration_publication_cases import ConfigurationPublicationCases

class ConfigurationBrowser(ConfigurationBrowserFixture, ConfigurationModbusCases, ConfigurationSetupCases, ConfigurationPublicationCases):
    pass

class MobileConfigurationBrowser(ConfigurationBrowser):
    viewport = {"width": 390, "height": 844}



if __name__ == "__main__":
    unittest.main(verbosity=2)
