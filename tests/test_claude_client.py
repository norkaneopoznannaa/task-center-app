"""Unit tests for ai/claude_client.py"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import anthropic

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai.claude_client import (
    RateLimiterConfig, RateLimiter, CacheStats, ClaudeClient
)


class TestRateLimiterConfig:
    """Tests for RateLimiterConfig dataclass"""

    def test_default_values(self):
        """Test default configuration values"""
        config = RateLimiterConfig()
        assert config.max_retries == 5
        assert config.base_delay == 1.0
        assert config.max_delay == 60.0
        assert config.exponential_base == 2.0
        assert config.jitter is True

    def test_custom_values(self):
        """Test custom configuration values"""
        config = RateLimiterConfig(
            max_retries=3,
            base_delay=0.5,
            max_delay=30.0,
            exponential_base=3.0,
            jitter=False
        )
        assert config.max_retries == 3
        assert config.base_delay == 0.5
        assert config.max_delay == 30.0
        assert config.exponential_base == 3.0
        assert config.jitter is False


class TestRateLimiter:
    """Tests for RateLimiter class"""

    @pytest.fixture
    def rate_limiter(self):
        """Create a rate limiter with no jitter for predictable tests"""
        config = RateLimiterConfig(jitter=False)
        return RateLimiter(config)

    def test_initial_state(self, rate_limiter):
        """Test initial state of rate limiter"""
        assert rate_limiter.retry_count == 0
        assert rate_limiter.total_retries == 0
        assert rate_limiter.last_retry_time is None

    def test_calculate_delay_exponential(self, rate_limiter):
        """Test exponential backoff calculation"""
        # base_delay = 1.0, exponential_base = 2.0, no jitter
        assert rate_limiter.calculate_delay(0) == 1.0   # 1.0 * 2^0 = 1.0
        assert rate_limiter.calculate_delay(1) == 2.0   # 1.0 * 2^1 = 2.0
        assert rate_limiter.calculate_delay(2) == 4.0   # 1.0 * 2^2 = 4.0
        assert rate_limiter.calculate_delay(3) == 8.0   # 1.0 * 2^3 = 8.0

    def test_calculate_delay_max_cap(self, rate_limiter):
        """Test that delay is capped at max_delay"""
        # max_delay = 60.0
        delay = rate_limiter.calculate_delay(10)  # 1.0 * 2^10 = 1024, but capped at 60
        assert delay == 60.0

    def test_should_retry_rate_limit_error(self, rate_limiter):
        """Test should_retry returns True for RateLimitError"""
        error = anthropic.RateLimitError(
            message="Rate limit exceeded",
            response=Mock(),
            body={}
        )
        assert rate_limiter.should_retry(error) is True

    def test_should_retry_max_retries_exceeded(self, rate_limiter):
        """Test should_retry returns False when max retries exceeded"""
        rate_limiter.retry_count = 5  # max_retries = 5
        error = anthropic.RateLimitError(
            message="Rate limit exceeded",
            response=Mock(),
            body={}
        )
        assert rate_limiter.should_retry(error) is False

    def test_should_retry_other_error(self, rate_limiter):
        """Test should_retry returns False for other errors"""
        error = ValueError("Some other error")
        assert rate_limiter.should_retry(error) is False

    def test_reset(self, rate_limiter):
        """Test reset method"""
        rate_limiter.retry_count = 3
        rate_limiter.reset()
        assert rate_limiter.retry_count == 0

    def test_get_stats(self, rate_limiter):
        """Test get_stats method"""
        rate_limiter.total_retries = 5
        stats = rate_limiter.get_stats()

        assert stats["total_retries"] == 5
        assert stats["current_retry_count"] == 0
        assert stats["last_retry_time"] is None
        assert "config" in stats
        assert stats["config"]["max_retries"] == 5


class TestCacheStats:
    """Tests for CacheStats dataclass"""

    def test_default_values(self):
        """Test default cache stats values"""
        stats = CacheStats()
        assert stats.cache_creation_input_tokens == 0
        assert stats.cache_read_input_tokens == 0
        assert stats.input_tokens == 0
        assert stats.output_tokens == 0
        assert stats.total_requests == 0
        assert stats.cached_requests == 0

    def test_cache_hit_rate_zero_requests(self):
        """Test cache hit rate with zero requests"""
        stats = CacheStats()
        assert stats.cache_hit_rate == 0.0

    def test_cache_hit_rate_with_hits(self):
        """Test cache hit rate calculation"""
        stats = CacheStats(total_requests=10, cached_requests=3)
        assert stats.cache_hit_rate == 30.0

    def test_cache_hit_rate_all_hits(self):
        """Test cache hit rate with all hits"""
        stats = CacheStats(total_requests=10, cached_requests=10)
        assert stats.cache_hit_rate == 100.0

    def test_estimated_savings_zero_tokens(self):
        """Test estimated savings with zero tokens"""
        stats = CacheStats()
        assert stats.estimated_savings == 0.0

    def test_estimated_savings_with_cache_reads(self):
        """Test estimated savings calculation"""
        stats = CacheStats(
            input_tokens=100,
            cache_read_input_tokens=100,
            cache_creation_input_tokens=0
        )
        # saved = 100 * 0.9 = 90
        # total = 100 + 100 + 0 = 200
        # savings = 90 / 200 * 100 = 45%
        assert stats.estimated_savings == 45.0


class TestClaudeClientInit:
    """Tests for ClaudeClient initialization"""

    @patch.dict(os.environ, {"CLAUDE_API_KEY": "test-key"})
    @patch('ai.claude_client.anthropic.Anthropic')
    def test_init_with_env_key(self, mock_anthropic):
        """Test initialization with environment API key"""
        with patch('config.Config.CLAUDE_API_KEY', 'test-key'):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                client = ClaudeClient()
                assert client.api_key == "test-key"

    @patch('ai.claude_client.anthropic.Anthropic')
    def test_init_with_explicit_key(self, mock_anthropic):
        """Test initialization with explicit API key"""
        with patch('config.Config.CLAUDE_API_KEY', None):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                client = ClaudeClient(api_key="explicit-key")
                assert client.api_key == "explicit-key"

    def test_init_without_key_raises(self):
        """Test that initialization without API key raises error"""
        with patch('config.Config.CLAUDE_API_KEY', None):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                with pytest.raises(ValueError, match="CLAUDE_API_KEY"):
                    ClaudeClient()

    @patch('ai.claude_client.anthropic.Anthropic')
    def test_init_with_caching_disabled(self, mock_anthropic):
        """Test initialization with caching disabled"""
        with patch('config.Config.CLAUDE_API_KEY', 'test-key'):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                client = ClaudeClient(enable_caching=False)
                assert client.enable_caching is False

    @patch('ai.claude_client.anthropic.Anthropic')
    def test_init_with_rate_limiter_config(self, mock_anthropic):
        """Test initialization with custom rate limiter config"""
        config = RateLimiterConfig(max_retries=10)
        with patch('config.Config.CLAUDE_API_KEY', 'test-key'):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                client = ClaudeClient(rate_limiter_config=config)
                assert client.rate_limiter.config.max_retries == 10


class TestClaudeClientCacheStats:
    """Tests for ClaudeClient cache statistics methods"""

    @pytest.fixture
    @patch('ai.claude_client.anthropic.Anthropic')
    def client(self, mock_anthropic):
        """Create a client for testing"""
        with patch('config.Config.CLAUDE_API_KEY', 'test-key'):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                return ClaudeClient()

    def test_get_cache_stats(self, client):
        """Test get_cache_stats method"""
        client.stats.total_requests = 10
        client.stats.cached_requests = 3

        stats = client.get_cache_stats()

        assert stats["total_requests"] == 10
        assert stats["cached_requests"] == 3
        assert "cache_hit_rate" in stats
        assert "estimated_savings" in stats
        assert "tokens" in stats

    def test_reset_cache_stats(self, client):
        """Test reset_cache_stats method"""
        client.stats.total_requests = 10
        client.stats.input_tokens = 1000

        client.reset_cache_stats()

        assert client.stats.total_requests == 0
        assert client.stats.input_tokens == 0

    def test_get_rate_limiter_stats(self, client):
        """Test get_rate_limiter_stats method"""
        client.rate_limiter.total_retries = 5

        stats = client.get_rate_limiter_stats()

        assert stats["total_retries"] == 5
        assert "config" in stats

    def test_get_all_stats(self, client):
        """Test get_all_stats method"""
        stats = client.get_all_stats()

        assert "cache" in stats
        assert "rate_limiter" in stats


class TestClaudeClientUpdateCacheStats:
    """Tests for _update_cache_stats method"""

    @pytest.fixture
    @patch('ai.claude_client.anthropic.Anthropic')
    def client(self, mock_anthropic):
        """Create a client for testing"""
        with patch('config.Config.CLAUDE_API_KEY', 'test-key'):
            with patch('config.Config.CLAUDE_MODEL', 'claude-sonnet-4-20250514'):
                return ClaudeClient()

    def test_update_stats_with_usage(self, client):
        """Test updating stats from response with usage"""
        mock_response = Mock()
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.usage.cache_creation_input_tokens = 0
        mock_response.usage.cache_read_input_tokens = 0

        client._update_cache_stats(mock_response)

        assert client.stats.total_requests == 1
        assert client.stats.input_tokens == 100
        assert client.stats.output_tokens == 50

    def test_update_stats_with_cache_read(self, client):
        """Test updating stats with cache read tokens"""
        mock_response = Mock()
        mock_response.usage = Mock()
        mock_response.usage.input_tokens = 50
        mock_response.usage.output_tokens = 50
        mock_response.usage.cache_creation_input_tokens = 0
        mock_response.usage.cache_read_input_tokens = 100

        client._update_cache_stats(mock_response)

        assert client.stats.cached_requests == 1
        assert client.stats.cache_read_input_tokens == 100

    def test_update_stats_without_usage(self, client):
        """Test updating stats from response without usage"""
        mock_response = Mock(spec=[])  # No usage attribute

        client._update_cache_stats(mock_response)

        assert client.stats.total_requests == 1
        assert client.stats.input_tokens == 0
