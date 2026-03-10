export interface DocChunk {
  source: string;
  chunkIndex: number;
  content: string;
}

const TARGET_CHUNK_SIZE = 800;
const OVERLAP_SIZE = 150;

export function chunkMarkdown(source: string, markdown: string): DocChunk[] {
  const lines = markdown.split('\n');
  const chunks: DocChunk[] = [];
  let headingHierarchy: string[] = [];
  let currentContent: string[] = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    const text = currentContent.join('\n').trim();
    if (text.length === 0) return;

    const prefix = headingHierarchy.length > 0 ? headingHierarchy.join(' > ') + '\n\n' : '';
    const fullText = `${prefix}${text}`;

    if (fullText.length <= TARGET_CHUNK_SIZE) {
      chunks.push({ source, chunkIndex, content: fullText });
      chunkIndex++;
    } else {
      const subChunks = splitLargeText(text, TARGET_CHUNK_SIZE, OVERLAP_SIZE);
      for (const sub of subChunks) {
        chunks.push({ source, chunkIndex, content: `${prefix}${sub}` });
        chunkIndex++;
      }
    }
    currentContent = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      flushChunk();
      const level = headingMatch[1].length;
      headingHierarchy = headingHierarchy.slice(0, level - 1);
      headingHierarchy[level - 1] = headingMatch[2].trim();
      headingHierarchy = headingHierarchy.slice(0, level);
      continue;
    }
    currentContent.push(line);

    if (currentContent.join('\n').length > TARGET_CHUNK_SIZE) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}

function splitLargeText(text: string, targetSize: number, overlapSize: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const results: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    if (currentLen + para.length > targetSize && current.length > 0) {
      results.push(current.join('\n\n'));
      const overlapText = current.join('\n\n');
      if (overlapText.length > overlapSize) {
        const tail = overlapText.slice(-overlapSize);
        const sentenceBreak = tail.indexOf('. ');
        current = [sentenceBreak >= 0 ? tail.slice(sentenceBreak + 2) : tail];
      } else {
        current = [overlapText];
      }
      currentLen = current[0].length;
    }
    current.push(para);
    currentLen += para.length;
  }

  if (current.length > 0) {
    const final = current.join('\n\n').trim();
    if (final) results.push(final);
  }

  return results;
}
