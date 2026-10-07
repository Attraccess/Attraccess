import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { preamble } from './wago-runtime-update-shell.preamble';

export function runtimeUpdateAcceptScript(
  token: string,
  profile: Cc100HardwareProfile,
  testRoot = '',
  helperParameters = false,
) {
  return `${preamble(token, profile, testRoot, helperParameters)}
require_transaction
case "$(cat "$tx/phase")" in verifying|accepted) ;; *) fail 'Update is not ready for acceptance' ;; esac
owned_new_container || fail 'Foreign runtime container'
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime is not running'
test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = "$(cat "$tx/image-id")" || fail 'Runtime image mismatch'
phase accepted
`;
}
