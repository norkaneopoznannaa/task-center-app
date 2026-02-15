"""Pytest configuration and fixtures"""
import pytest
import os
import sys
import tempfile
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests"""
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def sample_tasks_data():
    """Sample tasks.json data for testing"""
    return {
        "version": "1.0",
        "updated_at": "2024-01-15T10:00:00Z",
        "tasks": [
            {
                "id": "task-001",
                "title": "Test Task 1",
                "description": "Description 1",
                "original_text": "Test original text 1",
                "task_type": "Анализ/Исследование",
                "complexity": "средняя",
                "priority": 3,
                "status": "новая",
                "jira_references": [
                    {
                        "ticket_id": "REMD-123",
                        "url": "https://jira.example.com/browse/REMD-123",
                        "project": "REMD"
                    }
                ],
                "mentions": [],
                "dependencies": [],
                "deadline": None,
                "start_date": None,
                "context": {
                    "relevant_docs": [],
                    "key_terms": [],
                    "related_systems": [],
                    "criticality_factors": {}
                },
                "metadata": {
                    "created_at": "2024-01-15T10:00:00Z",
                    "updated_at": "2024-01-15T10:00:00Z",
                    "last_status_change": "2024-01-15T10:00:00Z",
                    "estimated_hours": 4,
                    "actual_hours": 0,
                    "tags": ["рэмд", "анализ"]
                },
                "ai_classification_confidence": 0.85,
                "ai_recommendations": {},
                "user_notes": "",
                "clarifications": {}
            },
            {
                "id": "task-002",
                "title": "Test Task 2",
                "description": "Description 2",
                "original_text": "Test original text 2",
                "task_type": "Разработка",
                "complexity": "высокая",
                "priority": 5,
                "status": "в работе",
                "jira_references": [],
                "mentions": [
                    {"name": "Иван", "role": "разработчик"}
                ],
                "dependencies": [],
                "deadline": "2024-01-20T18:00:00Z",
                "start_date": "2024-01-14T09:00:00Z",
                "context": {
                    "relevant_docs": [],
                    "key_terms": [],
                    "related_systems": [],
                    "criticality_factors": {}
                },
                "metadata": {
                    "created_at": "2024-01-14T09:00:00Z",
                    "updated_at": "2024-01-15T11:00:00Z",
                    "last_status_change": "2024-01-15T11:00:00Z",
                    "estimated_hours": 8,
                    "actual_hours": 2,
                    "tags": ["фэр", "разработка"]
                },
                "ai_classification_confidence": 0.9,
                "ai_recommendations": {},
                "user_notes": "",
                "clarifications": {}
            }
        ]
    }


@pytest.fixture
def temp_tasks_file(temp_dir, sample_tasks_data):
    """Create a temporary tasks.json file"""
    file_path = os.path.join(temp_dir, "tasks.json")
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(sample_tasks_data, f, ensure_ascii=False, indent=2)
    return file_path


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Mock environment variables for testing"""
    monkeypatch.setenv("CLAUDE_API_KEY", "test-api-key")
    monkeypatch.setenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
