import imageCompression from 'browser-image-compression';

/**
 * Compression options for different image types
 */
export interface CompressionOptions {
  /** Maximum width in pixels (default: 1920) */
  maxWidthOrHeight?: number;
  /** Maximum file size in MB (default: 0.5 = 500KB) */
  maxSizeMB?: number;
  /** Use WebP format when supported (default: true) */
  useWebWorker?: boolean;
  /** Initial quality (0-1, default: 0.8) */
  initialQualityPercentage?: number;
}

/**
 * Preset compression options for different use cases
 */
export const COMPRESSION_PRESETS = {
  /** For thumbnails (small cards, 640px max) */
  thumbnail: {
    maxWidthOrHeight: 640,
    maxSizeMB: 0.2, // 200KB
    useWebWorker: true,
    initialQualityPercentage: 0.8,
  },
  /** For banner/background images (full width, 1920px max) */
  banner: {
    maxWidthOrHeight: 1920,
    maxSizeMB: 0.5, // 500KB
    useWebWorker: true,
    initialQualityPercentage: 0.85,
  },
  /** For logos (smaller, high quality) */
  logo: {
    maxWidthOrHeight: 800,
    maxSizeMB: 0.15, // 150KB
    useWebWorker: true,
    initialQualityPercentage: 0.9,
  },
  /** For profile/saint pictures */
  profile: {
    maxWidthOrHeight: 400,
    maxSizeMB: 0.1, // 100KB
    useWebWorker: true,
    initialQualityPercentage: 0.85,
  },
} as const;

/**
 * Compresses an image file before upload
 * 
 * @param file - The original image file
 * @param options - Compression options (or use a preset)
 * @returns Compressed image file
 * 
 * @example
 * // Using a preset
 * const compressed = await compressImage(file, COMPRESSION_PRESETS.thumbnail);
 * 
 * // Using custom options
 * const compressed = await compressImage(file, { maxWidthOrHeight: 1000, maxSizeMB: 0.3 });
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = COMPRESSION_PRESETS.thumbnail
): Promise<File> {
  // Skip compression for non-image files
  if (!file.type.startsWith('image/')) {
    console.warn('[Image Compression] Not an image file, skipping compression');
    return file;
  }

  // Skip compression for SVG files (they're already optimized and shouldn't be compressed)
  if (file.type === 'image/svg+xml') {
    console.log('[Image Compression] SVG file, skipping compression');
    return file;
  }

  // Skip compression for very small files (already optimized)
  const fileSizeMB = file.size / (1024 * 1024);
  const targetSizeMB = options.maxSizeMB || 0.5;
  if (fileSizeMB <= targetSizeMB) {
    console.log(`[Image Compression] File already small (${fileSizeMB.toFixed(2)}MB <= ${targetSizeMB}MB), skipping`);
    return file;
  }

  const originalSize = file.size;
  console.log(`[Image Compression] Compressing ${file.name} (${(originalSize / 1024 / 1024).toFixed(2)}MB)`);

  try {
    const compressedFile = await imageCompression(file, {
      maxWidthOrHeight: options.maxWidthOrHeight || 1920,
      maxSizeMB: options.maxSizeMB || 0.5,
      useWebWorker: options.useWebWorker !== false,
      initialQuality: options.initialQualityPercentage || 0.8,
      // Preserve filename but change extension if format changes
      fileType: file.type === 'image/png' ? 'image/png' : 'image/webp',
    });

    const compressedSize = compressedFile.size;
    const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    
    console.log(
      `[Image Compression] Compressed: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB (${savings}% smaller)`
    );

    // Create a new File with the original name (but possibly different extension)
    const extension = compressedFile.type === 'image/webp' ? '.webp' : 
                      compressedFile.type === 'image/png' ? '.png' : '.jpg';
    const baseName = file.name.replace(/\.[^/.]+$/, ''); // Remove original extension
    const newFileName = `${baseName}${extension}`;

    return new File([compressedFile], newFileName, {
      type: compressedFile.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('[Image Compression] Failed to compress image:', error);
    // Return original file if compression fails
    return file;
  }
}

/**
 * Compresses multiple images in parallel
 * 
 * @param files - Array of image files
 * @param options - Compression options
 * @returns Array of compressed files
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = COMPRESSION_PRESETS.thumbnail
): Promise<File[]> {
  return Promise.all(files.map(file => compressImage(file, options)));
}

/**
 * Gets the appropriate compression preset based on image type
 * 
 * @param type - The type of image ('thumbnail' | 'banner' | 'logo' | 'profile')
 * @returns Compression options
 */
export function getCompressionPreset(type: keyof typeof COMPRESSION_PRESETS): CompressionOptions {
  return COMPRESSION_PRESETS[type];
}
