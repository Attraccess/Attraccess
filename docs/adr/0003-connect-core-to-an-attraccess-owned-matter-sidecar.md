# Connect core to an Attraccess-owned Matter sidecar

The Matter Sidecar will be an Attraccess-owned Node.js/TypeScript service based directly on a validated, pinned matter.js release. Core uses a versioned REST interface for lifecycle and commands and an authenticated WebSocket for events and Commissioning Relay traffic; browsers connect through core rather than directly to the sidecar.

The supported deployment places the sidecar on the same host or a trusted LAN, but the endpoint is configurable and Attraccess will not actively prohibit a securely deployed public endpoint. Operators choosing a remote topology own its TLS, latency, local IPv6, multicast discovery, and Matter reachability constraints.
