/**
 * Wrapper for pdf-parse to avoid import-time errors
 * The pdf-parse module has debug code that runs at import time
 * which can cause ENOENT errors in certain environments.
 */

let pdfParse: any = null;

export async function parsePDF(buffer: Buffer): Promise<any> {
  if (!pdfParse) {
    // Suppress the module.parent check that causes debug mode
    const originalModule = global.module;
    try {
      // Temporarily set module.parent to avoid debug mode
      if (global.module) {
        (global.module as any).parent = true;
      }
      
      // Import pdf-parse
      const pdfParseModule = await import('pdf-parse');
      pdfParse = pdfParseModule.default || pdfParseModule;
    } finally {
      // Restore original module state
      if (originalModule) {
        global.module = originalModule;
      }
    }
  }
  
  return pdfParse(buffer);
}