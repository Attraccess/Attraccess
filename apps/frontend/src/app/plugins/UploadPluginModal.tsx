import { usePluginsServiceUploadPlugin } from '@attraccess/react-query-client';
import { useState, useRef } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input } from '@heroui/react';
import { Upload } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './UploadPluginModal.en.json';
import de from './UploadPluginModal.de.json';
import { useToastMessage } from '../../components/toastProvider';

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
      // Validate file is a zip
      setIsFileInvalid(!file.name.endsWith('.zip'));
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

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} data-cy="upload-plugin-modal">
      <ModalContent>
        <ModalHeader>{t('title')}</ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <p>{t('description')}</p>

            <Input
              type="file"
              ref={fileInputRef}
              accept=".zip"
              onChange={handleFileChange}
              isInvalid={isFileInvalid}
              errorMessage={isFileInvalid ? t('errors.invalidFile') : ''}
              description={t('fileInputDescription')}
              data-cy="upload-plugin-modal-file-input"
            />

            {selectedFile && (
              <div className="py-2 px-4 bg-gray-100 dark:bg-gray-800 rounded-md">
                <p className="text-sm">
                  <span className="font-semibold">{t('selectedFile')}:</span> {selectedFile.name}
                </p>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="flat"
            onPress={handleCancel}
            isDisabled={isPending}
            data-cy="upload-plugin-modal-cancel-button"
          >
            {t('cancel')}
          </Button>
          <Button
            color="primary"
            onPress={handleUpload}
            isLoading={isPending}
            isDisabled={!selectedFile || isFileInvalid}
            startContent={<Upload size={18} />}
            data-cy="upload-plugin-modal-upload-button"
          >
            {t('upload')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
