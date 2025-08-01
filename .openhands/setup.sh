#!/bin/bash

echo "Installing pnpm..."
npm install -g pnpm

echo "Installing node modules..."
pnpm install

echo "Installing PlatformIO Core..."
pip3 install -U platformio

echo "Configuring Git commit signing..."

# Configure SSH key signing if both public and private keys are provided
if [ -n "$GIT_SIGNING_KEY_PUBLIC" ] && [ -n "$GIT_SIGNING_KEY_PRIVATE" ]; then
    # Create .ssh directory if it doesn't exist
    mkdir -p ~/.ssh
    chmod 700 ~/.ssh
    
    # Write the private key to the SSH directory
    echo "$GIT_SIGNING_KEY_PRIVATE" > ~/.ssh/id_ed25519
    chmod 600 ~/.ssh/id_ed25519
    
    # Write the public key to the SSH directory
    echo "$GIT_SIGNING_KEY_PUBLIC" > ~/.ssh/id_ed25519.pub
    chmod 644 ~/.ssh/id_ed25519.pub
    
    # Start SSH agent and add the key
    eval "$(ssh-agent -s)"
    ssh-add ~/.ssh/id_ed25519
    
    # Configure Git to use SSH for signing
    git config --global gpg.format ssh
    git config --global user.signingkey ~/.ssh/id_ed25519
    git config --global commit.gpgsign true
    git config --global tag.gpgsign true
    
    echo "Git commit signing with SSH key configured successfully."
    echo "Public key fingerprint: $(ssh-keygen -lf ~/.ssh/id_ed25519.pub)"
else
    echo "Warning: GIT_SIGNING_KEY_PUBLIC and/or GIT_SIGNING_KEY_PRIVATE environment variables not set. Git commit signing not configured."
fi

echo "Setup complete."
