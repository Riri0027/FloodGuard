export const metadata = {
  title: 'FloodGuard | Public Live Status',
  description: 'Public live water-level status for Bilog Falls.',
};

export default function PublicStatusPage() {
  return <main className="legacy-dashboard"><iframe title="FloodGuard public live status" src="/legacy/status.html" /></main>;
}
