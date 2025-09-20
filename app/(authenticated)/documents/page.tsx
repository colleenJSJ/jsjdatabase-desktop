'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@/contexts/user-context';
import { usePersonFilter } from '@/contexts/person-filter-context';
import { PersonSelector } from '@/components/ui/person-selector';
import { Document } from '@/types';
import DocumentUploadModal from '@/components/documents/document-upload-modal';
import { useRouter } from 'next/navigation';
import { 
  Plus, Search, Star, Clock, Upload, Download, Eye, Trash2, 
  ChevronDown, Grid3X3, List, FileText, Calendar, FileEdit, Sheet, Image, Paperclip, Filter, X, Copy, CopyCheck
} from 'lucide-react';
import { formatBytes, formatDate } from '@/lib/utils';

const categories = [
  { id: 'all', name: 'All Categories', color: 'bg-gray-500' },
  { id: 'legal', name: 'Legal', color: 'bg-purple-500' },
  { id: 'financial', name: 'Financial', color: 'bg-green-500' },
  { id: 'medical', name: 'Medical', color: 'bg-red-500' },
  { id: 'education', name: 'Education', color: 'bg-blue-500' },
  { id: 'travel', name: 'Travel', color: 'bg-yellow-500' },
  { id: 'property', name: 'Property', color: 'bg-indigo-500' },
  { id: 'vehicles', name: 'Vehicles', color: 'bg-orange-500' },
  { id: 'personal', name: 'Personal', color: 'bg-pink-500' },
  { id: 'work', name: 'Work', color: 'bg-cyan-500' },
  { id: 'household', name: 'Household', color: 'bg-teal-500' },
  { id: 'other', name: 'Other', color: 'bg-gray-400' }
];


const sortOptions = [
  { id: 'newest', name: 'Newest First' },
  { id: 'oldest', name: 'Oldest First' },
  { id: 'a-z', name: 'A to Z' },
  { id: 'z-a', name: 'Z to A' },
  { id: 'largest', name: 'Largest Size' },
  { id: 'smallest', name: 'Smallest Size' },
  { id: 'expiring', name: 'Expiring Soon' }
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'];

const getFileIcon = (fileType: string | null | undefined) => {
  if (!fileType) return <Paperclip className="h-5 w-5" />;
  
  const type = fileType.toLowerCase();
  if (type.includes('pdf')) return <FileText className="h-5 w-5" />;
  if (type.includes('doc')) return <FileEdit className="h-5 w-5" />;
  if (type.includes('xls')) return <Sheet className="h-5 w-5" />;
  if (type.includes('jpg') || type.includes('jpeg') || type.includes('png')) return <Image className="h-5 w-5" />;
  return <Paperclip className="h-5 w-5" />;
};

const isImageDocument = (doc: Document) => {
  const type = doc.file_type?.toLowerCase() || '';
  if (type.startsWith('image/')) return true;
  const fileName = (doc.file_name || doc.title || '').toLowerCase();
  const path = (doc.file_url || '').toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => fileName.endsWith(ext) || path.includes(ext));
};

// Function to clean document title by removing file extension
const cleanDocumentTitle = (title: string): string => {
  // Remove common file extensions
  const extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.zip', '.rar'];
  let cleanTitle = title;
  
  for (const ext of extensions) {
    if (cleanTitle.toLowerCase().endsWith(ext)) {
      cleanTitle = cleanTitle.slice(0, -ext.length);
      break;
    }
  }
  
  // Additional cleaning: remove "Review Contract - " prefix if present
  if (cleanTitle.startsWith('Review Contract - ')) {
    cleanTitle = cleanTitle.replace('Review Contract - ', '');
  }
  
  return cleanTitle;
};

export default function DocumentsPage() {
  const { user, loading: userLoading } = useUser();
  const { selectedPersonId } = usePersonFilter();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState({
    starred: false,
    expiringSoon: false,
    showArchived: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [familyMemberMap, setFamilyMemberMap] = useState<Record<string, string>>({ shared: 'Shared/Family' });
  const [copyingDocId, setCopyingDocId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, boolean>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const previewRequestsInFlight = useRef<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    storageUsed: 0,
    expiringSoon: 0,
    recentUploads: 0
  });

  useEffect(() => {
    if (!userLoading && user) {
      fetchDocuments();
      fetchFamilyMembers();
    } else if (!userLoading && !user) {
      setLoading(false);
    }
  }, [user, userLoading, selectedPersonId, filters.showArchived]);

  useEffect(() => {
    filterAndSortDocuments();
  }, [documents, selectedCategory, searchQuery, filters, sortBy]);

  const fetchDocuments = async () => {
    try {
      let url = '/api/documents';
      const params = new URLSearchParams();
      if (selectedPersonId) params.append('selected_person', selectedPersonId);
      if (filters.showArchived) params.append('show_archived', 'true');
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        calculateStats(data.documents || []);
      } else {
        console.error('Failed to fetch documents');
        setDocuments([]);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFamilyMembers = async () => {
    try {
      const response = await fetch('/api/family-members');
      if (!response.ok) return;
      const data = await response.json();
      const members = data.members || [];
      const map: Record<string, string> = { shared: 'Shared/Family' };
      members.forEach((member: any) => {
        const name = member.display_name || member.name || member.email || member.id;
        map[member.id] = name;
      });
      setFamilyMemberMap(map);
    } catch (error) {
      console.error('Failed to fetch family members for documents:', error);
    }
  };

  const calculateStats = (docs: Document[]) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setStats({
      total: docs.length,
      storageUsed: docs.reduce((acc, doc) => acc + (doc.file_size || 0), 0),
      expiringSoon: docs.filter(doc => 
        doc.expiration_date && new Date(doc.expiration_date) <= thirtyDaysFromNow
      ).length,
      recentUploads: docs.filter(doc => 
        new Date(doc.created_at) >= sevenDaysAgo
      ).length
    });
  };

  const filterAndSortDocuments = () => {
    let filtered = [...documents];

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(doc => doc.category === selectedCategory);
    }

    // Person filtering is now handled by the API via selected_person parameter

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Quick filters
    if (filters.starred) {
      filtered = filtered.filter(doc => doc.is_starred);
    }
    if (filters.expiringSoon) {
      const thirtyDaysFromNow = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(doc => 
        doc.expiration_date && new Date(doc.expiration_date) <= thirtyDaysFromNow
      );
    }

    // Sort
    switch (sortBy) {
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'a-z':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'z-a':
        filtered.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'largest':
        filtered.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
        break;
      case 'smallest':
        filtered.sort((a, b) => (a.file_size || 0) - (b.file_size || 0));
        break;
      case 'expiring':
        filtered.sort((a, b) => {
          if (!a.expiration_date && !b.expiration_date) return 0;
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        });
        break;
      default: // newest
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    setFilteredDocuments(filtered);
  };

  useEffect(() => {
    let isMounted = true;
    const loadPreviews = async () => {
      const imageDocs = filteredDocuments.filter(isImageDocument);
      if (imageDocs.length === 0) return;

      const pendingDocs = imageDocs.filter(doc => {
        const shouldFetch = !previewUrls[doc.id] && !previewErrors[doc.id] && !previewRequestsInFlight.current.has(doc.id);
        if (shouldFetch) {
          console.debug('[Documents] Preview pending', {
            id: doc.id,
            title: doc.title,
            fileName: doc.file_name,
            fileType: doc.file_type,
            fileUrl: doc.file_url,
          });
        }
        return shouldFetch;
      });

      if (pendingDocs.length === 0) return;

      for (const doc of pendingDocs) {
        previewRequestsInFlight.current.add(doc.id);
        if (isMounted) {
          setPreviewLoading(prev => ({ ...prev, [doc.id]: true }));
        }

        try {
          const previewUrl = `/api/documents/preview/${doc.id}?ts=${Date.now()}`;
          if (isMounted) {
            setPreviewUrls(prev => ({ ...prev, [doc.id]: previewUrl }));
            setPreviewErrors(prev => {
              if (!prev[doc.id]) return prev;
              const next = { ...prev };
              delete next[doc.id];
              return next;
            });
          }
        } catch (error) {
          console.error('[Documents] Preview fetch error', { id: doc.id, error });
          console.error('Failed to load preview for document', doc.id, error);
          if (isMounted) {
            setPreviewErrors(prev => ({ ...prev, [doc.id]: true }));
          }
        } finally {
          previewRequestsInFlight.current.delete(doc.id);
          if (isMounted) {
            setPreviewLoading(prev => {
              const next = { ...prev };
              delete next[doc.id];
              return next;
            });
          }
        }
      }
    };

    loadPreviews();

    return () => {
      isMounted = false;
      previewRequestsInFlight.current.clear();
    };
  }, [filteredDocuments, previewUrls, previewErrors]);

  const handleStarToggle = async (doc: Document) => {
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.patch(`/api/documents/${doc.id}`, { is_starred: !doc.is_starred });

      if (response.success) {
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, is_starred: !d.is_starred } : d
        ));
      }
    } catch (error) {
      console.error('Failed to update star status:', error);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) return;

    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.delete(`/api/documents/${doc.id}`);

      if (response.success) {
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        // Show success message (optional)
        console.log('Document deleted successfully');
      } else {
        console.error('Failed to delete document:', response.error);
        alert(`Failed to delete document: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('Failed to delete document. Please try again.');
    }
  };

  const handleView = async (doc: Document) => {
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.post('/api/documents/get-signed-url', {
        documentId: doc.id,
        fileName: doc.file_name,
        fileUrl: doc.file_url,
      });

      if (!response.success) {
        console.error('Failed to get signed URL');
        return;
      }

      const { signedUrl } = (response.data as any) || {};
      window.open(signedUrl, '_blank');
    } catch (error) {
      console.error('Failed to view document:', error);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
      const response = await ApiClient.post('/api/documents/get-signed-url', {
        documentId: doc.id,
        fileName: doc.file_name,
        fileUrl: doc.file_url,
      });

      if (!response.success) {
        console.error('Failed to get signed URL');
        return;
      }

      const { signedUrl } = (response.data as any) || {};
      // Create a temporary link element for download
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download document:', error);
    }
  };

  const copyDocumentLink = async (doc: Document) => {
    try {
      const ApiClient = (await import('@/lib/api/api-client')).default;
        const response = await ApiClient.post('/api/documents/get-signed-url', {
          documentId: doc.id,
          fileName: doc.file_name,
          fileUrl: doc.file_url,
        });

      if (!response.success) {
        console.error('Failed to get signed URL for copy');
        return;
      }

      const { signedUrl } = (response.data as any) || {};
      if (!signedUrl) return;
      await navigator.clipboard.writeText(signedUrl);
      setCopyingDocId(doc.id);
      setTimeout(() => setCopyingDocId(null), 2000);
    } catch (error) {
      console.error('Failed to copy document link:', error);
    }
  };

  const navigateToSource = (doc: Document) => {
    if (!doc.source_page || !doc.source_id) return;
    
    const routes: Record<string, string> = {
      'tasks': '/tasks',
      'travel': '/travel',
      'health': '/health',
      'calendar': '/calendar',
      'j3-academics': '/j3-academics',
      'pets': '/pets',
      'household': '/household'
    };

    if (routes[doc.source_page]) {
      router.push(`${routes[doc.source_page]}?id=${doc.source_id}`);
    }
  };

  const getDaysUntilExpiration = (date: Date | string | undefined) => {
    if (!date) return null;
    const expirationDate = new Date(date);
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatSourcePage = (page?: string | null) => {
    if (!page) return 'Manual';
    const normalized = page.toString().toLowerCase();
    const map: Record<string, string> = {
      tasks: 'Tasks',
      travel: 'Travel',
      health: 'Health',
      calendar: 'Calendar',
      'j3-academics': 'J3 Academics',
      pets: 'Pets',
      household: 'Household',
      manual: 'Manual',
    };
    return map[normalized] || normalized.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  const getRelatedNames = (doc: Document) => {
    const ids = doc.related_to && doc.related_to.length > 0
      ? doc.related_to
      : doc.assigned_to && doc.assigned_to.length > 0
        ? doc.assigned_to
        : [];
    const names = ids
      .map(id => familyMemberMap[id] || id)
      .filter(Boolean);
    return names;
  };

  if (loading || userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted">Please log in to view documents</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Documents Hub</h1>
        </div>
        
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-5 py-2 text-sm bg-button-create hover:bg-button-create/90 text-white rounded-xl transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Total Documents</div>
          <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-text-muted">Storage Used</div>
          <div className="text-2xl font-bold text-text-primary">
            {formatBytes(stats.storageUsed)}
          </div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-red-500">Expiring Soon</div>
          <div className="text-2xl font-bold text-red-500">{stats.expiringSoon}</div>
        </div>
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-4">
          <div className="text-sm text-green-500">Recent Uploads</div>
          <div className="text-2xl font-bold text-green-500">{stats.recentUploads}</div>
        </div>
      </div>

      {/* Search Bar and Filters */}
      <div className="space-y-4">
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search documents, tags, descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-1 bg-background-primary border border-gray-600/30 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
              />
            </div>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-background-secondary rounded-xl p-1 border border-gray-600/30">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'grid'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'list'
                    ? 'bg-gray-700 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={
                'inline-flex items-center gap-2 px-4 py-1 rounded-xl border border-gray-600/30 bg-background-primary text-text-muted hover:text-text-primary hover:bg-gray-700/20 transition-colors'
              }
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-600/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Filter by
                  </label>
                  <PersonSelector className="w-full" showLabel={false} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Sort By
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full px-3 py-2 bg-background-primary border border-gray-600/30 rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-gray-700"
                  >
                    {sortOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Quick Filters
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, starred: !prev.starred }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.starred
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <Star className="h-4 w-4" fill={filters.starred ? 'currentColor' : 'none'} />
                      Starred
                    </button>
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, expiringSoon: !prev.expiringSoon }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.expiringSoon
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      Expiring
                    </button>
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, showArchived: !prev.showArchived }))}
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm transition-colors border ${
                        filters.showArchived
                          ? 'bg-gray-700 text-text-primary border-gray-600'
                          : 'bg-background-primary text-text-muted border-gray-600/30 hover:bg-gray-700/20'
                      }`}
                    >
                      Show Archived
                    </button>
                  </div>
                </div>
              </div>

              {/* Clear Filters */}
              {(selectedCategory !== 'all' || selectedPersonId || sortBy !== 'newest' || filters.starred || filters.expiringSoon || filters.showArchived || searchQuery) && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedCategory('all');
                      setSortBy('newest');
                      setFilters({ starred: false, expiringSoon: false, showArchived: false });
                      setSearchQuery('');
                    }}
                    className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Documents Display */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-background-secondary border border-gray-600/30 rounded-xl p-12">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-600 mb-4" />
            <p className="text-text-muted">
              {searchQuery || selectedCategory !== 'all' || selectedPersonId || Object.values(filters).some(f => f)
                ? 'No documents match your filters'
                : 'No documents uploaded yet'}
            </p>
            {documents.length === 0 && (
              <p className="text-sm text-text-muted/70 mt-2">
                Click the Upload button to get started
              </p>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
          {filteredDocuments.map(doc => {
            const relatedNames = getRelatedNames(doc);
            const sourceLabel = formatSourcePage(doc.source_page);
            const categoryBadge = categories.find(c => c.id === doc.category);
            const categoryClass = categoryBadge?.color?.startsWith('bg-') ? categoryBadge.color : '';
            const categoryStyle = categoryBadge?.color && categoryBadge.color.startsWith('#')
              ? { backgroundColor: categoryBadge.color }
              : undefined;
            const expiresIn = doc.expiration_date ? getDaysUntilExpiration(doc.expiration_date) : null;
            const assignedSummary = relatedNames.length > 0
              ? `${relatedNames.slice(0, 2).join(', ')}${relatedNames.length > 2 ? ` +${relatedNames.length - 2}` : ''}`
              : '';
            const isImageDoc = isImageDocument(doc);
            console.debug('[Documents] grid card render', {
              id: doc.id,
              title: doc.title,
              isImageDoc,
              fileType: doc.file_type,
              fileName: doc.file_name,
              fileUrl: doc.file_url,
              hasPreviewUrl: !!previewUrls[doc.id],
              previewError: previewErrors[doc.id],
            });
            const previewUrl = previewUrls[doc.id];
            const previewError = previewErrors[doc.id];
            const previewIsLoading = !!previewLoading[doc.id];
            const showPreview = isImageDoc && !!previewUrl;
            const previewPending = isImageDoc && !previewUrl && !previewError;

            return (
              <div
                key={doc.id}
                className="relative group flex flex-col items-center justify-between rounded-xl border border-transparent bg-[#30302E] p-4 min-h-[280px] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3A3A38] focus-within:border-[#3A3A38]"
              >
                <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60 z-10" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="invisible flex gap-2 rounded-lg bg-[#262625]/90 p-2 shadow-sm ring-1 ring-gray-700/60 opacity-0 transition duration-200 ease-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 z-20">
                    <button
                      onClick={() => copyDocumentLink(doc)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-gray-500 hover:bg-[#262625] ${copyingDocId === doc.id ? 'text-green-400' : ''}`}
                      title="Copy link"
                      aria-label="Copy document link"
                    >
                      {copyingDocId === doc.id ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => handleView(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-blue-400/60 hover:text-blue-400"
                      title="View"
                      aria-label="View document"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-green-400/60 hover:text-green-400"
                      title="Download"
                      aria-label="Download document"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => handleDelete(doc)}
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-600/40 bg-[#262625]/80 text-text-primary transition hover:border-red-400/60 hover:text-red-400"
                        title="Delete"
                        aria-label="Delete document"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleStarToggle(doc)}
                  className={`absolute top-3 right-3 z-30 rounded p-1 transition-colors ${
                    doc.is_starred ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'
                  }`}
                  title={doc.is_starred ? 'Unstar' : 'Star'}
                  aria-label={doc.is_starred ? 'Remove star' : 'Add star'}
                >
                  <Star className="h-4 w-4" fill={doc.is_starred ? 'currentColor' : 'none'} />
                </button>

                <div className="relative z-10 flex w-full flex-1 flex-col items-center gap-2 text-center">
                  <div className="w-full">
                    {showPreview ? (
                      <div className="h-36 w-full overflow-hidden rounded-lg border border-gray-600/40 bg-black/20">
                        <img
                          src={previewUrl}
                          alt={`${cleanDocumentTitle(doc.title)} preview`}
                          className="h-full w-full object-cover"
                          onError={() => {
                            console.warn('[Documents] Preview image failed to load in browser', { id: doc.id, signedUrl: previewUrl });
                            setPreviewErrors(prev => ({ ...prev, [doc.id]: true }));
                            setPreviewUrls(prev => {
                              const next = { ...prev };
                              delete next[doc.id];
                              return next;
                            });
                          }}
                        />
                      </div>
                    ) : previewPending || previewIsLoading ? (
                      <div className="h-36 w-full overflow-hidden rounded-lg border border-gray-600/40 bg-gray-800/60 animate-pulse" />
                    ) : (
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gray-700/40 text-text-primary transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60">
                        {getFileIcon(doc.file_type)}
                      </div>
                    )}
                  </div>
                  <p
                    className="text-sm font-semibold text-text-primary transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    title={cleanDocumentTitle(doc.title)}
                  >
                    {cleanDocumentTitle(doc.title)}
                  </p>
                  <div className="flex items-center gap-1 text-[11px] text-text-muted transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30">
                    <span>{formatBytes(doc.file_size || 0)}</span>
                    <span>•</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>
                  <span className="text-[11px] font-medium text-[#AB9BBF] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30">
                    {doc.source_page ? `From ${sourceLabel}` : 'Manual Upload'}
                  </span>
                  {assignedSummary && (
                    <span
                      className="w-full truncate px-1 text-[10px] text-[#C2C0B6] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30"
                      title={assignedSummary}
                    >
                      {assignedSummary}
                    </span>
                  )}
                  {expiresIn !== null && (
                    <span
                      className={`text-[10px] transition-opacity duration-200 group-hover:opacity-30 group-focus-within:opacity-30 ${expiresIn <= 30 ? 'text-red-400' : 'text-text-muted'}`}
                    >
                      {expiresIn > 0 ? `Expires in ${expiresIn} days` : 'Expired'}
                    </span>
                  )}
                </div>

                <span
                  className={`relative z-10 mt-3 inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium text-white transition-opacity duration-200 group-hover:opacity-60 group-focus-within:opacity-60 ${categoryClass}`}
                  style={categoryStyle}
                >
                  {categoryBadge?.name || doc.category}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-background-secondary border border-gray-600/30 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-600/30">
              <tr>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Document</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Category</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Related To</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Uploaded</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Size</th>
                <th className="text-left px-4 py-3 text-text-primary font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600/30">
              {filteredDocuments.map(doc => {
                const relatedNames = getRelatedNames(doc);
                const sourceLabel = formatSourcePage(doc.source_page);
                const categoryBadge = categories.find(c => c.id === doc.category);
                const categoryClass = categoryBadge?.color?.startsWith('bg-') ? categoryBadge.color : '';
                const categoryStyle = categoryBadge?.color && categoryBadge.color.startsWith('#')
                  ? { backgroundColor: categoryBadge.color }
                  : undefined;
                const expirationBadge = doc.expiration_date
                  ? getDaysUntilExpiration(doc.expiration_date)
                  : null;

                return (
                  <tr key={doc.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg bg-gray-700/40 flex items-center justify-center text-text-primary">
                          {getFileIcon(doc.file_type)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary truncate">
                            <span className="truncate" title={cleanDocumentTitle(doc.title)}>
                              {cleanDocumentTitle(doc.title)}
                            </span>
                            {doc.is_starred && <Star className="h-4 w-4 text-yellow-500" fill="currentColor" />}
                          </div>
                        {expirationBadge !== null && (
                          <div className={`text-xs ${expirationBadge <= 30 ? 'text-red-400' : 'text-text-muted'}`}>
                            {expirationBadge > 0 ? `Expires in ${expirationBadge} days` : 'Expired'}
                          </div>
                        )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${categoryClass}`}
                      style={categoryStyle}
                    >
                      {categoryBadge?.name || doc.category}
                    </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="text-[#AB9BBF] font-medium">
                          {doc.source_page ? `From ${sourceLabel}` : 'Manual'}
                        </span>
                        {relatedNames.slice(0, 2).map(name => (
                          <span key={`${doc.id}-${name}`} className="px-2 py-0.5 rounded-full bg-gray-700/60 text-text-primary">
                            {name}
                          </span>
                        ))}
                        {relatedNames.length > 2 && (
                          <span className="text-text-muted">+{relatedNames.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-sm">
                      {formatBytes(doc.file_size || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyDocumentLink(doc)}
                          className={`p-1.5 rounded text-text-muted hover:text-primary-400 transition-colors ${copyingDocId === doc.id ? 'text-green-400' : ''}`}
                          title="Copy link"
                        >
                          {copyingDocId === doc.id ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleView(doc)}
                          className="p-1.5 rounded text-text-muted/70 hover:text-blue-400 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 rounded text-text-muted/70 hover:text-green-400 transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={() => handleDelete(doc)}
                            className="p-1.5 rounded text-text-muted/70 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => {
            setShowUploadModal(false);
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
}
