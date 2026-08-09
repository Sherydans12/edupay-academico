import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AcademicEmailDeliveryError,
  type AcademicEmailAdapter,
  type AcademicEmailMessage,
  type AcademicEmailResult,
} from './notification.types';

@Injectable()
export class ResendAcademicEmailAdapter implements AcademicEmailAdapter {
  constructor(private readonly config: ConfigService) {}

  async send(message: AcademicEmailMessage): Promise<AcademicEmailResult> {
    const apiKey = this.config.get<string>('ACADEMIC_RESEND_API_KEY');
    if (!apiKey) {
      throw new AcademicEmailDeliveryError(
        'configuration',
        false,
        'Academic Resend API key is not configured.',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.get<string>('ACADEMIC_EMAIL_FROM'),
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(this.config.get<string>('ACADEMIC_EMAIL_REPLY_TO')
            ? { reply_to: this.config.get<string>('ACADEMIC_EMAIL_REPLY_TO') }
            : {}),
        }),
      });
    } catch {
      throw new AcademicEmailDeliveryError(
        'network',
        true,
        'The email provider could not be reached.',
      );
    }

    if (!response.ok) {
      const category = response.status >= 500 ? 'provider_unavailable' : 'provider_rejected';
      throw new AcademicEmailDeliveryError(
        category,
        response.status >= 500 || response.status === 429,
        `The email provider returned HTTP ${response.status}.`,
      );
    }

    let body: { id?: unknown } = {};
    try {
      body = (await response.json()) as { id?: unknown };
    } catch {
      // A successful provider response without JSON is still a successful send.
    }
    return {
      ...(typeof body.id === 'string' ? { providerMessageId: body.id } : {}),
    };
  }
}

@Injectable()
export class FakeAcademicEmailAdapter implements AcademicEmailAdapter {
  async send(message: AcademicEmailMessage): Promise<AcademicEmailResult> {
    return { providerMessageId: `fake-${message.deliveryId}` };
  }
}
