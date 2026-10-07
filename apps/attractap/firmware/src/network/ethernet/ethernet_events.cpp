#include "ethernet.hpp"
#include "platform.hpp"
#include "esp_system.h"
#include "esp_mac.h"
#include "esp_eth_mac_w5500.h"
#include "esp_eth_phy_w5500.h"
#include <string>

void Ethernet::eth_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    uint8_t mac_addr[6] = {0};
    /* we can get the ethernet driver handle from event data */
    esp_eth_handle_t eth_handle = *(esp_eth_handle_t *)event_data;

    switch (event_id)
    {
    case ETHERNET_EVENT_CONNECTED:
        esp_eth_ioctl(eth_handle, ETH_CMD_G_MAC_ADDR, mac_addr);
        logger.info("Ethernet Link Up");
        logger.infof("Ethernet HW Addr %02x:%02x:%02x:%02x:%02x:%02x",
                     mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
        initialization_in_progress = false; // Clear flag on successful connection
        dhcp_start_time = millis();         // Record when we start waiting for DHCP
        logger.info("Waiting for DHCP IP address...");
        setState(ETHERNET_STATE_CONNECTED_WAITING_FOR_IP);
        break;
    case ETHERNET_EVENT_DISCONNECTED:
        logger.info("Ethernet Link Down");
        initialization_in_progress = false; // Clear flag on disconnection
        setState(ETHERNET_STATE_DISCONNECTED);
        break;
    case ETHERNET_EVENT_START:
        logger.info("Ethernet Started");
        break;
    case ETHERNET_EVENT_STOP:
        logger.info("Ethernet Stopped");
        initialization_in_progress = false; // Clear flag when stopped
        setState(ETHERNET_STATE_DISCONNECTED);
        break;
    default:
        break;
    }
}

void Ethernet::got_ip_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    const esp_netif_ip_info_t *ip_info = &event->ip_info;

    logger.info("Ethernet Got IP Address");
    logger.info("~~~~~~~~~~~");
    logger.infof("ETHIP:" IPSTR, IP2STR(&ip_info->ip));
    logger.infof("ETHMASK:" IPSTR, IP2STR(&ip_info->netmask));
    logger.infof("ETHGW:" IPSTR, IP2STR(&ip_info->gw));
    logger.info("~~~~~~~~~~~");

    initialization_in_progress = false; // Clear flag when fully connected
    setState(ETHERNET_STATE_CONNECTED);
}

void Ethernet::setState(EthernetState state)
{
    if (_state != state)
    {
        _state = state;
        logger.infof("State changed to: %d", state);

        State::setEthernetState(state == ETHERNET_STATE_CONNECTED, getIPAddress());
    }
}

esp_ip4_addr_t Ethernet::getIPAddress()
{
    esp_ip4_addr_t ip = {0};

    if (eth_netif != nullptr)
    {
        esp_netif_ip_info_t ip_info;
        if (esp_netif_get_ip_info(eth_netif, &ip_info) == ESP_OK)
        {
            ip = ip_info.ip;
        }
    }

    return ip;
}
