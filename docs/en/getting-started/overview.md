# Overview

## What is Attraccess?

Attraccess is a source-available platform for machine access control and resource management in industry, R&D and universities. It connects operator permissions and safety briefings with machine access, usage records and preventive maintenance. The software runs as a web application on your own infrastructure and can be used from desktops, tablets and phones.

## Key Features

### Resource Management

Manage machines, tools, workstations and doors across production areas, research labs and university facilities from a central location. Each resource has its own detail page with image, description and documentation.

### Qualifications & Safety Briefings

Use the introduction system to document safety briefings and grant access per machine or resource group. Authorized introducers record and revoke introductions, and supervision modes support training sessions.

### Maintenance Planning

Schedule regular maintenance for your resources. Attraccess shows the current maintenance status and sends reminders when maintenance is due.

### RFID Access Control

With the **Attractap RFID Reader**, you can control physical access to machines via RFID cards. Users hold their card to the reader, and Attraccess checks their permissions.

### Machine Integration & Automation

Connect machines through the WAGO PLC plugin or build visual automations using the flow editor. Use MQTT or HTTP to link access decisions and usage sessions with equipment controls and status signals.

### Projects

Organize production, development and research work in projects. Invite team members, manage project-level permissions and associate machine sessions with projects.

### Usage Records & Reporting

Track who used each machine, when and for how long. Export usage data as CSV for operational reporting and project analysis.

### IT & Operations

Connect your existing identity provider through [OIDC or SAML](user-management/sso-overview.md), map groups to roles, inspect [audit logs](settings/audit-log.md) and monitor application health with [Prometheus and Grafana](monitoring/overview.md).

### Billing

Create usage-based billing for your resources. The built-in billing feature supports various pricing models.

### Plugin System

Extend Attraccess with plugins. The plugin system provides SDKs for frontend and backend extensions.

## Technology

Attraccess consists of:

- **Web Application** – React frontend with NestJS backend
- **Database** – SQLite (no separate database server needed)
- **RFID Hardware** – Attractap reader (ESP32-based, optional)
- **Deployment** – Docker container

## Licensing

Attraccess is **source-available** under the [modified Prosperity Public License 3.0](https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md).

- **Commercial use**, including internal use in a company, requires a commercial license after a free evaluation of up to **30 days**.
- **Non-commercial use** by private individuals and non-profit organizations is free under the license terms.
- **Forks and redistributed modifications** remain subject to the same license terms. Components with separate licenses retain those licenses.

The linked `LICENSE.md` contains the full terms in German and takes precedence over this English summary. For licensing questions and integration support, contact [contact@attraccess.org](mailto:contact@attraccess.org).

### Activation

Activating licensed features requires a license key, including for free installations. Enter it in the **License Key** field of the [Setup Wizard](setup/first-time-setup.md) or under **Settings → Application Settings**. For a new installation, you can also set the `LICENSE_KEY` [environment variable](installation/environment-variables.md) before the database is initialized. Existing installations read the stored key; change it in Settings rather than by editing the environment variable.

For qualifying non-commercial use, copy the following special key exactly after reviewing the license terms:

```text
I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md
```

For a commercial evaluation or commercial use, request a license key from [contact@attraccess.org](mailto:contact@attraccess.org).

## Next Steps

- Check [System Requirements](getting-started/requirements.md)
- [Quick Start](getting-started/quick-start.md) – Install and run Attraccess
