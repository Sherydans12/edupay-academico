import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  return NextResponse.json({ service: 'edupay-academico-web', status: 'ok' });
}
