import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useReview } from '../app/AppContext.tsx';
import { generateReportHtml } from '../report/report-generator.ts';

/** Standalone printable report. Use the browser's Print dialog to save as PDF. */
export function PrintReportPage() {
  const { id } = useParams();
  const review = useReview(id);
  useEffect(() => {
    if (review) document.title = `Case Review Report – ${review.input.caseIdentifier}`;
  }, [review]);
  if (!review) return <p className="p-8 text-sm">Report not found (open it from the same browser session).</p>;
  const html = generateReportHtml(review);
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
  return (
    <div className="bg-white">
      <div className="no-print sticky top-0 flex justify-end gap-2 border-b bg-slate-50 p-2">
        <button className="rounded bg-navy-800 px-3 py-1.5 text-sm text-white" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <style>{style}</style>
      {/* Generated HTML: every dynamic value is escaped in report-generator. */}
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}
