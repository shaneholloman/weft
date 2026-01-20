import { jsonResponse } from '../utils/response';
import { transformScheduledRun, transformTask } from '../utils/transformations';

export interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'custom';
  time: string;              // "05:00" (24-hour format)
  timezone: string;          // "America/Los_Angeles"
  daysOfWeek?: number[];     // For weekly: [1,3,5] = Mon,Wed,Fri (0=Sun)
  cron?: string;             // For custom: "0 5 * * *"
  targetColumnId: string;
}

export type ScheduledRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ScheduledRun {
  id: string;
  taskId: string;
  status: ScheduledRunStatus;
  startedAt?: string;
  completedAt?: string;
  tasksCreated: number;
  summary?: string;
  error?: string;
  createdAt: string;
}

interface TaskRow {
  id: string;
  column_id: string;
  board_id: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  context: string | null;
  schedule_config: string | null;
  parent_task_id: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

export class ScheduleService {
  private sql: SqlStorage;
  private generateId: () => string;

  constructor(sql: SqlStorage, generateId: () => string) {
    this.sql = sql;
    this.generateId = generateId;
  }

  getScheduledTasks(boardId: string): Response {
    const tasks = this.sql.exec(
      `SELECT * FROM tasks
       WHERE board_id = ?
       AND schedule_config IS NOT NULL`,
      boardId
    ).toArray();

    const scheduledTasks = tasks.filter((task) => {
      const row = task as unknown as TaskRow;
      if (!row.schedule_config) return false;
      try {
        const config = JSON.parse(row.schedule_config) as ScheduleConfig;
        return config.enabled;
      } catch {
        return false;
      }
    });

    return jsonResponse({
      success: true,
      data: scheduledTasks.map(t => transformTask(t as Record<string, unknown>))
    });
  }

  getScheduledRuns(taskId: string, limit = 10): Response {
    const runs = this.sql.exec(
      `SELECT * FROM scheduled_runs
       WHERE task_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      taskId,
      limit
    ).toArray();

    return jsonResponse({
      success: true,
      data: runs.map(r => transformScheduledRun(r as Record<string, unknown>))
    });
  }

  getRunTasks(runId: string): Response {
    const tasks = this.sql.exec(
      `SELECT * FROM tasks WHERE run_id = ? ORDER BY created_at`,
      runId
    ).toArray();

    return jsonResponse({
      success: true,
      data: tasks.map(t => transformTask(t as Record<string, unknown>))
    });
  }

  getChildTasks(parentTaskId: string): Response {
    const tasks = this.sql.exec(
      `SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at DESC`,
      parentTaskId
    ).toArray();

    return jsonResponse({
      success: true,
      data: tasks.map(t => transformTask(t as Record<string, unknown>))
    });
  }

  createScheduledRun(taskId: string): Response {
    const id = this.generateId();
    const now = new Date().toISOString();

    this.sql.exec(
      `INSERT INTO scheduled_runs (id, task_id, status, started_at, tasks_created, created_at)
       VALUES (?, ?, 'pending', ?, 0, ?)`,
      id,
      taskId,
      now,
      now
    );

    const run = this.sql.exec('SELECT * FROM scheduled_runs WHERE id = ?', id).toArray()[0];
    return jsonResponse({ success: true, data: transformScheduledRun(run as Record<string, unknown>) });
  }

  updateScheduledRun(runId: string, data: {
    status?: ScheduledRunStatus;
    completedAt?: string;
    tasksCreated?: number;
    summary?: string;
    error?: string;
    childTasksInfo?: Array<{ id: string; title: string }>;
  }): Response {
    const run = this.sql.exec('SELECT * FROM scheduled_runs WHERE id = ?', runId).toArray()[0];
    if (!run) {
      return jsonResponse({ error: 'Scheduled run not found' }, 404);
    }

    const currentRun = run as Record<string, unknown>;

    this.sql.exec(
      `UPDATE scheduled_runs SET
        status = ?,
        completed_at = ?,
        tasks_created = ?,
        summary = ?,
        error = ?,
        child_tasks_info = ?
       WHERE id = ?`,
      data.status ?? currentRun.status,
      data.completedAt ?? currentRun.completed_at,
      data.tasksCreated ?? currentRun.tasks_created,
      data.summary ?? currentRun.summary,
      data.error ?? currentRun.error,
      data.childTasksInfo ? JSON.stringify(data.childTasksInfo) : currentRun.child_tasks_info,
      runId
    );

    const updated = this.sql.exec('SELECT * FROM scheduled_runs WHERE id = ?', runId).toArray()[0];
    return jsonResponse({ success: true, data: transformScheduledRun(updated as Record<string, unknown>) });
  }

  deleteScheduledRun(runId: string): void {
    this.sql.exec('DELETE FROM scheduled_runs WHERE id = ?', runId);
  }

  getNextScheduledRunTime(boardId: string): number | null {
    const tasks = this.sql.exec(
      `SELECT * FROM tasks
       WHERE board_id = ?
       AND schedule_config IS NOT NULL`,
      boardId
    ).toArray();

    let earliestNextRun: number | null = null;

    for (const task of tasks) {
      const row = task as unknown as TaskRow;
      if (!row.schedule_config) continue;

      try {
        const config = JSON.parse(row.schedule_config) as ScheduleConfig;
        if (!config.enabled) continue;

        const nextRun = this.calculateNextRunTime(config);
        if (nextRun !== null) {
          if (earliestNextRun === null || nextRun < earliestNextRun) {
            earliestNextRun = nextRun;
          }
        }
      } catch {
        // Invalid JSON in schedule_config - skip this task
      }
    }

    return earliestNextRun;
  }

  getTasksDueForRun(boardId: string, alarmTimestamp: number): Array<{
    id: string;
    config: ScheduleConfig;
    lastRunAt?: string;
  }> {
    const tasks = this.sql.exec(
      `SELECT t.*,
              (SELECT MAX(sr.completed_at) FROM scheduled_runs sr
               WHERE sr.task_id = t.id AND sr.status = 'completed') as last_completed_at,
              (SELECT MAX(sr.created_at) FROM scheduled_runs sr WHERE sr.task_id = t.id) as last_run_at
       FROM tasks t
       WHERE t.board_id = ?
       AND t.schedule_config IS NOT NULL`,
      boardId
    ).toArray();

    const dueTasks: Array<{ id: string; config: ScheduleConfig; lastRunAt?: string }> = [];
    const alarmDate = new Date(alarmTimestamp);

    for (const task of tasks) {
      const row = task as unknown as TaskRow & { last_run_at?: string; last_completed_at?: string };
      if (!row.schedule_config) continue;

      try {
        const config = JSON.parse(row.schedule_config) as ScheduleConfig;

        if (!config.enabled) {
          continue;
        }

        if (this.isTaskDueAt(config, alarmDate, row.last_run_at)) {
          dueTasks.push({
            id: row.id,
            config,
            lastRunAt: row.last_completed_at || undefined,
          });
        }
      } catch {
        // Invalid JSON in schedule_config - skip this task
      }
    }

    return dueTasks;
  }

  private isTaskDueAt(config: ScheduleConfig, alarmDate: Date, lastRunAt?: string): boolean {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    });

    const parts = formatter.formatToParts(alarmDate);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const alarmHours = parseInt(getPart('hour'), 10);
    const alarmMinutes = parseInt(getPart('minute'), 10);
    const alarmWeekday = getPart('weekday');

    const [schedHours, schedMinutes] = config.time.split(':').map(Number);

    const schedTotalMinutes = schedHours * 60 + schedMinutes;
    const alarmTotalMinutes = alarmHours * 60 + alarmMinutes;
    const timeDiff = Math.abs(alarmTotalMinutes - schedTotalMinutes);

    if (timeDiff > 5 && timeDiff < (24 * 60 - 5)) {
      return false;
    }

    if (config.frequency === 'weekly') {
      const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayOfWeek = dayMap[alarmWeekday];
      if (!config.daysOfWeek?.includes(dayOfWeek)) {
        return false;
      }
    }

    // Prevent duplicate alarm fires within 5-minute window
    if (lastRunAt) {
      const lastRun = new Date(lastRunAt);
      const minutesSinceLastRun = (alarmDate.getTime() - lastRun.getTime()) / (1000 * 60);

      if (minutesSinceLastRun < 5) {
        return false;
      }
    }

    return true;
  }

  calculateNextRunTime(config: ScheduleConfig): number | null {
    if (!config.enabled) return null;

    if (config.frequency === 'custom' && config.cron) {
      return this.parseCronNextRun(config.cron, config.timezone);
    }

    const now = Date.now();
    const [schedHours, schedMinutes] = config.time.split(':').map(Number);
    const nowLocal = this.getLocalTimeParts(now, config.timezone);

    if (config.frequency === 'daily') {
      let targetUtc = this.localTimeToUTC(
        nowLocal.year, nowLocal.month, nowLocal.day,
        schedHours, schedMinutes, config.timezone
      );

      if (targetUtc <= now) {
        const tomorrowLocal = this.getLocalTimeParts(now + 24 * 60 * 60 * 1000, config.timezone);
        targetUtc = this.localTimeToUTC(
          tomorrowLocal.year, tomorrowLocal.month, tomorrowLocal.day,
          schedHours, schedMinutes, config.timezone
        );
      }

      return targetUtc;
    }

    if (config.frequency === 'weekly' && config.daysOfWeek?.length) {
      const sortedDays = [...config.daysOfWeek].sort((a, b) => a - b);

      for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
        const checkLocal = this.getLocalTimeParts(now + daysAhead * 24 * 60 * 60 * 1000, config.timezone);

        if (sortedDays.includes(checkLocal.weekday)) {
          const targetUtc = this.localTimeToUTC(
            checkLocal.year, checkLocal.month, checkLocal.day,
            schedHours, schedMinutes, config.timezone
          );
          if (targetUtc > now) {
            return targetUtc;
          }
        }
      }
    }

    return null;
  }

  private getLocalTimeParts(timestamp: number, timezone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
  } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(timestamp));
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
    const weekdayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    return {
      year: parseInt(getPart('year'), 10),
      month: parseInt(getPart('month'), 10),
      day: parseInt(getPart('day'), 10),
      hour: parseInt(getPart('hour'), 10),
      minute: parseInt(getPart('minute'), 10),
      weekday: weekdayMap[getPart('weekday')] ?? 0,
    };
  }

  private localTimeToUTC(
    year: number, month: number, day: number,
    hour: number, minute: number, timezone: string
  ): number {
    const roughUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const offsetMs = this.getTimezoneOffsetMs(roughUtc, timezone);
    return roughUtc - offsetMs;
  }

  private getTimezoneOffsetMs(timestamp: number, timezone: string): number {
    const date = new Date(timestamp);

    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });

    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });

    const utcParts = utcFormatter.formatToParts(date);
    const tzParts = tzFormatter.formatToParts(date);

    const getNum = (parts: Intl.DateTimeFormatPart[], type: string) =>
      parseInt(parts.find(p => p.type === type)?.value || '0', 10);

    const utcMs = Date.UTC(
      getNum(utcParts, 'year'), getNum(utcParts, 'month') - 1, getNum(utcParts, 'day'),
      getNum(utcParts, 'hour'), getNum(utcParts, 'minute'), 0
    );

    const tzMs = Date.UTC(
      getNum(tzParts, 'year'), getNum(tzParts, 'month') - 1, getNum(tzParts, 'day'),
      getNum(tzParts, 'hour'), getNum(tzParts, 'minute'), 0
    );

    return tzMs - utcMs;
  }

  private parseCronNextRun(cron: string, timezone: string): number | null {
    const cronParts = cron.trim().split(/\s+/);
    if (cronParts.length !== 5) return null;

    const minutes = this.parseCronField(cronParts[0], 0, 59);
    const hours = this.parseCronField(cronParts[1], 0, 23);
    const daysOfMonth = this.parseCronField(cronParts[2], 1, 31);
    const months = this.parseCronField(cronParts[3], 1, 12);
    const daysOfWeek = this.parseCronField(cronParts[4], 0, 6);

    if (!minutes || !hours || !daysOfMonth || !months || !daysOfWeek) {
      return null;
    }

    const now = Date.now();
    const startMinute = Math.floor(now / 60000) * 60000 + 60000;

    for (let i = 0; i < 366 * 24 * 60; i++) {
      const candidateUtc = startMinute + i * 60000;
      const local = this.getLocalTimeParts(candidateUtc, timezone);

      if (
        minutes.has(local.minute) &&
        hours.has(local.hour) &&
        daysOfMonth.has(local.day) &&
        months.has(local.month) &&
        daysOfWeek.has(local.weekday)
      ) {
        return candidateUtc;
      }
    }

    return null;
  }

  private parseCronField(field: string, min: number, max: number): Set<number> | null {
    const values = new Set<number>();

    if (field === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      return values;
    }

    for (const part of field.split(',')) {
      if (part.includes('/')) {
        const [rangePart, stepStr] = part.split('/');
        const step = parseInt(stepStr, 10);
        if (isNaN(step) || step <= 0) return null;

        let start = min;
        let end = max;

        if (rangePart !== '*') {
          if (rangePart.includes('-')) {
            const [s, e] = rangePart.split('-').map(Number);
            if (isNaN(s) || isNaN(e)) return null;
            start = s;
            end = e;
          } else {
            start = parseInt(rangePart, 10);
            if (isNaN(start)) return null;
          }
        }

        for (let i = start; i <= end; i += step) {
          if (i >= min && i <= max) values.add(i);
        }
      } else if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end)) return null;
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) values.add(i);
        }
      } else {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < min || num > max) return null;
        values.add(num);
      }
    }

    return values.size > 0 ? values : null;
  }
}
