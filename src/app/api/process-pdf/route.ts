export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import weaviate from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const weaviateClient = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_URL!,
  apiKey: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY!),
});

// TypeScript interfaces for OCR response
interface OcrBlock {
  text?: string;
  content?: string;
  [key: string]: unknown;
}

interface OcrPage {
  text?: string;
  content?: string | { text?: string };
  blocks?: (string | OcrBlock)[];
  [key: string]: unknown;
}

interface OcrResponse {
  pages?: OcrPage[];
  text?: string;
  [key: string]: unknown;
}

function chunkTextFromOcr(ocrArray: string[], maxTokens = 500): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of ocrArray) {
    const next = current + '\n\n' + paragraph;
    if (next.split(' ').length > maxTokens) {
      if (current) chunks.push(current.trim());
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

function extractTextFromOcr(ocrResponse: OcrResponse): string {
  let allText = '';

  try {
    console.log('Starting text extraction...');
    console.log('OCR Response type:', typeof ocrResponse);
    console.log('OCR Response keys:', Object.keys(ocrResponse));
    
    // Check if response has pages
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      console.log('Found pages array with length:', ocrResponse.pages.length);
      
      for (let i = 0; i < ocrResponse.pages.length; i++) {
        const page = ocrResponse.pages[i];
        console.log(`Page ${i} keys:`, Object.keys(page));
        
        // Method 1: Direct text property
        if (page.text) {
          console.log(`Page ${i} has direct text:`, page.text.substring(0, 100));
          allText += page.text + '\n\n';
        }
        
        // Method 2: Content property
        if (page.content) {
          console.log(`Page ${i} has content:`, typeof page.content);
          if (typeof page.content === 'string') {
            console.log(`Page ${i} content is string:`, page.content.substring(0, 100));
            allText += page.content + '\n\n';
          } else if (typeof page.content === 'object' && page.content !== null && 'text' in page.content) {
            console.log(`Page ${i} content.text:`, (page.content as { text: string }).text.substring(0, 100));
            allText += (page.content as { text: string }).text + '\n\n';
          }
        }
        
        // Method 3: Blocks array
        if (page.blocks && Array.isArray(page.blocks)) {
          console.log(`Page ${i} has ${page.blocks.length} blocks`);
          for (let j = 0; j < page.blocks.length; j++) {
            const block = page.blocks[j];
            console.log(`Block ${j} type:`, typeof block, 'keys:', typeof block === 'object' ? Object.keys(block) : 'N/A');
            
            if (typeof block === 'string') {
              console.log(`Block ${j} is string:`, block.substring(0, 50));
              allText += block + '\n';
            } else if (typeof block === 'object' && block !== null) {
              const blockObj = block as OcrBlock;
              if (blockObj.text) {
                console.log(`Block ${j} has text:`, blockObj.text.substring(0, 50));
                allText += blockObj.text + '\n';
              } else if (blockObj.content) {
                console.log(`Block ${j} has content:`, blockObj.content.substring(0, 50));
                allText += blockObj.content + '\n';
              }
            }
          }
        }
        
        // Method 4: Any other text-like properties
        for (const key of Object.keys(page)) {
          if (key !== 'text' && key !== 'content' && key !== 'blocks' && typeof page[key] === 'string' && (page[key] as string).length > 10) {
            console.log(`Page ${i} has text in ${key}:`, (page[key] as string).substring(0, 50));
            allText += (page[key] as string) + '\n';
          }
        }
      }
    }
    
    // Fallback: check if response has direct text
    if (!allText && ocrResponse.text) {
      console.log('Using fallback direct text:', ocrResponse.text.substring(0, 100));
      allText = ocrResponse.text;
    }
    
    // Final fallback: check all top-level string properties
    if (!allText) {
      console.log('Trying final fallback - checking all properties...');
      for (const key of Object.keys(ocrResponse)) {
        if (typeof ocrResponse[key] === 'string' && (ocrResponse[key] as string).length > 10) {
          console.log(`Found text in ${key}:`, (ocrResponse[key] as string).substring(0, 50));
          allText += (ocrResponse[key] as string) + '\n';
        }
      }
    }
    
    console.log('Final extracted text length:', allText.length);
    if (allText.length > 0) {
      console.log('First 200 chars of extracted text:', allText.substring(0, 200));
    }
    
  } catch (error) {
    console.error('Error extracting text from OCR response:', error);
  }

  return allText.trim();
}

export async function POST(request: NextRequest) {
  try {
    console.log('Processing PDF request');
    const { pdfUrl, fileSize, fileName } = await request.json();

    if (!pdfUrl) {
      return NextResponse.json({ error: 'PDF URL is required' }, { status: 400 });
    }

    if (!fileName) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 });
    }

    console.log('fileName', fileName);
    const sanitizedClassName = fileName
      .replace(/\.[^/.]+$/, '') // Remove file extension
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
      .replace(/^[^A-Z]/g, 'PDF_') // Ensure starts with capital letter
      .substring(0, 50); // Limit length

    console.log('fileSize', fileSize);

    if (fileSize > 9437184) {
      // Check if file already exists in Weaviate by searching for existing chunks with the same source
      const validClassName = sanitizedClassName.charAt(0).toUpperCase() + sanitizedClassName.slice(1);
      
      try {
        const existingData = await weaviateClient.graphql
          .get()
          .withClassName(validClassName)
          .withFields('source')
          .withWhere({
            path: ['source'],
            operator: 'Equal',
            valueText: pdfUrl
          })
          .withLimit(1)
          .do();
        
        const fileAlreadyExists = existingData.data && 
          existingData.data.Get && 
          existingData.data.Get[validClassName] && 
          existingData.data.Get[validClassName].length > 0;
        
        if (fileAlreadyExists) {
          console.log('File already exists in Weaviate, skipping storage');
          return NextResponse.json({
            message: 'File already processed and stored in database',
            success: true,
            className: validClassName
          });
        } else {
          console.log('File not found in Weaviate, proceeding with storage');
          const apiKey = process.env.MISTRAL_API_KEY;
          const client = new Mistral({apiKey: apiKey});
          const ocrResponse = await client.ocr.process({
            model: "mistral-ocr-latest",
            document: {
                type: "document_url",
                documentUrl: pdfUrl
            },
            includeImageBase64: true
          });
          console.log('ocrResponse completed');
          console.log('OCR Response keys:', Object.keys(ocrResponse));
          
          // Extract all text from OCR response
          const extractedText = extractTextFromOcr(ocrResponse);
          console.log('Extracted text length:', extractedText.length);
          console.log('First 200 chars of extracted text:', extractedText.substring(0, 200));
          
          if (!extractedText || extractedText.length === 0) {
            return NextResponse.json({
              error: 'No text could be extracted from the PDF',
              success: false
            }, { status: 400 });
          }
          
          // Split text into paragraphs for chunking
          const paragraphs = extractedText.split('\n\n').filter(p => p.trim().length > 0);
          console.log('Found paragraphs:', paragraphs.length);
          
          // Create chunks from the extracted text
          const chunks = chunkTextFromOcr(paragraphs, 1000); // Larger chunks for better context
          console.log('Created chunks:', chunks.length);
          
          // Store chunks in Weaviate with embeddings
          const storedChunks = [];
          for (let i = 0; i < chunks.length; i++) {
            console.log(`Storing chunk ${i + 1}/${chunks.length}`);
            try {
              const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: chunks[i],
              });
              
              const embedding = embeddingResponse.data[0].embedding;
              const result = await weaviateClient.data.creator()
                .withClassName(validClassName)
                .withProperties({ 
                  text: chunks[i], 
                  chunkIndex: i + 1, 
                  source: pdfUrl,
                  fileSize: fileSize,
                  totalChunks: chunks.length
                })
                .withVector(embedding)
                .do();
              storedChunks.push(result);
              console.log(`Successfully stored chunk ${i + 1}`);
            } catch (error) {
              console.error(`Error storing chunk ${i + 1}:`, error);
            }
          }

          return NextResponse.json({
            message: `Successfully processed and stored ${chunks.length} chunks`,
            success: true,
            className: validClassName,
            chunksStored: storedChunks.length
          });
        }
      } catch (error) {
        console.error('Error processing PDF:', error);
        return NextResponse.json({
          error: 'Error processing PDF',
          success: false
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({
        message: 'File size is too small for processing',
        success: false
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in process-pdf API:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}
