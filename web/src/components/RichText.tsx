import { Fragment, type ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * Renders the light Markdown that model replies use (**bold**, *italic*,
 * `code`, "- " bullets) as React elements. Never injects HTML: anything else
 * stays plain text, so model output can't add markup or links.
 */
export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
        const content = bullet ? bullet[1] : heading ? heading[1] : line;
        return (
          <Fragment key={i}>
            {bullet ? (
              <Box component="span" sx={{ display: 'flex', gap: 0.75 }}>
                <span aria-hidden>•</span>
                <span>{inline(content)}</span>
              </Box>
            ) : heading ? (
              <strong>{inline(content)}</strong>
            ) : (
              inline(content)
            )}
            {i < lines.length - 1 && !bullet && '\n'}
          </Fragment>
        );
      })}
    </>
  );
}

const TOKEN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

function inline(s: string): ReactNode[] {
  return s.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__')))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <Box key={i} component="code" sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.92em', px: 0.4, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.06)' }}>
          {part.slice(1, -1)}
        </Box>
      );
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
