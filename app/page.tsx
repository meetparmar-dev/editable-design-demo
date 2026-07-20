"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    // Read as a base64 data-URL rather than URL.createObjectURL(): a blob URL
    // dies on reload/new-document, taking the image with it. A data-URL is
    // self-contained, survives a hard refresh of /editor, and is exactly the
    // form we'll hand to the Vision API in Phase 4 — one durable source.
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      sessionStorage.setItem("uploaded-image", reader.result);
      router.push("/editor");
    };
    reader.onerror = () => console.error("Failed to read image file");
    reader.readAsDataURL(file);
  };

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold">
          Editable Design Demo
        </h1>

        <button
          onClick={() => inputRef.current?.click()}
          className="rounded bg-black px-6 py-3 text-white"
        >
          Upload Image
        </button>

        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              handleFile(e.target.files[0]);
            }
          }}
        />
      </div>
    </main>
  );
}