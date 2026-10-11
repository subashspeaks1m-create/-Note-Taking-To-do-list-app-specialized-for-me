import { useCallback } from 'react';
import { useToast } from '../../components/Toasts';
import { formatShort, type DateKey } from '../../date/localDate';
import { XP_RULES } from '../../domain/config';
import type { ID, Task, TaskMove, TaskStatus } from '../../domain/models';
import { useRepo } from '../../storage/StorageProvider';

/** Task operations with user feedback and Undo, shared by every task surface. */
export function useTaskActions(timeZone: string) {
  const repo = useRepo();
  const toast = useToast();

  const fail = useCallback((e: unknown) => toast({ message: (e as Error).message || 'That change could not be saved. Nothing was changed.', tone: 'error' }), [toast]);

  const setStatus = useCallback(
    async (task: Task, status: TaskStatus): Promise<Task | null> => {
      try {
        const { after, capped, xp } = await repo.setTaskStatus(task.id, status, timeZone);
        if (capped) {
          const track = after.category === 'learning' ? 'Learning' : 'Doing';
          toast({
            message: xp > 0
              ? `Done. Only ${xp} XP counted: today's ${track} limit is ${XP_RULES.completionDailyCapPerTrack} XP.`
              : `Done and recorded. Today's ${track} XP limit (${XP_RULES.completionDailyCapPerTrack}) is reached, so this one adds no XP.`,
          });
        }
        if (status === 'canceled') {
          toast({ message: 'Task canceled', action: { label: 'Undo', run: () => void repo.setTaskStatus(task.id, task.status, timeZone) } });
        }
        return after;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [repo, timeZone, toast, fail],
  );

  const remove = useCallback(
    async (ids: ID[]) => {
      try {
        await repo.deleteTasks(ids);
        toast({
          message: ids.length === 1 ? 'Task deleted' : `${ids.length} tasks deleted`,
          action: { label: 'Undo', run: () => repo.restoreTasks(ids).catch(fail) },
        });
      } catch (e) {
        fail(e);
      }
    },
    [repo, toast, fail],
  );

  const move = useCallback(
    async (ids: ID[], to: DateKey | null, reason: TaskMove['reason'] = 'reschedule') => {
      try {
        await repo.moveTasks(ids, to, reason);
        const where = to ? formatShort(to) : 'Unscheduled';
        toast({ message: ids.length === 1 ? `Moved to ${where}` : `${ids.length} tasks moved to ${where}`, tone: 'neutral' });
      } catch (e) {
        fail(e);
      }
    },
    [repo, toast, fail],
  );

  const duplicate = useCallback(
    async (task: Task) => {
      try {
        await repo.duplicateTask(task.id);
        toast({ message: 'Copy added as a new task' });
      } catch (e) {
        fail(e);
      }
    },
    [repo, toast, fail],
  );

  return { setStatus, remove, move, duplicate, fail };
}
