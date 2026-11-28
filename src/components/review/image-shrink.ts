"use client";

export const MAX_SIDE = { photo: 1920, strip: 1100, logo: 1200, icon: 256 } as const;
const MAX_UPLOAD = 3.8 * 1024 * 1024;

/** Afbeelding verkleinen in de browser (foto's naar JPEG, logo en iconen blijven PNG). */
export async function shrink(blob: Blob, role: keyof typeof MAX_SIDE, name: string): Promise<{ file: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return { file: blob, width: 0, height: 0 };
  const max = MAX_SIDE[role];
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const keepPng = role === "logo" || role === "icon" || name.toLowerCase().endsWith(".png");
  if (scale === 1 && blob.size <= MAX_UPLOAD && (keepPng || blob.size < 900_000)) return { file: blob, width: bitmap.width, height: bitmap.height };
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const type = keepPng ? "image/png" : "image/jpeg";
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  return { file: out ?? blob, width: w, height: h };
}
