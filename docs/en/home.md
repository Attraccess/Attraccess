# Attraccess Documentation

Welcome to the official documentation for **Attraccess** – machine access control and resource management for industry, R&D and universities.

## What is Attraccess?

Attraccess helps you manage machines, tools, workstations and doors across production facilities, research labs and university workshops. Control access based on operator permissions and documented safety briefings, connect equipment through PLCs and automation flows, and record who used each resource, when and for which project.

Run Attraccess on your own infrastructure, connect your identity provider and use usage records, maintenance schedules and audit logs to support day-to-day operations.

Attraccess is **source-available** under the [modified Prosperity Public License 3.0](https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md). Commercial use requires a license after a 30-day evaluation; qualifying non-commercial use is free. The full license terms are written in German; see [Licensing and activation](getting-started/overview.md#licensing) for an English summary and setup instructions.

## Who is this documentation for?

| Audience | Recommended Sections |
|----------|---------------------|
| **Operators, Researchers & Students** | [End User Guide](end-user/overview.md), [Using the Reader](attractap/using-the-reader.md) |
| **Production & Lab Leads, Safety Officers** | [Resources](resources/overview.md), [Safety Briefings](resources/introductions.md), [Usage Exports](resources/csv-export.md) |
| **Maintenance & Automation Teams** | [Maintenance](resources/maintenance.md), [Flows](flows/overview.md), [Forms](forms/overview.md) |
| **Administrators** | [First-Time Setup](setup/first-time-setup.md), [User Management](user-management/overview.md), [Settings](settings/overview.md) |
| **IT Administrators** | [Installation](installation/docker-compose.md), [SSO](user-management/sso-overview.md), [Monitoring](monitoring/overview.md), [Audit Log](settings/audit-log.md) |
| **Developers** | [Developer Guide](developer/overview.md), [API Reference](developer/api-reference.md) |

## Quick Start

1. Check **[System Requirements](getting-started/requirements.md)**
2. Follow the **[Quick Start](getting-started/quick-start.md)** – get Attraccess running in minutes
3. Complete the **[First-Time Setup](setup/first-time-setup.md)**

## Feature Overview

- **Resource Management** – Manage machines, tools and equipment
- **Qualifications & Access Control** – Documented safety briefings and permissions per resource or resource group
- **Badge Access** – Physical access via Attractap RFID readers
- **Maintenance Planning** – Schedule preventive maintenance by time, usage hours or session count
- **Machine & PLC Integration** – Connect WAGO controllers and automate equipment via MQTT or HTTP
- **Projects & Usage Records** – Assign sessions to projects and export usage as CSV
- **SSO Integration** – Login via OIDC or SAML with group-to-role mappings
- **Audit Log & Monitoring** – Track sensitive changes and monitor operations with Prometheus and Grafana
- **Billing** – Usage-based billing
- **Plugin System** – Extend functionality with plugins
- **Progressive Web App** – Works on mobile devices too
