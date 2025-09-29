'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/user-context';
import { User } from '@/lib/supabase/types';
import { Shield, User as UserIcon, CheckCircle, XCircle, Edit2, Save, X, Plus, FolderKanban, Trash2, Calendar } from 'lucide-react';
import { CategoryManagementTabs } from '@/components/admin/category-management-tabs';
import { AddUserModal } from '@/components/admin/add-user-modal';
import { CalendarPermissions } from '@/components/admin/CalendarPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminSettingsPage() {
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: '', user_status: 'active' as 'active' | 'inactive' | 'suspended' });
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [projects, setProjects] = useState<{
    id: string;
    name: string;
    description?: string;
    color: string;
    is_active: boolean;
    task_count?: number;
  }[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: '#6366f1' });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: '', description: '', color: '', is_active: true });
  const [categoryTab, setCategoryTab] = useState<'tasks' | 'calendar' | 'documents' | 'passwords' | 'contacts'>('tasks');
  const [mainTab, setMainTab] = useState<'users' | 'categories' | 'google' | 'projects'>('users');

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === 'admin') {
      fetchUsers();
      fetchProjects();
    } else {
      // Non-admins cannot access Admin Settings
      window.location.href = '/dashboard';
      return;
    }

    // Check for tab parameter in URL
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'calendar') {
      setMainTab('google');
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      console.log('[Admin Settings] Fetching users...');
      const response = await fetch('/api/admin/users');
      console.log('[Admin Settings] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Admin Settings] Received data:', data);
        console.log('[Admin Settings] Users array:', data.users);
        setUsers(data.users);
      } else {
        console.error('[Admin Settings] Failed to fetch users:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('[Admin Settings] Error data:', errorData);
      }
    } catch (error) {
      console.error('[Admin Settings] Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        // Also fetch task counts
        const projectsWithCounts = await Promise.all(
          data.projects.map(async (project: {
            id: string;
            name: string;
            description?: string;
            color: string;
            is_active: boolean;
          }) => {
            const countResponse = await fetch(`/api/tasks?project_id=${project.id}&count=true`);
            const countData = await countResponse.json();
            return { ...project, task_count: countData.count || 0 };
          })
        );
        setProjects(projectsWithCounts);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject)
      });

      if (response.ok) {
        await fetchProjects();
        setShowAddProject(false);
        setNewProject({ name: '', description: '', color: '#6366f1' });
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleEditProject = (project: {
    id: string;
    name: string;
    description?: string;
    color: string;
    is_active: boolean;
  }) => {
    setEditingProjectId(project.id);
    setEditProjectForm({
      name: project.name,
      description: project.description || '',
      color: project.color,
      is_active: project.is_active
    });
  };

  const handleSaveProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editProjectForm)
      });

      if (response.ok) {
        await fetchProjects();
        setEditingProjectId(null);
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchProjects();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      user_status: user.user_status || 'active'
    });
  };

  const handleSaveUser = async (userId: string) => {
    try {
      const updateData: Partial<{
        name: string;
        email: string;
        password: string;
        role: string;
        user_status: string;
      }> = {
        role: editForm.role,
        user_status: editForm.user_status
      };
      
      // Only send name, email, password if they've been changed
      if (editForm.name && editForm.name !== users.find(u => u.id === userId)?.name) {
        updateData.name = editForm.name;
      }
      if (editForm.email && editForm.email !== users.find(u => u.id === userId)?.email) {
        updateData.email = editForm.email;
      }
      if (editForm.password) {
        updateData.password = editForm.password;
      }
      
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        await fetchUsers();
        setEditingUserId(null);
      }
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditForm({ name: '', email: '', password: '', role: '', user_status: 'active' });
  };

  const handleAddUser = async (userData: { name: string; email: string; password: string; role: 'admin' | 'user' | 'guest' }) => {
    const response = await fetch('/api/admin/users/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add user');
    }

    await fetchUsers();
  };


  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-text-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">Access Restricted</h2>
        <p className="text-text-muted">Only administrators can access settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Admin Settings</h1>
      </div>

      {/* Main Tabs */}
      <div className="bg-background-secondary border border-gray-600/30 rounded-lg">
        <div className="border-b border-gray-600/30">
          <div className="flex">
            <button
              onClick={() => setMainTab('users')}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                mainTab === 'users'
                  ? 'text-text-primary bg-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              User Management
              {mainTab === 'users' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
              )}
            </button>
            <button
              onClick={() => setMainTab('categories')}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                mainTab === 'categories'
                  ? 'text-text-primary bg-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Category Management
              {mainTab === 'categories' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
              )}
            </button>
            <button
              onClick={() => setMainTab('google')}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                mainTab === 'google'
                  ? 'text-text-primary bg-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Google Calendar
              </div>
              {mainTab === 'google' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
              )}
            </button>
            <button
              onClick={() => setMainTab('projects')}
              className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                mainTab === 'projects'
                  ? 'text-text-primary bg-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Projects
              {mainTab === 'projects' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* User Management */}
      {mainTab === 'users' && (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text-primary">User Management</h2>
          <button
            onClick={() => setShowAddUserModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600/30 bg-background-tertiary">
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-text-muted">
                    No users found
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-700/20">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUserId === user.id && user.role !== 'admin' ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary w-full"
                      />
                    ) : (
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                          <span className="text-text-primary text-sm font-medium">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-text-primary">{user.name}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted">
                    {editingUserId === user.id && user.role !== 'admin' ? (
                      <div className="space-y-2">
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary w-full"
                          placeholder="Email"
                        />
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary w-full"
                          placeholder="New password (optional)"
                        />
                      </div>
                    ) : (
                      user.email
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUserId === user.id ? (
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        user.role === 'admin' 
                          ? 'bg-purple-500/20 text-purple-400' 
                          : user.role === 'user'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {user.role === 'guest' ? 'Guest (View Only)' : user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUserId === user.id ? (
                      <select
                        value={editForm.user_status}
                        onChange={(e) => setEditForm({ ...editForm, user_status: e.target.value as 'active' | 'inactive' | 'suspended' })}
                        className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                        user.user_status === 'active'
                          ? 'bg-green-500/20 text-green-400' 
                          : user.user_status === 'suspended'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {user.user_status === 'active' ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Active
                          </>
                        ) : user.user_status === 'suspended' ? (
                          <>
                            <XCircle className="h-3 w-3" />
                            Suspended
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            Inactive
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingUserId === user.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveUser(user.id)}
                          className="text-green-400 hover:text-green-300"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditUser(user)}
                        disabled={user.id === currentUser?.id || (user.role === 'admin' && currentUser?.id !== user.id)}
                        title={user.role === 'admin' && currentUser?.id !== user.id ? 'Cannot edit other admins' : ''}
                        className="text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Category Management */}
      {mainTab === 'categories' && (
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-4">Category Management</h2>
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg">
          {/* Category Tabs */}
          <div className="border-b border-gray-600/30">
            <div className="flex">
              <button
                onClick={() => setCategoryTab('tasks')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  categoryTab === 'tasks'
                    ? 'text-text-primary bg-background-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Task Categories
                {categoryTab === 'tasks' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
                )}
              </button>
              <button
                onClick={() => setCategoryTab('calendar')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  categoryTab === 'calendar'
                    ? 'text-text-primary bg-background-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Calendar Categories
                {categoryTab === 'calendar' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
                )}
              </button>
              <button
                onClick={() => setCategoryTab('documents')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  categoryTab === 'documents'
                    ? 'text-text-primary bg-background-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Document Categories
                {categoryTab === 'documents' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
                )}
              </button>
              <button
                onClick={() => setCategoryTab('passwords')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  categoryTab === 'passwords'
                    ? 'text-text-primary bg-background-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Password Categories
                {categoryTab === 'passwords' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
                )}
              </button>
              <button
                onClick={() => setCategoryTab('contacts')}
                className={`px-6 py-3 text-sm font-medium transition-colors relative ${
                  categoryTab === 'contacts'
                    ? 'text-text-primary bg-background-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Contact Categories
                {categoryTab === 'contacts' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700"></div>
                )}
              </button>
            </div>
          </div>
          <div className="p-6">
            {categoryTab === 'tasks' && (
              <CategoryManagementTabs module="tasks" moduleLabel="Task" />
            )}
            {categoryTab === 'calendar' && (
              <CategoryManagementTabs module="calendar" moduleLabel="Calendar" />
            )}
            {categoryTab === 'documents' && (
              <CategoryManagementTabs module="documents" moduleLabel="Document" />
            )}
            {categoryTab === 'passwords' && (
              <CategoryManagementTabs module="passwords" moduleLabel="Password" />
            )}
            {categoryTab === 'contacts' && (
              <CategoryManagementTabs module="contacts" moduleLabel="Contact" />
            )}
          </div>
        </div>
      </div>
      )}

      {/* Google Calendar Integration */}
      {mainTab === 'google' && (
        <div>
          <CalendarPermissions />
        </div>
      )}

      {/* Project Management */}
      {mainTab === 'projects' && (
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-4">Project Management</h2>
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-600/30 flex justify-between items-center">
            <h3 className="text-sm font-medium text-text-primary">Projects</h3>
            <Button
              onClick={() => setShowAddProject(!showAddProject)}
              className="bg-button-create hover:bg-button-create/90 text-white text-sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Project
            </Button>
          </div>
          
          {showAddProject && (
            <div className="p-4 border-b border-gray-600/30 bg-background-primary">
              <div className="space-y-3">
                <Input
                  placeholder="Project Name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="bg-background-secondary"
                />
                <Input
                  placeholder="Description (optional)"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="bg-background-secondary"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newProject.color}
                    onChange={(e) => setNewProject({ ...newProject, color: e.target.value })}
                    className="h-8 w-16 rounded cursor-pointer"
                  />
                  <span className="text-sm text-text-secondary">Project Color</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateProject}
                    className="bg-button-create hover:bg-button-create/90 text-white text-sm"
                  >
                    Create Project
                  </Button>
                  <Button
                    onClick={() => {
                      setShowAddProject(false);
                      setNewProject({ name: '', description: '', color: '#6366f1' });
                    }}
                    variant="outline"
                    className="text-sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-primary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Color
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Tasks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600/30">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingProjectId === project.id ? (
                        <Input
                          value={editProjectForm.name}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                          className="bg-background-primary text-sm w-32"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="text-text-primary">{project.name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingProjectId === project.id ? (
                        <Input
                          value={editProjectForm.description}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, description: e.target.value })}
                          className="bg-background-primary text-sm"
                        />
                      ) : (
                        <span className="text-text-secondary text-sm">
                          {project.description || 'No description'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingProjectId === project.id ? (
                        <input
                          type="color"
                          value={editProjectForm.color}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, color: e.target.value })}
                          className="h-6 w-12 rounded cursor-pointer"
                        />
                      ) : (
                        <div
                          className="w-6 h-6 rounded"
                          style={{ backgroundColor: project.color }}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {project.task_count || 0}
                    </td>
                    <td className="px-6 py-4">
                      {editingProjectId === project.id ? (
                        <select
                          value={editProjectForm.is_active.toString()}
                          onChange={(e) => setEditProjectForm({ ...editProjectForm, is_active: e.target.value === 'true' })}
                          className="px-2 py-1 bg-background-primary border border-gray-600/30 rounded text-sm text-text-primary"
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                          project.is_active
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {project.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingProjectId === project.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveProject(project.id)}
                            className="text-green-400 hover:text-green-300"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingProjectId(null)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditProject(project)}
                            className="text-text-secondary hover:text-text-primary"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="text-red-400 hover:text-red-300"
                            disabled={(project.task_count || 0) > 0}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* System Preferences - Always show at bottom */}
      <div>
        <h2 className="text-lg font-medium text-text-primary mb-4">System Preferences</h2>
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Password Policy
              </label>
              <div className="space-y-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-600 bg-gray-700 text-gray-400"
                  />
                  <span className="ml-2 text-sm text-text-primary">
                    Require minimum 8 characters
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-600 bg-gray-700 text-gray-400"
                  />
                  <span className="ml-2 text-sm text-text-primary">
                    Require uppercase and lowercase letters
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-600 bg-gray-700 text-gray-400"
                  />
                  <span className="ml-2 text-sm text-text-primary">
                    Require numbers
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onAddUser={handleAddUser}
      />
    </div>
  );
}
