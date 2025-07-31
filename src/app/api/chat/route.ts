export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { Mistral } from '@mistralai/mistralai';



const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


export async function POST(request: NextRequest) {
  try {
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
    const apiKey = process.env.MISTRAL_API_KEY;
    const client = new Mistral({apiKey: apiKey});
    
    
    const ocrResponse = await client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
            type: "document_url",
            documentUrl: "https://arxiv.org/pdf/2201.04234"
        },
        includeImageBase64: true
    });
   
    // Create a conversational prompt with actual PDF content
   
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

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
