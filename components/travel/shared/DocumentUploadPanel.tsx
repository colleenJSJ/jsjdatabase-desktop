'use client';

import { Upload } from 'lucide-react';

export type PendingDoc = { file: File; title: string; category: string };

export function DocumentUploadPanel({
  pendingFiles,
  setPendingFiles,
  categories,
  onSmartUploadClick,
  smartUploading = false,
  smartUploadButton,
  chooseFileLabel,
  uploadHint,
}: {
  pendingFiles: PendingDoc[];
  setPendingFiles: (files: PendingDoc[]) => void;
  categories: Array<{ id: string; name: string }>;
  onSmartUploadClick?: () => void;
  smartUploading?: boolean;
  smartUploadButton?: React.ReactNode;
  chooseFileLabel?: string;
  uploadHint?: string;
}) {
  const manualRef = (node: HTMLInputElement | null) => {
    if (!node) return;
    (DocumentUploadPanel as any)._fileInput = node;
  };
  const triggerManual = () => (DocumentUploadPanel as any)._fileInput?.click();
  const buttonLabel = chooseFileLabel ?? 'Choose File';
  const hintText = uploadHint ?? 'Documents upload after you save the event.';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={triggerManual}
          className="flex-1 w-full justify-center px-4 py-2 bg-background-primary border border-gray-600/40 rounded-xl text-text-primary hover:bg-gray-700/30"
        >
          {buttonLabel}
        </button>
        <input
          ref={manualRef as any}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/jpg,.eml,.msg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const defaultTitle = file.name.replace(/\.[^/.]+$/, '');
            setPendingFiles([...(pendingFiles||[]), { file, title: defaultTitle, category: '' }]);
            (DocumentUploadPanel as any)._fileInput.value = '';
          }}
        />
        {smartUploadButton ? (
          <div className="flex-1 w-full">{smartUploadButton}</div>
        ) : onSmartUploadClick ? (
          <button
            type="button"
            onClick={onSmartUploadClick}
            className={`flex-1 w-full justify-center px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              smartUploading ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {smartUploading ? 'Processing…' : (
              <span className="inline-flex items-center gap-2 justify-center w-full"><Upload className="w-4 h-4"/> Smart Travel Upload</span>
            )}
          </button>
        ) : null}
      </div>

      {pendingFiles && pendingFiles.length > 0 && (
        <div className="space-y-2">
          {pendingFiles.map((item, idx) => (
            <div key={idx} className="p-3 bg-background-primary/40 rounded-md border border-gray-600/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-text-muted">Document Title
                  <input value={item.title} onChange={e=>{
                    const v=e.target.value; const copy=[...pendingFiles]; copy[idx]={...copy[idx], title:v}; setPendingFiles(copy);
                  }} className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary" />
                </label>
                <label className="text-xs text-text-muted">Document Category
                  <select value={item.category} onChange={e=>{
                    const v=e.target.value; const copy=[...pendingFiles]; copy[idx]={...copy[idx], category:v}; setPendingFiles(copy);
                  }} className="mt-1 w-full px-2 py-1.5 bg-background-primary border border-gray-600/30 rounded-md text-text-primary">
                    <option value="">Select a category...</option>
                    {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </label>
              </div>
              <div className="mt-2 text-right">
                <button type="button" onClick={()=>{ const copy=[...pendingFiles]; copy.splice(idx,1); setPendingFiles(copy); }} className="text-sm text-text-muted hover:text-text-primary">Remove</button>
              </div>
            </div>
          ))}
          <div className="text-xs text-text-muted">{hintText}</div>
        </div>
      )}
    </div>
  );
}
