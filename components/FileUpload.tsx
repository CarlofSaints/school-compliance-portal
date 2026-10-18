"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/I18nProvider";

interface FileUploadProps {
  accept?: string;
  label?: string;
  onChange: (file: File) => void;
  value?: File | null;
}

export default function FileUpload({
  accept = ".pdf,.docx,.doc,.txt",
  label,
  onChange,
  value,
}: FileUploadProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onChange(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-gray-200 hover:border-primary/50"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
        }}
        className="hidden"
      />
      <svg
        className="w-8 h-8 mx-auto text-gray-400 mb-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      {value ? (
        <p className="text-sm text-primary font-medium">{value.name}</p>
      ) : (
        <>
          <p className="text-sm text-gray-600 font-medium">{label ?? t("Upload File")}</p>
          <p className="text-xs text-gray-400 mt-1">
            {t("Drag & drop or click to browse")}
          </p>
        </>
      )}
    </div>
  );
}
