/**
 * Smart Worklog Validator - Phase 1 Quick Win
 *
 * Validates worklogs before synchronization with Jira to prevent errors and ensure data quality.
 */

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  worklogId?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  canSync: boolean;
}

export interface LocalWorklog {
  id: string;
  taskId: string;
  jiraKey: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  taskTitle: string;
  status: 'pending' | 'synced' | 'error';
  syncedAt: string | null;
  jiraWorklogId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export class WorklogValidator {
  /**
   * Validates worklogs before synchronization
   */
  async validate(worklogs: LocalWorklog[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // 1. Time overlap detection
    issues.push(...this.detectTimeOverlaps(worklogs));

    // 2. Unrealistic duration
    issues.push(...this.validateDurations(worklogs));

    // 3. Missing time coverage
    issues.push(...this.detectMissingTime(worklogs));

    // 4. Description quality
    issues.push(...this.validateDescriptions(worklogs));

    // 5. Jira key format
    issues.push(...this.validateJiraKeys(worklogs));

    // 6. Business rules
    issues.push(...this.validateBusinessRules(worklogs));

    const hasErrors = issues.some(i => i.level === 'error');

    return {
      valid: !hasErrors,
      issues,
      canSync: !hasErrors,
    };
  }

  /**
   * Detects time overlaps between worklogs
   */
  private detectTimeOverlaps(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const sorted = [...worklogs].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].date !== sorted[j].date) break;

        const overlap = this.checkTimeOverlap(
          sorted[i].startTime,
          sorted[i].endTime,
          sorted[j].startTime,
          sorted[j].endTime
        );

        if (overlap) {
          issues.push({
            level: 'error',
            code: 'TIME_OVERLAP',
            message: `Перекрытие времени: ${sorted[i].taskTitle} (${sorted[i].startTime}-${sorted[i].endTime}) и ${sorted[j].taskTitle} (${sorted[j].startTime}-${sorted[j].endTime})`,
            worklogId: sorted[i].id,
            suggestion: `Скорректируйте время одной из записей`,
          });
        }
      }
    }

    return issues;
  }

  private checkTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const [h1Start, m1Start] = start1.split(':').map(Number);
    const [h1End, m1End] = end1.split(':').map(Number);
    const [h2Start, m2Start] = start2.split(':').map(Number);
    const [h2End, m2End] = end2.split(':').map(Number);

    const mins1Start = h1Start * 60 + m1Start;
    const mins1End = h1End * 60 + m1End;
    const mins2Start = h2Start * 60 + m2Start;
    const mins2End = h2End * 60 + m2End;

    return (
      (mins1Start < mins2End && mins1End > mins2Start) ||
      (mins2Start < mins1End && mins2End > mins1Start)
    );
  }

  /**
   * Validates worklog durations (realistic values)
   */
  private validateDurations(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Group by date
    const byDate = new Map<string, LocalWorklog[]>();
    worklogs.forEach(w => {
      if (!byDate.has(w.date)) {
        byDate.set(w.date, []);
      }
      byDate.get(w.date)!.push(w);
    });

    // Check each day
    byDate.forEach((dayWorklogs, date) => {
      const totalMinutes = dayWorklogs.reduce((sum, w) => sum + w.durationMinutes, 0);
      const totalHours = totalMinutes / 60;

      // 1. Too many hours in a day
      if (totalHours > 12) {
        issues.push({
          level: 'error',
          code: 'EXCESSIVE_DAILY_HOURS',
          message: `${date}: ${totalHours.toFixed(1)}ч - слишком много часов в один день (максимум 12ч)`,
          suggestion: 'Проверьте корректность времени или разбейте на несколько дней',
        });
      } else if (totalHours > 10) {
        issues.push({
          level: 'warning',
          code: 'HIGH_DAILY_HOURS',
          message: `${date}: ${totalHours.toFixed(1)}ч - много часов в день`,
          suggestion: 'Убедитесь, что время указано корректно',
        });
      }

      // 2. Too few hours (incomplete work day)
      const isWeekday = this.isWeekday(date);
      if (isWeekday && totalHours < 4) {
        issues.push({
          level: 'info',
          code: 'LOW_DAILY_HOURS',
          message: `${date}: ${totalHours.toFixed(1)}ч - мало часов для рабочего дня`,
          suggestion: 'Возможно, не все worklogs созданы?',
        });
      }

      // 3. Check individual worklogs
      dayWorklogs.forEach(w => {
        const hours = w.durationMinutes / 60;

        if (hours > 8) {
          issues.push({
            level: 'warning',
            code: 'LONG_SINGLE_WORKLOG',
            worklogId: w.id,
            message: `${w.taskTitle}: ${hours.toFixed(1)}ч - очень долго для одной задачи`,
            suggestion: 'Рассмотрите возможность разбиения на несколько worklogs',
          });
        }

        if (hours < 0.05) {  // 3 minutes - quick fixes are valid
          issues.push({
            level: 'warning',
            code: 'SHORT_WORKLOG',
            worklogId: w.id,
            message: `${w.taskTitle}: ${w.durationMinutes}м - очень короткий worklog`,
            suggestion: 'Возможно, стоит объединить с другим worklog?',
          });
        }
      });
    });

    return issues;
  }

  /**
   * Detects missing time between worklogs
   */
  private detectMissingTime(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    const byDate = new Map<string, LocalWorklog[]>();
    worklogs.forEach(w => {
      if (!byDate.has(w.date)) {
        byDate.set(w.date, []);
      }
      byDate.get(w.date)!.push(w);
    });

    byDate.forEach((dayWorklogs, date) => {
      if (!this.isWeekday(date)) return;

      const sorted = [...dayWorklogs].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const gaps: { start: string; end: string; minutes: number }[] = [];

      // Find gaps between worklogs
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        const gapMinutes = this.calculateGapMinutes(current.endTime, next.startTime);

        if (gapMinutes > 30) { // Gap longer than 30 minutes
          gaps.push({
            start: current.endTime,
            end: next.startTime,
            minutes: gapMinutes,
          });
        }
      }

      if (gaps.length > 0) {
        const totalGap = gaps.reduce((sum, g) => sum + g.minutes, 0);
        const gapHours = totalGap / 60;

        if (gapHours > 2) {
          issues.push({
            level: 'warning',
            code: 'MISSING_TIME_COVERAGE',
            message: `${date}: Обнаружены пропуски времени (всего ${gapHours.toFixed(1)}ч)`,
            suggestion: `Промежутки: ${gaps.map(g => `${g.start}-${g.end} (${(g.minutes / 60).toFixed(1)}ч)`).join(', ')}`,
          });
        }
      }
    });

    return issues;
  }

  /**
   * Validates worklog descriptions quality
   */
  private validateDescriptions(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    worklogs.forEach(w => {
      const desc = w.description.trim();

      // 1. Empty description
      if (!desc) {
        issues.push({
          level: 'warning',
          code: 'EMPTY_DESCRIPTION',
          worklogId: w.id,
          message: `${w.taskTitle}: Отсутствует описание worklog`,
          suggestion: 'Добавьте краткое описание выполненной работы',
        });
        return;
      }

      // 2. Too short description
      if (desc.length < 10) {
        issues.push({
          level: 'info',
          code: 'SHORT_DESCRIPTION',
          worklogId: w.id,
          message: `${w.taskTitle}: Очень короткое описание (${desc.length} символов)`,
          suggestion: 'Опишите подробнее, что было сделано',
        });
      }

      // 3. Generic phrases (anti-patterns)
      const antiPatterns = [
        /^работа( над задачей)?$/i,
        /^делал задачу$/i,
        /^coding$/i,
        /^work$/i,
        /^задача$/i,
      ];

      if (antiPatterns.some(pattern => pattern.test(desc))) {
        issues.push({
          level: 'warning',
          code: 'GENERIC_DESCRIPTION',
          worklogId: w.id,
          message: `${w.taskTitle}: Слишком общее описание "${desc}"`,
          suggestion: 'Опишите конкретные действия (анализ, разработка, ревью, тестирование)',
        });
      }

      // NOTE: Mixed layout check removed - mixing Cyrillic and Latin is normal in IT
      // e.g. "Исправил баг в API endpoint" is valid
    });

    return issues;
  }

  /**
   * Validates Jira keys format
   */
  private validateJiraKeys(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const jiraKeyPattern = /^[A-Z][A-Z0-9]+-\d+$/;

    worklogs.forEach(w => {
      if (!w.jiraKey) {
        issues.push({
          level: 'warning',
          code: 'MISSING_JIRA_KEY',
          worklogId: w.id,
          message: `${w.taskTitle}: Отсутствует Jira key`,
          suggestion: 'Worklog не будет синхронизирован с Jira',
        });
        return;
      }

      if (!jiraKeyPattern.test(w.jiraKey)) {
        issues.push({
          level: 'error',
          code: 'INVALID_JIRA_KEY',
          worklogId: w.id,
          message: `${w.jiraKey}: Некорректный формат Jira key`,
          suggestion: 'Формат: PROJECT-123 (например, EGISZREMD-15263)',
        });
      }
    });

    return issues;
  }

  /**
   * Validates business rules
   */
  private validateBusinessRules(worklogs: LocalWorklog[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 1. Do not sync old worklogs (> 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    worklogs.forEach(w => {
      const worklogDate = new Date(w.date);

      if (worklogDate < thirtyDaysAgo) {
        issues.push({
          level: 'warning',
          code: 'OLD_WORKLOG',
          worklogId: w.id,
          message: `${w.date}: Worklog старше 30 дней`,
          suggestion: 'Синхронизация старых worklogs может быть отклонена в Jira',
        });
      }
    });

    // 2. Worklogs in the future
    const today = new Date().toISOString().split('T')[0];
    worklogs.forEach(w => {
      if (w.date > today) {
        issues.push({
          level: 'error',
          code: 'FUTURE_DATE',
          worklogId: w.id,
          message: `${w.date}: Дата в будущем`,
          suggestion: 'Исправьте дату worklog',
        });
      }
    });

    // 3. Duplicate worklogs
    const duplicateMap = new Map<string, LocalWorklog[]>();
    worklogs.forEach(w => {
      const key = `${w.date}|${w.jiraKey}|${w.startTime}|${w.endTime}`;
      if (!duplicateMap.has(key)) {
        duplicateMap.set(key, []);
      }
      duplicateMap.get(key)!.push(w);
    });

    duplicateMap.forEach((dupes, key) => {
      if (dupes.length > 1) {
        issues.push({
          level: 'warning',
          code: 'POSSIBLE_DUPLICATE',
          worklogId: dupes[0].id,
          message: `Найдено ${dupes.length} похожих worklogs: ${dupes.map(d => d.taskTitle).join(', ')}`,
          suggestion: 'Проверьте, не дублируются ли worklogs',
        });
      }
    });

    return issues;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private isWeekday(dateStr: string): boolean {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day >= 1 && day <= 5; // Mon-Fri
  }

  private calculateGapMinutes(endTime: string, startTime: string): number {
    const [hEnd, mEnd] = endTime.split(':').map(Number);
    const [hStart, mStart] = startTime.split(':').map(Number);

    const minsEnd = hEnd * 60 + mEnd;
    const minsStart = hStart * 60 + mStart;

    return minsStart - minsEnd;
  }

  private containsCyrillic(text: string): boolean {
    return /[а-яА-ЯёЁ]/.test(text);
  }

  private containsLatin(text: string): boolean {
    return /[a-zA-Z]/.test(text);
  }
}

/**
 * Convenience function to validate pending worklogs
 */
export async function validatePendingWorklogs(worklogs: LocalWorklog[]): Promise<ValidationResult> {
  const validator = new WorklogValidator();
  return validator.validate(worklogs);
}
