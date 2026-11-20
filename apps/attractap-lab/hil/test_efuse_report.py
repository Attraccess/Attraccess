"""The eFuse report of the secure-lab reader (ATT-1207).

READER_PROFILE=secure-lab runs a development-mode flash encryption image with the public lab Secure Boot
key, so the server must keep it *not secured* and name why. That is the expected result, not a failure:
a release (`secure` profile) build on a release-fused unit is the only thing that becomes secured, and no
such image ever goes on the lab reader. Skipped on every other profile.

The reader sends its report after the session is up (firmware 2.6.0); the server stores the result on the
reader record (`secured`, `securityReportProblems`, `securityReportCheckedAt`).
"""

import time

import pytest

from attractap_lab import efuse

from conftest import PROFILE

pytestmark = pytest.mark.skipif(PROFILE != efuse.SECURE_LAB, reason="needs the secure-lab reader")

# EfuseReportService: the build profile is `secure-lab`, not `secure`.
PROFILE_PROBLEM = "profile-not-secure"
# efuse-report.ts: development-mode flash encryption is not release mode.
FLASH_ENCRYPTION_PROBLEM = "flash-encryption-not-release"
# The lab reader's fuses (read-only dump in the janitor baseline): Secure Boot v2 on with the lab key in KEY0/KEY1,
# KEY2 XTS and KEY4 HMAC_UP read-protected, slot 2 revoked, both JTAGs off. A report the firmware really read from
# the chip passes these checks; a broken snapshot (every key USER, nothing set) fails them.
PASSING_EFUSE_CHECKS = {
    "secure-boot-disabled", "key0-purpose", "key1-purpose", "signing-key-revoked", "slot2-not-revoked",
    "key2-not-xts", "key4-not-nvs-hmac", "rd-dis-incomplete", "jtag-enabled",
}
# What the lab reader's fuses leave open on purpose (development mode): ROM download and manual encryption stay
# enabled and RD_DIS is not write-protected.
FAILING_EFUSE_CHECKS = {"rom-download-open", "manual-encrypt-enabled", "rd-dis-writable"}
REPORT_TIMEOUT = 120


def checked_record(api, admin, reader, timeout=REPORT_TIMEOUT):
    deadline = time.monotonic() + timeout
    while True:
        status, record = api.call("GET", f"/attractap/readers/{reader['id']}", token=admin)
        assert status == 200, record
        if record.get("securityReportCheckedAt"):
            return record
        assert time.monotonic() < deadline, "the server never received an eFuse report from the reader"
        time.sleep(3)


def test_secure_lab_reader_is_reported_not_secured(api, admin, reader, artifacts):
    record = checked_record(api, admin, reader)
    (artifacts / "efuse-report-record.txt").write_text(
        f"secured={record['secured']} profile={record.get('firmwareProfile')} "
        f"efuseSecureVersion={record.get('efuseSecureVersion')} problems={record['securityReportProblems']}\n")
    assert record["secured"] is False
    assert record["securedAt"] is None
    problems = record["securityReportProblems"]
    assert PROFILE_PROBLEM in problems, problems
    assert FLASH_ENCRYPTION_PROBLEM in problems, problems
    assert not PASSING_EFUSE_CHECKS & set(problems), problems
    assert FAILING_EFUSE_CHECKS <= set(problems), problems
    assert record["firmwareProfile"] == "secure-lab"
    # The report is read from the chip: the lab reader's SECURE_VERSION is the baseline's.
    assert record["efuseSecureVersion"] is not None
