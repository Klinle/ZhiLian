from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/knowledge_assistant"

    # DeepSeek 默认配置
    DEEPSEEK_API_KEY: str = "sk-c81b285c96e14e38b3b15aa43be35140"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"

    class Config:
        env_file = ".env"

settings = Settings()
