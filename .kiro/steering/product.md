# Product Overview

Attraccess is a comprehensive resource management system for tracking and managing access to shared resources. It provides a complete solution for organizations to manage physical resources, track usage, and control access through various authentication methods.

## Core Features

- **Resource Management**: Track resource status, usage, and maintenance with image support
- **Access Control**: Role-based access control with multiple authentication providers
- **Hardware Integration**: Support for ESP32-based access control devices (Attractap)
- **Real-time Communication**: WebSocket and MQTT support for live updates
- **Plugin System**: Extensible architecture with frontend and backend plugin support
- **Multi-tenant**: Support for multiple organizations and user management

## Target Users

- Organizations managing shared resources (makerspaces, labs, coworking spaces)
- Facilities requiring access control and usage tracking
- Communities needing resource scheduling and management

## Architecture

The system consists of:
- **Backend API**: NestJS-based REST API with real-time features
- **Frontend**: React-based web application with PWA support
- **Firmware**: ESP32 firmware for hardware access control devices
- **Plugin System**: Extensible architecture for custom functionality