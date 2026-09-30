import { wagoFw31IdentityCheck } from './wago-firmware-identity';
import { wagoShellStat } from './wago-shell-stat';

/** Runtime classification only: this never grants permission to own DOUT. Requires root (or an isolated fixture root). */
export function wagoCodesysClassificationShell(): string {
  return String.raw`
wago_codesys_classify() (
  export LC_ALL=C
  ${wagoShellStat()}
  # Preserve read failures, framing and NULs rather than letting shell substitution hide them.
  codesys_read() {
    value=$( (cat "$1" && printf '\nCODESYS_READ_OK') | dd bs=1 count=16385 2>/dev/null | tr '\000' '\001') || return 1
    test "${'$'}{#value}" -le 16384 || return 1
    case "$value" in *"$(printf '\001')"*) return 1 ;; esac
    case "$value" in *'
CODESYS_READ_OK') value=${'$'}{value%'
CODESYS_READ_OK'} ;; *) return 1 ;; esac
    printf '%s' "$value"
  }
  codesys_comm() {
    framed=$(codesys_read "$1" && printf '.') || return 1
    case "$framed" in *'
.') framed=${'$'}{framed%'
.'} ;; *) return 1 ;; esac
    printf '%s\n' "$framed" | awk 'NR!=1 || length($0)<1 || length($0)>15 || /[^ -~]/ { bad=1 } END { exit (bad || NR!=1) }' || return 1
    printf '%s' "$framed"
  }
  codesys_exe() {
    test "$(readlink "$1" && printf '.')" = '/usr/sbin/pp_codesys3
.' || return 1
    stat -Lc '%d:%i' "$1"
  }
  codesys_snapshot() (
    test -d "$root/proc/1" && test -r "$root/proc" && test -x "$root/proc" || exit 1
    # Bound native enumeration and retain its exit status and final newline.
    # Only candidates get /proc observations; unrelated process churn is normal.
    rows=$( (timeout -k 5 10 ps -eo pid=,comm= && printf 'CODESYS_PS_OK\n') | dd bs=1 count=131073 2>/dev/null | tr '\000' '\001') || exit 1
    test "${'$'}{#rows}" -le 131072 || exit 1
    case "$rows" in *"$(printf '\001')"*) exit 1 ;; esac
    case "$rows" in *'
CODESYS_PS_OK') rows=${'$'}{rows%'
CODESYS_PS_OK'} ;; *) exit 1 ;; esac
    candidates=$(printf '%s\n' "$rows" | awk '
      {
        if (NR>4096 || length($0)>4096 || $0 !~ /^[ \t]*[1-9][0-9]*[ \t]+[ -~]+$/) { bad=1; next }
        pid=$1
        if (length(pid)>10 || pid+0>2147483647 || seen[pid]++) bad=1
        sub(/^[ \t]*[0-9]+[ \t]+/, "")
        # Native ps can report extended kernel names; match the entire comm without truncation.
        if (length($0)<1) bad=1
        if (pid==1) init=1
        if (tolower($0) ~ /codesys|plclinux_rt|rtswrapper/) {
          if (++count>128) bad=1
          print pid " " $0
        }
      }
      END { exit (bad || !init) }') || exit 1
    candidates=$(printf '%s\n' "$candidates" | sort -n) || exit 1
    while read -r pid listed_comm; do
      test -n "$pid" || continue
      process="$root/proc/$pid"
      test -d "$process" && test ! -L "$process" || exit 1
      comm=$(codesys_comm "$process/comm") || exit 1
      test "$comm" = "$listed_comm" || exit 1
      identity=$(codesys_read "$process/stat" && printf '.') || exit 1
      case "$identity" in *'
.') identity=${'$'}{identity%'
.'} ;; *) exit 1 ;; esac
      start=$(printf '%s\n' "$identity" | awk -v pid="$pid" '
        NR!=1 || $1!=pid || $1 !~ /^[1-9][0-9]*$/ { bad=1 }
        { if (!sub(/^[0-9]+ [(].*[)] /,"")) bad=1
          if (NF!=50 || $1 !~ /^[RSDZTtXxKWPIN]$/ || $20 !~ /^[0-9]+$/) bad=1
          for (i=2; i<=NF; i++) if ($i !~ /^-?[0-9]+$/) bad=1
          start=$20 }
        END { if (bad || NR!=1) exit 1; print start }') || exit 1
      if test "$comm" = pp_codesys3; then exe=$(codesys_exe "$process/exe") || exit 1
      else exe=$(stat -Lc '%d:%i' "$process/exe") || exit 1; fi
      printf '%s %s %s %s\n' "$pid" "$start" "$exe" "$comm"
    done <<EOF_CANDIDATES
$candidates
EOF_CANDIDATES
  )
  codesys_credentials() (
    status=$(codesys_read "$1") || exit 1
    printf '%s\n' "$status" | awk '
      /^Uid:/ { u++; if (NF!=5 || $2!="0" || $3!="0" || $4!="0" || $5!="0") bad=1 }
      /^Gid:/ { g++; if (NF!=5 || $2!="0" || $3!="0" || $4!="0" || $5!="0") bad=1 }
      END { if (bad || u!=1 || g!=1) exit 1; print "Uid: 0 0 0 0\nGid: 0 0 0 0" }'
  )
  codesys_provider() (
    process="$root/proc/$1"
    test "$(codesys_comm "$process/comm")" = pp_codesys3 || exit 1
    inode=$(codesys_exe "$process/exe") || exit 1
    credentials=$(codesys_credentials "$process/status") || exit 1
    digest=$(sha256sum < "$process/exe") || exit 1
    test "$digest" = 'f37752c01173911379286db7f4ae0f9ab5d6327c63d49c7a07b2ba37de9bd6bf  -' || exit 1
    ending_inode=$(codesys_exe "$process/exe") || exit 1
    test "$ending_inode" = "$inode" || exit 1
    test "$(codesys_comm "$process/comm")" = pp_codesys3 || exit 1
    test "$(codesys_credentials "$process/status")" = "$credentials" || exit 1
    printf '%s\n' "$inode"
  )
  codesys_observe() (
    snapshot=$(codesys_snapshot) || exit 1
    printf '%s\n' "$snapshot"
    while read -r pid start exe comm; do
      case "$comm" in '') continue ;; esac
      if test "$comm" != pp_codesys3; then
        printf 'active\n'
      else
        ${wagoFw31IdentityCheck(true)} || exit 1
        provider=$(codesys_provider "$pid") || exit 1
        test "$provider" = "$exe" || exit 1
        printf 'provider %s %s\n' "$pid" "$provider"
      fi
    done <<EOF_CODESYS
$snapshot
EOF_CODESYS
    ending_snapshot=$(codesys_snapshot) || exit 1
    test "$ending_snapshot" = "$snapshot" || exit 1
  )
  before=$(codesys_observe) || { printf 'unknown\n'; exit 0; }
  after=$(codesys_observe) || { printf 'unknown\n'; exit 0; }
  if test "$before" != "$after"; then printf 'unknown\n'
  else
    case "$before" in *'
active') printf 'active\n' ;; *'
active
'*) printf 'active\n' ;; *) printf 'inactive\n' ;; esac
  fi
)
`;
}

export function parseWagoCodesysClassification(output: string): 'active' | 'inactive' | 'unknown' {
  return output === 'active\n' ? 'active' : output === 'inactive\n' ? 'inactive' : 'unknown';
}
