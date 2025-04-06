"""Key validation is the boundary that stops a caller choosing what we read."""

import pytest

from common import keys


def test_new_visitor_key_is_accepted_by_the_validator():
    # The minting and validating halves must agree, or every upload 400s.
    assert keys.is_valid_visitor_key(keys.new_visitor_key())


def test_new_visitor_keys_are_unique():
    assert keys.new_visitor_key() != keys.new_visitor_key()


@pytest.mark.parametrize(
    "key",
    [
        "",
        None,
        "visitors/../employees/ceo.jpg",       # path traversal
        "employees/ceo.jpg",                   # wrong prefix entirely
        "visitors/ceo.jpg",                    # right prefix, not a UUID
        "visitors/not-a-uuid.jpg",
        "visitors/8f14e45f-ceea-467a-9a36-dedd4bea2543.png",   # wrong suffix
        "visitors/8f14e45f-ceea-467a-9a36-dedd4bea2543.jpg/x",  # suffix smuggling
        "VISITORS/8f14e45f-ceea-467a-9a36-dedd4bea2543.jpg",   # case
    ],
)
def test_rejects_keys_the_api_did_not_mint(key):
    assert not keys.is_valid_visitor_key(key)


def test_parse_employee_key_splits_the_name():
    assert keys.parse_employee_key("employees/ada_lovelace.jpg") == (
        "Ada",
        "Lovelace",
    )


@pytest.mark.parametrize(
    "key",
    [
        "employees/nolastname.jpg",
        "employees/ada_lovelace.png",
        "employees/Ada_Lovelace.jpg",   # uppercase not in the scheme
        "other/ada_lovelace.jpg",
        "employees/ada_lovelace_iii.jpg",
    ],
)
def test_parse_employee_key_returns_none_for_unparseable_names(key):
    assert keys.parse_employee_key(key) is None
