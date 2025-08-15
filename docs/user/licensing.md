# Licensing

Attraccess includes license verification. A valid license key is required at startup via the `LICENSE_KEY` environment variable.

> [!NOTE]
> If `LICENSE_KEY` is missing or empty, the application will stop at startup and display an error message that also includes instructions for non-profit organizations.

## Non-profit usage (free)

Non-profit organizations may use Attraccess for free by setting `LICENSE_KEY` to exactly the following value:

```
I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md
```

This special key enables all modules without usage limits and marks your instance as non-profit.

## Commercial licenses

For commercial usage beyond the 30-day trial, please obtain a valid license key. Contact us at `contact@attraccess.org` and we will help you get set up.

## How to set `LICENSE_KEY`

You can provide the license key via environment variables in several ways:

### Shell / local `.env`

```bash
export LICENSE_KEY="I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md"
```

### Docker Compose

```yaml
services:
  attraccess:
    image: attraccess/attraccess:latest
    environment:
      LICENSE_KEY: 'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md'
```

### Docker CLI

```bash
docker run -e LICENSE_KEY="I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md" attraccess/attraccess:latest
```

## Troubleshooting

- If the app exits on startup with a configuration error, check that `LICENSE_KEY` is set correctly. The error message will include guidance for non-profits.
- Ensure quotes are used appropriately in your shell or YAML to preserve the exact key text.

## Further reading

- Source-available license details: see `LICENSE.md` in the repository.
- Installation and environment variables: see [Setup → Installation](../setup/installation.md).
