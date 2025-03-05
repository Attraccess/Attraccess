#!/bin/bash
set -e

# Default values
NX_TOKEN=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --nx-token=*)
      NX_TOKEN="${1#*=}"
      shift
      ;;
    --nx-token)
      NX_TOKEN="$2"
      shift 2
      ;;
    *)
      # Unknown option
      shift
      ;;
  esac
done

# Read Node version from .nvmrc
NODE_VERSION=$(cat .nvmrc | tr -d '[:space:]')
echo "Building Docker image with Node version: $NODE_VERSION"

# Build arguments
BUILD_ARGS=(
  "--build-arg" "NODE_VERSION=$NODE_VERSION"
)

# Secret arguments for NX_CLOUD_ACCESS_TOKEN
SECRET_ARGS=()
if [[ -n "$NX_TOKEN" ]]; then
  # Enable BuildKit for secret support
  export DOCKER_BUILDKIT=1
  SECRET_ARGS=("--secret" "id=nx_token,env=NX_CLOUD_ACCESS_TOKEN")
  # Set the environment variable for the current process
  export NX_CLOUD_ACCESS_TOKEN="$NX_TOKEN"
  echo "Using provided Nx Cloud Access Token as build secret"
else
  echo "No Nx Cloud Access Token provided"
fi

# Build the Docker image
echo "Running docker build with arguments: ${BUILD_ARGS[@]}"
docker build \
  "${BUILD_ARGS[@]}" \
  "${SECRET_ARGS[@]}" \
  -t attraccess:latest \
  .

echo "Docker image built successfully with tag: attraccess:latest" 