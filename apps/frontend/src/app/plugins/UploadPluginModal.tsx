import { usePluginsServiceUploadPlugin } from '@attraccess/react-query-client';
import { useState, useRef } from 'react';
import { DrawerBody, DrawerFooter, DrawerHeader } from '@heroui/react';
import { Button } from '../../components/button';
import { Upload } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './UploadPluginModal.en.json';
import de from './UploadPluginModal.de.json';
import { useToastMessage } from '../../components/toastProvider';
import { StandardDrawer } from '../../components/standardDrawer';

interface UploadPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadPluginModal({ isOpen, onClose }: UploadPluginModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFileInvalid, setIsFileInvalid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToastMessage();
  const { t } = useTranslations({ en, de });

  const { mutate: uploadPlugin, isPending } = usePluginsServiceUploadPlugin({
    onSuccess: () => {
      setTimeout(() => {
        window.location.reload();
      }, 5000);
      onClose();
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to upload plugin:', error);
      toast.error({
        title: t('error.title'),
        description: t('error.description'),
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);

    if (file) {
      const zipMimeTypes = ['application/zip', 'application/x-zip-compressed'];
      const isZip = file.name.toLowerCase().endsWith('.zip') || zipMimeTypes.includes(file.type);
      setIsFileInvalid(!isZip);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || isFileInvalid) return;

    uploadPlugin({
      formData: {
        pluginZip: selectedFile,
      },
    });
  };

  const resetForm = () => {
    setSelectedFile(null);
    setIsFileInvalid(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <StandardDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div data-cy="upload-plugin-modal" className="contents">
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-4">
            <p>{t('description')}</p>

            <div className="space-y-1">
              <input
                type="file"
                ref={fileInputRef}
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={handleFileChange}
                data-cy="upload-plugin-modal-file-input"
                className={`block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 dark:file:bg-gray-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200 dark:hover:file:bg-gray-700 cursor-pointer rounded-md border ${
                  isFileInvalid ? 'border-danger' : 'border-gray-300 dark:border-gray-700'
                } px-3 py-2`}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('fileInputDescription')}</p>
              {isFileInvalid && <p className="text-xs text-danger">{t('errors.invalidFile')}</p>}
            </div>

            {selectedFile && (
              <div className="py-2 px-4 bg-gray-100 dark:bg-gray-800 rounded-md">
                <p className="text-sm">
                  <span className="font-semibold">{t('selectedFile')}:</span> {selectedFile.name}
                </p>
              </div>
            )}
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button
            variant="secondary"
            onPress={onClose}
            isDisabled={isPending}
            data-cy="upload-plugin-modal-cancel-button"
          >
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={handleUpload}
            isPending={isPending}
            isDisabled={!selectedFile || isFileInvalid}
            data-cy="upload-plugin-modal-upload-button"
          >
            <Upload size={18} />
            {t('upload')}
          </Button>
        </DrawerFooter>
      </div>
    </StandardDrawer>
  );
}
