'use client';

import { useState, useEffect } from 'react';
import { Task, User } from '@/lib/supabase/types';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { useFamilyMembers } from '@/hooks/use-family-members';
import { X } from 'lucide-react';
import { CategoriesClient, Category } from '@/lib/categories/categories-client';
import { smartUrlComplete } from '@/lib/utils/url-helper';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  task?: Task | null;
  users?: User[];
}

export default function TaskModal({ isOpen, onClose, onSave, task = null, users = [] }: TaskModalProps) {
  const { user: currentUser } = useUser();
  const { selectedPersonId } = usePersonFilter();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [projectId, setProjectId] = useState<string>((task as any)?.project_id || '');
  const [projects, setProjects] = useState<any[]>([]);
  const [category, setCategory] = useState<string>(task?.category || 'personal');
  const [priority, setPriority] = useState<string>(task?.priority || 'medium');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [assignedTo, setAssignedTo] = useState<string[]>(task?.assigned_to || []);
  const [isUrgent, setIsUrgent] = useState((task as any)?.is_urgent || false);
  const [isRecurring, setIsRecurring] = useState(!!(task as any)?.recurrence_pattern);
  const [recurrencePattern, setRecurrencePattern] = useState((task as any)?.recurrence_pattern || 'weekly');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState((task as any)?.recurrence_end_date || '');
  const [links, setLinks] = useState<string[]>(task?.links && task.links.length > 0 ? task.links : ['']);
  const [completionRequirement, setCompletionRequirement] = useState((task as any)?.completion_requirement || 'any');
  const [uploadedDocumentIds, setUploadedDocumentIds] = useState<string[]>(task?.document_ids || []);
  const [documentCategory, setDocumentCategory] = useState<string>('');
  const [documentAssignedTo, setDocumentAssignedTo] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<{file: File, category: string, assignedTo: string[], title: string}[]>([]);
  const [existingDocuments, setExistingDocuments] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const { humanMembers } = useFamilyMembers({ includePets: false });
  const [documentTitle, setDocumentTitle] = useState<string>('');

  const normalizeCategory = (val: string | null | undefined) => {
    if (!val) return '';
    return val.trim().toLowerCase().replace(/\s+/g, '_');
  };

  // Map arbitrary admin category names to allowed TaskCategory enum values
  const mapToTaskEnum = (name: string | null | undefined): string => {
    const normalized = normalizeCategory(name);
    const allowed = new Set([
      'personal','household','medical','travel','pets','administrative','work','family','documents'
    ]);
    if (allowed.has(normalized)) return normalized;
    const aliases: Record<string, string> = {
      'education': 'work',
      'school': 'work',
      'j3_academics': 'work',
      'financial': 'administrative',
      'legal': 'administrative',
    };
    return aliases[normalized] || 'personal';
  };

  // Helper to reset all form state for a fresh create
  const resetForm = () => {
    setTitle('');
    setDescription('');
    setProjectId('');
    setCategory('personal');
    setPriority('medium');
    setDueDate('');
    setAssignedTo([]);
    setIsUrgent(false);
    setIsRecurring(false);
    setRecurrencePattern('weekly');
    setRecurrenceEndDate('');
    setLinks(['']);
    setCompletionRequirement('any');
    setUploadedDocumentIds([]);
    setExistingDocuments([]);
    setDocumentCategory('');
    setDocumentAssignedTo([]);
    setPendingFiles([]);
    setDocumentTitle('');
  };

  // Fetch projects and categories on mount
  useEffect(() => {
    fetchProjects();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (isOpen && !task && selectedPersonId && selectedPersonId !== 'all') {
      setAssignedTo([selectedPersonId]);
    }
  }, [isOpen, task, selectedPersonId]);

  // Refresh categories when modal is opened to reflect latest admin changes
  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  // Update form fields when task prop changes
  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setProjectId((task as any)?.project_id || '');
      setCategory(task.category || 'personal');
      setPriority(task.priority || 'medium');
      setDueDate(task.due_date || '');
      setAssignedTo(task.assigned_to || []);
      setIsUrgent((task as any)?.is_urgent || false);
      setIsRecurring(!!(task as any)?.recurrence_pattern);
      setRecurrencePattern((task as any)?.recurrence_pattern || 'weekly');
      setRecurrenceEndDate((task as any)?.recurrence_end_date || '');
      setLinks(task.links && task.links.length > 0 ? task.links : ['']);
      setCompletionRequirement((task as any)?.completion_requirement || 'any');
      setUploadedDocumentIds(task.document_ids || []);
      // Fetch existing documents
      if (task.document_ids && task.document_ids.length > 0) {
        fetchExistingDocuments(task.document_ids);
      } else {
        setExistingDocuments([]);
      }
    } else {
      // Reset form when creating a new task
      resetForm();
    }
  }, [task]);

  // Also reset form each time the modal opens for a new task (task is null)
  useEffect(() => {
    if (isOpen && !task) {
      resetForm();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      console.log('[TaskModal] Fetching categories...');
      const cats = await CategoriesClient.getCategories('tasks');
      console.log('[TaskModal] Fetched categories:', cats);
      setCategories(cats);
      // If no category is selected and we have categories, select the first one
      if (!category && cats.length > 0) {
        // Default to a mapped enum value for the first category
        setCategory(mapToTaskEnum(cats[0].name));
      }
    } catch (error) {
      console.error('[TaskModal] Failed to fetch categories:', error);
      // Set some default categories as fallback
      const defaultCategories = [
        { id: '1', name: 'Personal', module: 'tasks' as const, color: '#AB9BBF', created_at: '', updated_at: '' },
        { id: '2', name: 'Work', module: 'tasks' as const, color: '#D4B574', created_at: '', updated_at: '' },
        { id: '3', name: 'Medical', module: 'tasks' as const, color: '#7B9CC3', created_at: '', updated_at: '' },
        { id: '4', name: 'Household', module: 'tasks' as const, color: '#D4B574', created_at: '', updated_at: '' },
        { id: '5', name: 'Administrative', module: 'tasks' as const, color: '#C2C0B6', created_at: '', updated_at: '' }
      ];
      setCategories(defaultCategories);
      if (!category) {
        setCategory('personal');
      }
    }
  };

  const fetchExistingDocuments = async (documentIds: string[]) => {
    try {
      const response = await fetch('/api/documents/by-ids', {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: documentIds })
      });
      
      if (response.ok) {
        const data = await response.json();
        setExistingDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch existing documents:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleRemoveDocument = (documentId: string) => {
    setUploadedDocumentIds(uploadedDocumentIds.filter(id => id !== documentId));
    setExistingDocuments(existingDocuments.filter(doc => doc.id !== documentId));
  };

  const handleFileUpload = async () => {
    if (pendingFiles.length === 0) return;
    
    const newDocumentIds: string[] = [];
    const newExistingDocs: any[] = [];
    
    for (const item of pendingFiles) {
      if (!item.title || !item.title.trim()) {
        alert('Please provide a title for all pending documents');
        return;
      }
      if (!item.category || !item.category.trim()) {
        alert('Please select a category for all pending documents');
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', item.file);
        // Use provided title
        formData.append('title', item.title.trim());
        formData.append('category', item.category);
        formData.append('source_page', 'tasks');
        // Store task title in description since source_title column might not exist
        formData.append('description', `Document uploaded for task: ${title || 'Untitled Task'}`);
        // Tag related people using the current task assignees
        const assigneesForDoc = (assignedTo && assignedTo.length > 0)
          ? assignedTo
          : (currentUser ? [currentUser.id] : []);
        const relatedPeopleIds = Array.from(new Set(assigneesForDoc));
        formData.append('relatedPeople', JSON.stringify(relatedPeopleIds));
        
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: addCSRFToHeaders(),
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.document?.id) {
            newDocumentIds.push(result.document.id);
            // Add to existing documents for display
            newExistingDocs.push({
              ...result.document,
              size: item.file.size || result.document.file_size,
              related_to: relatedPeopleIds
            });
          }
        } else {
          const errorText = await response.text();
          console.error('Failed to upload document:', errorText);
          alert(`Failed to upload ${item.file.name}: ${errorText}`);
        }
      } catch (error) {
        console.error('Error uploading document:', error);
        alert(`Error uploading ${item.file.name}: ${error}`);
      }
    }
    
    // Update the uploaded document IDs state
    setUploadedDocumentIds(prev => [...prev, ...newDocumentIds]);
    // Update existing documents display
    setExistingDocuments(prev => [...prev, ...newExistingDocs]);
    // Clear pending files
    setPendingFiles([]);
    
    // Return the new document IDs so handleSave can use them
            return newDocumentIds;
  };

  const handleSave = async (isDraft: boolean) => {
    // Validate required fields
    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }
    if (!dueDate) {
      alert('Please select a due date');
      return;
    }
    if (!assignedTo || assignedTo.length === 0) {
      alert('Please assign the task to at least one person');
      return;
    }
    
    // Upload pending files first
    let newUploadedIds: string[] = [];
    if (pendingFiles.length > 0) {
      newUploadedIds = await handleFileUpload() || [];
    }
    
    // Use selected assignees (required)
    const finalAssignedTo = assignedTo;
    
    // Combine existing and newly uploaded document IDs
    const allDocumentIds = [...uploadedDocumentIds, ...newUploadedIds];
    
    const taskData = {
      title,
      description,
      category,
      priority,
      due_date: dueDate,
      assigned_to: finalAssignedTo,
      is_urgent: isUrgent,
      status: isDraft ? 'draft' : 'active',
      recurrence_pattern: isRecurring ? recurrencePattern : null,
      recurrence_end_date: isRecurring ? recurrenceEndDate : null,
      links: links.filter(l => l).map(l => smartUrlComplete(l)), // Apply URL normalization
      document_ids: allDocumentIds,
      completion_requirement: finalAssignedTo.length > 1 ? completionRequirement : 'any',
      project_id: projectId || null
    };

    const res = await fetch(task ? `/api/tasks/${task.id}` : '/api/tasks', {
      method: task ? 'PUT' : 'POST',
      headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(taskData) // Send task data directly, API now handles both formats
    });

    if (res.ok && dueDate) {
      // Auto-sync to Calendar - temporarily disabled due to 500 error
      // TODO: Fix calendar auto-sync
      /*
      try {
        await fetch('/api/calendar/auto-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Task Due: ${title}`,
            start_date: dueDate,
            end_date: dueDate,
            category: 'task',
            assigned_to: assignedTo,
            source: 'tasks',
            source_id: task?.id || 'new',
            color: priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'blue'
          })
        });
      } catch (error) {
        console.error('Calendar sync failed:', error);
      }
      */
    }

    if (res.ok) {
      const savedTask = await res.json();
      
      if (onSave) {
        // Call onSave first to refresh the list
        await onSave();
        // Then close the modal
        onClose();
      } else {
        onClose();
        // Give a moment for modal to close before reload
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    } else {
      let message = 'Unknown error';
      try {
        const text = await res.text();
        try {
          const json = text ? JSON.parse(text) : {};
          message = `${json.error || message}${json.details ? `\n${json.details}` : ''}`;
          console.error('Task save failed:', json);
        } catch {
          message = text || message;
          console.error('Task save failed (non-JSON):', text);
        }
      } catch (e) {
        console.error('Task save failed: could not read error body', e);
      }
      alert(`Failed to save task. ${message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background-secondary rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-text-primary">
              {task ? 'Edit Task' : 'Add Task'}
            </h2>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        
          <form onSubmit={(e) => { e.preventDefault(); handleSave(false); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g., Schedule dentist appointment"
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Additional details about the task..."
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            {projects.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={mapToTaskEnum(cat.name)}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Priority *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Due Date *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>

            <div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-red-400">Pin as URGENT</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-text-primary">Make task recurring</span>
                </label>
              </div>

              {isRecurring && (
                <div className="mt-2 space-y-2">
                  <select
                    value={recurrencePattern}
                    onChange={(e) => setRecurrencePattern(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  
                  <input
                    type="date"
                    placeholder="End date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Assign To *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {humanMembers.map(member => (
                  <label key={member.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={assignedTo.includes(member.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAssignedTo([...assignedTo, member.id]);
                        } else {
                          setAssignedTo(assignedTo.filter(id => id !== member.id));
                        }
                      }}
                      className="rounded border-neutral-600 bg-neutral-700 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-text-primary">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {assignedTo.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Completion Requirement
                </label>
                <select
                  value={completionRequirement}
                  onChange={(e) => setCompletionRequirement(e.target.value)}
                  className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                  <option value="any">Any assignee can complete</option>
                  <option value="all">All assignees must complete</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Links
              </label>
              {links.map((link, index) => (
                <div key={index} className="mb-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={link}
                      onChange={(e) => {
                        const newLinks = [...links];
                        newLinks[index] = e.target.value;
                        setLinks(newLinks);
                      }}
                      placeholder="e.g. drphil.com, www.google.com, or https://..."
                      className="flex-1 px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => setLinks(links.filter((_, i) => i !== index))}
                      className="p-2 text-text-muted hover:text-text-primary transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {link && !link.startsWith('http') && (
                    <p className="text-xs text-blue-400 mt-1 ml-1">
                      Will be saved as: {smartUrlComplete(link)}
                    </p>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLinks([...links, ''])}
                className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                + Add Link
              </button>
            </div>

            {/* Minimal Document Uploads: Choose files first, then show metadata */}
            <div className="space-y-3">
              <div>
                <input
                  id="task-file-input"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const newItem = {
                      file,
                      category: '',
                      assignedTo: assignedTo.length > 0 ? [...assignedTo] : (currentUser ? [currentUser.id] : []),
                      title: file.name.replace(/\.[^/.]+$/, '')
                    };
                    setPendingFiles([...pendingFiles, newItem]);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="task-file-input"
                  className="inline-block py-2 px-4 bg-[#3b4e76] hover:bg-[#314060] text-white text-sm font-medium rounded-md cursor-pointer"
                >
                  Choose File
                </label>
              </div>

              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((item, index) => (
                    <div key={index} className="p-3 bg-background-primary/40 rounded-md border border-gray-600/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">⬆</span>
                            <span className="text-sm font-medium truncate">{item.file.name}</span>
                            <span className="text-xs text-muted-foreground">({formatFileSize(item.file.size)})</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            <div>
                              <label className="text-xs text-text-muted">Document Title *</label>
                              <input
                                type="text"
                                value={item.title}
                                onChange={(e) => {
                                  const next = [...pendingFiles];
                                  next[index] = { ...next[index], title: e.target.value };
                                  setPendingFiles(next);
                                }}
                                className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                                placeholder="Enter document title"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-text-muted">Document Category *</label>
                              <select
                                value={item.category}
                                onChange={(e) => {
                                  const next = [...pendingFiles];
                                  next[index] = { ...next[index], category: e.target.value };
                                  setPendingFiles(next);
                                }}
                                className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary"
                              >
                                <option value="">Select a category...</option>
                                <option value="medical">Medical</option>
                                <option value="financial">Financial</option>
                                <option value="legal">Legal</option>
                                <option value="education">Education</option>
                                <option value="travel">Travel</option>
                                <option value="property">Property</option>
                                <option value="vehicles">Vehicles</option>
                                <option value="personal">Personal</option>
                                <option value="work">Work</option>
                                <option value="photos">Photos</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== index))}
                          className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Upload happens automatically on Save Task */}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={!title.trim()}
                className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
              >
                {task ? 'Update Task' : 'Save Task'}
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                className="flex-1 py-2 px-4 bg-[#8C7348] hover:bg-[#7A6340] text-white font-medium rounded-md transition-colors"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-button-delete hover:bg-button-delete/90 text-white font-medium rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
