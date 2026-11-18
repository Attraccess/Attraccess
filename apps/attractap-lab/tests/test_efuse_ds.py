"""eFuse policy for the DS lab reader (ATT-1207): exactly two states, one way transition, own baseline."""

import json

import pytest

from attractap_lab import efuse

DS_MAC = "dc:b4:d9:21:71:c8"
OTHER_MAC = "7c:df:a1:00:11:22"
SECURE_LAB = {**efuse.SECURE_LAB_VALUES, "KEY_PURPOSE_2": "XTS_AES_128_KEY", "KEY_PURPOSE_4": "HMAC_UP",
              **{name: " ".join(digest[i:i + 2] for i in range(0, 64, 2))
                 for name, digest in efuse.LAB_KEY_DIGESTS.items()}}
# Layout of the BLOCK0 words below: WR_DIS word 0, RD_DIS word 1 bits 0-6, KEY_PURPOSE_3 word 5 bits 0-3,
# SECURE_VERSION word 4 bits 14-29, SPI_BOOT_CRYPT_CNT word 2 bits 18-20.
LAYOUT = {
    "WR_DIS": {"block": 0, "word": 0, "pos": 0, "bit_len": 32},
    "RD_DIS": {"block": 0, "word": 1, "pos": 0, "bit_len": 7},
    "KEY_PURPOSE_3": {"block": 0, "word": 5, "pos": 0, "bit_len": 4},
    "SECURE_VERSION": {"block": 0, "word": 4, "pos": 14, "bit_len": 16},
}
PRE_WORDS = ["0b801700", "000f0c14", "a984d1f5", "00500804", "00004102", "00000000"]
# The burn: RD_DIS 20 -> 28, purpose 3 = 7, three more WR_DIS bits (0, 26, 28).
POST_WORDS = ["1f801701", "000f0c1c", "a984d1f5", "00500804", "00004102", "00000007"]
KEY3_ZERO = " ".join(["00000000"] * 8)


def output(words=PRE_WORDS, post=False, mac=DS_MAC, overrides=None, key3=KEY3_ZERO, key0="00000000 00000000",
           version=1):
    summary = {name: {"value": value} for name, value in efuse.FACTORY_VALUES.items()}
    summary.update({name: {"value": value} for name, value in SECURE_LAB.items()})
    summary["MAC"] = {"value": f"{mac} (OK)"}
    for name, layout in LAYOUT.items():
        summary[name] = {**summary.get(name, {}), **layout}
    summary["SECURE_VERSION"]["value"] = version
    summary["RD_DIS"]["value"] = 28 if post else 20
    summary["RD_DIS"]["writeable"] = not post
    summary["KEY_PURPOSE_3"]["value"] = efuse.DS_PURPOSE if post else "USER"
    summary["BLOCK_KEY3"] = {"value": "?? ??" if post else KEY3_ZERO, "readable": not post}
    for name, value in (overrides or {}).items():
        summary[name] = {**summary.get(name, {}), **value}
    return (
        "espefuse v5.2.0\r\n\n=== Run \"dump\" command ===\n"
        f"BLOCK0          (                ) [0 ] dump: {' '.join(words)}\n"
        f"BLOCK_KEY0      (BLOCK4          ) [4 ] dump: {key0}\n"
        f"BLOCK_KEY3      (BLOCK7          ) [7 ] dump: {key3}\n"
        f"\n=== Run \"summary\" command ===\n{json.dumps(summary, indent=2)}\n"
    )


def check(text, tmp_path, mac=DS_MAC):
    return efuse.check(text, tmp_path, profile=efuse.SECURE_LAB)


def baseline(tmp_path, mac=DS_MAC):
    return tmp_path / f"{mac.replace(':', '')}.json"


def burned(tmp_path):
    """A baseline recorded before the burn, then the janitor's first sight of the burned reader."""
    check(output(), tmp_path)
    assert check(output(POST_WORDS, post=True), tmp_path) == DS_MAC


def test_pre_burn_state_passes_as_today(tmp_path):
    assert check(output(), tmp_path) == DS_MAC
    assert check(output(), tmp_path) == DS_MAC
    assert "ds" not in json.loads(baseline(tmp_path).read_text())


def test_first_sight_of_the_burn_rerecords_and_keeps_the_old_baseline(tmp_path):
    check(output(), tmp_path)
    old = baseline(tmp_path).read_text()
    assert check(output(POST_WORDS, post=True), tmp_path) == DS_MAC
    kept = tmp_path / f"{DS_MAC.replace(':', '')}.pre-ds.json"
    assert kept.read_text() == old
    new = json.loads(baseline(tmp_path).read_text())
    assert new["ds"] == "post" and new["blocks"]["BLOCK0"] == " ".join(POST_WORDS)
    assert check(output(POST_WORDS, post=True), tmp_path) == DS_MAC


def test_post_burn_state_is_accepted_without_a_baseline(tmp_path):
    assert efuse.check(output(POST_WORDS, post=True), profile=efuse.SECURE_LAB) == DS_MAC
    assert check(output(POST_WORDS, post=True), tmp_path) == DS_MAC
    assert json.loads(baseline(tmp_path).read_text())["ds"] == "post"
    assert not list(tmp_path.glob("*.pre-ds.json"))


def test_no_way_back_after_the_burn(tmp_path):
    burned(tmp_path)
    with pytest.raises(efuse.EfuseViolation, match="went back"):
        check(output(), tmp_path)
    # also for a baseline first recorded in the burned state
    other = tmp_path / "fresh"
    check(output(POST_WORDS, post=True), other)
    with pytest.raises(efuse.EfuseViolation, match="went back"):
        check(output(), other)


@pytest.mark.parametrize("overrides,message", [
    ({"KEY_PURPOSE_3": {"value": "USER"}}, "neither the state before nor after"),
    ({"BLOCK_KEY3": {"readable": True}}, "neither the state before nor after"),
    ({"RD_DIS": {"writeable": True}}, "neither the state before nor after"),
    ({"RD_DIS": {"value": 20}}, "neither the state before nor after"),
])
def test_half_burned_states_are_neither(tmp_path, overrides, message):
    with pytest.raises(efuse.EfuseViolation, match=message):
        check(output(POST_WORDS, post=True, overrides=overrides), tmp_path)
    assert not list(tmp_path.iterdir())


def test_burned_state_needs_purpose_key_and_locks_together(tmp_path):
    with pytest.raises(efuse.EfuseViolation, match="neither"):
        # purpose burned, read protection not: an interrupted burn quarantines the reader
        check(output(post=False, overrides={"KEY_PURPOSE_3": {"value": efuse.DS_PURPOSE}}), tmp_path)


@pytest.mark.parametrize("words,message", [
    # SPI_BOOT_CRYPT_CNT 1 -> 7 hides behind "Enable" in the summary
    (["1f801701", "000f0c1c", "a99cd1f5", "00500804", "00004102", "00000007"], "besides the DS burn"),
    # any other word, here word 3
    (["1f801701", "000f0c1c", "a984d1f5", "00500805", "00004102", "00000007"], "besides the DS burn"),
])
def test_other_block0_bits_change_in_the_transition_is_a_violation(tmp_path, words, message):
    check(output(), tmp_path)
    with pytest.raises(efuse.EfuseViolation, match=message):
        check(output(words, post=True), tmp_path)
    assert not list(tmp_path.glob("*.pre-ds.json")), "a rejected transition must not re-record"


def test_rd_dis_may_gain_key3_only(tmp_path):
    check(output(), tmp_path)
    words = ["1f801701", "000f0c3c", "a984d1f5", "00500804", "00004102", "00000007"]  # + KEY5 read protection
    with pytest.raises(efuse.EfuseViolation, match="RD_DIS changed by more than"):
        check(output(words, post=True, overrides={"RD_DIS": {"value": 60}}), tmp_path)


def test_wr_dis_may_only_gain_a_few_bits(tmp_path):
    check(output(), tmp_path)
    for word, message in (("1fbf1701", "WR_DIS changed"), ("0a801701", "WR_DIS changed")):
        words = [word, *POST_WORDS[1:]]
        with pytest.raises(efuse.EfuseViolation, match=message):
            check(output(words, post=True), tmp_path)


def test_purpose_3_must_have_been_unused(tmp_path):
    check(output(["0b801700", "000f0c14", "a984d1f5", "00500804", "00004102", "00000002"]), tmp_path)
    with pytest.raises(efuse.EfuseViolation, match="KEY_PURPOSE_3 was not unused"):
        check(output(POST_WORDS, post=True), tmp_path)


def test_other_key_blocks_may_not_change_in_the_transition(tmp_path):
    check(output(), tmp_path)
    with pytest.raises(efuse.EfuseViolation, match="BLOCK_KEY0"):
        check(output(POST_WORDS, post=True, key0="00000000 00000001"), tmp_path)


def test_key3_content_is_pinned_once_burned(tmp_path):
    burned(tmp_path)
    with pytest.raises(efuse.EfuseViolation, match="BLOCK_KEY3"):
        check(output(POST_WORDS, post=True, key3=" ".join(["00000000"] * 7 + ["00000001"])), tmp_path)


def test_burned_state_is_strict_after_the_first_sight(tmp_path):
    burned(tmp_path)
    for words, message in ((["1f801701", "000f0c1c", "a99cd1f5", "00500804", "00004102", "00000007"],
                            "BLOCK0 \\(besides SECURE_VERSION\\)"),
                           (["1f801701", "000f0c1c", "a984d1f5", "00500804", "00004102", "0000000f"],
                            "BLOCK0 \\(besides SECURE_VERSION\\)")):
        with pytest.raises(efuse.EfuseViolation, match=message):
            check(output(words, post=True), tmp_path)


def test_secure_version_masking_still_applies_in_both_states(tmp_path):
    burned(tmp_path)
    newer = POST_WORDS[:4] + ["00008102"] + POST_WORDS[5:]
    assert check(output(newer, post=True, version=2), tmp_path) == DS_MAC
    older = POST_WORDS[:4] + ["00000102"] + POST_WORDS[5:]
    with pytest.raises(efuse.EfuseViolation, match="SECURE_VERSION went from 1 to 0"):
        check(output(older, post=True, version=0), tmp_path)


def test_secure_version_may_grow_during_the_transition(tmp_path):
    check(output(), tmp_path)
    newer = POST_WORDS[:4] + ["00008102"] + POST_WORDS[5:]
    assert check(output(newer, post=True, version=2), tmp_path) == DS_MAC


def test_other_macs_get_no_second_state(tmp_path):
    check(output(mac=OTHER_MAC), tmp_path)
    with pytest.raises(efuse.EfuseViolation, match="BLOCK0 \\(besides SECURE_VERSION\\)"):
        check(output(POST_WORDS, post=True, mac=OTHER_MAC), tmp_path)
    assert not list(tmp_path.glob("*.pre-ds.json"))


def test_other_macs_never_get_the_ds_checks(tmp_path):
    # An odd KEY3 on another reader is not judged by the DS rules: only its own baseline matters.
    assert efuse.check(output(mac=OTHER_MAC, overrides={"KEY_PURPOSE_3": {"value": "HMAC_UP"}}),
                       profile=efuse.SECURE_LAB) == OTHER_MAC


def test_the_plain_profile_does_not_know_the_ds_state():
    plain = {name: {"value": value} for name, value in efuse.FACTORY_VALUES.items()}
    plain["MAC"] = {"value": f"{DS_MAC} (OK)"}
    text = ("=== Run \"dump\" command ===\nBLOCK0 (  ) [0 ] dump: 00000000 00000000\n"
            f"=== Run \"summary\" command ===\n{json.dumps(plain)}\n")
    assert efuse.check(text) == DS_MAC
