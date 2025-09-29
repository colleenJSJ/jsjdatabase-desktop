'use client';

import { useEffect, useMemo, useState } from 'react';
import { isElectronEnvironment } from '@/lib/is-electron';
import { Download, Loader2, RefreshCw, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';

interface UpdateInfoPayload {
  version?: string;
  releaseName?: string;
  releaseNotes?: string | Array<{ version: string; note: string }>;
}

interface ProgressPayload {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

const bannerBaseClasses = 'rounded-lg border border-[#3a3a38] bg-[#1f1f1e] text-[#E4E3DC] shadow-[0_12px_24px_rgba(0,0,0,0.35)]';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetVersion, setTargetVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!isElectronEnvironment() || !window.electron?.updates) {
      return;
    }

    const { updates } = window.electron;
    const unsubscribers: Array<() => void> = [];

    updates.getCurrentVersion?.()
      .then((version) => {
        if (version) setCurrentVersion(version);
      })
      .catch(() => {})

    unsubscribers.push(
      updates.onCurrentVersion?.((payload) => {
        if (payload?.version) {
          setCurrentVersion(payload.version);
        }
      }) ?? (() => {})
    );

    unsubscribers.push(
      updates.onUpdateAvailable?.((payload: UpdateInfoPayload) => {
        setStatus('available');
        setTargetVersion(payload?.version || payload?.releaseName || null);
        setVisible(true);
        setDismissed(false);
        setCollapsed(false);
        setErrorMessage(null);
        setProgress(0);
      }) ?? (() => {})
    );

    unsubscribers.push(
      updates.onDownloadProgress?.((payload: ProgressPayload) => {
        setStatus('downloading');
        setProgress(Math.round(Math.max(0, Math.min(100, payload?.percent ?? 0))));
      }) ?? (() => {})
    );

    unsubscribers.push(
      updates.onUpdateDownloaded?.((payload: UpdateInfoPayload) => {
        setStatus('downloaded');
        setTargetVersion(payload?.version || payload?.releaseName || targetVersion);
        setProgress(100);
        setActionPending(false);
        setCollapsed(false);
      }) ?? (() => {})
    );

    unsubscribers.push(
      updates.onError?.((payload: { message?: string }) => {
        setStatus('error');
        setErrorMessage(payload?.message || 'There was a problem while checking for updates.');
        setActionPending(false);
        setVisible(true);
        setCollapsed(false);
      }) ?? (() => {})
    );

    // Kick off an initial check
    updates.checkForUpdates?.().catch(() => {});

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe && unsubscribe());
    };
  }, []);

  const shouldRender = isElectronEnvironment() && !dismissed && visible && status !== 'idle';

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'available':
        return 'Update available';
      case 'downloading':
        return 'Downloading update';
      case 'downloaded':
        return 'Update ready to install';
      case 'error':
        return 'Update issue';
      default:
        return '';
    }
  }, [status]);

  const primaryActionLabel = (() => {
    switch (status) {
      case 'available':
      case 'error':
        return 'Download';
      case 'downloading':
        return 'Downloading';
      case 'downloaded':
        return 'Restart & Install';
      default:
        return 'Download';
    }
  })();

  const handleDownload = async () => {
    if (!window.electron?.updates?.downloadUpdate) return;
    setActionPending(true);
    setErrorMessage(null);
    try {
      const result = await window.electron.updates.downloadUpdate();
      if (result && 'ok' in result && !result.ok) {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      setStatus('error');
      setActionPending(false);
      setErrorMessage(message);
    }
  };

  const handleInstall = async () => {
    if (!window.electron?.updates?.installUpdate) return;
    setActionPending(true);
    try {
      const result = await window.electron.updates.installUpdate();
      if (result && 'ok' in result && !result.ok) {
        throw new Error(result.error || 'Install failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Install failed';
      setStatus('error');
      setActionPending(false);
      setErrorMessage(message);
    }
  };

  const handleRetry = async () => {
    if (!window.electron?.updates?.checkForUpdates) return;
    setActionPending(true);
    setErrorMessage(null);
    try {
      await window.electron.updates.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check for updates';
      setErrorMessage(message);
      setStatus('error');
      setActionPending(false);
    }
  };

  const onPrimaryAction = async () => {
    if (status === 'downloaded') {
      await handleInstall();
      return;
    }

    if (status === 'error') {
      await handleRetry();
      return;
    }

    await handleDownload();
  };

  if (!shouldRender) {
    return null;
  }

  const versionLabel = targetVersion || 'new version';

  if (collapsed) {
    return (
      <div className="mb-4">
        <div className={`${bannerBaseClasses} flex items-center justify-between px-4 py-2 text-sm`}>
          <div className="flex items-center gap-2 text-[#C2C0B6]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{statusLabel}</span>
            {targetVersion && <span className="text-xs text-[#8C8B83]">({versionLabel})</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="inline-flex items-center rounded-md border border-[#3a3a38] px-2 py-1 text-xs text-[#C2C0B6] transition-colors hover:bg-white/5"
            >
              <ChevronUp className="mr-1 h-3 w-3" />
              Expand
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[#7A7A78] transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className={`${bannerBaseClasses} p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-[#7A7A78]">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Desktop Update</span>
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">{statusLabel}</p>
              <p className="text-sm text-[#C2C0B6]">
                {status === 'available' && (
                  <>Version {versionLabel} is ready to download.</>
                )}
                {status === 'downloading' && (
                  <>Downloading version {versionLabel}. Keep the app open while we prepare the update.</>
                )}
                {status === 'downloaded' && (
                  <>Version {versionLabel} has been downloaded. Restart to finish installing.</>
                )}
                {status === 'error' && (
                  <>
                    {errorMessage || 'We hit a snag while checking for updates. Try again in a moment.'}
                  </>
                )}
              </p>
              {currentVersion && (
                <p className="text-xs text-[#8C8B83]">
                  Current version: <span className="font-mono text-[#C2C0B6]">{currentVersion}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="inline-flex items-center rounded-md border border-[#3a3a38] px-2 py-1 text-xs text-[#C2C0B6] transition-colors hover:bg-white/5"
            >
              <ChevronDown className="mr-1 h-3 w-3" />
              Minimize
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[#7A7A78] transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {status === 'downloaded' ? (
              <CheckCircle2 className="h-5 w-5 text-[#83C28B]" />
            ) : status === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-[#F3C969]" />
            ) : (
              <RefreshCw className="h-5 w-5 text-[#7B9CC3] animate-spin" />
            )}
            <span className="text-sm text-[#C2C0B6]">
              {status === 'available' && 'Click download to fetch the latest release.'}
              {status === 'downloading' && `Downloading… ${progress}% complete`}
              {status === 'downloaded' && 'Ready when you are. We will restart the app to finish up.'}
              {status === 'error' && (errorMessage || 'Something went wrong. Try again.')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={status === 'downloading' || actionPending}
              className="inline-flex items-center gap-2 rounded-lg bg-button-create px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-button-create/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {status === 'downloaded' ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {primaryActionLabel}
            </button>
            {status === 'error' && (
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-lg border border-[#3a3a38] px-4 py-2 text-sm font-medium text-[#C2C0B6] transition-colors hover:bg-white/5"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>

        {status === 'downloading' && (
          <div className="mt-4">
            <div className="h-2 w-full rounded-full bg-[#3a3a38]">
              <div
                className="h-full rounded-full bg-[#7B9CC3] transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#8C8B83]">{progress}% downloaded</p>
          </div>
        )}
      </div>
    </div>
  );
}
