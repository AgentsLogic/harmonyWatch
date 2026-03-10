import { NextRequest, NextResponse } from 'next/server';

export interface Rendition {
  id: string;
  width?: number;
  height?: number;
  bitrate?: number;
  label: string;
}

/**
 * Fetches and parses HLS manifest from Mux to extract available renditions
 * This is done server-side to avoid CORS issues
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playbackId = searchParams.get('playbackId');

    if (!playbackId) {
      return NextResponse.json(
        { error: 'playbackId parameter is required' },
        { status: 400 }
      );
    }

    // Fetch the HLS manifest from Mux (server-side, no CORS issues)
    const manifestUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    
    const response = await fetch(manifestUrl, {
      headers: {
        'User-Agent': 'HarmonyWatch/1.0',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Failed to fetch video manifest' },
        { status: response.status }
      );
    }

    const manifestText = await response.text();

    // Parse HLS manifest for #EXT-X-STREAM-INF tags
    const renditions: Rendition[] = [
      { id: 'auto', label: 'Auto' } // Always include Auto option
    ];

    const lines = manifestText.split('\n');
    let index = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse attributes from the stream info line
        const attrs = line.replace('#EXT-X-STREAM-INF:', '');
        
        // Extract resolution (e.g., RESOLUTION=1920x1080)
        const resolutionMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/);
        
        // Extract bandwidth/bitrate (e.g., BANDWIDTH=5000000)
        const bitrateMatch = attrs.match(/BANDWIDTH=(\d+)/);
        
        const width = resolutionMatch ? parseInt(resolutionMatch[1], 10) : undefined;
        const height = resolutionMatch ? parseInt(resolutionMatch[2], 10) : undefined;
        const bitrate = bitrateMatch ? parseInt(bitrateMatch[1], 10) : undefined;

        if (height) {
          // Create a label based on height (e.g., 1080p, 720p)
          const label = `${height}p`;
          
          renditions.push({
            id: `level_${index}`,
            width,
            height,
            bitrate,
            label
          });
          index++;
        }
      }
    }

    // Sort renditions by height (descending) - highest quality first
    renditions.sort((a, b) => {
      if (a.id === 'auto') return -1; // Auto always first
      if (b.id === 'auto') return 1;
      return (b.height || 0) - (a.height || 0);
    });

    // If no renditions found (shouldn't happen with Mux, but handle gracefully)
    if (renditions.length === 1) {
      console.warn(`No renditions found in manifest for playbackId: ${playbackId}`);
      // Return at least Auto option
      return NextResponse.json({ renditions });
    }

    return NextResponse.json({ renditions });
  } catch (error) {
    console.error('Error fetching renditions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch renditions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
