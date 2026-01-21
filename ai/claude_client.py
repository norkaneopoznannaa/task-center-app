"""Клиент для работы с Claude API с поддержкой prompt caching и rate limiting"""
import anthropic
from typing import Dict, Any, Optional, List
import json
import hashlib
import time
import random
from dataclasses import dataclass, field
from functools import wraps


from config import Config


# ============================================================================
# RATE LIMITER - Защита от превышения лимитов API
# ============================================================================

@dataclass
class RateLimiterConfig:
    """Конфигурация rate limiter"""
    max_retries: int = 5                    # Максимум повторных попыток
    base_delay: float = 1.0                 # Базовая задержка в секундах
    max_delay: float = 60.0                 # Максимальная задержка
    exponential_base: float = 2.0           # База для экспоненциального backoff
    jitter: bool = True                     # Добавлять случайный jitter


class RateLimiter:
    """Rate limiter с exponential backoff для Claude API"""

    def __init__(self, config: RateLimiterConfig = None):
        self.config = config or RateLimiterConfig()
        self.retry_count = 0
        self.total_retries = 0
        self.last_retry_time: Optional[float] = None

    def calculate_delay(self, attempt: int) -> float:
        """Вычисление задержки с exponential backoff"""
        delay = min(
            self.config.base_delay * (self.config.exponential_base ** attempt),
            self.config.max_delay
        )

        # Добавляем jitter для избежания thundering herd
        if self.config.jitter:
            delay = delay * (0.5 + random.random())

        return delay

    def should_retry(self, error: Exception) -> bool:
        """Определение, нужно ли повторять запрос"""
        if self.retry_count >= self.config.max_retries:
            return False

        # Anthropic rate limit errors
        if isinstance(error, anthropic.RateLimitError):
            return True

        # Overloaded errors (529)
        if isinstance(error, anthropic.APIStatusError):
            if hasattr(error, 'status_code') and error.status_code in (429, 529):
                return True

        return False

    def wait_and_retry(self) -> float:
        """Ожидание перед повторной попыткой, возвращает время ожидания"""
        delay = self.calculate_delay(self.retry_count)
        self.retry_count += 1
        self.total_retries += 1
        self.last_retry_time = time.time()

        time.sleep(delay)
        return delay

    def reset(self) -> None:
        """Сброс счетчика после успешного запроса"""
        self.retry_count = 0

    def get_stats(self) -> Dict[str, Any]:
        """Статистика rate limiter"""
        return {
            "total_retries": self.total_retries,
            "current_retry_count": self.retry_count,
            "last_retry_time": self.last_retry_time,
            "config": {
                "max_retries": self.config.max_retries,
                "base_delay": self.config.base_delay,
                "max_delay": self.config.max_delay
            }
        }


@dataclass
class CacheStats:
    """Статистика использования кэша промптов"""
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_requests: int = 0
    cached_requests: int = 0

    @property
    def cache_hit_rate(self) -> float:
        """Процент кэш-попаданий"""
        if self.total_requests == 0:
            return 0.0
        return (self.cached_requests / self.total_requests) * 100

    @property
    def estimated_savings(self) -> float:
        """Оценка экономии в % (кэшированные токены стоят 10% от обычных)"""
        total_input = self.cache_read_input_tokens + self.input_tokens + self.cache_creation_input_tokens
        if total_input == 0:
            return 0.0
        # Кэшированные токены стоят 10% от обычных
        saved = self.cache_read_input_tokens * 0.9
        return (saved / total_input) * 100 if total_input > 0 else 0.0


class ClaudeClient:
    """Клиент для работы с Claude API с поддержкой prompt caching и rate limiting"""

    def __init__(
        self,
        api_key: str = None,
        model: str = None,
        enable_caching: bool = True,
        rate_limiter_config: RateLimiterConfig = None
    ):
        """
        Инициализация клиента

        Args:
            api_key: API ключ Anthropic (если None, берется из Config)
            model: Модель Claude (если None, берется из Config)
            enable_caching: Включить prompt caching (экономия до 90%)
            rate_limiter_config: Конфигурация rate limiter (опционально)
        """
        self.api_key = api_key or Config.CLAUDE_API_KEY
        self.model = model or Config.CLAUDE_MODEL
        self.enable_caching = enable_caching
        self.stats = CacheStats()
        self.rate_limiter = RateLimiter(rate_limiter_config)

        if not self.api_key:
            raise ValueError(
                "CLAUDE_API_KEY не установлен. "
                "Создайте файл .env и добавьте ваш API ключ."
            )

        self.client = anthropic.Anthropic(api_key=self.api_key)

    def send_message(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = None,
        max_tokens: int = None,
        use_cache: bool = True
    ) -> str:
        """
        Отправка сообщения Claude с поддержкой prompt caching

        Args:
            prompt: Текст запроса
            system_prompt: Системный промпт (кэшируется для экономии до 90%)
            temperature: Температура (0.0-1.0)
            max_tokens: Максимум токенов в ответе
            use_cache: Использовать prompt caching (по умолчанию True)

        Returns:
            Ответ Claude в виде текста
        """
        temperature = temperature if temperature is not None else Config.AI_TEMPERATURE
        max_tokens = max_tokens if max_tokens is not None else Config.AI_MAX_TOKENS

        message_params = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        # Prompt caching: кэширование системного промпта
        # Минимум 1024 токена для кэширования, иначе используем обычный формат
        if system_prompt:
            if self.enable_caching and use_cache and len(system_prompt) >= 1024:
                # Формат с cache_control для ephemeral кэширования (5 минут TTL)
                message_params["system"] = [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"}
                    }
                ]
            else:
                message_params["system"] = system_prompt

        # Rate limiting с exponential backoff
        last_error = None
        while True:
            try:
                response = self.client.messages.create(**message_params)

                # Сброс счетчика после успешного запроса
                self.rate_limiter.reset()

                # Обновление статистики кэша
                self._update_cache_stats(response)

                # Извлечение текста из ответа
                if response.content and len(response.content) > 0:
                    return response.content[0].text
                else:
                    return ""

            except (anthropic.RateLimitError, anthropic.APIStatusError) as e:
                last_error = e
                if self.rate_limiter.should_retry(e):
                    delay = self.rate_limiter.wait_and_retry()
                    print(f"Rate limit hit, waiting {delay:.1f}s before retry...")
                    continue
                else:
                    raise Exception(
                        f"Ошибка Claude API после {self.rate_limiter.retry_count} попыток: {e}"
                    )

            except anthropic.APIError as e:
                raise Exception(f"Ошибка Claude API: {e}")

    def _update_cache_stats(self, response) -> None:
        """Обновление статистики использования кэша"""
        self.stats.total_requests += 1

        if hasattr(response, 'usage'):
            usage = response.usage

            # Стандартные токены
            self.stats.input_tokens += getattr(usage, 'input_tokens', 0)
            self.stats.output_tokens += getattr(usage, 'output_tokens', 0)

            # Кэшированные токены (Anthropic prompt caching)
            cache_creation = getattr(usage, 'cache_creation_input_tokens', 0)
            cache_read = getattr(usage, 'cache_read_input_tokens', 0)

            self.stats.cache_creation_input_tokens += cache_creation
            self.stats.cache_read_input_tokens += cache_read

            # Если были cache_read токены - это кэш-попадание
            if cache_read > 0:
                self.stats.cached_requests += 1

    def get_cache_stats(self) -> Dict[str, Any]:
        """Получение статистики кэша"""
        return {
            "total_requests": self.stats.total_requests,
            "cached_requests": self.stats.cached_requests,
            "cache_hit_rate": f"{self.stats.cache_hit_rate:.1f}%",
            "estimated_savings": f"{self.stats.estimated_savings:.1f}%",
            "tokens": {
                "input": self.stats.input_tokens,
                "output": self.stats.output_tokens,
                "cache_creation": self.stats.cache_creation_input_tokens,
                "cache_read": self.stats.cache_read_input_tokens
            }
        }

    def reset_cache_stats(self) -> None:
        """Сброс статистики кэша"""
        self.stats = CacheStats()

    def get_rate_limiter_stats(self) -> Dict[str, Any]:
        """Получение статистики rate limiter"""
        return self.rate_limiter.get_stats()

    def get_all_stats(self) -> Dict[str, Any]:
        """Получение полной статистики (кэш + rate limiter)"""
        return {
            "cache": self.get_cache_stats(),
            "rate_limiter": self.get_rate_limiter_stats()
        }

    def structured_output(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.3
    ) -> Dict[str, Any]:
        """
        Получение структурированного ответа (JSON)

        Args:
            prompt: Текст запроса
            system_prompt: Системный промпт
            temperature: Температура (рекомендуется низкая для структурированных данных)

        Returns:
            Словарь с распарсенным JSON
        """
        # Добавляем инструкцию по формату в промпт
        enhanced_prompt = f"{prompt}\n\nВЕРНИ ТОЛЬКО ВАЛИДНЫЙ JSON БЕЗ ДОПОЛНИТЕЛЬНОГО ТЕКСТА."

        response_text = self.send_message(
            prompt=enhanced_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=Config.AI_MAX_TOKENS
        )

        # Парсинг JSON
        try:
            # Попытка найти JSON в ответе (может быть обернут в ```json или текст)
            response_text = response_text.strip()

            # Удаление markdown кода если есть
            if response_text.startswith("```json"):
                response_text = response_text[7:]  # Убираем ```json
            elif response_text.startswith("```"):
                response_text = response_text[3:]  # Убираем ```

            if response_text.endswith("```"):
                response_text = response_text[:-3]  # Убираем ```

            response_text = response_text.strip()

            return json.loads(response_text)

        except json.JSONDecodeError as e:
            raise Exception(f"Не удалось распарсить JSON ответ от Claude: {e}\n\nОтвет:\n{response_text}")

    def batch_classify(
        self,
        tasks_data: List[Dict[str, str]],
        system_prompt: str,
        temperature: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Пакетная классификация задач

        Args:
            tasks_data: Список задач для классификации [{"title": ..., "description": ...}, ...]
            system_prompt: Системный промпт
            temperature: Температура

        Returns:
            Список результатов классификации
        """
        # Формируем промпт для пакетной обработки
        tasks_text = "\n\n".join([
            f"ЗАДАЧА {i+1}:\nНазвание: {task['title']}\nОписание: {task['description']}"
            for i, task in enumerate(tasks_data)
        ])

        prompt = f"""Проанализируй следующие задачи и верни JSON массив с результатами классификации для каждой:

{tasks_text}

Верни JSON массив в формате:
[
  {{
    "task_index": 1,
    "task_type": "тип задачи",
    "complexity": "сложность",
    "priority": "приоритет (1-5)",
    "confidence": 0.0-1.0,
    "reasoning": "краткое объяснение",
    "estimated_hours": число или null,
    "key_terms": ["термины"]
  }},
  ...
]
"""

        response = self.structured_output(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature
        )

        # Проверка что ответ - массив
        if isinstance(response, list):
            return response
        elif isinstance(response, dict) and 'tasks' in response:
            return response['tasks']
        else:
            raise Exception(f"Неожиданный формат ответа: {type(response)}")

    def test_connection(self) -> bool:
        """
        Тест подключения к Claude API

        Returns:
            True если подключение успешно
        """
        try:
            response = self.send_message(
                prompt="Скажи привет",
                max_tokens=50
            )
            return bool(response)
        except Exception:
            return False
