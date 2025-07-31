export interface PDFChunk {
  id: string;
  pageRange: string;
  content: string;
  pageNumbers: number[];
  tokenCount?: number;
}

export interface ChunkingOptions {
  maxPagesPerChunk: number;
  overlapPages: number;
  maxTokensPerChunk: number;
}

export class PDFChunker {
  private options: ChunkingOptions;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = {
      maxPagesPerChunk: 20, // Process 20 pages at a time
      overlapPages: 2, // 2 pages overlap between chunks
      maxTokensPerChunk: 15000, // ~15k tokens per chunk
      ...options,
    };
  }

  /**
   * Extract text from PDF and chunk it
   */
  async chunkPDF(pdfUrl: string): Promise<PDFChunk[]> {
    try {
      // For now, we'll use a simple page-based approach
      // In production, you'd extract actual text content
      const chunks: PDFChunk[] = [];
      
      // Simulate chunking based on page ranges
      // You'll need to implement actual PDF text extraction
      const totalPages = await this.estimatePageCount(pdfUrl);
      
      for (let startPage = 1; startPage <= totalPages; startPage += this.options.maxPagesPerChunk - this.options.overlapPages) {
        const endPage = Math.min(startPage + this.options.maxPagesPerChunk - 1, totalPages);
        
        chunks.push({
          id: `chunk-${startPage}-${endPage}`,
          pageRange: `Pages ${startPage}-${endPage}`,
          content: `PDF content for pages ${startPage} to ${endPage}`, // Replace with actual extraction
          pageNumbers: Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i),
        });
      }
      
      return chunks;
    } catch (error) {
      console.error('Error chunking PDF:', error);
      throw new Error('Failed to chunk PDF');
    }
  }

  /**
   * Find relevant chunks based on user query
   */
  async findRelevantChunks(chunks: PDFChunk[], query: string, maxChunks: number = 3): Promise<PDFChunk[]> {
    // Simple keyword-based relevance (in production, use embeddings/vector search)
    const queryWords = query.toLowerCase().split(' ');
    
    const scoredChunks = chunks.map(chunk => {
      const content = chunk.content.toLowerCase();
      const score = queryWords.reduce((acc, word) => {
        return acc + (content.includes(word) ? 1 : 0);
      }, 0);
      
      return { chunk, score };
    });

    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);
  }

  private async estimatePageCount(pdfUrl: string): Promise<number> {
    // Placeholder - in production, you'd extract this from the PDF
    // For now, assume large PDFs have ~100 pages
    return 100;
  }
}

/**
 * Process chunks sequentially to avoid rate limits
 */
export async function processChunksSequentially<T>(
  chunks: PDFChunk[],
  processor: (chunk: PDFChunk) => Promise<T>,
  delayMs: number = 1000
): Promise<T[]> {
  const results: T[] = [];
  
  for (const chunk of chunks) {
    try {
      const result = await processor(chunk);
      results.push(result);
      
      // Add delay to avoid rate limiting
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Error processing chunk ${chunk.id}:`, error);
      throw error;
    }
  }
  
  return results;
}
