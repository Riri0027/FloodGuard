import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_REPORT_SIZE = 1_000_000;

function safeFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return cleaned.endsWith('.html') ? cleaned : `${cleaned || 'floodguard-data-report'}.html`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const report = formData.get('report');
  const filename = formData.get('filename');

  if (typeof report !== 'string' || !report.trim() || report.length > MAX_REPORT_SIZE) {
    return NextResponse.json({ error: 'Invalid report content.' }, { status: 400 });
  }

  const downloadName = safeFilename(typeof filename === 'string' ? filename : 'floodguard-data-report.html');
  return new Response(report, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
