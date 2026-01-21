"""SQLite-based storage for Task Center - better performance and ACID compliance"""
import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import contextmanager

from core.models import Task, TaskHistory, Status, Priority, TaskType
from config import Config
from utils.logging_config import get_logger

logger = get_logger('sqlite_storage')

# Database schema version for migrations
SCHEMA_VERSION = 1


class SQLiteStorage:
    """
    SQLite-based storage implementation.

    Provides the same interface as TaskStorage but with:
    - Better query performance
    - ACID compliance
    - Concurrent access support
    - Full-text search capability
    """

    def __init__(self, db_path: str = None):
        """
        Initialize SQLite storage.

        Args:
            db_path: Path to database file. Uses default from Config if not provided.
        """
        if db_path:
            self.db_path = Path(db_path)
        else:
            self.db_path = Config.DATA_DIR / "tasks.db"

        # Ensure data directory exists
        self.db_path.parent.mkdir(exist_ok=True)

        # Initialize database
        self._init_database()

    @contextmanager
    def _get_connection(self):
        """Get database connection with proper settings."""
        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,
            isolation_level='DEFERRED'
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")  # Better concurrency
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            conn.close()

    def _init_database(self):
        """Initialize database schema."""
        with self._get_connection() as conn:
            # Check schema version
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                )
            """)

            result = conn.execute("SELECT version FROM schema_version").fetchone()
            current_version = result['version'] if result else 0

            if current_version < SCHEMA_VERSION:
                self._create_schema(conn)
                conn.execute("DELETE FROM schema_version")
                conn.execute("INSERT INTO schema_version (version) VALUES (?)", (SCHEMA_VERSION,))
                logger.info(f"Database schema updated to version {SCHEMA_VERSION}")

    def _create_schema(self, conn: sqlite3.Connection):
        """Create database tables."""
        # Main tasks table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                original_text TEXT DEFAULT '',
                task_type TEXT DEFAULT 'Неизвестно',
                complexity TEXT DEFAULT 'средняя',
                priority TEXT DEFAULT 'MEDIUM',
                status TEXT DEFAULT 'новая',
                deadline TEXT,
                start_date TEXT,
                ai_classification_confidence REAL DEFAULT 0.0,
                user_notes TEXT DEFAULT '',
                project TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_status_change TEXT,
                estimated_hours REAL,
                actual_hours REAL
            )
        """)

        # Jira references table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jira_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                ticket_id TEXT NOT NULL,
                url TEXT,
                project TEXT DEFAULT 'REMD',
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # Mentions table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mentions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT,
                mention_context TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # Dependencies table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dependencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                depends_on_id TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # Task context table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS task_context (
                task_id TEXT PRIMARY KEY,
                relevant_docs TEXT DEFAULT '[]',
                key_terms TEXT DEFAULT '[]',
                related_systems TEXT DEFAULT '[]',
                criticality_factors TEXT DEFAULT '{}',
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # Tags table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # Clarifications table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS clarifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # AI recommendations (stored as JSON)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_recommendations (
                task_id TEXT PRIMARY KEY,
                recommendations TEXT DEFAULT '{}',
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)

        # History table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                changes TEXT DEFAULT '{}',
                user_comment TEXT,
                old_value TEXT,
                new_value TEXT
            )
        """)

        # Metadata table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # Create indexes for common queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_history_task_id ON history(task_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jira_ticket ON jira_references(ticket_id)")

        logger.info("Database schema created successfully")

    def save_tasks(self, tasks: List[Task]):
        """Save all tasks (replaces existing data)."""
        with self._get_connection() as conn:
            # Clear existing data
            conn.execute("DELETE FROM tasks")

            # Insert all tasks
            for task in tasks:
                self._insert_task(conn, task)

            logger.info(f"Saved {len(tasks)} tasks to database")

    def _insert_task(self, conn: sqlite3.Connection, task: Task):
        """Insert a single task with all related data."""
        # Insert main task
        conn.execute("""
            INSERT INTO tasks (
                id, title, description, original_text, task_type, complexity,
                priority, status, deadline, start_date, ai_classification_confidence,
                user_notes, project, created_at, updated_at, last_status_change,
                estimated_hours, actual_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task.id,
            task.title,
            task.description,
            task.original_text,
            task.task_type.value,
            task.complexity.value,
            task.priority.name,
            task.status.value,
            task.deadline.isoformat() if task.deadline else None,
            task.start_date.isoformat() if task.start_date else None,
            task.ai_classification_confidence,
            task.user_notes,
            getattr(task, 'project', None),
            task.metadata.created_at.isoformat(),
            task.metadata.updated_at.isoformat(),
            task.metadata.last_status_change.isoformat() if task.metadata.last_status_change else None,
            task.metadata.estimated_hours,
            task.metadata.actual_hours
        ))

        # Insert Jira references
        for ref in task.jira_references:
            conn.execute("""
                INSERT INTO jira_references (task_id, ticket_id, url, project)
                VALUES (?, ?, ?, ?)
            """, (task.id, ref.ticket_id, ref.url, ref.project))

        # Insert mentions
        for mention in task.mentions:
            conn.execute("""
                INSERT INTO mentions (task_id, name, role, mention_context)
                VALUES (?, ?, ?, ?)
            """, (task.id, mention.name, mention.role, mention.mention_context))

        # Insert dependencies
        for dep_id in task.dependencies:
            conn.execute("""
                INSERT INTO dependencies (task_id, depends_on_id)
                VALUES (?, ?)
            """, (task.id, dep_id))

        # Insert context
        conn.execute("""
            INSERT INTO task_context (task_id, relevant_docs, key_terms, related_systems, criticality_factors)
            VALUES (?, ?, ?, ?, ?)
        """, (
            task.id,
            json.dumps(task.context.relevant_docs),
            json.dumps(task.context.key_terms),
            json.dumps(task.context.related_systems),
            json.dumps(task.context.criticality_factors)
        ))

        # Insert tags
        for tag in task.metadata.tags:
            conn.execute("""
                INSERT INTO tags (task_id, tag) VALUES (?, ?)
            """, (task.id, tag))

        # Insert clarifications
        for question, answer in task.clarifications.items():
            conn.execute("""
                INSERT INTO clarifications (task_id, question, answer)
                VALUES (?, ?, ?)
            """, (task.id, question, answer))

        # Insert AI recommendations
        conn.execute("""
            INSERT INTO ai_recommendations (task_id, recommendations)
            VALUES (?, ?)
        """, (task.id, json.dumps(task.ai_recommendations)))

    def load_tasks(self) -> List[Task]:
        """Load all tasks from database."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
            return [self._row_to_task(conn, row) for row in rows]

    def _row_to_task(self, conn: sqlite3.Connection, row: sqlite3.Row) -> Task:
        """Convert database row to Task object."""
        task_id = row['id']

        # Load Jira references
        jira_refs = conn.execute(
            "SELECT ticket_id, url, project FROM jira_references WHERE task_id = ?",
            (task_id,)
        ).fetchall()

        # Load mentions
        mentions = conn.execute(
            "SELECT name, role, mention_context FROM mentions WHERE task_id = ?",
            (task_id,)
        ).fetchall()

        # Load dependencies
        deps = conn.execute(
            "SELECT depends_on_id FROM dependencies WHERE task_id = ?",
            (task_id,)
        ).fetchall()

        # Load context
        context_row = conn.execute(
            "SELECT * FROM task_context WHERE task_id = ?",
            (task_id,)
        ).fetchone()

        # Load tags
        tags = conn.execute(
            "SELECT tag FROM tags WHERE task_id = ?",
            (task_id,)
        ).fetchall()

        # Load clarifications
        clarifications = conn.execute(
            "SELECT question, answer FROM clarifications WHERE task_id = ?",
            (task_id,)
        ).fetchall()

        # Load AI recommendations
        ai_rec = conn.execute(
            "SELECT recommendations FROM ai_recommendations WHERE task_id = ?",
            (task_id,)
        ).fetchone()

        # Build Task object
        from core.models import JiraReference, Person, TaskContext, TaskMetadata

        # Parse enums
        task_type = TaskType.UNKNOWN
        for tt in TaskType:
            if tt.value == row['task_type']:
                task_type = tt
                break

        complexity_map = {'низкая': 'LOW', 'средняя': 'MEDIUM', 'высокая': 'HIGH'}
        from core.models import Complexity
        complexity = Complexity.MEDIUM
        for c in Complexity:
            if c.value == row['complexity']:
                complexity = c
                break

        priority = Priority.MEDIUM
        try:
            priority = Priority[row['priority']]
        except KeyError:
            pass

        status = Status.NEW
        for s in Status:
            if s.value == row['status']:
                status = s
                break

        return Task(
            id=task_id,
            title=row['title'],
            description=row['description'] or '',
            original_text=row['original_text'] or '',
            task_type=task_type,
            complexity=complexity,
            priority=priority,
            status=status,
            jira_references=[
                JiraReference(
                    ticket_id=ref['ticket_id'],
                    url=ref['url'],
                    project=ref['project']
                ) for ref in jira_refs
            ],
            mentions=[
                Person(
                    name=m['name'],
                    role=m['role'],
                    mention_context=m['mention_context']
                ) for m in mentions
            ],
            dependencies=[d['depends_on_id'] for d in deps],
            deadline=datetime.fromisoformat(row['deadline']) if row['deadline'] else None,
            start_date=datetime.fromisoformat(row['start_date']) if row['start_date'] else None,
            context=TaskContext(
                relevant_docs=json.loads(context_row['relevant_docs']) if context_row else [],
                key_terms=json.loads(context_row['key_terms']) if context_row else [],
                related_systems=json.loads(context_row['related_systems']) if context_row else [],
                criticality_factors=json.loads(context_row['criticality_factors']) if context_row else {}
            ),
            metadata=TaskMetadata(
                created_at=datetime.fromisoformat(row['created_at']),
                updated_at=datetime.fromisoformat(row['updated_at']),
                last_status_change=datetime.fromisoformat(row['last_status_change']) if row['last_status_change'] else None,
                estimated_hours=row['estimated_hours'],
                actual_hours=row['actual_hours'],
                tags=[t['tag'] for t in tags]
            ),
            ai_classification_confidence=row['ai_classification_confidence'] or 0.0,
            ai_recommendations=json.loads(ai_rec['recommendations']) if ai_rec else {},
            user_notes=row['user_notes'] or '',
            clarifications={c['question']: c['answer'] for c in clarifications}
        )

    def get_task_by_id(self, task_id: str) -> Optional[Task]:
        """Get task by ID (supports partial ID matching)."""
        with self._get_connection() as conn:
            # Exact match
            row = conn.execute(
                "SELECT * FROM tasks WHERE id = ?",
                (task_id,)
            ).fetchone()

            if row:
                return self._row_to_task(conn, row)

            # Partial match
            rows = conn.execute(
                "SELECT * FROM tasks WHERE id LIKE ?",
                (f"{task_id}%",)
            ).fetchall()

            if len(rows) == 1:
                return self._row_to_task(conn, rows[0])
            elif len(rows) > 1:
                raise ValueError(
                    f"Найдено несколько задач с ID начинающимся на '{task_id}'. "
                    "Укажите более полный ID."
                )

            return None

    def update_task(self, task: Task):
        """Update a single task."""
        with self._get_connection() as conn:
            # Delete existing related data
            task_id = task.id
            conn.execute("DELETE FROM jira_references WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM mentions WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM dependencies WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM task_context WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM tags WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM clarifications WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM ai_recommendations WHERE task_id = ?", (task_id,))
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

            # Insert updated task
            task.metadata.updated_at = datetime.now()
            self._insert_task(conn, task)

            logger.debug(f"Updated task: {task_id[:8]}")

    def delete_task(self, task_id: str):
        """Delete a task by ID."""
        with self._get_connection() as conn:
            # Foreign key cascade will handle related tables
            conn.execute("DELETE FROM tasks WHERE id = ? OR id LIKE ?", (task_id, f"{task_id}%"))
            logger.info(f"Deleted task: {task_id[:8]}")

    def save_history(self, event: TaskHistory | Dict[str, Any]):
        """Add event to history."""
        with self._get_connection() as conn:
            if isinstance(event, TaskHistory):
                conn.execute("""
                    INSERT INTO history (task_id, timestamp, action, changes, user_comment)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    event.task_id,
                    event.timestamp.isoformat(),
                    event.action,
                    json.dumps(event.changes),
                    event.user_comment
                ))
            else:
                timestamp = event.get('timestamp', datetime.now().isoformat())
                conn.execute("""
                    INSERT INTO history (task_id, timestamp, action, changes, user_comment, old_value, new_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    event.get('task_id'),
                    timestamp,
                    event.get('action'),
                    json.dumps(event.get('changes', {})),
                    event.get('user_comment'),
                    event.get('old_value'),
                    event.get('new_value')
                ))

    def get_task_history(self, task_id: str) -> List[TaskHistory]:
        """Get history for a specific task."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM history WHERE task_id = ? ORDER BY timestamp DESC",
                (task_id,)
            ).fetchall()

            return [
                TaskHistory(
                    task_id=row['task_id'],
                    timestamp=datetime.fromisoformat(row['timestamp']),
                    action=row['action'],
                    changes=json.loads(row['changes']),
                    user_comment=row['user_comment']
                ) for row in rows
            ]

    def save_metadata(self, metadata: Dict[str, Any]):
        """Save project metadata."""
        with self._get_connection() as conn:
            now = datetime.now().isoformat()
            for key, value in metadata.items():
                if key != 'updated_at':
                    conn.execute("""
                        INSERT OR REPLACE INTO metadata (key, value, updated_at)
                        VALUES (?, ?, ?)
                    """, (key, json.dumps(value), now))

    def load_metadata(self) -> Dict[str, Any]:
        """Load project metadata."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT key, value FROM metadata").fetchall()
            return {row['key']: json.loads(row['value']) for row in rows}

    def get_statistics(self) -> Dict[str, Any]:
        """Get task statistics using SQL aggregation."""
        with self._get_connection() as conn:
            total = conn.execute("SELECT COUNT(*) as cnt FROM tasks").fetchone()['cnt']

            by_status = dict(conn.execute(
                "SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status"
            ).fetchall())

            by_priority = dict(conn.execute(
                "SELECT priority, COUNT(*) as cnt FROM tasks GROUP BY priority"
            ).fetchall())

            by_type = dict(conn.execute(
                "SELECT task_type, COUNT(*) as cnt FROM tasks GROUP BY task_type"
            ).fetchall())

            with_deadline = conn.execute(
                "SELECT COUNT(*) as cnt FROM tasks WHERE deadline IS NOT NULL"
            ).fetchone()['cnt']

            now = datetime.now().isoformat()
            overdue = conn.execute("""
                SELECT COUNT(*) as cnt FROM tasks
                WHERE deadline IS NOT NULL
                AND deadline < ?
                AND status != 'завершена'
            """, (now,)).fetchone()['cnt']

            return {
                'total_tasks': total,
                'by_status': by_status,
                'by_priority': by_priority,
                'by_type': by_type,
                'with_deadline': with_deadline,
                'overdue': overdue,
            }

    def search_tasks(self, query: str, limit: int = 50) -> List[Task]:
        """Full-text search in tasks."""
        with self._get_connection() as conn:
            search_pattern = f"%{query}%"
            rows = conn.execute("""
                SELECT * FROM tasks
                WHERE title LIKE ? OR description LIKE ? OR original_text LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (search_pattern, search_pattern, search_pattern, limit)).fetchall()

            return [self._row_to_task(conn, row) for row in rows]

    def get_tasks_by_status(self, status: Status) -> List[Task]:
        """Get tasks filtered by status."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC",
                (status.value,)
            ).fetchall()
            return [self._row_to_task(conn, row) for row in rows]

    def get_tasks_by_priority(self, priority: Priority) -> List[Task]:
        """Get tasks filtered by priority."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE priority = ? ORDER BY created_at DESC",
                (priority.name,)
            ).fetchall()
            return [self._row_to_task(conn, row) for row in rows]

    def get_overdue_tasks(self) -> List[Task]:
        """Get all overdue tasks."""
        with self._get_connection() as conn:
            now = datetime.now().isoformat()
            rows = conn.execute("""
                SELECT * FROM tasks
                WHERE deadline IS NOT NULL
                AND deadline < ?
                AND status NOT IN ('завершена', 'отменена')
                ORDER BY deadline ASC
            """, (now,)).fetchall()
            return [self._row_to_task(conn, row) for row in rows]


def migrate_json_to_sqlite(json_storage_path: Path = None, sqlite_storage: SQLiteStorage = None):
    """
    Migrate data from JSON storage to SQLite.

    Args:
        json_storage_path: Path to JSON tasks file. Uses default if not provided.
        sqlite_storage: SQLiteStorage instance. Creates new one if not provided.
    """
    import json as json_module

    # Default paths
    if json_storage_path is None:
        json_storage_path = Config.get_tasks_file()

    if sqlite_storage is None:
        sqlite_storage = SQLiteStorage()

    if not json_storage_path.exists():
        logger.warning(f"JSON file not found: {json_storage_path}")
        return

    logger.info(f"Starting migration from {json_storage_path}")

    try:
        with open(json_storage_path, 'r', encoding='utf-8') as f:
            data = json_module.load(f)

        tasks = [Task.from_dict(t) for t in data.get('tasks', [])]
        sqlite_storage.save_tasks(tasks)

        logger.info(f"Successfully migrated {len(tasks)} tasks to SQLite")

        # Backup original JSON file
        backup_path = json_storage_path.with_suffix('.json.backup')
        import shutil
        shutil.copy(json_storage_path, backup_path)
        logger.info(f"Original JSON backed up to {backup_path}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise
