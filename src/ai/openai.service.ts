import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

@Injectable()
export class OpenAIService {
  constructor(private readonly config: ConfigService) {}

  private getApiKey(): string {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) throw new Error('OPENAI_API_KEY não configurada');
    return key;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const apiKey = this.getApiKey();
    const res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${err}`);
    }
    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (content == null) throw new Error('Resposta vazia da OpenAI');
    return content;
  }

  async chatJson<T>(messages: ChatMessage[]): Promise<T> {
    const content = await this.chat(messages);
    try {
      const parsed = JSON.parse(content) as T;
      return parsed;
    } catch {
      const wrapped = content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1');
      return JSON.parse(wrapped) as T;
    }
  }
}
