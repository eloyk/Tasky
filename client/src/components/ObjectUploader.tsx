import { useState, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UploadedFile {
  uploadURL: string;
  objectPath: string;
  name: string;
  size: number;
  type: string;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
    objectPath: string;
  }>;
  onComplete?: (result: { successful: UploadedFile[] }) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    const validFiles: File[] = [];
    for (const file of files) {
      if (validFiles.length >= maxNumberOfFiles) {
        break;
      }
      if (file.size > maxFileSize) {
        alert(`El archivo ${file.name} excede el tamaño máximo de ${Math.round(maxFileSize / 1024 / 1024)}MB`);
        continue;
      }
      validFiles.push(file);
    }

    setSelectedFiles(validFiles);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((files) => files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    try {
      const successful: UploadedFile[] = [];

      for (const file of selectedFiles) {
        try {
          const params = await onGetUploadParameters();
          
          const response = await fetch(params.url, {
            method: params.method,
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });

          if (response.ok) {
            successful.push({
              uploadURL: params.url,
              objectPath: params.objectPath,
              name: file.name,
              size: file.size,
              type: file.type || "application/octet-stream",
            });
          } else {
            console.error(`Failed to upload ${file.name}:`, response.status);
            alert(`Error al subir ${file.name}`);
          }
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          alert(`Error al subir ${file.name}`);
        }
      }

      if (successful.length > 0) {
        onComplete?.({ successful });
      }

      setShowModal(false);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error al subir archivos");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setShowModal(false);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div>
      <Button
        onClick={() => setShowModal(true)}
        className={buttonClassName}
        type="button"
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Archivos</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-md p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple={maxNumberOfFiles > 1}
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                accept="*/*"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-12 h-12 text-muted-foreground" />
                <div className="text-sm">
                  <span className="font-medium text-primary">Haz clic para seleccionar</span>
                  <span className="text-muted-foreground"> o arrastra archivos aquí</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Máximo {maxNumberOfFiles} archivo(s), hasta {Math.round(maxFileSize / 1024 / 1024)}MB cada uno
                </p>
              </label>
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Archivos seleccionados:</h4>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-md text-sm">
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(file.size / 1024)} KB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                      disabled={isUploading}
                      className="h-6 w-6 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isUploading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || isUploading}
              >
                {isUploading ? "Subiendo..." : "Subir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
