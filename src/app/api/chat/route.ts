export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import pdfParse from 'pdf-parse';


const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Cache for storing PDF content to avoid re-processing
const pdfCache = new Map<string, string>();

async function extractTextFromPDF(pdfUrl: string): Promise<string> {
  // Check cache first
  console.log('Checking cache for PDF:', pdfUrl);
  if (pdfCache.has(pdfUrl)) {
    return pdfCache.get(pdfUrl)!;
  }

  try {
    console.log('Fetching PDF from URL:', pdfUrl);
    
    // Fetch the PDF from the URL
    const buffers = await fetch(pdfUrl).then(res => res.arrayBuffer());
    const parsed = await pdfParse(Buffer.from(buffers));
    const response = parsed.text;
    
    console.log('Text extracted, length:', response.length);

    // Cache the extracted text
    pdfCache.set(pdfUrl, response);
    
    return response;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, pdfUrl } = await request.json();

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    if (!pdfUrl) {
      return new Response('PDF URL is required', { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response('Anthropic API key not configured', { status: 500 });
    }

    // Extract text from PDF
    let pdfText: string;
    try {
      pdfText = await extractTextFromPDF(pdfUrl);
    } catch {
      return NextResponse.json(
        { error: 'Failed to process PDF. Please ensure the PDF is accessible and valid.' },
        { status: 400 }
      );
    }

    // Truncate PDF text if it's too long (Claude has token limits)
    const maxPdfLength = 500000; // Adjust based on your needs
    const truncatedPdfText = pdfText.length > maxPdfLength 
      ? pdfText.substring(0, maxPdfLength) + "... [Content truncated]"
      : pdfText;

    // Create a conversational prompt with actual PDF content
    const prompt = `Hi! I'm here to help you understand your PDF document. I've read through the content and I'm ready to answer your questions about it.

Document Content:
${truncatedPdfText}

Your Question: ${message}

Let me help you with that! I'll give you a clear, friendly answer based on what I found in your document. If I can't find the specific information you're looking for, I'll let you know and suggest what might help.`;

    // Use Vercel AI SDK to generate the response
    const result = await generateText({
      model: anthropic('claude-3-haiku-20240307'),
      prompt: prompt,
      maxTokens: 1000,
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
