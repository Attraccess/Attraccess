// Pinned authenticated capture supplied by the owner. Not live qualification.
export const fw31OsRelease = `NAME=PTXdist
VERSION="2024.12.0"
ID=ptxdist
VERSION_ID="2024.12.0"
PRETTY_NAME="PTXdist / WAGO-CTL"
ANSI_COLOR="1;34"

PTXDIST_VERSION="2024.12.0"
PTXDIST_BSP_VENDOR="WAGO"
PTXDIST_BSP_NAME="CTL"
PTXDIST_BSP_VERSION="CTL-trunk"
PTXDIST_PLATFORM_NAME="cc100"
PTXDIST_PLATFORM_VERSION="-trunk"
PTXDIST_BUILD_DATE="2026-04-29T14:25:04+0000"
`;
export const fw31Revisions = 'FIRMWARE=04.09.01(31)\n';
export const fw31Model = 'CC100-751-9301\0';
export function fw31IdentityOutput(osRelease = fw31OsRelease, revisions = fw31Revisions, model = fw31Model): string {
  return (
    [osRelease, revisions, model].map((text, i) => `source${i}\n${[...Buffer.from(text)].join(' ')}\n`).join('') +
    'complete\n'
  );
}
