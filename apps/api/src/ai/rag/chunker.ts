export interface DocChunk {
  source: string;
  chunkIndex: number;
  content: string;
}

export function chunkMarkdown(source: string, markdown: string): DocChunk[] {
  const lines = markdown.split('\n');
  const chunks: DocChunk[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    const text = currentContent.join('\n').trim();
    if (text.length > 0) {
      const prefix = currentHeading ? `${currentHeading}\n\n` : '';
      chunks.push({ source, chunkIndex, content: `${prefix}${text}` });
      chunkIndex++;
    }
    currentContent = [];
  };

  for (const line of lines) {
    if (line.match(/^#{1,3}\s/)) {
      flushChunk();
      currentHeading = line;
      continue;
    }
    currentContent.push(line);

    if (currentContent.join('\n').length > 2000) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}
