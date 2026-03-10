require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI assistant for Global Arc AI, a bespoke AI automation agency. Your job is to help website visitors understand what we offer, qualify them as potential leads, and guide them towards booking a discovery call.

ABOUT GLOBAL ARC AI:
We build custom AI automation systems for growing businesses. Everything is built from scratch, tailored to each client's exact tools, processes, and goals. No off-the-shelf solutions.

OUR SERVICES:
1. Workflow Automation — We replace repetitive manual tasks with intelligent AI workflows. From customer onboarding to internal reporting, if it's repeatable, we automate it. Runs 24/7 without error or delay.
2. Systems Integration — We connect your CRM, calendar, communication tools, and other platforms with intelligent bridges so everything talks to everything and data flows seamlessly.
3. AI Deployment — Custom AI systems built, tested, and launched end-to-end. Includes AI chatbots, lead qualification systems, document processing, and custom dashboards. Ongoing support included.
4. Web Development — Fast, modern websites built to convert, designed alongside your AI automations so your site and systems work as one.

KEY FEATURES WE DELIVER:
- Instant lead response: AI replies to enquiries in seconds, qualifies leads, answers questions, books calls
- Auto-quoting and invoicing: AI generates branded quotes instantly, sends invoices automatically
- Google review automation: SMS sent to customers after job completion with a direct review link
- 24/7 operations: Systems run continuously, handling queries and keeping workflows moving
- Lead qualification: AI scores, qualifies, and segments every inbound lead before a human sees it
- Document processing: AI reads and acts on invoices, contracts, forms, and reports automatically

PRICING:
We don't publish fixed prices because every system is custom-built. We offer a free discovery call to understand the business, then provide a tailored proposal. Typical engagements start from a few thousand pounds depending on scope.

HOW TO RESPOND:
- Be friendly, professional, and concise. Match the tone of a sharp, modern tech company.
- Ask questions to understand the visitor's business and pain points.
- When someone asks about pricing, explain it's custom and encourage a discovery call.
- Collect: first name, business type, main pain point/goal, email address (in a natural conversation, not a form-like interrogation).
- Once you have their details or when appropriate, direct them to the contact form on the page or suggest booking a free discovery call.
- Keep responses short and punchy — 2-4 sentences max per reply unless they ask for detail.
- Never make up specific prices, timelines, or guarantees.
- If asked something you don't know, say you'll have the team follow up.`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'Something went wrong. Please try again.' })}\n\n`);
    res.end();
  }
});

if (!process.env.APPS_SCRIPT_URL) {
  console.warn('APPS_SCRIPT_URL not set — contact form emails will not send.');
} else {
  console.log('Apps Script webhook configured.');
}

app.get('/api/status', (req, res) => {
  res.json({
    emailConfigured: !!process.env.APPS_SCRIPT_URL,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, company, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!process.env.APPS_SCRIPT_URL) {
    return res.status(500).json({ error: 'Email not configured on server' });
  }

  try {
    const body = JSON.stringify({ name, email, company, message });
    const headers = { 'Content-Type': 'application/json' };

    // Apps Script redirects POST → must follow manually or fetch silently switches to GET
    let response = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST', headers, body, redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      console.log('Following redirect to:', location);
      response = await fetch(location, { method: 'POST', headers, body });
    }

    const text = await response.text();
    console.log('Apps Script response:', response.status, text);

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to send email', code: response.status });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Email send error:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Global Arc AI server running at http://localhost:${PORT}`);
});
