"""好大一颗菜 · 后端服务配置。

环境变量以 .env 为准（不入库），详见 .env.example。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "好大一颗菜 · 后端服务"
    debug: bool = True
    api_prefix: str = "/api/v1"

    # 数据库：本机 MySQL8 端口 3307（User: root）
    database_url: str = "mysql+pymysql://root:123456@127.0.0.1:3307/good_good_eat?charset=utf8mb4"
    test_database_url: str = "mysql+pymysql://root:123456@127.0.0.1:3307/good_good_eat_test?charset=utf8mb4"

    jwt_secret: str = "dev-secret-change-me-please-use-a-longer-random-secret-32b-plus"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    wx_appid: str = ""
    wx_secret: str = ""

    cors_origins: str = "*"


@lru_cache
def get_settings() -> "Settings":
    return Settings()