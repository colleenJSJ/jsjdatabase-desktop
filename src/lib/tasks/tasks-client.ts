import { addCSRFToHeaders } from '@/lib/security/csrf-client';

// Client-side tasks service methods
export const clientTasksService = {
  async updateTaskStatus(taskId: string, status: string) {
    const response = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error('Failed to update task status');
    }

    return response.json();
  },

  async deleteTask(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: addCSRFToHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete task');
    }

    return response.json();
  },
};
