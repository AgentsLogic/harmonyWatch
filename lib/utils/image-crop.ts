/**
 * Crops an image file to the specified aspect ratio
 * @param file - The image file to crop
 * @param aspectRatio - The target aspect ratio (width/height), e.g., 16/9 for video, 1/1 for square
 * @param clipPosition - 'center' for middle clip, 'top' for top clip
 * @returns A Promise that resolves to a cropped File
 */
export async function cropImageToAspectRatio(
  file: File,
  aspectRatio: number,
  clipPosition: 'center' | 'top' = 'center'
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const imgWidth = img.width;
      const imgHeight = img.height;
      const imgAspectRatio = imgWidth / imgHeight;
      
      let cropWidth: number;
      let cropHeight: number;
      let cropX: number;
      let cropY: number;
      
      // Calculate crop dimensions
      if (imgAspectRatio > aspectRatio) {
        // Image is wider than target - crop width (keep full height)
        cropHeight = imgHeight;
        cropWidth = cropHeight * aspectRatio;
        
        // Center horizontally, use full height (top to bottom)
        cropX = (imgWidth - cropWidth) / 2;
        cropY = 0;
      } else {
        // Image is taller than target - crop height (keep full width)
        cropWidth = imgWidth;
        cropHeight = cropWidth / aspectRatio;
        
        // Use full width, center or top clip vertically
        cropX = 0;
        cropY = clipPosition === 'top' ? 0 : (imgHeight - cropHeight) / 2;
      }
      
      // Create canvas and draw cropped image
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );
      
      // Convert canvas to blob, then to File
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'));
            return;
          }
          
          // Create a new File with the same name and type
          const croppedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now()
          });
          
          resolve(croppedFile);
        },
        file.type || 'image/jpeg',
        0.95 // Quality (for JPEG)
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Crops a thumbnail image based on content type
 * - Video: 16:9 aspect ratio (middle clip)
 * - Audio: 1:1 square aspect ratio (top clip)
 */
export async function cropThumbnailForContent(
  file: File,
  contentType: 'video' | 'audio'
): Promise<File> {
  if (contentType === 'video') {
    return cropImageToAspectRatio(file, 16 / 9, 'center');
  } else {
    return cropImageToAspectRatio(file, 1 / 1, 'top');
  }
}

