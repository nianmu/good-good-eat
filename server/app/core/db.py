"""数据库会话与模型基类。

- 开发期用同步 SQLAlchemy + pymysql 驱动（MySQL8, utf8mb4）
- 统一通过 get_db 依赖注入获取会话
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.debug,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """所有 ORM 模型的公共基类。"""


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：请求级会话，始终关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()