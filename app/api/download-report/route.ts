import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

export const runtime = 'nodejs';
const MAX_REPORT_SIZE = 1_000_000;
const LEFT = 54, WIDTH = 487, BOTTOM = 788;

function safeFilename(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/\.(html|pdf)$/i, '');
  return `${clean || 'floodguard-data-report'}.pdf`;
}

function text(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:h[1-6]|p|section|header|footer|div|tr|ol|ul)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ').replace(/<\/(?:li|th)>/gi, '  ').replace(/<\/td>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code))).replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inner(html: string, expression: RegExp) { return expression.exec(html)?.[1] || ''; }
function rows(html: string) { return [...html.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)].map(([, a, b]) => [text(a), text(b)] as const); }

function parse(html: string) {
  const report = inner(html, /<div[^>]*class=["'][^"']*official-report[^"']*["'][^>]*>([\s\S]*)<\/div>\s*$/i) || html;
  const section = (title: string) => inner(report, new RegExp(`<section[^>]*>\\s*<h2[^>]*>${title}<\\/h2>([\\s\\S]*?)<\\/section>`, 'i'));
  const actions = section('Recommended Action');
  const signatures = inner(report, /<footer[^>]*class=["'][^"']*report-signature[^"']*["'][^>]*>([\s\S]*?)<\/footer>/i);
  const metaHtml = inner(report, /<div[^>]*class=["'][^"']*report-meta[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  return {
    meta: [...metaHtml.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map(([, item]) => text(item)),
    summary: rows(section('Current Monitoring Summary')), assessment: text(section('Assessment')),
    actions: [...actions.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(([, item]) => text(item)), thresholds: rows(section('Alert Thresholds')),
    signatures: [...signatures.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map(([, item]) => [
      text(inner(item, /<span[^>]*>([\s\S]*?)<\/span>/i)),
      text(inner(item, /<strong[^>]*>([\s\S]*?)<\/strong>/i)),
      text(inner(item, /<small[^>]*>([\s\S]*?)<\/small>/i)),
    ]),
  };
}

async function createPdf(html: string) {
  const doc = new PDFDocument({ margin: LEFT, size: 'A4', info: { Title: 'FloodGuard Data Report' } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => { doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const data = parse(html);
  const continuationHeader = () => {
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(11).text('FLOOD MONITORING DATA REPORT', LEFT, 54, { width: WIDTH, align: 'center' });
    doc.fillColor('#ef7d00').rect(LEFT, 73, WIDTH, 3).fill();
    doc.y = 92;
  };
  const space = (height: number) => {
    if (doc.y + height > BOTTOM) {
      doc.addPage();
      continuationHeader();
    }
  };
  const heading = (title: string) => { space(70); doc.moveDown(0.35); doc.fillColor('#ef7d00').rect(LEFT, doc.y, 5, 29).fill(); doc.fillColor('#f4e1c8').rect(LEFT + 5, doc.y, WIDTH - 5, 29).fill(); doc.fillColor('#172033').font('Helvetica-Bold').fontSize(14).text(title, LEFT + 14, doc.y + 8, { width: WIDTH - 22 }); doc.y += 38; };
  const table = (items: readonly (readonly [string, string])[]) => items.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(10); const height = Math.max(27, doc.heightOfString(label, { width: 166 }) + 14, doc.heightOfString(value, { width: 284 }) + 14); space(height); const y = doc.y;
    doc.fillColor('#f5f7fa').rect(LEFT, y, 185, height).fill(); doc.fillColor('#fff').rect(LEFT + 185, y, WIDTH - 185, height).fill(); doc.fillColor('#c7ced8').rect(LEFT, y, WIDTH, height).stroke(); doc.moveTo(LEFT + 185, y).lineTo(LEFT + 185, y + height).stroke();
    doc.fillColor('#172033').font('Helvetica-Bold').fontSize(10).text(label, LEFT + 9, y + 7, { width: 166 }); doc.font('Helvetica').text(value, LEFT + 194, y + 7, { width: 284 }); doc.y = y + height;
  });
  const [seal, logo] = await Promise.all([readFile(path.join(process.cwd(), 'public/legacy/assets/images/lagonoy-seal.png')), readFile(path.join(process.cwd(), 'public/legacy/assets/images/mdrrmo-logo.jpg'))]);
  doc.image(seal, LEFT, 54, { fit: [70, 70] }).image(logo, LEFT + WIDTH - 82, 54, { fit: [82, 70] });
  const letterheadLeft = LEFT + 78;
  const letterheadWidth = WIDTH - 156;
  doc.fillColor('#172033').font('Helvetica').fontSize(10).text('Republic of the Philippines', letterheadLeft, 56, { width: letterheadWidth, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).text('Municipality of Lagonoy', letterheadLeft, 72, { width: letterheadWidth, align: 'center' });
  doc.fontSize(9).text('MUNICIPAL DISASTER RISK REDUCTION AND MANAGEMENT OFFICE', letterheadLeft, 95, { width: letterheadWidth, align: 'center' });
  doc.font('Helvetica').fontSize(10).text('Lagonoy, Camarines Sur', letterheadLeft, 112, { width: letterheadWidth, align: 'center' });
  doc.fillColor('#ef7d00').rect(LEFT, 140, WIDTH, 4).fill().fillColor('#172033').rect(LEFT, 147, WIDTH, 1).fill();
  doc.font('Helvetica-Bold').fontSize(18).text('FLOOD MONITORING DATA REPORT', LEFT, 170, { width: WIDTH, align: 'center' });
  const metaTop = 213;
  const metaWidth = WIDTH / 3;
  data.meta.slice(0, 3).forEach((item, index) => {
    doc.font('Helvetica').fontSize(8.5).fillColor('#172033').text(item, LEFT + metaWidth * index, metaTop, { width: metaWidth, align: 'center', lineGap: 2 });
  });
  doc.y = 254;
  heading('Current Monitoring Summary'); table(data.summary);
  doc.font('Helvetica').fontSize(10); space(70 + doc.heightOfString(data.assessment, { width: WIDTH, lineGap: 4 }));
  heading('Assessment'); doc.fillColor('#172033').text(data.assessment, { width: WIDTH, lineGap: 4 }).moveDown(0.8); heading('Recommended Action');
  data.actions.forEach((action, index) => { doc.font('Helvetica').fontSize(10); space(doc.heightOfString(action, { width: WIDTH - 20, lineGap: 4 }) + 18); const y = doc.y; doc.text(`${index + 1}.`, LEFT, y, { width: 18 }).text(action, LEFT + 20, y, { width: WIDTH - 20, lineGap: 4 }).moveDown(0.35); });
  heading('Alert Thresholds'); table(data.thresholds);
  if (data.signatures.length) { space(90); doc.moveDown(2.2); data.signatures.slice(0, 2).forEach((signature, index) => { const x = index ? LEFT + WIDTH - 200 : LEFT; const [caption, name, role] = signature; const y = doc.y; doc.font('Helvetica').fontSize(9).fillColor('#172033').text(caption || '', x, y, { width: 200, align: 'center' }).font('Helvetica-Bold').fontSize(10).text(name || '', x, y + 26, { width: 200, align: 'center' }).rect(x, y + 40, 200, 1).fill().font('Helvetica').fontSize(9).text(role || '', x, y + 48, { width: 200, align: 'center' }); }); }
  doc.end(); return output;
}

export async function POST(request: Request) {
  const formData = await request.formData(); const report = formData.get('report'); const filename = formData.get('filename');
  if (typeof report !== 'string' || !report.trim() || report.length > MAX_REPORT_SIZE) return NextResponse.json({ error: 'Invalid report content.' }, { status: 400 });
  const pdf = await createPdf(report);
  const body = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(body).set(pdf);
  return new Response(body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${safeFilename(typeof filename === 'string' ? filename : 'floodguard-data-report.pdf')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
