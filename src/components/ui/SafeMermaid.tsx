import React, { useRef, useEffect, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

interface SafeMermaidProps {
  chart: string;
}

export default function SafeMermaid({ chart }: SafeMermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        setError(null);
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (isMounted) setSvg(svg);
      } catch (err) {
        if (isMounted) {
          setError(chart);
        }
      }
    };
    if (chart) renderChart();
    return () => { isMounted = false; };
  }, [chart]);

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
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}