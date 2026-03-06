# Installation with Portainer

Portainer is a graphical management interface for Docker. If you already use Portainer, you can conveniently install Attraccess through it.

## Prerequisites

- Portainer is installed and accessible
- Docker is running on your server

## 1. Create a Stack

1. Open Portainer in your browser
2. Navigate to **Stacks** → **Add stack**
3. Give the stack a name, e.g. `attraccess`
4. Paste the following configuration in the **Web editor**:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    ports:
      - "3000:3000"
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=your-random-secure-key
      - ATTRACCESS_URL=https://attraccess.your-domain.com
      - LICENSE_KEY=your-license-key
    restart: unless-stopped

volumes:
  attraccess-storage:
```

## 2. Set Environment Variables

As an alternative to inline variables, you can enter values individually in the **Environment variables** section. Required variables:

| Variable | Value |
|----------|-------|
| `AUTH_SESSION_SECRET` | A random, secure key |
| `ATTRACCESS_URL` | The URL of your installation |
| `LICENSE_KEY` | Your license key |

More variables can be found at [Environment Variables](installation/environment-variables.md).

## 3. Deploy the Stack

Click **Deploy the stack**. Portainer will pull the Docker image and start the container.

## 4. First-Time Setup

Open `http://your-server:3000` in your browser and follow the [Setup Wizard](setup/first-time-setup.md).

## Updating the Stack

To update Attraccess:

1. Navigate to **Stacks** → `attraccess`
2. Click **Pull and redeploy**
3. Confirm the action

Details on updating can be found at [Updating](installation/updating.md).

## See Also

- [Docker Compose Installation](installation/docker-compose.md)
- [Environment Variables](installation/environment-variables.md)
- [First-Time Setup](setup/first-time-setup.md)
