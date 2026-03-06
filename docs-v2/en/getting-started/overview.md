# Overview

## What is Attraccess?

Attraccess is an open-source platform for managing resources and access in makerspaces, workshops and FabLabs. The software runs as a web application on your own server and can be used from any device with a web browser.

## Key Features

### Resource Management

Manage all machines, tools and equipment in your workshop from a central location. Each resource has its own detail page with image, description and documentation.

### Introduction System

Require users to receive a safety briefing before they can use a resource. Introducers can grant access to other users. All introductions are documented.

### Maintenance Planning

Schedule regular maintenance for your resources. Attraccess shows the current maintenance status and sends reminders when maintenance is due.

### NFC Access Control

With the **Attractap NFC Reader**, you can control physical access to machines via NFC cards. Users hold their card to the reader, and Attraccess checks their permissions.

### Flows & Automation

Create visual automations using the flow editor. Connect actions such as HTTP requests, MQTT messages and conditions to build automated workflows.

### Projects

Organize your work in projects. Invite team members and manage project-level permissions.

### Billing

Create usage-based billing for your resources. The built-in billing feature supports various pricing models.

### Plugin System

Extend Attraccess with plugins. The plugin system provides SDKs for frontend and backend extensions.

## Technology

Attraccess consists of:

- **Web Application** – React frontend with NestJS backend
- **Database** – SQLite (no separate database server needed)
- **NFC Hardware** – Attractap reader (ESP32-based, optional)
- **Deployment** – Docker container

## Next Steps

- Check [System Requirements](getting-started/requirements.md)
- [Quick Start](getting-started/quick-start.md) – Install and run Attraccess
