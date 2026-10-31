# Secure boot fixtures

Test data for `secure-boot-signer.spec.ts`.

- `throwaway-key.pem` is a **throwaway RSA-3072 test key**. It protects nothing and must never be used for a real installation or device. To make a new one: `espsecure generate-signing-key --version 2 --scheme rsa3072 throwaway-key.pem`.
- `image.bin` is 5000 bytes of dummy data, not a real app image: `python3 -c "import sys; sys.stdout.buffer.write(bytes((i * 7) % 251 for i in range(5000)))" > image.bin`.
- `image.signed.bin` is espsecure's output for it: `espsecure sign-data --version 2 --keyfile throwaway-key.pem -o image.signed.bin image.bin`. The spec compares everything except the randomised PSS signature and its CRC byte-for-byte.
- The eFuse key digest hard-coded in the spec comes from `espsecure digest-sbv2-public-key --keyfile throwaway-key.pem -o digest.bin`.

Regenerating the key or image changes `image.signed.bin` and the hard-coded digest, so update all of them together.
