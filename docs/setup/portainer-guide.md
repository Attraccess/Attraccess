# Deploying Attraccess with Portainer

This guide explains how to set up Attraccess using Portainer, a user-friendly web interface for managing Docker containers.

## What is Portainer?

Portainer is a web-based graphical user interface (GUI) that makes it easy to manage Docker environments without having to use the command line. It's particularly helpful for beginners who are not comfortable with command-line interfaces.

> 💡 **Benefit**: Portainer provides a visual way to manage your Docker containers, networks, volumes, and images through a web browser.

## Prerequisites

- A server or computer with Docker installed
- Internet access
- Basic understanding of web interfaces

## Step 1: Install Portainer

First, you need to install Portainer on your system:

```bash
# Create a volume for Portainer data
docker volume create portainer_data

# Install and run Portainer
docker run -d -p 8000:8000 -p 9000:9000 --name=portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce
```

## Step 2: Access Portainer Dashboard

1. Open your web browser
2. Navigate to `http://your-server-ip:9000` (replace `your-server-ip` with your actual server IP address)
3. Create an admin user with a strong password
4. Select "Local" to manage your local Docker environment
5. Click "Connect"

## Step 3: Create Volumes for Attraccess

1. In the Portainer dashboard, click on "Volumes" in the left sidebar
2. Click "Add volume"
3. Name the first volume `attraccess_storage` and click "Create the volume"
4. Repeat to create a second volume named `attraccess_plugins`

## Step 4: Deploy Attraccess Container

### Using the Web UI

1. In the Portainer dashboard, click on "Containers" in the left sidebar
2. Click "Add container"
3. Configure the container with the following settings:

#### Basic Container Settings:

- **Name**: attraccess
- **Image**: attraccess/attraccess:latest
- **Always pull the image**: Enable this option
- **Restart policy**: Unless stopped

#### Port Mapping:

- **Host**: 3000
- **Container**: 3000
- **Protocol**: TCP

#### Advanced Container Settings:

1. Click on "Advanced container settings"

2. Go to the "Volumes" tab:

   - Click "Map additional volume"
   - **Container**: /app/storage
   - **Volume**: attraccess_storage
   - Click "Map an additional volume"
   - **Container**: /app/plugins
   - **Volume**: attraccess_plugins

3. Go to the "Env" tab and add the following environment variables:

| Variable            | Value                                   |
| ------------------- | --------------------------------------- |
| AUTH_SESSION_SECRET | replace_with_another_long_random_string |
| ATTRACCESS_URL      | http://your-server-ip:3000              |
| SMTP_SERVICE        | SMTP                                    |
| SMTP_FROM           | your-email@example.com                  |
| SMTP_HOST           | smtp.example.com                        |
| SMTP_PORT           | 587                                     |
| SMTP_USER           | your-email-username                     |
| SMTP_PASS           | your-email-password                     |
| LOG_LEVELS          | error,warn,log                          |

> ⚠️ **Security Note**: Generate strong random strings for `AUTH_SESSION_SECRET`. You can use a password generator or run `openssl rand -base64 32` in a terminal.

4. Click "Deploy the container"

### Using Stack Deployment (Alternative Method)

Portainer also supports deploying applications using Docker Compose:

1. In the Portainer dashboard, click on "Stacks" in the left sidebar
2. Click "Add stack"
3. Give your stack a name (e.g., "attraccess")
4. Select "Web editor" as the build method
5. Paste the following Docker Compose configuration:

```yaml
version: '3'

services:
  attraccess:
    image: attraccess/attraccess:latest
    container_name: attraccess
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      # Authentication & Security
      - AUTH_SESSION_SECRET=replace_with_another_long_random_string
      - ATTRACCESS_URL=http://your-server-ip:3000

      # Email Configuration
      - SMTP_SERVICE=SMTP
      - SMTP_FROM=your-email@example.com
      - SMTP_HOST=smtp.example.com
      - SMTP_PORT=587
      - SMTP_USER=your-email-username
      - SMTP_PASS=your-email-password

      # Logging level
      - LOG_LEVELS=error,warn,log
    volumes:
      - attraccess_storage:/app/storage
      - attraccess_plugins:/app/plugins

volumes:
  attraccess_storage:
  attraccess_plugins:
```

6. Replace the placeholder values with your actual configuration
7. Click "Deploy the stack"

## Step 5: Access Attraccess

1. Once the container is running, open your web browser
2. Navigate to `http://your-server-ip:3000`
3. You should now see the Attraccess login page

## Managing Attraccess with Portainer

Portainer makes it easy to manage your Attraccess container:

### Viewing Logs

1. In the Portainer dashboard, click on "Containers"
2. Find and click on your "attraccess" container
3. Click on "Logs" to view the container logs

### Stopping and Starting

1. In the Portainer dashboard, click on "Containers"
2. Find your "attraccess" container
3. Use the "Stop", "Start", or "Restart" buttons as needed

### Updating Attraccess

1. In the Portainer dashboard, click on "Containers"
2. Stop your existing "attraccess" container
3. Click on "Images" in the left sidebar
4. Find "attraccess/attraccess" and click "Pull"
5. Go back to "Containers" and start your "attraccess" container again

## Email Configuration Help

### Gmail Configuration

To use Gmail as your email service:

1. Go to your "attraccess" container in Portainer
2. Click "Duplicate/Edit"
3. Go to "Advanced container settings" > "Env"
4. Update the email settings:

| Variable     | Value                |
| ------------ | -------------------- |
| SMTP_SERVICE | SMTP                 |
| SMTP_FROM    | your-gmail@gmail.com |
| SMTP_HOST    | smtp.gmail.com       |
| SMTP_PORT    | 587                  |
| SMTP_USER    | your-gmail@gmail.com |
| SMTP_PASS    | your-app-password    |

> Note: For Gmail, you need to set up an "App Password" in your Google Account security settings.

### Outlook/Office 365 Configuration

For Outlook or Office 365:

| Variable     | Value                          |
| ------------ | ------------------------------ |
| SMTP_SERVICE | Outlook365                     |
| SMTP_FROM    | your-outlook-email@outlook.com |
| SMTP_USER    | your-outlook-email@outlook.com |
| SMTP_PASS    | your-outlook-password          |

## Troubleshooting

### Common Issues in Portainer

1. **Container fails to start**:

   - Check the container logs for error messages
   - Verify all environment variables are set correctly
   - Ensure the ports aren't already in use by another container

2. **Can't access Attraccess from web browser**:

   - Verify the container is running in Portainer
   - Check if your firewall is blocking port 3000
   - Make sure you're using the correct URL

3. **Email configuration issues**:
   - Review the container logs for SMTP errors
   - Verify your email credentials are correct
   - Some email providers may block connections from servers

### Increasing Log Verbosity

To get more detailed logs for troubleshooting:

1. Edit your container in Portainer
2. Change the `LOG_LEVELS` environment variable to:
   ```
   error,warn,log,debug,verbose
   ```
3. Restart the container
4. Check the logs for more detailed information

## Next Steps

After successfully deploying Attraccess with Portainer, you can:

1. Create an account (the first account is automatically Admin)
2. Enjoy Attraccess!

For further guidance on using Attraccess, refer to our [User Guide](/user/getting-started.md).
