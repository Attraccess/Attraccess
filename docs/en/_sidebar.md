- [Home](home.md)

- **Getting Started**
  - [Overview](getting-started/overview.md)
  - [System Requirements](getting-started/requirements.md)
  - [Quick Start](getting-started/quick-start.md)

- **Installation**
  - [Docker Compose](installation/docker-compose.md)
  - [Portainer](installation/portainer.md)
  - [Environment Variables](installation/environment-variables.md)
  - [SSL Setup](installation/ssl-setup.md)
  - [Updating](installation/updating.md)
  - [Backup & Restore](installation/backup-restore.md)

- **First-Time Setup**
  - [Setup Wizard](setup/first-time-setup.md)
  - [Email / SMTP](setup/smtp-email.md)
  - [Email Templates](setup/email-templates.md)
  - [Branding](setup/branding.md)

- **User Management**
  - [Overview](user-management/overview.md)
  - [Creating Users](user-management/creating-users.md)
  - [Permissions](user-management/permissions.md)
  - [SSO Overview](user-management/sso-overview.md)
  - [OIDC Setup](user-management/sso-oidc.md)
  - [SAML Setup](user-management/sso-saml.md)
  - [Two-Factor Authentication](user-management/two-factor-auth.md)

- **Resources**
  - [Overview](resources/overview.md)
  - [Creating Resources](resources/creating-resources.md)
  - [Detail Page](resources/resource-details.md)
  - [Groups](resources/resource-groups.md)
  - [Documentation](resources/documentation.md)
  - [Introductions](resources/introductions.md)
  - [Maintenance](resources/maintenance.md)
  - [Usage Tracking](resources/usage-tracking.md)
  - [CSV Export](resources/csv-export.md)

- **Flows & Automation**
  - [Overview](flows/overview.md)
  - [Flow Editor](flows/flow-editor.md)
  - [Payloads, Variables & Templates](flows/payloads-variables-templates.md)
  - [Global Flows](flows/global-flows.md)
  - [Node Types](flows/node-types.md)
  - [Meters](flows/energy-metering.md)

- **Forms**
  - [Overview](forms/overview.md)
  - [Creating Forms](forms/creating-forms.md)

- **Projects**
  - [Overview](projects/overview.md)
  - [Creating Projects](projects/creating-projects.md)
  - [Team Management](projects/team-management.md)

- **Attractap RFID Reader**
  - [Overview](attractap/overview.md)
  - [Using the Reader](attractap/using-the-reader.md)
  - [Hardware](attractap/hardware.md)
  - [Setup](attractap/setup.md)
  - [Reader Pairing](attractap/pairing.md)
  - [RFID Cards](attractap/rfid-cards.md)
  - [Firmware Updates](attractap/firmware-updates.md)
  - [Reader Security](attractap/reader-security.md)
  - [Reader Display](attractap/reader-ui.md)
  - [LED Guide (Lite)](attractap/led-guide.md)

- **Hardware**
  - [Waveshare ESP32-S3-Touch-LCD-4 (Touch V1, V2)](hardware/waveshare-esp32-s3-touch-lcd-4.md)
  - **Attractap Touch P4 (in development)**
    - [Overview](hardware/touch-p4/overview.md)
    - [Specification](hardware/touch-p4/spec.md)
    - [Case](hardware/touch-p4/case.md)
    - [Installation Manual](hardware/touch-p4/installation-manual.md)
    - **Development**
      - [Working on the Board](hardware/touch-p4/development.md)
      - [Design](hardware/touch-p4/design-notes.md)
      - [Known Limitations](hardware/touch-p4/limitations.md)
      - [Design Standards and Review Criteria](hardware/touch-p4/review.md)
      - [Parts and Sourcing](hardware/touch-p4/parts.md)
      - [Pin Map and Firmware Port](hardware/touch-p4/firmware-port.md)
      - [Simulations](hardware/touch-p4/simulations.md)
      - [Bring-up Plan](hardware/touch-p4/bring-up.md)
      - [CE and Market Checklist](hardware/touch-p4/compliance.md)

- **Devices**
  - [MQTT](devices/mqtt/overview.md)
  - [MQTT Server Setup](devices/mqtt/server-setup.md)
  - [MQTT Message Explorer](devices/mqtt/message-explorer.md)
  - [MQTT Examples](devices/mqtt/examples.md)

- **Billing**
  - [Overview](billing/overview.md)
  - [Configuration](billing/configuration.md)
  - [Transactions](billing/transactions.md)

- **Plugins**
  - [Overview](plugins/overview.md)
  - [Installing Plugins](plugins/installing-plugins.md)
  - [Developing Plugins](plugins/developing-plugins.md)
  - [Migrating Plugins to SDK 2.0](plugins/migrating-to-2.md)
  - [Bluetooth Transport for Plugins](plugins/ble-transport.md)
  - [Plugin Storage](plugins/plugin-storage.md)
  - [Card Authentication for Plugins](plugins/card-authentication.md)
  - [Plugin Readers](plugins/plugin-readers.md)
  - **Reservations**
    - [Overview](plugins/reservations/overview.md)
    - [Using Reservations](plugins/reservations/using-reservations.md)
    - [Administering Reservations](plugins/reservations/administration.md)
    - [Reservations API](plugins/reservations/api.md)
  - **WAGO**
    - [Overview](plugins/wago/overview.md)
    - [Guided WAGO CC100 Commissioning](plugins/wago/cc100-commissioning.md)
    - [WAGO CC100 Docker Runtime](plugins/wago/cc100-runtime.md)
    - [WAGO Production Support](plugins/wago/production-support.md)
    - [WAGO Recovery Runbooks](plugins/wago/recovery-runbooks.md)
    - [WAGO Threat Model and Pen-Test Brief](plugins/wago/threat-model.md)
    - [WAGO Safety Boundary](plugins/wago/safety-boundary.md)
  - **Matter**
    - [Overview](plugins/matter/overview.md)
    - [Matter: Architecture](plugins/matter/architecture.md)
    - [Matter: Operator Guide](plugins/matter/operator.md)
    - [Matter: Data Model and Lifecycle](plugins/matter/data-model.md)
    - [Matter: Backup and Recovery](plugins/matter/backup-restore.md)
    - [Matter: Permissions](plugins/matter/permissions.md)
  - **RabbitMQ**
    - [Overview](plugins/rabbitmq/overview.md)
  - **Shelly**
    - [Overview](plugins/shelly/overview.md)

- **Monitoring & Metrics**
  - [Overview](monitoring/overview.md)
  - [Setup](monitoring/setup.md)
  - [Prometheus & Grafana](monitoring/prometheus-grafana.md)
  - [Metrics Reference](monitoring/metrics-reference.md)

- **System Settings**
  - [Overview](settings/overview.md)
  - [Security](settings/security.md)
  - [Audit log](settings/audit-log.md)

- **Developer Guide**
  - [Overview](developer/overview.md)
  - [Architecture](developer/architecture.md)
  - [Persistence Architecture](developer/persistence-architecture.md)
  - [Persistence Guarantees](developer/persistence-guarantees.md)
  - [Adding a Database Backend](developer/adding-a-database-backend.md)
  - [API Log Destinations](developer/logging.md)
  - [API Reference](developer/api-reference.md)
  - [MCP Server (AI Clients)](developer/mcp.md)
  - [AI Agents (llms.txt & WebMCP)](developer/ai-agents.md)
  - [Contributing](developer/contributing.md)

- **End User Guide**
  - [Overview](end-user/overview.md)
  - [Logging In](end-user/login.md)
  - [My Account](end-user/account.md)
  - [Using Resources](end-user/using-resources.md)
  - [Dashboard](end-user/dashboard.md)
  - [Mobile Usage (PWA)](end-user/mobile-pwa.md)

- **FAQ & Help**
  - [Common Issues](faq/common-issues.md)
  - [Glossary](faq/glossary.md)
