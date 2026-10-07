import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { useToastMessage } from '../toastProvider';
import { processImageWithAutoScale } from './imageProcessing';
import { ImageUploadProps } from './index.image-upload-props';
import { ALLOWED_MIME_TYPES } from './index.state';
import { MAX_FILE_SIZE } from './index.state';
export function useImageUploadState({
  id,
  label,
  onChange,
  disabled = false,
  className = '',
  currentImageUrl,
  autoScale,
  ...rest
}: Readonly<ImageUploadProps>) {
  const { t } = useTranslations({
    en,
    de,
  });
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { error } = useToastMessage();
  const [imageWasChanged, setImageWasChanged] = useState(false);

  const imageUrlToDisplay = useMemo(() => {
    if (imageWasChanged) {
      return previewUrl;
    }

    return previewUrl || currentImageUrl;
  }, [previewUrl, currentImageUrl, imageWasChanged]);

  useEffect(() => {
    // Clean up the object URL when component unmounts or when a new file is selected
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const validateFile = useCallback(
    (file: File): boolean => {
      // Check file type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
        error({
          title: t('invalidFileType'),
          description: t('invalidFileTypeDescription', {
            allowedTypes: ALLOWED_MIME_TYPES.join(', '),
          }),
        });
        return false;
      }

      // Check file size
      const effectiveMax = autoScale?.maxBytes ?? MAX_FILE_SIZE;
      if (file.size > effectiveMax) {
        error({
          title: t('fileTooLarge'),
          description: t('fileTooLargeDescription', {
            maxSize: Math.round((effectiveMax / 1024 / 1024) * 10) / 10,
          }),
        });
        return false;
      }

      return true;
    },
    [error, t, autoScale?.maxBytes],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const originalFile = e.target.files?.[0] || null;
      if (!originalFile) {
        setSelectedFile(null);
        setPreviewUrl(null);
        onChange(null);
        return;
      }

      try {
        const processed = autoScale ? await processImageWithAutoScale(originalFile, autoScale) : originalFile;
        if (!validateFile(processed)) {
          e.target.value = '';
          setSelectedFile(null);
          setPreviewUrl(null);
          onChange(null);
          return;
        }

        setSelectedFile(processed);
        const url = URL.createObjectURL(processed);
        setPreviewUrl(url);
        onChange(processed);
      } catch (err) {
        console.error('Image processing failed', err);
        setSelectedFile(null);
        setPreviewUrl(null);
        onChange(null);
      }
    },
    [onChange, autoScale, validateFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);

      const originalFile = e.dataTransfer.files[0];
      if (!originalFile) return;

      try {
        const processed = autoScale ? await processImageWithAutoScale(originalFile, autoScale) : originalFile;
        if (!validateFile(processed)) {
          setSelectedFile(null);
          setPreviewUrl(null);
          onChange(null);
          return;
        }

        setSelectedFile(processed);
        const url = URL.createObjectURL(processed);
        setPreviewUrl(url);
        onChange(processed);
      } catch (err) {
        console.error('Image processing failed', err);
        setSelectedFile(null);
        setPreviewUrl(null);
        onChange(null);
      }
    },
    [onChange, autoScale, validateFile],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    onChange(null);
    setImageWasChanged(true);
  }, [onChange]);
  return {
    t,
    isDragActive,
    selectedFile,
    imageUrlToDisplay,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRemoveFile,
    id,
    label,
    onChange,
    disabled,
    className,
    autoScale,
    rest,
  } as const;
}
