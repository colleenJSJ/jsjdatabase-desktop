'use client';

import { useState, useRef } from 'react';
import { Bot, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { TravelExtractResponse } from '@/lib/ai/schemas';
import { useToast } from '@/hooks/use-toast';

interface SmartUploadButtonProps {
  onAutofill: (result: TravelExtractResponse) => void;
  context: 'travel-modal' | 'calendar-travel';
  className?: string;
}

export function SmartUploadButton({ 
  onAutofill, 
  context, 
  className = '' 
}: SmartUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
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

    setIsUploading(true);
    
    try {
      // Step 1: Upload document to get document_id
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'travel'); // Travel category for documents
      
      const uploadResponse = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        // Check if response is JSON or HTML (redirect)
        const contentType = uploadResponse.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          // Likely a redirect to login
          throw new Error('Session expired. Please refresh the page and log in again.');
        }
        
        let errorMessage = 'Failed to upload document';
        try {
          const error = await uploadResponse.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch (e) {
          // If JSON parsing fails, use the status text
          errorMessage = uploadResponse.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const uploadResult = await uploadResponse.json();
      const uploadedDocument = uploadResult?.data?.document ?? uploadResult?.document;
      const documentId = uploadedDocument?.id;
      
      if (!documentId) {
        throw new Error('Failed to get document ID after upload');
      }

      // Step 2: Extract travel details using Claude
      setIsUploading(false);
      setIsExtracting(true);
      
      const extractResponse = await fetch('/api/ai/travel-extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ document_id: documentId })
      });

      if (!extractResponse.ok) {
        // Check if response is JSON or HTML (redirect)
        const contentType = extractResponse.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          throw new Error('Session expired. Please refresh the page and log in again.');
        }
        
        // Handle rate limiting
        if (extractResponse.status === 429) {
          throw new Error('Too many requests. Please try again in a few minutes.');
        }
        
        let errorMessage = 'Failed to extract travel details';
        try {
          const error = await extractResponse.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (e) {
          errorMessage = extractResponse.statusText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const extractResult: TravelExtractResponse = await extractResponse.json();
      
      // Step 3: Handle extraction results
      if (extractResult.success) {
        // Call the autofill callback with the extracted data
        onAutofill(extractResult);
        
        // Show appropriate success message
        if (extractResult.cached) {
          toast({
            title: 'Document processed',
            description: 'Using previously extracted information'
          });
        } else if (extractResult.partial) {
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
      } else {
        // Even if extraction failed, we might have partial data
        if (extractResult.data) {
          onAutofill(extractResult);
          toast({
            title: 'Partial extraction',
            description: extractResult.error || 'Some fields could not be extracted. Please fill them manually.'
          });
        } else {
          throw new Error(extractResult.error || 'Could not extract travel details');
        }
      }
      
    } catch (error: any) {
      console.error('Smart upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to process document. Please try again or fill manually.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const buttonText = () => {
    if (isUploading) return 'Uploading...';
    if (isExtracting) return 'Analyzing with AI...';
    return 'Smart Upload';
  };

  const buttonIcon = () => {
    if (isUploading || isExtracting) {
      return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />;
    }
    return <Bot className="w-4 h-4" />;
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg,text/html,text/plain,.eml,.msg"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading || isExtracting}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || isExtracting}
        className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg transition-all duration-200 ${className}`}
      >
        {buttonIcon()}
        {buttonText()}
      </button>
      {context === 'travel-modal' && (
        <div className="text-xs text-text-muted mt-1">
          AI-powered extraction from PDFs, images, and emails
        </div>
      )}
    </>
  );
}
