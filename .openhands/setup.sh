#!/bin/bash

echo "Installing pnpm..."
npm install -g pnpm

echo "Installing node modules..."
pnpm install

echo "Installing PlatformIO Core..."
pip3 install -U platformio

echo "Configuring Git commit signing..."
# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Write the signing key to a file
if [ -n "$GIT_SIGNING_KEY" ]; then
    echo "$GIT_SIGNING_KEY" > "$HOME/.ssh/git_signing_key"
    chmod 600 "$HOME/.ssh/git_signing_key"
    
    # Configure Git to use the SSH key for signing
    git config --global gpg.format ssh
    git config --global user.signingkey "$HOME/.ssh/git_signing_key"
    git config --global commit.gpgsign true
    git config --global tag.gpgsign true
    
    echo "Git commit signing configured successfully."
else
    echo "Warning: GIT_SIGNING_KEY environment variable not set. Git commit signing not configured."
fi

echo "Setup complete."
