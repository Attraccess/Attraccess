// Minimal FW31 head may lack -c. One dd input block can be short on a pipe;
// account for its actual output before choosing the next bounded read. No fancy
// dd flags, pipefail, byte-at-a-time archive copy, or unbounded disk writes.
export const boundedReceiver = String.raw`file=$1
limit=$2
mode=$3
case "$mode" in native|terse) ;; *) exit 1 ;; esac
received=0
: > "$file"
while test "$received" -lt "$limit"; do
  chunk=$((limit - received))
  if test "$chunk" -gt 65536; then chunk=65536; fi
  dd bs="$chunk" count=1 >> "$file" 2>/dev/null || exit 1
  # The outer filesystem guard already positively identified this stat ABI.
  # One metadata process per input block avoids the guarded capture pipeline
  # (and its byte-at-a-time dd) on every short SSH pipe read. This is our own
  # private upload file; the full guard still validates its final size below.
  if test "$mode" = native; then
    next=$(command stat -c '%s' "$file") || exit 1
  else
    next=$(command stat -t "$file") || exit 1
    case "$next" in "$file "*) next=${'$'}{next#"$file "}; next=${'$'}{next%% *} ;; *) exit 1 ;; esac
  fi
  case "$next" in ''|*[!0-9]*) exit 1 ;; esac
  test "${'$'}{next#0}" = "$next" || test "$next" = 0 || exit 1
  test "${'$'}{#next}" -le 9 || exit 1
  test "$next" -ge "$received" || exit 1
  test "$next" -le "$limit" || exit 1
  if test "$next" = "$received"; then break; fi
  received=$next
done`;
