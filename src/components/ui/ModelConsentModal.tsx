import { useState, useEffect } from 'react';
import { AlertTriangle, Download } from 'lucide-react';

interface ConsentDetail {
  targetModelId: string;
  targetModelUrl: string;
  modelSize: string;
}

export default function ModelConsentModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [consentDetail, setConsentDetail] = useState<ConsentDetail>({ targetModelId: '', targetModelUrl: '', modelSize: '' });
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    const handleConsentEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      setConsentDetail({
        targetModelId: customEvent.detail.targetModelId || '',
        targetModelUrl: customEvent.detail.targetModelUrl || '',
        modelSize: customEvent.detail.modelSize || 'Size: Varies',
      });
      setConsentChecked(false);
      setIsOpen(true);
    };

    window.addEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
    return () => window.removeEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
  }, []);

  const handleConsentAndDownload = () => {
    if (!consentChecked) return;
    // Close modal immediately — progress shown in Header + GlobalProgressWidget
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('EA_MODEL_DOWNLOAD_START', {
      detail: {
        modelId: consentDetail.targetModelId,
        modelUrl: consentDetail.targetModelUrl,
        onProgress: (_bytesDownloaded: number, _totalBytes: number) => {},
        onComplete: () => {},
        onError: (_error: string) => {},
      },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-amber-500" size={24} />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">AI Model Download Required</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          This action will download the <strong>{consentDetail.targetModelId}</strong> model weights (~{consentDetail.modelSize}) to your device.
          The model will be stored locally in OPFS for offline Sovereign Engine inference.
        </p>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
            Source: {consentDetail.targetModelUrl}
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Network Required:</strong> This download requires an active internet connection. Once cached, the model works fully offline.
            Zero local architecture data will leave this device — only the model weights are fetched.
          </p>
        </div>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            I consent to downloading model weights from an external source. I understand that the model will be stored locally on my device.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => setIsOpen(false)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConsentAndDownload}
            disabled={!consentChecked}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            Consent & Download
          </button>
        </div>
      </div>
    </div>
  );
}
