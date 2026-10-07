"use client";

/** Shrink a picked image to a JPEG (max 1600px) in the browser, so uploads stay small and uniform. */
export async function toJpeg(file: File, maxDim = 1600, quality = 0.85): Promise<{ name: string; data: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image.");
  ctx.fillStyle = "#fff"; // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL("image/jpeg", quality);
  return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", data: url.split(",")[1], preview: url };
}
