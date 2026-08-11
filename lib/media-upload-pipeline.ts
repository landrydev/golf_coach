type FixedLengthPair = Readonly<{
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}>;

/**
 * Runs storage consumption and the fixed-length source transfer as one
 * coordinated pipeline. Either-side failure aborts the other side, and both
 * promises settle before the error escapes so cleanup cannot race a late write.
 */
export async function runFixedLengthMediaUploadPipeline<T>(
  source: ReadableStream<Uint8Array>,
  expectedBytes: number,
  store: (body: ReadableStream<Uint8Array>) => Promise<T>,
  createFixedLength: (size: number) => FixedLengthPair = cloudflareFixedLength,
): Promise<T> {
  const fixedLength = createFixedLength(expectedBytes);
  const controller = new AbortController();
  const transfer = source
    .pipeTo(fixedLength.writable, { signal: controller.signal })
    .catch((error) => {
      if (!controller.signal.aborted) controller.abort(error);
      throw error;
    });
  const storage = Promise.resolve()
    .then(() => store(fixedLength.readable))
    .catch(async (error) => {
      if (!controller.signal.aborted) controller.abort(error);
      // A storage implementation may reject before it starts consuming. Once
      // its promise rejects it no longer owns the readable, so cancel it to
      // release fixed-stream backpressure and let pipeTo cancel the source.
      await fixedLength.readable.cancel(error).catch(() => undefined);
      throw error;
    });
  const [storageResult, transferResult] = await Promise.allSettled([
    storage,
    transfer,
  ]);

  if (storageResult.status === "rejected" || transferResult.status === "rejected") {
    const reason =
      transferResult.status === "rejected" &&
      isRequestBoundaryError(transferResult.reason)
        ? transferResult.reason
        : storageResult.status === "rejected"
          ? storageResult.reason
          : transferResult.status === "rejected"
            ? transferResult.reason
            : new Error("Media upload pipeline failed.");
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
    // pipeTo normally propagates cancellation to its source. Explicitly
    // cancel once pipeTo has settled as well so an implementation-specific
    // early writable failure cannot leave the request reader alive.
    await source.cancel(reason).catch(() => undefined);
    throw reason;
  }
  return storageResult.value;
}

function isRequestBoundaryError(value: unknown): boolean {
  return (
    value instanceof Error &&
    value.name === "RequestError" &&
    "status" in value &&
    "code" in value
  );
}

function cloudflareFixedLength(size: number): FixedLengthPair {
  return new FixedLengthStream(size);
}
