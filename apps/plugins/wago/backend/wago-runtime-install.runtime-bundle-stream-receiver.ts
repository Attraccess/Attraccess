/** Decode only the first stdin line; leave the binary bundle for the locked script. */
export const runtimeBundleStreamReceiver = `set -eu
umask 077
directory=$(mktemp -d "\${TMPDIR:-/tmp}/attraccess-wago-receiver.XXXXXX")
trap 'code=$?; trap - EXIT HUP INT TERM; rm -rf "$directory"; exit "$code"' EXIT
child=
interrupt() {
  trap '' HUP INT TERM
  if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
  exit "$1"
}
trap 'interrupt 129' HUP
trap 'interrupt 130' INT
trap 'interrupt 143' TERM
chmod 0700 "$directory"
IFS= read -r payload
printf '%s' "$payload" | base64 -d > "$directory/script"
chmod 0600 "$directory/script"
unset payload
exec 3<&0
sh "$directory/script" <&3 &
child=$!
wait "$child"
`;
