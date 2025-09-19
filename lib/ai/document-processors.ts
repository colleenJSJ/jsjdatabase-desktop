import sharp from 'sharp';
import { ClaudeInput, ClaudeImageInput } from './schemas';
import { parsePDF } from './pdf-parse-wrapper';

// Maximum file sizes
const MAX_PDF_SIZE_MB = 10;
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MIN_TEXT_LENGTH_FOR_EXTRACTION = 100;

/**
 * Process a PDF document - extract text or convert to images if text is insufficient
 */
export async function processPDF(buffer: Buffer): Promise<ClaudeInput> {
  // Check file size
  const sizeInMB = buffer.length / (1024 * 1024);
  if (sizeInMB > MAX_PDF_SIZE_MB) {
    throw new Error(`PDF file too large: ${sizeInMB.toFixed(2)}MB (max ${MAX_PDF_SIZE_MB}MB)`);
  }

  try {
    // Step 1: Try text extraction using our wrapper
    const pdfData = await parsePDF(buffer);
    const text = pdfData.text?.trim() || '';
    
    if (text.length > MIN_TEXT_LENGTH_FOR_EXTRACTION) {
      // Sufficient text content
      return { 
        type: 'text', 
        content: text 
      };
    }
    
    // Step 2: If text is insufficient (likely scanned PDF), convert to images
    // For now, we'll return a text message indicating we need image processing
    // In production, you'd use a PDF-to-image library like pdf2pic or pdf-poppler
    console.warn('PDF has insufficient text, may be scanned. Falling back to text extraction.');
    
    // Return whatever text we could extract
    return { 
      type: 'text', 
      content: text || 'Unable to extract text from PDF. Please try uploading an image or text file.' 
    };
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('Failed to process PDF document');
  }
}

/**
 * Process an image file - resize if needed and convert to base64 for Claude
 */
export async function processImage(buffer: Buffer, mimeType: string): Promise<ClaudeInput> {
  try {
    let processedBuffer = buffer;
    
    // Check if resize is needed
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      console.log(`Image size ${(buffer.length / 1024 / 1024).toFixed(2)}MB exceeds limit, resizing...`);
      
      // Resize image to fit within size limit while maintaining aspect ratio
      const image = sharp(buffer);
      const metadata = await image.metadata();
      
      // Calculate new dimensions to reduce file size
      const scaleFactor = Math.sqrt(MAX_IMAGE_SIZE_BYTES / buffer.length) * 0.9; // 0.9 for safety margin
      const newWidth = Math.floor((metadata.width || 1000) * scaleFactor);
      
      processedBuffer = await image
        .resize(newWidth, undefined, { 
          withoutEnlargement: true,
          fit: 'inside' 
        })
        .jpeg({ quality: 85 }) // Convert to JPEG with reasonable quality
        .toBuffer();
      
      console.log(`Image resized from ${(buffer.length / 1024 / 1024).toFixed(2)}MB to ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    }
    
    // Convert to base64 for Claude
    const base64Data = processedBuffer.toString('base64');
    
    // Determine media type
    const mediaType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    
    return {
      type: 'image',
      content: {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/png' | 'image/jpeg',
          data: base64Data
        }
      }
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error('Failed to process image document');
  }
}

/**
 * Process a text document (HTML, email, plain text)
 */
export function processTextDocument(content: string, mimeType: string): string {
  let processedContent = content;
  
  // Remove HTML tags if HTML content
  if (mimeType === 'text/html' || content.includes('<html') || content.includes('<!DOCTYPE')) {
    // Basic HTML stripping (in production, use a proper HTML parser like cheerio)
    processedContent = processedContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  // Limit text length to prevent token overflow
  const MAX_TEXT_LENGTH = 50000;
  if (processedContent.length > MAX_TEXT_LENGTH) {
    processedContent = processedContent.substring(0, MAX_TEXT_LENGTH) + '...';
  }
  
  return processedContent;
}

/**
 * Process any document based on its MIME type
 */
export async function processDocument(
  buffer: Buffer | string, 
  mimeType: string
): Promise<ClaudeInput> {
  // Handle text content (already extracted)
  if (typeof buffer === 'string') {
    return { 
      type: 'text', 
      content: processTextDocument(buffer, mimeType) 
    };
  }
  
  // Handle binary content based on MIME type
  switch (mimeType) {
    case 'application/pdf':
      return processPDF(buffer);
      
    case 'image/png':
    case 'image/jpeg':
    case 'image/jpg':
      return processImage(buffer, mimeType);
      
    case 'text/html':
    case 'text/plain':
    case 'message/rfc822': // Email
      const textContent = buffer.toString('utf-8');
      return { 
        type: 'text', 
        content: processTextDocument(textContent, mimeType) 
      };
      
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Validate file type and size before processing
 */
export function validateFile(mimeType: string, sizeInBytes: number): { valid: boolean; error?: string } {
  // Supported MIME types
  const SUPPORTED_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'text/html',
    'text/plain',
    'message/rfc822' // Email files
  ];
  
  if (!SUPPORTED_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: `Unsupported file type: ${mimeType}. Supported types: PDF, PNG, JPG, HTML, TXT, EML` 
    };
  }
  
  // Check file size based on type
  const sizeInMB = sizeInBytes / (1024 * 1024);
  const maxSize = mimeType === 'application/pdf' ? MAX_PDF_SIZE_MB : MAX_IMAGE_SIZE_MB;
  
  if (sizeInMB > maxSize) {
    return { 
      valid: false, 
      error: `File too large: ${sizeInMB.toFixed(2)}MB (max ${maxSize}MB)` 
    };
  }
  
  return { valid: true };
}