import { create } from 'zustand';
import { DownloadTask, listAllTasks, getTaskStatus } from '../lib/api';

interface DownloadState {
  tasks: Record<string, DownloadTask>;
  pollingTasks: Set<string>;
  setTask: (taskId: string, task: DownloadTask) => void;
  updateTasks: () => Promise<void>;
  startPollingTask: (taskId: string) => void;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: {},
  pollingTasks: new Set(),
  setTask: (taskId, task) => 
    set((state) => ({
      tasks: { ...state.tasks, [taskId]: task }
    })),
  
  updateTasks: async () => {
    try {
      const allTasks = await listAllTasks();
      const taskMap: Record<string, DownloadTask> = {};
      allTasks.forEach(task => {
        taskMap[task.task_id] = task;
      });
      set({ tasks: taskMap });
    } catch (error) {
      console.error("Failed to update tasks from server:", error);
    }
  },

  startPollingTask: (taskId: string) => {
    if (get().pollingTasks.has(taskId)) return;
    
    set(state => ({
      pollingTasks: new Set(state.pollingTasks).add(taskId)
    }));

    const poll = async () => {
      try {
        const task = await getTaskStatus(taskId);
        get().setTask(taskId, task);
        if (task.status === "running" || task.status === "pending") {
          setTimeout(poll, 1000);
        } else {
          // Task finished or failed, remove from polling
          set(state => {
            const next = new Set(state.pollingTasks);
            next.delete(taskId);
            return { pollingTasks: next };
          });
        }
      } catch (error) {
        console.error(`Polling failed for task ${taskId}:`, error);
        // Remove from polling on error to allow retry
        set(state => {
          const next = new Set(state.pollingTasks);
          next.delete(taskId);
          return { pollingTasks: next };
        });
      }
    };
    poll();
  }
}));
