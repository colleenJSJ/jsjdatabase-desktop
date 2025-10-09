import { NextResponse } from 'next/server';

type SuccessOptions<T> = {
  status?: number;
  meta?: Record<string, unknown>;
  legacy?: T;
};

type FailureOptions = {
  status?: number;
  code?: string;
  meta?: Record<string, unknown>;
};

export function jsonSuccess<T>(data: T, options?: SuccessOptions<unknown>) {
  const { status = 200, meta, legacy } = options ?? {};
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
      ...(legacy ?? {}),
    },
    { status }
  );
}

export function jsonError(message: string, options?: FailureOptions) {
  const { status = 400, code, meta } = options ?? {};
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code ? { code } : {}),
      ...(meta ? { meta } : {}),
    },
    { status }
  );
}
