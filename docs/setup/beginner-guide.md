# Beginner's Guide to Attraccess Installation

This guide is designed for absolute beginners with no prior knowledge of Docker or server deployment. We'll walk through each step carefully to help you get Attraccess up and running.

## What is Attraccess?

Attraccess is a complete solution for managing access to spaces, resources, and equipment. It's packaged as a Docker container, which is a standardized way to deliver software that works consistently across different computers and servers.

## Prerequisites

Before you begin, you'll need:

1. A computer or server running Linux, macOS, or Windows
2. Internet connection
3. Basic knowledge of using a terminal/command line
4. An email service (like Gmail, Outlook, or your own SMTP server)

## Understanding Docker Basics

### What is Docker?

Docker is a platform that allows you to package and run applications in isolated environments called "containers." Think of a container as a lightweight, standalone package that includes everything needed to run the software: code, runtime, system tools, libraries, and settings.

> 💡 **Why Docker?** Docker makes it easy to install and run software without worrying about dependencies or configuration issues. It ensures that Attraccess runs the same way regardless of where it's installed.

### Installing Docker

Before you can run Attraccess, you need to install Docker on your system:

- **Windows**: Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)
- **macOS**: Download and install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop)
- **Linux**: Follow the [official Docker installation guide](https://docs.docker.com/engine/install/) for your specific Linux distribution

After installation:

1. Open a terminal or command prompt
2. Verify Docker is installed by running: `docker --version`

## Step-by-Step Installation Guide

### Step 1: Create Directories for Attraccess

First, create directories to store your Attraccess data:

```bash
# Create a main directory for Attraccess
mkdir -p ~/attraccess

# Create subdirectories for storage and plugins
mkdir -p ~/attraccess/storage
mkdir -p ~/attraccess/plugins
```

### Step 2: Create Your Environment Configuration

You need to configure several settings for Attraccess to work correctly:

```bash
# Navigate to your Attraccess directory
cd ~/attraccess

# Create an environment file
touch .env
```

Now, open the `.env` file with a text editor and add the following configurations:

```
# Authentication & Security
AUTH_SESSION_SECRET=replace_with_another_long_random_string
ATTRACCESS_URL=http://localhost:3000

# Email Configuration
SMTP_SERVICE=SMTP
SMTP_FROM=your-email@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email-username
SMTP_PASS=your-email-password

# Logging level
LOG_LEVELS=error,warn,log
```

> ⚠️ **Important Security Note**:
>
> - Replace `replace_with_a_long_random_string` with actual random strings
> - You can generate secure random strings with this command: `openssl rand -base64 32`
> - Never share these values with anyone

### Step 3: Running Attraccess

Now that you've set up your configuration, you can run Attraccess:

```bash
docker run -d \
  --name attraccess \
  -p 3000:3000 \
  --env-file ./.env \
  -v $(pwd)/storage:/app/storage \
  -v $(pwd)/plugins:/app/plugins \
  attraccess/attraccess:latest
```

### Step 4: Accessing Attraccess

Once the container is running:

1. Open your web browser
2. Go to `http://localhost:3000`
3. You should see the Attraccess login page

#### Accessing from a Remote Server

If you've installed Attraccess on a remote server (not your local computer):

1. You'll need to use the server's IP address or domain name instead of `localhost`
2. Open your web browser on your local computer
3. Go to `http://your-server-ip:3000` (replace `your-server-ip` with your actual server's IP address)
4. If you have a domain name pointing to your server, you can use `http://your-domain.com:3000`

> 💡 **Important:** When installing on a remote server, you should update the `ATTRACCESS_URL` in your `.env` file to match how you'll access the application:
>
> ```
> ATTRACCESS_URL=http://your-server-ip:3000
> ```
>
> or
>
> ```
> ATTRACCESS_URL=http://your-domain.com:3000
> ```

##### Firewall Considerations

If you can't access your Attraccess instance, you may need to:

1. Make sure port 3000 is open in your server's firewall
2. For most cloud providers (AWS, DigitalOcean, etc.), you'll need to configure security groups or firewall rules to allow traffic on port 3000

##### Secure Access with HTTPS

For production environments, it's recommended to:

1. Set up a reverse proxy (like Nginx or Apache) in front of Attraccess
2. Configure SSL/TLS certificates (using Let's Encrypt)
3. Update your `ATTRACCESS_URL` to use `https://` instead of `http://`

Detailed instructions for setting up a secure proxy are beyond the scope of this beginner guide, but we recommend researching this for any production deployment.

### Step 5: First-Time Setup

The first time you access Attraccess, you'll need to:

1. Create an account (the first account is automatically Admin)
2. Enjoy Attraccess!

## Email Configuration Help

Configuring email can be tricky. Here are some common SMTP settings:

### Gmail

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-app-password
```

> Note: For Gmail, you need to create an "App Password" in your Google Account security settings

### Outlook/Office 365

```
SMTP_SERVICE=Outlook365
SMTP_FROM=your-outlook-email@outlook.com
SMTP_USER=your-outlook-email@outlook.com
SMTP_PASS=your-outlook-password
```

### Other Email Providers

Check your email provider's documentation for SMTP settings. You typically need:

- SMTP server address (SMTP_HOST)
- SMTP port (usually 587 or 465)
- Your email address
- Your email password or an app-specific password

## Troubleshooting

If you encounter issues:

1. **Container won't start**:

   - Check if the required ports are already in use
   - Verify your environment variables are set correctly

2. **Can't connect to Attraccess**:

   - Make sure you're using the correct URL
   - Check if the container is running with `docker ps`

3. **Email not working**:

   - Verify your SMTP settings
   - Some email providers may block sending from apps

4. **Getting error messages**:
   - Check the logs with `docker logs attraccess`

## Additional Resources

- [Official Docker Documentation](https://docs.docker.com/)
- [SMTP Configuration Guide](https://nodemailer.com/smtp/)
- [Attraccess GitHub Repository](https://github.com/attraccess/attraccess)

For more advanced deployment options, check our specialized guides:

- [Docker Compose Deployment](./docker-compose-guide.md)
- [Portainer Deployment](./portainer-guide.md)
