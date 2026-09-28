from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PROJECT_NAME: str = "Challan Data Manager"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Database
    POSTGRES_USER: str = "challan_admin"
    POSTGRES_PASSWORD: str = "challan_secure_pass_2026"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5434
    POSTGRES_DB: str = "challan_db"
    DATABASE_URL: str | None = None

    @computed_field
    def sync_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Security / Auth
    SECRET_KEY: str = "e83921af7b561081395b290dfc102c7b1297e682d3bf9c6b7501a3089ef062b9"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Initial Admin Seed
    INITIAL_ADMIN_NAME: str = "System Administrator"
    INITIAL_ADMIN_EMAIL: str = "admin@challango.in"
    INITIAL_ADMIN_PASSWORD: str = "Admin@123456"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


settings = Settings()
