# SSL Configuration

> [!NOTE]
> SSL/TLS encryption is essential for securing your Attraccess instance, especially when accessing it from external networks or when handling sensitive data.

## 🔒 SSL Options

Attraccess provides two main approaches for SSL configuration:

1. **Automatic Self-Signed Certificates** - Perfect for development, testing, or internal networks
2. **Custom SSL Certificates** - Recommended for production environments with proper CA-signed certificates

## 🔐 Automatic Self-Signed Certificates

The easiest way to enable SSL is by using automatically generated self-signed certificates. Attraccess can generate these certificates automatically on startup.

### Configuration

Add the following environment variable to enable automatic SSL certificate generation:

```bash
SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true
```

### Example Docker Command

```bash
docker run -d \
  --name attraccess \
  -p 443:3000 \
  -e SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true \
  -e AUTH_SESSION_SECRET=your_secure_session_secret \
  -e ATTRACCESS_URL=https://attraccess.yourdomain.com \
  -v /path/to/storage:/app/storage \
  attraccess/attraccess:latest
```

### How It Works

When `SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true`:

1. Attraccess automatically generates a Certificate Authority (CA) and SSL certificate
2. The certificate is valid for **365 days (1 year)**
3. Certificates are stored in your storage directory with the domain name (e.g., `yourdomain.com.pem` and `yourdomain.com.key`)
4. The certificate covers multiple domains: `127.0.0.1`, `localhost`, and your configured domain
5. Your application automatically starts with HTTPS enabled

## 🗂️ Custom SSL Certificates

For production environments, you should use proper SSL certificates from a trusted Certificate Authority.

### Using Custom Certificates

1. Obtain your SSL certificate files (`.pem` or `.crt`) and private key (`.key`) from your CA
2. Place them in your storage directory
3. Name them according to your domain (e.g., `yourdomain.com.pem` and `yourdomain.com.key`)
4. Do **NOT** set `SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true`

### Example with Custom Certificates

```bash
# Place your certificates in the storage directory
cp yourdomain.com.pem /path/to/storage/
cp yourdomain.com.key /path/to/storage/

# Run without SSL_GENERATE_SELF_SIGNED_CERTIFICATES
docker run -d \
  --name attraccess \
  -p 443:3000 \
  -e AUTH_SESSION_SECRET=your_secure_session_secret \
  -e ATTRACCESS_URL=https://attraccess.yourdomain.com \
  -v /path/to/storage:/app/storage \
  attraccess/attraccess:latest
```

## 🔄 Certificate Renewal & Expiration

### Self-Signed Certificate Renewal

Self-signed certificates generated by Attraccess are valid for **1 year**. When they expire:

1. **Stop** your Attraccess container
2. **Delete** the expired certificate files from your storage directory:
   ```bash
   rm /path/to/storage/yourdomain.com.pem
   rm /path/to/storage/yourdomain.com.key
   ```
3. **Restart** your container with `SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true`
4. New certificates will be automatically generated

### Custom Certificate Renewal

For custom certificates:

1. Obtain renewed certificates from your CA before expiration
2. Replace the old certificate files in your storage directory
3. Restart your Attraccess container

## 📱 Trusting Self-Signed Certificates

Since self-signed certificates are not issued by a trusted Certificate Authority, browsers and devices will show security warnings. You'll need to manually trust these certificates on each device.

### 🍎 iOS/iPhone/iPad

1. Open Safari and navigate to your Attraccess URL
2. Tap "Advanced" when you see the certificate warning
3. Tap "Proceed to [domain]"
4. Go to **Settings** → **General** → **About** → **Certificate Trust Settings**
5. Enable full trust for your certificate under "Enable Full Trust for Root Certificates"

### 🤖 Android

1. Download the certificate file (`yourdomain.com.pem`) to your device
2. Go to **Settings** → **Security** → **Encryption & credentials** → **Install from storage**
3. Select the certificate file and give it a name
4. Set "Used for" to "VPN and apps"

### 🍎 macOS

1. Double-click the certificate file (`yourdomain.com.pem`) to open Keychain Access
2. Select "System" keychain and click "Add"
3. Find the certificate in Keychain Access
4. Right-click the certificate and select "Get Info"
5. Expand "Trust" and set "When using this certificate" to "Always Trust"

### 🪟 Windows

1. Double-click the certificate file (`yourdomain.com.pem`)
2. Click "Install Certificate"
3. Choose "Local Machine" and click "Next"
4. Select "Place all certificates in the following store"
5. Click "Browse" and select "Trusted Root Certification Authorities"
6. Click "Next" and "Finish"

### 🌐 Desktop Browsers

#### Chrome/Edge

1. Navigate to your Attraccess URL
2. Click "Advanced" on the security warning
3. Click "Proceed to [domain] (unsafe)"
4. Alternatively, add `--ignore-certificate-errors` to your browser launch arguments (development only)

#### Firefox

1. Navigate to your Attraccess URL
2. Click "Advanced" on the security warning
3. Click "Accept the Risk and Continue"

## ⚠️ Important Security Notes

### Self-Signed Certificates

- **Development/Testing Only**: Self-signed certificates are perfect for development, testing, or internal networks
- **Not for Public Production**: Do not use self-signed certificates for publicly accessible production instances
- **Trust Warnings**: Users will see security warnings until they manually trust the certificate
- **No Identity Verification**: Self-signed certificates encrypt data but don't verify the server's identity

### Best Practices

1. **Use Custom Certificates for Production**: Always use proper CA-signed certificates for production environments
2. **Regular Renewal**: Monitor certificate expiration dates and renew before expiry
3. **Secure Storage**: Keep private keys secure and limit access to certificate files
4. **Strong Domains**: Use proper domain names in your `ATTRACCESS_URL` configuration

## 🔧 Troubleshooting

### Certificate Not Found

If you see errors about missing certificates:

1. Verify certificate files exist in your storage directory
2. Check file permissions (should be readable by the container)
3. Ensure filenames match your domain exactly
4. Restart the container after placing certificates

### Browser Security Warnings

This is normal for self-signed certificates. Follow the device-specific instructions above to trust the certificate.

### Certificate Expired

For self-signed certificates:

1. Delete the expired certificate files
2. Restart with `SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true`

For custom certificates:

1. Obtain renewed certificates from your CA
2. Replace the certificate files
3. Restart the container

### Port Configuration

When using SSL, make sure to:

- Use HTTPS URLs in your `ATTRACCESS_URL`
- Map port 443 (standard HTTPS port) to container port 3000: `-p 443:3000`
- Update any firewall rules to allow HTTPS traffic on port 443

> [!NOTE]
> The container always runs on port 3000 internally, but for SSL we map the standard HTTPS port 443 to the container's port 3000. This allows users to access your Attraccess instance using the standard HTTPS port without specifying a port number in the URL.
