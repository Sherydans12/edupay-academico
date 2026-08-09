export const ACADEMIC_EMAIL_ADAPTER = Symbol('ACADEMIC_EMAIL_ADAPTER');

export interface AcademicEmailMessage {
  readonly deliveryId: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}
export interface AcademicEmailResult {
  readonly providerMessageId?: string;
}

export interface AcademicEmailAdapter {
  send(message: AcademicEmailMessage): Promise<AcademicEmailResult>;
}

export class AcademicEmailDeliveryError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'AcademicEmailDeliveryError';
  }
}
