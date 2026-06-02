# Glossary

This glossary explains key terms used throughout the Attraccess documentation.

## General Terms

| Term | Description |
|------|-------------|
| **Resource** | A machine, tool, piece of equipment, or door managed in Attraccess. Resources can be booked, tracked, and access-controlled. |
| **Introduction** | A safety briefing that grants a user permission to use a specific resource. Introductions are typically conducted in person at the machine. |
| **Introducer** | A person authorized to grant introductions for a resource. Introducers confirm that a user has received a safety briefing and can operate the machine safely. They can also control the machine and manage maintenance. |
| **Maintainer** | A person who can control a resource and manage its maintenance, but who cannot grant introductions to other users. Use this for people who service a machine without deciding who else gets access. |
| **Usage Session** | A recorded period during which a user is actively using a resource. Sessions have a start and end time. |
| **Flow** | A visual automation workflow created in the flow editor. Flows connect triggers, actions, and conditions to automate tasks. |
| **Project** | A way to organize work and team collaboration. Usage sessions can be linked to projects for tracking. |

## Hardware

| Term | Description |
|------|-------------|
| **Attractap** | The NFC card reader hardware used with Attraccess. It is based on the ESP32 microcontroller and reads NFC cards to identify users at machines. |
| **NFC** | Near Field Communication – a short-range wireless technology used for contactless identification, such as tapping a card on a reader. |

## Protocols & Standards

| Term | Description |
|------|-------------|
| **MQTT** | Message Queuing Telemetry Transport – a lightweight messaging protocol commonly used for IoT (Internet of Things) devices. Attraccess uses MQTT to communicate with hardware and automation systems. |
| **SSO** | Single Sign-On – a mechanism that allows users to log in once with a central identity provider and access multiple applications without logging in again. |
| **OIDC** | OpenID Connect – an authentication protocol built on top of OAuth 2.0. It is one of the SSO methods supported by Attraccess. |
| **SAML** | Security Assertion Markup Language – an XML-based standard for exchanging authentication data between an identity provider and a service provider. It is one of the SSO methods supported by Attraccess. |
| **TOTP** | Time-based One-Time Password – an algorithm that generates a temporary code (typically six digits) that changes every 30 seconds. Used for two-factor authentication (2FA) with authenticator apps. |
| **REST API** | Representational State Transfer Application Programming Interface – the web interface through which Attraccess exposes its functionality for programmatic access. |
| **OpenAPI** | A specification format for describing REST APIs. Attraccess uses OpenAPI (Swagger) to document its API endpoints. |

## Web & Mobile

| Term | Description |
|------|-------------|
| **PWA** | Progressive Web App – a web application that can be installed on a device's home screen and used like a native app. Attraccess is a PWA. |

## See Also

- [Common Issues](faq/common-issues.md) – Troubleshooting guide
- [Overview](getting-started/overview.md) – What is Attraccess?
