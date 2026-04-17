import {
  Plus,
  FileText,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

export interface SourceFile {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number;
}

interface DataSourcesTabProps {
  sources: SourceFile[];
  onUploadSource: (file: File) => void;
  onDeleteSource?: (id: string) => void;
}

function StatusIndicator({
  status,
}: {
  status: SourceFile['status'];
}) {
  if (status === 'ready') {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-green-500 flex items-center justify-center">
        <Check className="w-3 h-3 text-green-500" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-red-500 flex items-center justify-center">
        <AlertCircle className="w-3 h-3 text-red-500" />
      </div>
    );
  }

  return (
    <div className="w-6 h-6 flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
    </div>
  );
}

export function DataSourcesTab({
  sources,
  onUploadSource,
  onDeleteSource,
}: DataSourcesTabProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Upload Button */}
      <label className="w-full cursor-pointer">
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadSource(file);
              e.target.value = '';
            }
          }}
        />

        <div className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 dark:border-neutral-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors">
          <Plus className="w-5 h-5" />
          <span className="font-medium text-sm">Upload PDF</span>
        </div>
      </label>

      {/* Sources List */}
      <div className="mt-4 space-y-2">
        {sources.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-neutral-800 rounded-lg">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No sources uploaded yet.</p>
          </div>
        ) : (
          sources.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-800"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                    {file.status}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <StatusIndicator status={file.status} />

                {onDeleteSource && (
                  <button
                    onClick={() => onDeleteSource(file.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete source"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}