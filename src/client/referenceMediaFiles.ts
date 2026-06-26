interface MediaFetchResponse {
  ok: boolean;
  status: number;
  blob(): Promise<Blob>;
}

export interface MediaReferenceToFileOptions {
  currentHref?: string;
  fetchMedia?: (input: string) => Promise<MediaFetchResponse>;
  FileCtor?: typeof File;
}

export function isReferenceImageFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    return true;
  }
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function isSameOriginMediaReference(reference: string, currentHref = window.location.href): boolean {
  try {
    const url = new URL(reference, currentHref);
    const currentUrl = new URL(currentHref);
    const mediaPath = url.searchParams.get("path") ?? "";
    return url.origin === currentUrl.origin &&
      url.pathname === "/media" &&
      /\.(jpe?g|png|webp)$/i.test(mediaPath);
  } catch {
    return false;
  }
}

export async function mediaReferenceToFile(reference: string, options: MediaReferenceToFileOptions = {}): Promise<File> {
  const currentHref = options.currentHref ?? window.location.href;
  const url = new URL(reference, currentHref);
  const fetchMedia = options.fetchMedia ?? fetch;
  const FileCtor = options.FileCtor ?? File;
  const response = await fetchMedia(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(`参考图读取失败: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const fileName = mediaReferenceFileName(url, blob.type);
  return new FileCtor([blob], fileName, {
    type: blob.type || mediaReferenceMimeType(fileName)
  });
}

export function mediaReferenceFileName(url: URL, mimeType: string): string {
  const mediaPath = url.searchParams.get("path") ?? "";
  const decodedName = mediaPath.split(/[\\/]/).pop() ?? "";
  if (/\.(?:jpe?g|png|webp)$/i.test(decodedName)) {
    return decodedName;
  }
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  return `copied-reference${extension}`;
}

export function mediaReferenceMimeType(fileName: string): string {
  if (/\.png$/i.test(fileName)) return "image/png";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/jpeg";
}
