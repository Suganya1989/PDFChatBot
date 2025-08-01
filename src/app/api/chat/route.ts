export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { Mistral } from '@mistralai/mistralai';



const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
function extractParagraphsFromOcr(ocrResponse: any): string[] {
  const paragraphs: string[] = [];

  try {
    // Handle the actual Mistral OCR response structure
    if (ocrResponse.pages && Array.isArray(ocrResponse.pages)) {
      for (const page of ocrResponse.pages) {
        // Check if page has blocks directly
        if (page.blocks && Array.isArray(page.blocks)) {
          for (const block of page.blocks) {
            if (block.type === 'paragraph' && block.text) {
              paragraphs.push(block.text);
            }
          }
        }
        // Check if page has content.blocks
        else if (page.content && page.content.blocks && Array.isArray(page.content.blocks)) {
          for (const block of page.content.blocks) {
            if (block.type === 'paragraph' && block.text) {
              paragraphs.push(block.text);
            }
          }
        }
        // If no blocks found, try to extract any text content
        else if (page.text) {
          paragraphs.push(page.text);
        }
      }
    }
    
    // Fallback: if no pages structure, check if response has direct text
    if (paragraphs.length === 0 && ocrResponse.text) {
      paragraphs.push(ocrResponse.text);
    }
    
  } catch (error) {
    console.error('Error extracting paragraphs from OCR response:', error);
    console.log('OCR Response structure:', JSON.stringify(ocrResponse, null, 2));
  }

  return paragraphs;
}

export async function POST(request: NextRequest) {
  try {

    console.log('request', request);
    const { message, pdfUrl, fileSize } = await request.json();

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
  console.log('ocrResponse', ocrResponse);
 const paragraphs = extractParagraphsFromOcr(ocrResponse);
 console.log('paragraphs', paragraphs);
  return NextResponse.json({
    message: paragraphs,
    success: true
  });
  }
  else{  // Create a conversational prompt with actual PDF content
   
    // Use Vercel AI SDK to generate the response
    const result = await generateText({
      model: anthropic('claude-4-opus-20250514'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: message,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
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
  
    console.log('Generated text:', result.text);
    
    return NextResponse.json({
      message: result.text,
      success: true
    });
  }
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
