"""pytest 全局夹具：独立测试库 engine、session 级建/拆表、每用例清表、TestClient。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.main import app

settings = get_settings()

TEST_ENGINE = create_engine(
    settings.test_database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
)
TestSessionLocal = sessionmaker(
    bind=TEST_ENGINE,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

# 确保所有模型注册到 Base.metadata（create_all / drop_all 用的就是它）
from app import models  # noqa: E402,F401

# 清表顺序：子表 → 父表（外键依赖）
_TABLES_IN_DELETE_ORDER = (
    "messages",
    "order_items",
    "orders",
    "activity_items",
    "activities",
    "team_members",
    "favorites",
    "recipe_favorites",
    "plan_items",
    "plans",
    "recipes",
    "fridge_items",
    "basket_items",
    "user_identities",
    "dishes",
    "teams",
    "categories",
    "users",
)


@pytest.fixture(scope="session")
def _schema():
    """session 级：先拆后建，保证测试库始终对齐当前模型（含新增表/列），结束后整库拆表。"""
    Base.metadata.drop_all(TEST_ENGINE)
    Base.metadata.create_all(TEST_ENGINE)
    yield
    Base.metadata.drop_all(TEST_ENGINE)


@pytest.fixture(scope="session", autouse=True)
def _patch_ws_session():
    """WS 房间处理器直接用 app.core.db.SessionLocal（开发库）；
    测试期间替换为测试库会话，避免查错库导致成员校验失败。"""
    import app.ws.handlers as ws_handlers

    ws_handlers.SessionLocal = TestSessionLocal
    yield


@pytest.fixture(autouse=True)
def _clean_tables(_schema):
    """每个测试函数前清空全部表。"""
    with TEST_ENGINE.begin() as conn:
        for table in _TABLES_IN_DELETE_ORDER:
            conn.execute(text(f"DELETE FROM {table}"))
    yield


@pytest.fixture
def client(_schema):
    """TestClient：依赖覆盖 get_db → 测试库会话。"""
    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def db_session(_schema):
    """直接操作测试库的 Session（用于造团队/成员等前置数据）。"""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def seeded(client):
    """跑一遍种子数据（幂等），返回新增数量统计。"""
    from seed.seed_data import seed_all

    db = TestSessionLocal()
    try:
        result = seed_all(db)
    finally:
        db.close()
    return result