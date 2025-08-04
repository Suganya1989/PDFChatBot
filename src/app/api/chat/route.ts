export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { Mistral } from '@mistralai/mistralai';
import weaviate from 'weaviate-ts-client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // or your key directly
});

const weaviateClient = weaviate.client({
  scheme: 'https',
  host: process.env.WEAVIATE_URL!, // e.g. 'yourinstance.weaviate.network'
  apiKey: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY!),
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
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
function extractTextFromOcr(ocrResponse: any): string {
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
          } else if (page.content.text) {
            console.log(`Page ${i} content.text:`, page.content.text.substring(0, 100));
            allText += page.content.text + '\n\n';
          }
        }
        
        // Method 3: Blocks array
        if (page.blocks && Array.isArray(page.blocks)) {
          console.log(`Page ${i} has ${page.blocks.length} blocks`);
          for (let j = 0; j < page.blocks.length; j++) {
            const block = page.blocks[j];
            console.log(`Block ${j} type:`, typeof block, 'keys:', Object.keys(block));
            
            if (typeof block === 'string') {
              console.log(`Block ${j} is string:`, block.substring(0, 50));
              allText += block + '\n';
            } else if (block.text) {
              console.log(`Block ${j} has text:`, block.text.substring(0, 50));
              allText += block.text + '\n';
            } else if (block.content) {
              console.log(`Block ${j} has content:`, block.content.substring(0, 50));
              allText += block.content + '\n';
            }
          }
        }
        
        // Method 4: Any other text-like properties
        for (const key of Object.keys(page)) {
          if (key !== 'text' && key !== 'content' && key !== 'blocks' && typeof page[key] === 'string' && page[key].length > 10) {
            console.log(`Page ${i} has text in ${key}:`, page[key].substring(0, 50));
            allText += page[key] + '\n';
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
        if (typeof ocrResponse[key] === 'string' && ocrResponse[key].length > 10) {
          console.log(`Found text in ${key}:`, ocrResponse[key].substring(0, 50));
          allText += ocrResponse[key] + '\n';
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

    console.log('request', request);
    const { message, pdfUrl, fileSize ,fileName} = await request.json();
    console.log('fileName', fileName);
    const sanitizedClassName = fileName
    .replace(/\.[^/.]+$/, '') // Remove file extension
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
    .replace(/^[^A-Z]/g, 'PDF_') // Ensure starts with capital letter
    .substring(0, 50); // Limit length

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    if (!pdfUrl) {
      return new Response('PDF URL is required', { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response('Anthropic API key not configured', { status: 500 });
    }
    
    console.log('fileSize', fileSize);

    if(fileSize > 9437184) {
      
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
          console.log('OCR Response structure:', JSON.stringify(ocrResponse, null, 2));
          
          // Extract all text from OCR response
          const extractedText = extractTextFromOcr(ocrResponse);
          console.log('Extracted text length:', extractedText.length);
          console.log('First 200 chars of extracted text:', extractedText.substring(0, 200));
          
          if (!extractedText || extractedText.length === 0) {
            return NextResponse.json({
              message: 'No text could be extracted from the PDF',
              success: false
            });
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
              // Create a valid Weaviate class name from fileName
              
              
              const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-ada-002',
                input: chunks[i],
              });
              
              const embedding = embeddingResponse.data[0].embedding;
              console.log('Embedding:', embedding);
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
        }
      } catch (error) {
        console.error('Error checking file existence:', error);
      }
    }
    // For smaller PDFs or when we have a question about stored content
    // First, try to retrieve relevant chunks from Weaviate
    let relevantChunks = [];
    let contextText = '';
    
    if (pdfUrl && fileName) {
      try {
        // Create a valid class name for searching
        
        const validClassName = sanitizedClassName.charAt(0).toUpperCase() + sanitizedClassName.slice(1);
        
        console.log('Searching Weaviate for class:', validClassName);
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: message // this is your chat input
        });
        const inputVector = embeddingResponse.data[0].embedding;
        
        // Search for relevant chunks using semantic similarity
        const searchResult = await weaviateClient.graphql
          .get()
          .withClassName(validClassName)
          .withFields('text chunkIndex source fileSize totalChunks')
          .withNearVector({ vector : inputVector })
          .withLimit(5) // Get top 5 most relevant chunks
          .do();
        console.log('Search result:', searchResult);
        if (searchResult.data && searchResult.data.Get && searchResult.data.Get[validClassName]) {
          relevantChunks = searchResult.data.Get[validClassName];
          console.log(`Found ${relevantChunks.length} relevant chunks from Weaviate`);
          
          // Combine relevant chunks into context
          contextText = relevantChunks.map((chunk, index) => 
            `[Chunk ${chunk.chunkIndex}]: ${chunk.text}`
          ).join('\n\n');
        }
      } catch (error) {
        console.error('Error searching Weaviate:', error);
      }
    
    
    // Generate response using Claude with context
    let promptText = message;
    if (contextText) {
      promptText = `Based on the following PDF content, please answer the question: "${message}"

PDF Content:
${contextText}

Question: ${message}`;
    }
    
    // Use Vercel AI SDK to generate the response
    const result = await generateText({
      model: anthropic('claude-3-5-sonnet-20241022'),
      messages: [
        {
          role: 'user',
          content: contextText ? [
            {
              type: 'text',
              text: promptText,
            }
          ] : [
            {
              type: 'text',
              text: message,
            },
            {
              type: 'file',
              data: new URL(pdfUrl),
              mimeType: 'application/pdf',
            }
          ]
        },
      ],
    });
    
    console.log('Generated response using', contextText ? 'Weaviate chunks' : 'direct PDF');
    
    return NextResponse.json({
      message: result.text,
      chunksUsed: relevantChunks.length,
      success: true
    });
  }
  }
  catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
