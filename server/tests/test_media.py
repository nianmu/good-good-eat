"""媒体代理路由测试：路径安全校验 + gitee URL 转换（回源依赖外网，不入测试）。"""

from __future__ import annotations

from app.api.v1.media import _translate_media_uri

RAW = "https://gitee.com/Anduin2017/HowToCook/raw/master/dishes/aquatic/油焖大虾/虾.jpg"


def test_translate_media_uri():
    assert _translate_media_uri(RAW) == "/api/v1/media/htc/dishes/aquatic/油焖大虾/虾.jpg"
    assert _translate_media_uri(f"{RAW}?x=1") == "/api/v1/media/htc/dishes/aquatic/油焖大虾/虾.jpg?x=1"
    # 非 HowToCook gitee 链接原样
    assert _translate_media_uri("https://gitee.com/other/repo/raw/master/a.jpg") == "https://gitee.com/other/repo/raw/master/a.jpg"
    assert _translate_media_uri("https://example.com/a.jpg") == "https://example.com/a.jpg"
    assert _translate_media_uri(None) is None


def test_media_rejects_unsafe_paths(client):
    # 非 dishes 前缀
    assert client.get("/api/v1/media/htc/etc/passwd").status_code == 404
    assert client.get("/api/v1/media/htc/README.md").status_code == 404
    # 穿越
    assert client.get("/api/v1/media/htc/dishes/aquatic/../../secrets.jpg").status_code == 404
    # 少于两层
    assert client.get("/api/v1/media/htc/dishes").status_code == 404
    # 合法路径 → 会尝试回源，但不在测试中要求成功（可能 200 或 404/502，取决于网络）
    resp = client.get("/api/v1/media/htc/dishes/aquatic/x.jpg")
    assert resp.status_code in (200, 404, 502)