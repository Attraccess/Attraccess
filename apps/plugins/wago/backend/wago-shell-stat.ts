/** GNU metadata formats used by our guards, with the FW31 BusyBox terse ABI only. */
export function wagoShellStat(): string {
  return String.raw`
# Private shell state: probe -> native|terse, or invalid on any probe failure.
# Reset at every emission: inherited environment values are never evidence.
wago_stat_mode=probe
stat() (
  export LC_ALL=C
  case "$wago_stat_mode" in probe|native|terse) ;; *) exit 1 ;; esac
  export WAGO_STAT_MODE="$wago_stat_mode"
  test "$#" = 3 || exit 1
  case "$1" in -c) terse=-t ;; -Lc) terse=-Lt ;; *) exit 1 ;; esac
  case "$2" in '%u'|'%u:%a'|'%u:%a:%h'|'%u:%g'|'%u:%g:%a'|'%u:%g:%a:%h'|'%d:%i') ;; *) exit 1 ;; esac
  export WAGO_STAT_FORMAT="$2" WAGO_STAT_PATH="$3"
  case "$WAGO_STAT_PATH" in ''|*'
'*) exit 1 ;; -*) WAGO_STAT_PATH="./$WAGO_STAT_PATH" ;; esac
  test "${'$'}{#WAGO_STAT_PATH}" -le 4096 || exit 1
  wago_stat_invalid=$(printf '\001')
  # Bound captured bytes and retain the producer status even without pipefail.
  # Mark failures too; the outer dot preserves newlines at the byte limit so
  # truncated output cannot impersonate a complete successful capture.
  wago_stat_capture() {
    wago_stat_output=$( (if command stat "$@" 2>/dev/null; then printf '\nWAGO_STAT_OK'; else printf '\nWAGO_STAT_FAILED'; fi) | dd bs=1 count=8193 2>/dev/null | tr '\000' '\001' && printf '.') || return 1
    wago_stat_output=${'$'}{wago_stat_output%.}
    test "${'$'}{#wago_stat_output}" -le 8192 || return 1
    case "$wago_stat_output" in *"$wago_stat_invalid"*) return 1 ;; esac
    case "$wago_stat_output" in *'
WAGO_STAT_OK') wago_stat_output=${'$'}{wago_stat_output%'
WAGO_STAT_OK'} ;; *) return 1 ;; esac
    case "$wago_stat_output" in *'
') ;; *) return 1 ;; esac
  }
  # Prefer the native observation. Only the positively identified no-format
  # BusyBox build below may fall back; native tool file errors remain failures.
  if test "$wago_stat_mode" != terse && wago_stat_capture "$1" "$2" "$WAGO_STAT_PATH"; then
    printf '%s' "$wago_stat_output" | awk '
      BEGIN { n=split(ENVIRON["WAGO_STAT_FORMAT"], f, ":") }
      NR != 1 || NF != 1 { bad=1 }
      { if (split($0, a, ":") != n) bad=1
        for (i=1; i<=n; i++) {
          if (a[i] !~ /^(0|[1-9][0-9]*)$/ || length(a[i])>20) bad=1
          if (length(a[i])==20 && "x" a[i] > "x18446744073709551615") bad=1
          if (f[i]=="%a" && (a[i] !~ /^[0-7]+$/ || length(a[i])>4)) bad=1
        }
        result=$0 }
      END { if (bad || NR!=1) exit 1; print (ENVIRON["WAGO_STAT_MODE"]=="probe" ? "native" : result) }'
    exit $?
  fi
  if test "$wago_stat_mode" != terse; then
    # A verified native tool's file errors must never trigger fallback.
    test "$wago_stat_mode" = probe || exit 1
    # Do not infer compatibility from a failed -c invocation alone.
    wago_stat_help=$( (if command stat --help 2>&1; then printf '\nWAGO_STAT_OK'; else printf '\nWAGO_STAT_FAILED'; fi) | dd bs=1 count=8193 2>/dev/null | tr '\000' '\001' && printf '.') || exit 1
    wago_stat_help=${'$'}{wago_stat_help%.}
    test "${'$'}{#wago_stat_help}" -le 8192 || exit 1
    case "$wago_stat_help" in *"$wago_stat_invalid"*) exit 1 ;; esac
    case "$wago_stat_help" in *'
WAGO_STAT_OK') wago_stat_help=${'$'}{wago_stat_help%'
WAGO_STAT_OK'} ;; *) exit 1 ;; esac
    printf '%s\n' "$wago_stat_help" | awk '
      /^BusyBox v1[.]37[.]0 \(.*\) multi-call binary[.]$/ { version++ }
      /^Usage: stat \[-ltf\] FILE[.][.][.]$/ { usage++ }
      END { exit (version!=1 || usage!=1) }' || exit 1
  fi
  wago_stat_capture "$terse" "$WAGO_STAT_PATH" || exit 1
  printf '%s' "$wago_stat_output" | awk '
    function decimal(s) {
      return s ~ /^(0|[1-9][0-9]*)$/ && length(s)<=20 &&
        (length(s)<20 || "x" s <= "x18446744073709551615")
    }
    # Convert hex device IDs without rounding 64-bit identities in awk doubles.
    function hexdecimal(s,    out,i,j,carry,digits,digit) {
      out="0"
      for (i=1; i<=length(s); i++) {
        carry=index("0123456789abcdef",substr(s,i,1))-1; digits=""
        for (j=length(out); j>0; j--) {
          digit=substr(out,j,1)*16+carry
          digits=(digit%10) digits; carry=int(digit/10)
        }
        while (carry) { digits=(carry%10) digits; carry=int(carry/10) }
        out=digits
      }
      return out
    }
    NR != 1 { bad=1; next }
    {
      prefix=ENVIRON["WAGO_STAT_PATH"] " "
      if (substr($0,1,length(prefix)) != prefix) { bad=1; next }
      rest=substr($0,length(prefix)+1)
      if (rest ~ /[^0-9a-f -]/ || rest ~ /^ / || rest ~ / $/ || rest ~ /  / || split(rest,a," ")!=14) { bad=1; next }
      for (i=1; i<=14; i++) {
        if (i==3 || i==6 || i==9 || i==10) continue
        value=a[i]; if (i>=11 && i<=13) sub(/^-/,"",value)
        if (!decimal(value)) bad=1
      }
      # Anonymous Linux inodes can have permissions without file-type bits.
      # Callers still enforce directory/regular-file types with test -d/-f.
      if (a[3] !~ /^[0-9a-f]+$/ || length(a[3])>4 ||
          (length(a[3])==4 && a[3] !~ /^[12468ac]/)) bad=1
      for (i=6; i<=10; i++) {
        if (i==7 || i==8) continue
        if (a[i] !~ /^[0-9a-f]+$/ || length(a[i])>16) bad=1
      }
      if (bad) next
      mode=hexdecimal(a[3])+0
      permissions=sprintf("%o", mode%4096)
      fmt=ENVIRON["WAGO_STAT_FORMAT"]
      if (fmt=="%u") result=a[4]
      else if (fmt=="%u:%a") result=a[4] ":" permissions
      else if (fmt=="%u:%a:%h") result=a[4] ":" permissions ":" a[8]
      else if (fmt=="%u:%g") result=a[4] ":" a[5]
      else if (fmt=="%u:%g:%a") result=a[4] ":" a[5] ":" permissions
      else if (fmt=="%u:%g:%a:%h") result=a[4] ":" a[5] ":" permissions ":" a[8]
      else if (fmt=="%d:%i") result=hexdecimal(a[6]) ":" a[7]
      else bad=1
    }
    END { if (bad || NR!=1) exit 1; print (ENVIRON["WAGO_STAT_MODE"]=="probe" ? "terse" : result) }'
)
# Probe an existing root, not a requested file whose native error could be
# mistaken for an unsupported option. Function arguments leave caller "$@" intact.
wago_stat_mode=$(stat -c '%u:%g:%a' "${'$'}{root:-/}") || wago_stat_mode=invalid
`;
}
