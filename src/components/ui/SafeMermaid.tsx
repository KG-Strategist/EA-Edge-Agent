import { useRef, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

// Lazy-load Mermaid: only imported when SafeMermaid component mounts
// This allows Mermaid.js (~400KB gzipped) to be code-split from main bundle
let mermaidInstance: any = null;
let mermaidLoading: Promise<any> | null = null;

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;
  if (mermaidLoading) return mermaidLoading;

  mermaidLoading = import('mermaid').then(m => {
    mermaidInstance = m.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
    });
    return mermaidInstance;
  });

  return mermaidLoading;
}

interface SafeMermaidProps {
  chart: string;
}

export default function SafeMermaid({ chart }: SafeMermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const mermaid = await getMermaid();
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(svg);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setError(chart);
          setIsLoading(false);
        }
      }
    };
    if (chart) renderChart();
    return () => { isMounted = false; };
  }, [chart]);

  if (isLoading) {
    return (
      <div className="flex justify-center my-4 bg-gray-900 p-4 rounded-lg h-48 items-center justify-center">
        <div className="animate-pulse text-gray-500">Rendering diagram...</div>
      </div>
    );
  }

  if (error) {
    return (
      <pre className="bg-gray-900 border border-red-500/50 p-4 rounded-lg text-red-400 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
        <code>Diagram syntax error. Displaying raw code.{'\n\n'}{error}</code>
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center my-4 bg-gray-900 p-4 rounded-lg overflow-x-auto"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(svg, {
          ALLOWED_TAGS: ['svg', 'path', 'rect', 'circle', 'line', 'text', 'g', 'defs', 'style', 'tspan', 'polyline', 'polygon', 'ellipse'],
          ALLOWED_ATTR: ['x', 'y', 'width', 'height', 'viewBox', 'xmlns', 'id', 'class', 'd', 'fill', 'stroke', 'stroke-width', 'r', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2', 'points', 'rx', 'ry', 'font-size', 'font-family', 'text-anchor', 'font-weight']
        })
      }}
    />
  );
}