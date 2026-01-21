"""Unit tests for core/models.py"""
import pytest
from datetime import datetime
from core.models import (
    Task, TaskType, Complexity, Priority, Status,
    JiraReference, Person, TaskContext
)


class TestTaskType:
    """Tests for TaskType enum"""

    def test_all_task_types_exist(self):
        """Verify all expected task types are defined"""
        expected_types = ['ANALYSIS', 'DOCUMENTATION', 'DEVELOPMENT', 'COORDINATION', 'BUG_FIX', 'RESEARCH', 'MEETING', 'OTHER']
        for task_type in expected_types:
            assert hasattr(TaskType, task_type)

    def test_task_type_value(self):
        """Test task type values"""
        assert TaskType.ANALYSIS.value == "анализ"
        assert TaskType.DEVELOPMENT.value == "разработка"
        assert TaskType.BUG_FIX.value == "исправление бага"


class TestComplexity:
    """Tests for Complexity enum"""

    def test_complexity_values(self):
        """Test complexity enum values"""
        assert Complexity.LOW.value == "низкая"
        assert Complexity.MEDIUM.value == "средняя"
        assert Complexity.HIGH.value == "высокая"


class TestPriority:
    """Tests for Priority enum"""

    def test_priority_values(self):
        """Test priority numeric values"""
        assert Priority.CRITICAL.value == 1
        assert Priority.HIGH.value == 2
        assert Priority.MEDIUM.value == 3
        assert Priority.LOW.value == 4
        assert Priority.BACKLOG.value == 5

    def test_priority_ordering(self):
        """Test that priorities are ordered correctly"""
        assert Priority.CRITICAL.value < Priority.HIGH.value
        assert Priority.HIGH.value < Priority.MEDIUM.value
        assert Priority.MEDIUM.value < Priority.LOW.value


class TestStatus:
    """Tests for Status enum"""

    def test_status_values(self):
        """Test status enum values"""
        assert Status.NEW.value == "новая"
        assert Status.IN_PROGRESS.value == "в работе"
        assert Status.BLOCKED.value == "заблокирована"
        assert Status.DONE.value == "завершена"


class TestJiraReference:
    """Tests for JiraReference dataclass"""

    def test_jira_reference_creation(self):
        """Test creating a JiraReference"""
        ref = JiraReference(
            ticket_id="EGISZREMD-12345",
            url="https://jira.example.com/browse/EGISZREMD-12345",
            project="EGISZREMD"
        )
        assert ref.ticket_id == "EGISZREMD-12345"
        assert ref.project == "EGISZREMD"
        assert "jira" in ref.url.lower()


class TestPerson:
    """Tests for Person dataclass"""

    def test_person_creation(self):
        """Test creating a Person"""
        person = Person(name="Иван Петров", role="аналитик")
        assert person.name == "Иван Петров"
        assert person.role == "аналитик"


class TestTask:
    """Tests for Task dataclass"""

    @pytest.fixture
    def sample_task(self):
        """Create a sample task for testing"""
        return Task(
            id="task-001",
            title="Test Task",
            description="Test task description",
            original_text="Test original text"
        )

    def test_task_default_values(self, sample_task):
        """Test that Task has correct default values"""
        assert sample_task.task_type == TaskType.OTHER
        assert sample_task.complexity == Complexity.MEDIUM
        assert sample_task.priority == Priority.MEDIUM
        assert sample_task.status == Status.NEW
        assert sample_task.jira_references == []
        assert sample_task.mentions == []
        assert sample_task.dependencies == []
        assert sample_task.deadline is None

    def test_task_timestamps(self, sample_task):
        """Test that Task has created_at and updated_at"""
        assert sample_task.created_at is not None
        assert sample_task.updated_at is not None
        assert isinstance(sample_task.created_at, datetime)

    def test_task_ai_confidence_default(self, sample_task):
        """Test AI confidence default value"""
        assert sample_task.ai_classification_confidence == 0.0

    def test_task_with_jira_references(self):
        """Test Task with Jira references"""
        jira_ref = JiraReference(
            ticket_id="REMD-123",
            url="https://jira.example.com/browse/REMD-123",
            project="REMD"
        )
        task = Task(
            id="task-002",
            title="Task with Jira",
            description="Description",
            original_text="Original",
            jira_references=[jira_ref]
        )
        assert len(task.jira_references) == 1
        assert task.jira_references[0].ticket_id == "REMD-123"

    def test_task_with_mentions(self):
        """Test Task with person mentions"""
        person = Person(name="Максим", role="разработчик")
        task = Task(
            id="task-003",
            title="Task with mentions",
            description="Description",
            original_text="Задача от Максима",
            mentions=[person]
        )
        assert len(task.mentions) == 1
        assert task.mentions[0].name == "Максим"

    def test_task_priority_change(self, sample_task):
        """Test changing task priority"""
        sample_task.priority = Priority.CRITICAL
        assert sample_task.priority == Priority.CRITICAL

    def test_task_status_change(self, sample_task):
        """Test changing task status"""
        sample_task.status = Status.IN_PROGRESS
        assert sample_task.status == Status.IN_PROGRESS


class TestTaskContext:
    """Tests for TaskContext dataclass"""

    def test_task_context_default(self):
        """Test TaskContext default values"""
        context = TaskContext()
        assert context.relevant_docs == []
        assert context.key_terms == []
        assert context.related_systems == []

    def test_task_context_with_values(self):
        """Test TaskContext with values"""
        context = TaskContext(
            relevant_docs=["doc1.md", "doc2.md"],
            key_terms=["ФЛК", "СЭМД"],
            related_systems=["РЭМД", "ЕГИСЗ"]
        )
        assert len(context.relevant_docs) == 2
        assert "ФЛК" in context.key_terms
        assert "РЭМД" in context.related_systems
