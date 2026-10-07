import { ImageIcon, X } from 'lucide-react';
import { ImageUploadProps } from './index.image-upload-props';
import { ALLOWED_MIME_TYPES } from './index.state';
import { MAX_FILE_SIZE } from './index.state';
import { useImageUploadState } from './useImageUploadState';

export function ImageUpload({
  id,
  label,
  onChange,
  disabled = false,
  className = '',
  currentImageUrl,
  autoScale,
  ...rest
}: Readonly<ImageUploadProps>) {
  const {
    t,
    isDragActive,
    selectedFile,
    imageUrlToDisplay,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRemoveFile,
  } = useImageUploadState({ id, label, onChange, disabled, className, currentImageUrl, autoScale, ...rest });

  return (
    <div {...rest}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div
        className={`relative ${
          isDragActive ? 'border-accent' : 'border-gray-300 dark:border-gray-700'
        } border-2 border-dashed rounded-lg p-4 transition-colors`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          data-cy="image-upload-file-input"
          type="file"
          id={id}
          accept={ALLOWED_MIME_TYPES.join(',')}
          onChange={handleFileChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        {!imageUrlToDisplay && (
          <div className="text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('dragAndDrop')}</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {t('acceptedFormats', { maxSize: (autoScale?.maxBytes ?? MAX_FILE_SIZE) / 1024 / 1024 })}
            </p>
          </div>
        )}

        {imageUrlToDisplay && (
          <div className="relative">
            <button
              onClick={handleRemoveFile}
              className="absolute z-10 -top-2 -right-2 p-1 bg-red-100 dark:bg-red-900 rounded-full text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"

              data-cy="image-upload-remove-button"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative w-full aspect-video">
              <img src={imageUrlToDisplay} alt="Preview" className="w-full h-full object-contain rounded-lg" />
            </div>
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                {t('preview', {
                  fileName: selectedFile.name,
                  fileSize: (selectedFile.size / 1024 / 1024).toFixed(2),
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
