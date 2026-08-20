"""ORM 模型注册包：导入全部模型即注册到 Base.metadata（alembic 自动收集）。"""

from app.models.basket import BasketItem
from app.models.dish import Category, Dish
from app.models.favorite import Favorite
from app.models.fridge import FridgeItem
from app.models.message import Message
from app.models.order import Order, OrderItem
from app.models.plan import Plan, PlanItem
from app.models.recipe import Recipe
from app.models.user import Team, TeamMember, User, UserIdentity

__all__ = [
    "BasketItem",
    "Category",
    "Dish",
    "Favorite",
    "FridgeItem",
    "Message",
    "Order",
    "OrderItem",
    "Plan",
    "PlanItem",
    "Recipe",
    "Team",
    "TeamMember",
    "User",
    "UserIdentity",
]