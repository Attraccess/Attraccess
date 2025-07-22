# Installation

> [!NOTE] > **Are you new to Docker or server deployment?** Check out our beginner-friendly guides:
>
> - [Complete Beginner's Guide](setup/beginner-guide.md) - Step-by-step instructions for first-time users
> - [Docker Compose Guide](setup/docker-compose-guide.md) - Simplified deployment with Docker Compose
> - [Portainer Guide](setup/portainer-guide.md) - Visual deployment using the Portainer web interface

## 🚀 Getting Started with Attraccess

Attraccess is distributed as a single Docker container that includes everything you need to get up and running quickly. Follow these simple steps to deploy your instance:

### 📦 Pull the Docker Image

Get the latest version from our GitHub Docker registry:

```bash
docker pull attraccess/attraccess:latest
```

> [!TIP]
> For production environments, we recommend pinning to a specific version tag instead of using `latest` to ensure consistency across deployments.

### 🔧 Configure Environment Variables

Attraccess requires several environment variables to function properly:

#### Authentication & Security

| Variable              | Description                              | Required | Default |
| --------------------- | ---------------------------------------- | -------- | ------- |
| `AUTH_SESSION_SECRET` | Secret for encrypting sessions           | Yes      | -       |
| `ATTRACCESS_URL`      | URL/hostname of your Attraccess instance | Yes      | -       |

> [!WARNING]
> Always use strong, unique secrets for `AUTH_SESSION_SECRET`. These are critical for your application's security.

#### Email Configuration

| Variable                       | Description                                 | Required             | Default |
| ------------------------------ | ------------------------------------------- | -------------------- | ------- |
| `SMTP_SERVICE`                 | Email service type ("SMTP" or "Outlook365") | Yes                  | -       |
| `SMTP_FROM`                    | Email address for outgoing messages         | Yes                  | -       |
| `SMTP_HOST`                    | SMTP server hostname                        | If SMTP_SERVICE=SMTP | -       |
| `SMTP_PORT`                    | SMTP server port                            | If SMTP_SERVICE=SMTP | -       |
| `SMTP_USER`                    | SMTP authentication username                | Optional             | -       |
| `SMTP_PASS`                    | SMTP authentication password                | Optional             | -       |
| `SMTP_SECURE`                  | Use secure connection ("true"/"false")      | Optional             | "false" |
| `SMTP_IGNORE_TLS`              | Ignore TLS ("true"/"false")                 | Optional             | "true"  |
| `SMTP_REQUIRE_TLS`             | Require TLS ("true"/"false")                | Optional             | "false" |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | Reject unauthorized TLS ("true"/"false")    | Optional             | "true"  |
| `SMTP_TLS_CIPHERS`             | TLS cipher configuration                    | Optional             | -       |

#### SSL Configuration

| Variable                                | Description                                         | Required | Default |
| --------------------------------------- | --------------------------------------------------- | -------- | ------- |
| `SSL_GENERATE_SELF_SIGNED_CERTIFICATES` | Automatically generate self-signed SSL certificates | No       | "false" |

> [!TIP]
> Enable SSL for secure connections by setting `SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true`. For detailed SSL configuration, custom certificates, and device trust instructions, see our [SSL Configuration Guide](setup/ssl-configuration.md).

#### Storage & File Management

| Variable       | Description                                | Required | Default        |
| -------------- | ------------------------------------------ | -------- | -------------- |
| `STORAGE_ROOT` | Path to store uploaded files and resources | No       | `/app/storage` |

#### Logging & Plugins

| Variable     | Description                                  | Required | Default          |
| ------------ | -------------------------------------------- | -------- | ---------------- |
| `LOG_LEVELS` | Comma-separated list of log levels to enable | No       | "error,warn,log" |
| `PLUGIN_DIR` | Directory for plugins                        | No       | "plugins"        |

### 🐳 Run the Container

Start Attraccess with your configured environment variables:

```bash
docker run -d \
  --name attraccess \
  -p 3000:3000 \
  -e AUTH_SESSION_SECRET=your_secure_session_secret \
  -e ATTRACCESS_URL=https://attraccess.yourdomain.com \
  -e SMTP_SERVICE=SMTP \
  -e SMTP_FROM=no-reply@yourdomain.com \
  -e SMTP_HOST=smtp.yourdomain.com \
  -e SMTP_PORT=587 \
  -e SMTP_USER=your_smtp_user \
  -e SMTP_PASS=your_smtp_password \
  -e LOG_LEVELS=error,warn,log \
  -v /path/to/plugins:/app/plugins \
  -v /path/to/storage:/app/storage \
  attraccess/attraccess:latest
```

### 📂 Storage Volume

Attraccess uses a dedicated storage directory to store uploaded files, resources, and cache:

```bash
-v /path/to/storage:/app/storage
```

This directory contains:

- `/app/storage/uploads`: Stores all uploaded files, including resource images
- `/app/storage/cache`: Stores cached files for performance optimization
- `/app/storage/resources`: Stores resource-related files
- `/app/storage/*.pem` and `/app/storage/*.key`: SSL certificates (when using SSL features)

> [!ATTENTION]
> Mounting the storage volume is **essential** to ensure data persistence across container restarts and updates. Failure to mount this volume will result in data loss when the container is updated or restarted.

### 📋 Available Log Levels

The `LOG_LEVELS` environment variable accepts a comma-separated list of these values:

- `error` - Error messages only
- `warn` - Warnings and errors
- `log` - Standard logs, warnings, and errors
- `debug` - Detailed debugging information
- `verbose` - Highly detailed diagnostics

> [!TIP]
> For production environments, use `error,warn` to minimize log volume while capturing important information. During troubleshooting, you can temporarily enable `log`, `debug` or `verbose` levels.

### 🔌 Plugin Support

Attraccess supports plugins that extend its functionality. Mount your plugins directory to `/app/plugins` in the container:

```bash
docker run -d \
  --name attraccess \
  -p 3000:3000 \
  -e AUTH_SESSION_SECRET=your_secure_session_secret \
  -e ATTRACCESS_URL=https://attraccess.yourdomain.com \
  -v /path/to/plugins:/app/plugins \
  -v /path/to/storage:/app/storage \
  attraccess/attraccess:latest
```

## 🔧 Troubleshooting

If you encounter issues during installation:

1. Verify all required environment variables are correctly set
2. Check the container logs: `docker logs attraccess`
3. Ensure your SMTP configuration is correct
4. Verify network connectivity to required services

For additional support, please visit our [GitHub repository](https://github.com/attraccess/attraccess).

## 🌱 Alternative Deployment Methods

If you prefer simpler deployment options or are new to Docker, we offer several alternative approaches:

### For Beginners

If you're new to Docker or server deployment, our [Complete Beginner's Guide](setup/beginner-guide.md) provides detailed explanations and step-by-step instructions with no prior knowledge required.

### Using Docker Compose

Docker Compose provides a simpler way to manage your Attraccess configuration through a YAML file. Follow our [Docker Compose Guide](setup/docker-compose-guide.md) to get started.

### Using Portainer (GUI-based approach)

If you prefer a graphical interface over command line, Portainer offers a user-friendly web interface for managing Docker containers. Our [Portainer Guide](setup/portainer-guide.md) walks you through the entire process.
