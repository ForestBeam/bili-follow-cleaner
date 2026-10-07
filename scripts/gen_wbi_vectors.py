#!/usr/bin/env python3
"""Generate wbi signing fixtures from the reference implementation used by bili_unfollow.py."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode

MIXIN_KEY_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]

IMG_KEY = "7f1a3c9d2b8e4065af17c2d94e6b8031"
SUB_KEY = "c4e0d8196a2f53b7e0948c1d7b62fa35"


def mixin_key(raw: str) -> str:
    return "".join(raw[i] for i in MIXIN_KEY_TAB)[:32]


def sign(params: dict, wts: int) -> tuple[str, str]:
    cleaned = {k: "".join(ch for ch in str(v) if ch not in "!'()*") for k, v in params.items()}
    cleaned["wts"] = wts
    query = urlencode(sorted(cleaned.items()))
    return query, hashlib.md5((query + mixin_key(IMG_KEY + SUB_KEY)).encode()).hexdigest()


CASES = [
    {"vmid": "12345678", "pn": 1, "ps": 50, "order": "desc", "order_type": "attention", "jsonp": "jsonp"},
    {"q": "Hello!(World)*", "tag": "a b~c-d_e.f", "kw": "关注列表", "empty": ""},
    {"mid": "10086", "type": "unfollow"},
]
WTS = [1700000000, 1700000123, 1700000999]

fixtures = []
for params, wts in zip(CASES, WTS):
    query, w_rid = sign(params, wts)
    fixtures.append(
        {
            "imgKey": IMG_KEY,
            "subKey": SUB_KEY,
            "wts": wts,
            "params": {k: str(v) for k, v in params.items()},
            "expectedQuery": query,
            "expectedMixinKey": mixin_key(IMG_KEY + SUB_KEY),
            "expectedWRid": w_rid,
        }
    )

out = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "wbi-vectors.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(fixtures, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out} ({len(fixtures)} cases)")
