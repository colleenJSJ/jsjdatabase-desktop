'use client';

import { useState, useRef } from 'react';
import { Bot, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { TravelExtractResponse } from '@/lib/ai/schemas';
import { useToast } from '@/hooks/use-toast';

interface SmartUploadButtonV2Props {
  onAutofill: (result: TravelExtractResponse) => void;
  context: 'travel-modal' | 'calendar-travel';
  tripId?: string; // Optional trip ID for linking
  className?: string;
}

export function SmartUploadButtonV2({ 
  onAutofill, 
  context, 
  tripId,
  className = '' 
}: SmartUploadButtonV2Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'extracting' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side file validation
    const MAX_SIZE_MB = 10;
    const sizeInMB = file.size / (1024 * 1024);
    
    if (sizeInMB > MAX_SIZE_MB) {
      toast({
        title: 'File too large',
        description: `Please select a file smaller than ${MAX_SIZE_MB}MB`,
        variant: 'destructive'
      });
      return;
    }

    // Validate file type
    const supportedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'text/html',
      'text/plain',
      'message/rfc822' // .eml files
    ];
    
    if (!supportedTypes.includes(file.type) && 
        !file.name.endsWith('.eml') && 
        !file.name.endsWith('.msg')) {
      toast({
        title: 'Unsupported file type',
        description: 'Please upload a PDF, image (PNG/JPG), or email file',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    setStatus('uploading');
    
    try {
      // Direct extraction with file upload (new hybrid approach)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('storeDocument', 'true'); // Store after extraction
      if (tripId) {
        formData.append('trip_id', tripId);
      }
      
      setStatus('extracting');
      
      // Use the v2 endpoint that handles AI extraction
      const { getCSRFHeaders } = await import('@/lib/security/csrf-client');
      const response = await fetch('/api/ai/travel-extract-v2', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: getCSRFHeaders()
      });

      // Check for authentication issues
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Session expired. Please refresh the page and log in again.');
      }

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 429) {
          throw new Error('Too many requests. Please try again in a few minutes.');
        }
        
        let errorMessage = 'Failed to extract travel details';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = response.statusText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const result: TravelExtractResponse = await response.json();
      
      // Handle extraction results
      if (result.success) {
        setStatus('success');
        
        // Call the autofill callback with the extracted data
        onAutofill(result);
        
        // Show appropriate success message
        if (result.cached) {
          toast({
            title: 'Document processed',
            description: 'Using previously extracted information'
          });
        } else if (result.partial) {
          toast({
            title: 'Partial extraction',
            description: 'We filled what we could. Please review and complete the missing fields.'
          });
        } else {
          toast({
            title: 'Extraction complete',
            description: 'Travel details have been filled. Please review before saving.'
          });
        }
        
        // Reset after short delay
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        // Even if extraction failed, we might have partial data
        if (result.data) {
          onAutofill(result);
          toast({
            title: 'Partial extraction',
            description: result.error || 'Some fields could not be extracted. Please fill them manually.'
          });
        } else {
          throw new Error(result.error || 'Could not extract travel details');
        }
      }
      
    } catch (error: any) {
      console.error('Smart upload error:', error);
      setStatus('error');
      
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to process document. Please try again or fill manually.',
        variant: 'destructive'
      });
      
      // Reset after short delay
      setTimeout(() => setStatus('idle'), 3000);
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getButtonText = () => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'extracting':
        return 'Analyzing with AI...';
      case 'success':
        return 'Success!';
      case 'error':
        return 'Try Again';
      default:
        return 'Smart Upload';
    }
  };

  const getButtonIcon = () => {
    switch (status) {
      case 'uploading':
      case 'extracting':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />;
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getButtonClassName = () => {
    let baseClass = `flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-all duration-200 ${className}`;
    
    switch (status) {
      case 'success':
        return `${baseClass} bg-green-600 hover:bg-green-700`;
      case 'error':
        return `${baseClass} bg-red-600 hover:bg-red-700`;
      default:
        return `${baseClass} bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700`;
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg,text/html,text/plain,.eml,.msg"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isProcessing}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isProcessing}
        className={getButtonClassName()}
      >
        {getButtonIcon()}
        {getButtonText()}
      </button>
      {/* Helper text removed per design */}
    </>
  );
}
