'use client';

import { useState, useEffect } from 'react';
import { Task, TaskCategory } from '@/lib/supabase/types';
import { 
  Check, X, Edit, Clock, Link as LinkIcon, ChevronDown, ChevronRight,
  Home, User as UserIcon, Heart, Plane, PawPrint, FileText, Briefcase, Users,
  MessageCircle, Send
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { parseDateOnlyLocal } from '@/lib/utils/date-utils';
import { createClient } from '@/lib/supabase/client';
import { useFamilyMembers } from '@/hooks/use-family-members';
import { addCSRFToHeaders } from '@/lib/security/csrf-client';

const categoryIcons: Record<TaskCategory, React.ReactNode> = {
  medical: <Heart className="h-6 w-6" />,
  household: <Home className="h-6 w-6" />,
  personal: <UserIcon className="h-6 w-6" />,
  administrative: <FileText className="h-6 w-6" />,
  travel: <Plane className="h-6 w-6" />,
  pets: <PawPrint className="h-6 w-6" />,
  documents: <FileText className="h-6 w-6" />,
  work: <Briefcase className="h-6 w-6" />,
  family: <Users className="h-6 w-6" />,
};


interface Document {
  id: string;
  title: string;
  file_url: string;
  file_name?: string;
  file_type: string;
  file_size: number;
  category?: string;
  signed_url?: string;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  is_deleted: boolean;
  parent_comment_id?: string | null;
  users: {
    id: string;
    name: string;
    email: string;
  };
  replies?: Comment[];
}

export function TaskDetailModal({
  task,
  onClose,
  onComplete,
  onEdit,
  onPending
}: {
  task: Task;
  onClose: () => void;
  onComplete: () => void;
  onEdit?: () => void;
  onPending?: () => void;
}) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [generatingUrls, setGeneratingUrls] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const { getMemberName } = useFamilyMembers({ includePets: false, includeExtended: true });

  useEffect(() => {
    const fetchDocuments = async () => {
      if (task.document_ids && task.document_ids.length > 0) {
        setLoadingDocs(true);
        try {
          // Fetch specific documents by their IDs
          const response = await fetch('/api/documents/by-ids', {
            method: 'POST',
            headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ ids: task.document_ids })
          });
          
          if (response.ok) {
            const { documents } = await response.json();
            
            // Generate signed URLs for each document
            if (documents && documents.length > 0) {
              setGeneratingUrls(true);
              const docsWithSignedUrls = await Promise.all(
                documents.map(async (doc: Document) => {
                  try {
                  const signedUrlResponse = await fetch('/api/documents/get-signed-url', {
                    method: 'POST',
                    headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                      documentId: doc.id,
                      fileName: doc.file_name,
                      fileUrl: doc.file_url,
                    })
                  });
                    
                    if (signedUrlResponse.ok) {
                      const { signedUrl } = await signedUrlResponse.json();
                      return { ...doc, signed_url: signedUrl };
                    } else {
                      const error = await signedUrlResponse.text();
                      console.error('Signed URL generation failed:', error);
                    }
                  } catch (error) {
                    console.error('Failed to get signed URL for document:', doc.id);
                  }
                  return doc;
                })
              );
              setGeneratingUrls(false);
              setDocuments(docsWithSignedUrls);
            } else {
              setDocuments(documents || []);
            }
          } else {
            const errorText = await response.text();
            console.error('Failed to fetch documents:', errorText);
          }
        } catch (error) {
          console.error('Failed to fetch documents:', error);
        } finally {
          setLoadingDocs(false);
        }
      }
    };

    fetchDocuments();
  }, [task.document_ids]);

  // Fetch comments and set up real-time subscription
  useEffect(() => {
    const fetchComments = async () => {
      setLoadingComments(true);
      try {
        const response = await fetch(`/api/tasks/${task.id}/comments`);
        if (response.ok) {
          const { comments } = await response.json();
          setComments(comments || []);
        } else {
          const errorData = await response.json();
          console.error('Failed to fetch comments:', errorData);
          throw new Error(errorData.error || 'Failed to fetch comments');
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setLoadingComments(false);
      }
    };

    fetchComments();

    // Set up real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel(`task-comments-${task.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${task.id}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the new comment with user data
            const response = await fetch(`/api/tasks/${task.id}/comments`);
            if (response.ok) {
              const { comments } = await response.json();
              setComments(comments || []);
            }
          } else if (payload.eventType === 'UPDATE' && payload.new.is_deleted) {
            // Remove deleted comment
            setComments(prev => prev.filter(c => c.id !== payload.new.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [task.id]);

  // Post a new comment
  const handlePostComment = async () => {
    if (!commentText.trim()) return;

    setPostingComment(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ comment: commentText.trim() })
      });

      if (response.ok) {
        const { comment } = await response.json();
        setComments([comment, ...comments]);
        setCommentText('');
        setShowCommentInput(false);
      } else {
        const error = await response.json();
        console.error('Failed to post comment:', error);
      }
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setPostingComment(false);
    }
  };

  // Post a reply to a comment
  const handlePostReply = async (parentCommentId: string) => {
    if (!replyText.trim()) return;

    setPostingComment(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: addCSRFToHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 
          comment: replyText.trim(),
          parent_comment_id: parentCommentId
        })
      });

      if (response.ok) {
        // Refetch comments to get updated thread structure
        const fetchResponse = await fetch(`/api/tasks/${task.id}/comments`);
        if (fetchResponse.ok) {
          const { comments: updatedComments } = await fetchResponse.json();
          setComments(updatedComments || []);
        }
        setReplyText('');
        setReplyingTo(null);
      } else {
        const error = await response.json();
        console.error('Failed to post reply:', error);
      }
    } catch (error) {
      console.error('Error posting reply:', error);
    } finally {
      setPostingComment(false);
    }
  };

  // Organize comments into threaded structure
  const organizeThreadedComments = (commentsList: Comment[]) => {
    const commentMap = new Map<string, Comment>();
    const topLevelComments: Comment[] = [];

    // First pass: create map
    commentsList.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: organize hierarchy
    commentsList.forEach(comment => {
      const currentComment = commentMap.get(comment.id)!;
      if (comment.parent_comment_id && commentMap.has(comment.parent_comment_id)) {
        const parentComment = commentMap.get(comment.parent_comment_id)!;
        if (!parentComment.replies) parentComment.replies = [];
        parentComment.replies.push(currentComment);
      } else {
        topLevelComments.push(currentComment);
      }
    });

    return topLevelComments;
  };
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    const date = /\d{4}-\d{2}-\d{2}(?:$|T00:00:00)/.test(dateString) ? parseDateOnlyLocal(dateString) : new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background-secondary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-600/30">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text-primary">Task Details</h2>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="p-2 hover:bg-gray-700 rounded-md transition-colors"
                  title="Edit"
                >
                  <Edit className="h-4 w-4 text-text-primary" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              >
                <X className="h-4 w-4 text-text-primary" />
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* Header Card - Title and Description */}
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <span className="text-2xl">{categoryIcons[task.category]}</span>
                {task.title}
              </h3>
              {task.description && (
                <p className="text-text-muted mt-1">{task.description}</p>
              )}
            </div>

            {/* Links & Documents Card */}
            {((task.links && task.links.length > 0) || (task.document_ids && task.document_ids.length > 0)) && (
              <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
                {/* Links */}
                {task.links && task.links.length > 0 && (
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-4">
                    <span className="text-text-muted text-sm font-medium">Links:</span>
                    <div className="space-y-1 mt-2">
                      {task.links.map((link, index) => {
                        let displayName = `Link ${index + 1}`;
                        try {
                          const url = new URL(link);
                          displayName = url.hostname || displayName;
                        } catch {
                          // If URL parsing fails, use the link as is
                          displayName = link.substring(0, 50) + (link.length > 50 ? '...' : '');
                        }
                        return (
                          <a
                            key={index}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {displayName}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Documents */}
                {task.document_ids && task.document_ids.length > 0 && (
                  <div className={(task.links && task.links.length > 0 ? 'mt-4 ' : '') + 'bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-4'}>
                    <span className="text-text-muted text-sm font-medium">Documents:</span>
                    <div className="space-y-1 mt-2">
                      {loadingDocs ? (
                        <span className="text-text-primary text-sm">Loading documents...</span>
                      ) : generatingUrls ? (
                        <span className="text-text-primary text-sm">Generating secure links...</span>
                      ) : documents.length > 0 ? (
                        documents.map((doc) => {
                          // Format file size
                          const formatFileSize = (bytes: number) => {
                            if (bytes < 1024) return bytes + ' B';
                            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                          };
                          
                          return (
                            <div key={doc.id} className="py-1">
                              <a
                                href={doc.signed_url || '#'}
                                onClick={doc.signed_url ? undefined : (e) => {
                                  e.preventDefault();
                                  alert('Unable to generate secure link for this document. Please try refreshing the page.');
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors group"
                              >
                                <FileText className="h-4 w-4 flex-shrink-0" />
                                <span className="group-hover:underline">
                                  {doc.title || doc.file_name || 'Untitled Document'}
                                </span>
                                {doc.file_size && (
                                  <span className="text-xs text-text-muted">
                                    ({formatFileSize(doc.file_size)})
                                  </span>
                                )}
                                {!doc.signed_url && (
                                  <span className="text-xs text-yellow-400">
                                    (Secure link unavailable)
                                  </span>
                                )}
                              </a>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-text-primary text-sm">
                          {task.document_ids.length} document{task.document_ids.length > 1 ? 's' : ''} attached
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Details Card */}
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg">
              <button
                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  {isDetailsExpanded ? (
                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                  ) : (
                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                  )}
                  <span>Details</span>
                  {!isDetailsExpanded && (
                    <span className="text-text-muted font-normal">
                      • {task.priority} Priority • Due {task.due_date ? formatDate(task.due_date) : 'Not set'}
                    </span>
                  )}
                </div>
              </button>
              
              {/* Expandable Content */}
              <div 
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  isDetailsExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-4 pb-4">
                  {/* Details Grid */}
                  <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-text-muted">Category:</span>
                      <div className="text-text-primary capitalize">{task.category}</div>
                    </div>
                    <div>
                      <span className="text-text-muted">Priority:</span>
                      <div className="text-text-primary capitalize">{task.priority} Priority</div>
                    </div>
                    <div>
                      <span className="text-text-muted">Status:</span>
                      <div className="text-text-primary capitalize flex items-center gap-1">
                        {task.status === 'active' && <Clock className="h-3 w-3" />}
                        {task.status.replace('_', ' ')}
                      </div>
                    </div>
                    <div>
                      <span className="text-text-muted">Due Date:</span>
                      <div className={`text-text-primary ${task.due_date && parseDateOnlyLocal(task.due_date) < new Date() ? 'text-red-400' : ''}`}>
                        {formatDate(task.due_date ?? null)}
                        {task.due_date && parseDateOnlyLocal(task.due_date) < new Date() && ' (Overdue)'}
                      </div>
                    </div>
                    <div>
                      <span className="text-text-muted">Created:</span>
                      <div className="text-text-primary">{formatDate(task.created_at)}</div>
                    </div>
                    <div>
                      <span className="text-text-muted">Assigned to:</span>
                      <div className="text-text-primary">
                        {(() => {
                          const namesFromUsers = task.assigned_users?.map(u => u?.name).filter(Boolean) || [];
                          if (namesFromUsers.length > 0) return namesFromUsers.join(', ');
                          const ids = task.assigned_to || [];
                          if (ids.length > 0) return ids.map(id => getMemberName(id)).join(', ');
                          return '—';
                        })()}
                      </div>
                    </div>
                    {task.completed_at && (
                      <div className="col-span-2">
                        <span className="text-text-muted">Completed:</span>
                        <div className="text-text-primary">{formatDate(task.completed_at)}</div>
                      </div>
                    )}
                  </div>
                  
                </div>
              </div>
            </div>


            {/* Notes Card */}
            {task.notes && (
              <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
                <span className="text-text-muted text-sm font-medium">Notes:</span>
                <div className="bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-4 mt-2">
                  <p className="text-text-primary text-sm whitespace-pre-wrap">{task.notes}</p>
                </div>
              </div>
            )}

            {/* Comments Card */}
            <div className="bg-[#30302E] border border-[#3A3A38] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Comments ({comments.length})
                </h3>
              </div>

              {/* Comment Input (shown when Add Comment is clicked) */}
              {showCommentInput && (
                <div className="mb-4 bg-background-secondary p-3 rounded-md border border-gray-600/20">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 bg-background-primary text-text-primary placeholder-text-muted rounded-md border border-gray-600/30 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setShowCommentInput(false);
                        setCommentText('');
                      }}
                      className="px-3 py-1.5 text-sm text-text-primary hover:text-white transition-colors"
                      disabled={postingComment}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePostComment}
                      disabled={!commentText.trim() || postingComment}
                      className="px-3 py-1.5 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {postingComment ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-3 max-h-60 overflow-y-auto bg-[#2A2A28] border border-[#3A3A38] rounded-lg p-3">
                {loadingComments ? (
                  <div className="text-center py-4">
                    <span className="text-text-muted text-sm">Loading comments...</span>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-4">
                    <span className="text-text-muted text-sm">No comments yet</span>
                  </div>
                ) : (
                  <>
                    {organizeThreadedComments(comments).map((comment) => (
                      <CommentThread
                        key={comment.id}
                        comment={comment}
                        depth={0}
                        replyingTo={replyingTo}
                        replyText={replyText}
                        setReplyingTo={setReplyingTo}
                        setReplyText={setReplyText}
                        handlePostReply={handlePostReply}
                        postingComment={postingComment}
                        formatDistanceToNow={formatDistanceToNow}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons - No card wrapper */}
          <div className="flex gap-3 pt-3 mt-3 border-t border-gray-600/30">
            {task.status !== 'completed' && task.status !== 'archived' && (
              <>
                <button
                  onClick={onComplete}
                  className="flex-1 py-2 px-4 bg-button-create hover:bg-button-create/90 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="h-4 w-4" />
                  Mark Complete
                </button>
                {task.status !== 'active' && onPending && (
                  <button
                    onClick={onPending}
                    className="flex-1 py-2 px-4 bg-[#514c78] hover:bg-[#474169] text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Mark Pending
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setShowCommentInput(!showCommentInput)}
              className="py-2 px-4 bg-[#5B7CA3] hover:bg-[#4F6B8C] text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Add Comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Comment Thread Component for nested display
function CommentThread({
  comment,
  depth,
  replyingTo,
  replyText,
  setReplyingTo,
  setReplyText,
  handlePostReply,
  postingComment,
  formatDistanceToNow
}: {
  comment: Comment;
  depth: number;
  replyingTo: string | null;
  replyText: string;
  setReplyingTo: (id: string | null) => void;
  setReplyText: (text: string) => void;
  handlePostReply: (parentId: string) => Promise<void>;
  postingComment: boolean;
  formatDistanceToNow: typeof import('date-fns').formatDistanceToNow;
}) {
  const isReplying = replyingTo === comment.id;
  const marginLeft = depth > 0 ? 'ml-6' : '';

  return (
    <div className={marginLeft}>
      <div className="bg-background-secondary p-3 rounded-md border border-gray-600/20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-text-primary">
                {comment.users.name}
              </span>
              <span className="text-xs text-text-muted">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
              {depth > 0 && (
                <span className="text-xs text-text-muted italic">
                  (reply)
                </span>
              )}
            </div>
            <p className="text-sm text-text-primary whitespace-pre-wrap">
              {comment.comment}
            </p>
            
            {/* Reply button */}
            <button
              onClick={() => {
                if (isReplying) {
                  setReplyingTo(null);
                  setReplyText('');
                } else {
                  setReplyingTo(comment.id);
                  setReplyText('');
                }
              }}
              className="mt-2 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {isReplying ? 'Cancel' : 'Reply'}
            </button>
          </div>
        </div>

        {/* Reply input field */}
        {isReplying && (
          <div className="mt-3 pl-4 border-l-2 border-gray-600/30">
            <div className="text-xs text-text-muted mb-1">
              Replying to {comment.users.name}
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="w-full px-2 py-1.5 text-sm bg-background-primary text-text-primary placeholder-text-muted rounded-md border border-gray-600/30 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 resize-none"
              rows={2}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText('');
                }}
                className="px-2 py-1 text-xs text-text-primary hover:text-white transition-colors"
                disabled={postingComment}
              >
                Cancel
              </button>
              <button
                onClick={() => handlePostReply(comment.id)}
                disabled={!replyText.trim() || postingComment}
                className="px-2 py-1 text-xs bg-button-create hover:bg-button-create/90 text-white rounded-md transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3 w-3" />
                {postingComment ? 'Posting...' : 'Reply'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              replyingTo={replyingTo}
              replyText={replyText}
              setReplyingTo={setReplyingTo}
              setReplyText={setReplyText}
              handlePostReply={handlePostReply}
              postingComment={postingComment}
              formatDistanceToNow={formatDistanceToNow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
