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
    assert record["firmwareProfile"] == "secure-lab"
    # The report is read from the chip: the lab reader's SECURE_VERSION is the baseline's.
    assert record["efuseSecureVersion"] is not None
