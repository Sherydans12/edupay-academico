import { NextResponse } from 'next/server';

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete('edupay_dev_user');
  return response;
}
