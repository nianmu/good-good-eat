"""用户 / 团队 / 团队成员 模型（M2.2 认证 + 团队基础结构）。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class User(Base):
    """统一用户账号（跨端）。

    is_guest=True 表示"尚未绑定任何正式渠道身份"的纯游客账号。
    登录身份（微信 openid / 用户名密码 / 游客昵称）由 UserIdentity 表承载，
    一个用户可绑定多个渠道，实现"统一账号 + 多端身份"。
    """

    __tablename__ = "users"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nickname: Mapped[str] = mapped_column(String(64), nullable=False)
    avatar: Mapped[str] = mapped_column(String(255), nullable=False, default="👤", server_default="👤")
    user_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list[TeamMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    identities: Mapped[list[UserIdentity]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserIdentity(Base):
    """用户登录身份绑定：provider（渠道）+ provider_uid（渠道内唯一标识）。

    常见 provider：
     - password  : 用户名+密码（H5/Web 独立账号），provider_uid=username，credential=密码哈希
     - wechat    : 微信 openid，provider_uid = openid
     - guest     : 纯游客昵称（provider_uid=nickname，便于同名会话复用）

    一个用户可有多个身份（统一账号多端绑定）；一个 provider_uid 只能绑一个账号。
    用户登录时会自动注册并绑定；游客账号绑上任一正式渠道即自动升级（is_guest=0）。
    """

    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_uid", name="uq_user_identity_provider_uid"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    provider_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    # 加密凭据（password 渠道存密码哈希；oauth 可存 refresh token；guest 通常为空）
    credential: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 渠道返回的额外信息（JSON 字符串，如 unionid / 渠道昵称头像）
    extra_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="identities")


class Team(Base):
    """团队；chef_id 可空（空则支持成员认领厨师）。"""

    __tablename__ = "teams"
    __table_args__ = {"mysql_charset": "utf8mb4"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    chef_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    chef: Mapped[User | None] = relationship(foreign_keys=[chef_id])
    members: Mapped[list[TeamMember]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )


class TeamMember(Base):
    """团队成员关系，role: organizer(组织者) / member(成员)。"""

    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_member_team_user"),
        {"mysql_charset": "utf8mb4"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(
        Enum("organizer", "member", name="member_role"),
        nullable=False,
        default="member",
        server_default="member",
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    team: Mapped[Team] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")