# Component Refactoring Plan

## Overview
Split large components to improve maintainability and testability.

### Current Status
- **TaskDetails.tsx**: 431 lines (TOO LARGE - needs split)
- **electron/main.ts**: Large Electron main process file (needs analysis)

---

## TaskDetails.tsx Refactoring

### Current Structure
Large monolithic component handling:
1. Task metadata display
2. Edit mode toggle
3. Status/Priority updates
4. Jira integration
5. Time tracking display
6. Task operations (delete, etc.)

### Proposed Split (3 sub-components)

#### 1. **TaskHeader.tsx** (60-80 lines)
```typescript
interface TaskHeaderProps {
  task: Task;
  onEditToggle: () => void;
  onDelete: () => void;
  isEditing: boolean;
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({ ... }) => (
  <div className="task-header">
    {/* Task title, ID, actions */}
  </div>
);
```
**Responsibility:** Title display, edit button, delete button

#### 2. **TaskMetadata.tsx** (80-100 lines)
```typescript
interface TaskMetadataProps {
  task: Task;
  onStatusChange: (status: Status) => void;
  onPriorityChange: (priority: Priority) => void;
}

export const TaskMetadata: React.FC<TaskMetadataProps> = ({ ... }) => (
  <div className="task-metadata">
    {/* Status, Priority, Complexity, Dates */}
  </div>
);
```
**Responsibility:** Metadata display and inline edits

#### 3. **TaskContent.tsx** (80-120 lines)
```typescript
interface TaskContentProps {
  task: Task;
  isEditing: boolean;
  onDescriptionChange: (desc: string) => void;
  onContextChange: (context: TaskContext) => void;
}

export const TaskContent: React.FC<TaskContentProps> = ({ ... }) => (
  <div className="task-content">
    {/* Description, Context, Jira References */}
  </div>
);
```
**Responsibility:** Main content, Jira links, context information

#### 4. **TaskTimeTracking.tsx** (60-80 lines)
```typescript
interface TaskTimeTrackingProps {
  task: Task;
  timeTracking?: TimeTracking;
  onTimeUpdate: (sessions: TimeSession[]) => void;
}

export const TaskTimeTracking: React.FC<TaskTimeTrackingProps> = ({ ... }) => (
  <div className="task-time-tracking">
    {/* Time sessions, total hours */}
  </div>
);
```
**Responsibility:** Time tracking display and management

### Main TaskDetails.tsx (Becomes orchestrator - ~80 lines)
```typescript
export const TaskDetails: React.FC<TaskDetailsProps> = ({ task, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="task-details">
      <TaskHeader
        task={task}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
        onDelete={handleDelete}
      />

      <TaskMetadata
        task={task}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
      />

      <TaskContent
        task={task}
        isEditing={isEditing}
        onDescriptionChange={handleDescriptionChange}
        onContextChange={handleContextChange}
      />

      <TaskTimeTracking
        task={task}
        onTimeUpdate={handleTimeUpdate}
      />
    </div>
  );
};
```

---

## electron/main.ts Refactoring

### Identify Sections
Need to analyze file structure but typically Electron main files include:
- Window creation
- IPC handlers
- App event listeners
- File system operations
- Window state management

### Proposed Modules

#### 1. **windowManager.ts** (Windows creation & state)
- Create/restore window functions
- Window state persistence
- Window event handlers

#### 2. **ipcHandlers.ts** (All IPC channels)
- Register all ipcMain handlers
- Organize by domain (files, tasks, jira, etc.)

#### 3. **appLifecycle.ts** (App events)
- app.ready, app.quit handlers
- Single instance lock
- Protocol handlers

#### 4. **constants.ts** (Electron constants)
- Window dimensions
- Paths configuration
- IPC channel names

---

## Benefits

### Maintainability
- ✅ Easier to find and modify specific features
- ✅ Clear separation of concerns
- ✅ Single Responsibility Principle

### Testability
- ✅ Smaller components easier to unit test
- ✅ Can mock sub-component props independently
- ✅ More focused test cases

### Reusability
- ✅ Can use TaskMetadata in other views
- ✅ Can use TaskTimeTracking in reports
- ✅ Window manager can be used by other processes

### Performance
- ✅ Better code splitting potential
- ✅ Lazy loading of sub-components possible
- ✅ Reduced component re-renders

---

## Implementation Steps

### Phase 1: TaskDetails.tsx Split
1. Create `components/taskDetails/` directory
2. Extract TaskHeader sub-component
3. Extract TaskMetadata sub-component
4. Extract TaskContent sub-component
5. Extract TaskTimeTracking sub-component
6. Update main TaskDetails to use sub-components
7. Update imports in pages/DailyPlan.tsx or wherever TaskDetails is used
8. Test in browser

### Phase 2: electron/main.ts Split
1. Create `electron/modules/` directory
2. Create windowManager.ts and extract window logic
3. Create ipcHandlers.ts and extract IPC logic
4. Create appLifecycle.ts and extract app events
5. Create constants.ts for shared constants
6. Update main.ts to use modules
7. Test Electron app functionality

---

## File Structure After Refactoring

```
task-center-app/
├── src/
│   ├── components/
│   │   ├── taskDetails/
│   │   │   ├── TaskDetails.tsx         (orchestrator ~80 lines)
│   │   │   ├── TaskHeader.tsx          (60-80 lines)
│   │   │   ├── TaskMetadata.tsx        (80-100 lines)
│   │   │   ├── TaskContent.tsx         (80-120 lines)
│   │   │   ├── TaskTimeTracking.tsx    (60-80 lines)
│   │   │   └── index.ts                (exports)
│   │   └── ...
│   └── ...
│
└── electron/
    ├── main.ts                          (simplified, uses modules)
    ├── modules/
    │   ├── windowManager.ts             (window lifecycle)
    │   ├── ipcHandlers.ts               (all IPC channels)
    │   ├── appLifecycle.ts              (app events)
    │   ├── constants.ts                 (shared config)
    │   └── index.ts                     (exports)
    └── ...
```

---

## Metrics After Refactoring

### Before
- TaskDetails.tsx: 431 lines (too large)
- electron/main.ts: ~400-500 lines (needs measurement)
- Total large files: 2

### After
- TaskDetails.tsx: ~80 lines ✅ (orchestrator)
- TaskHeader.tsx: ~70 lines ✅ (small)
- TaskMetadata.tsx: ~90 lines ✅ (small)
- TaskContent.tsx: ~100 lines ✅ (small)
- TaskTimeTracking.tsx: ~70 lines ✅ (small)
- electron/main.ts: ~100-150 lines ✅ (small)
- electron/windowManager.ts: ~80-100 lines ✅ (small)
- electron/ipcHandlers.ts: ~150-200 lines ✅ (medium, ok for handlers)

**All files now under 200 lines (ideal) or 250 lines (maximum acceptable)**

---

## Testing Checklist

### TaskDetails Refactoring Tests
- [ ] All sub-components render without errors
- [ ] Edit mode toggle works correctly
- [ ] Status/Priority changes persist
- [ ] Task deletion works
- [ ] Time tracking displays correctly
- [ ] Responsive layout maintained
- [ ] No console warnings or errors

### Electron Refactoring Tests
- [ ] App starts correctly
- [ ] Windows create/restore properly
- [ ] All IPC channels work (tasks, jira, files, etc.)
- [ ] Window state persists across sessions
- [ ] Single instance lock works
- [ ] No memory leaks
- [ ] File operations functional

---

## Next Actions

1. **Measure electron/main.ts** - Determine exact line count and sections
2. **Extract TaskDetails** - Start with simpler TaskHeader component
3. **Test thoroughly** - Run both in dev and production builds
4. **Monitor performance** - Check bundle size and load times
5. **Document** - Add JSDoc comments to exported components

---

**Status:** Planning complete, ready for implementation
**Difficulty:** Medium (straightforward component extraction)
**Time Estimate:** 2-3 hours for full refactoring + testing
**Risk Level:** Low (no breaking changes to public API)
