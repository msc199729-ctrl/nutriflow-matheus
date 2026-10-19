export class BarcodeUpstreamError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'network' | 'http',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BarcodeUpstreamError';
  }
}
