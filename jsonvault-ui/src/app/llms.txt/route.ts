import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Read the master integration guide from the root docs folder
    const filePath = path.join(process.cwd(), '../docs/integration-guide.md');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error("Failed to read integration guide", error);
    return new NextResponse('Error reading llms.txt', { status: 500 });
  }
}
