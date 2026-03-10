import { NextRequest, NextResponse } from 'next/server';
import { storageService, STORAGE_BUCKETS } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bucket = formData.get('bucket') as string;
    const path = formData.get('path') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type (only images)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Use provided bucket or default to thumbnails
    const targetBucket = bucket || STORAGE_BUCKETS.THUMBNAILS;
    
    // Use provided path or generate one
    const filePath = path || storageService.generateFilePath(
      'content',
      storageService.getFileExtension(file.name)
    );

    // Upload the file
    const uploadResult = await storageService.uploadFile(targetBucket, filePath, file);

    if (!uploadResult.success) {
      return NextResponse.json(
        { error: uploadResult.error || 'Upload failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: uploadResult.url,
      path: filePath,
      bucket: targetBucket
    });

  } catch (error) {
    console.error('Thumbnail upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
