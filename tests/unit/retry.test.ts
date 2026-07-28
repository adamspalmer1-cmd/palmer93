import { describe, expect, it, vi } from "vitest";
import { computeBackoffDelay, RetryableError, withRetry } from "@/lib/sync/retry";

describe("computeBackoffDelay", () => {
  it("grows the cap exponentially with attempt number", () => {
    const alwaysMax = () => 1;
    expect(computeBackoffDelay(1, { baseDelayMs: 100, random: alwaysMax })).toBe(100);
    expect(computeBackoffDelay(2, { baseDelayMs: 100, random: alwaysMax })).toBe(200);
    expect(computeBackoffDelay(3, { baseDelayMs: 100, random: alwaysMax })).toBe(400);
  });

  it("never exceeds maxDelayMs even at high attempt numbers", () => {
    const alwaysMax = () => 1;
    expect(computeBackoffDelay(10, { baseDelayMs: 100, maxDelayMs: 500, random: alwaysMax })).toBe(500);
  });

  it("returns 0 when random() returns 0 (full jitter floor)", () => {
    expect(computeBackoffDelay(5, { baseDelayMs: 100, random: () => 0 })).toBe(0);
  });
});

describe("withRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { sleep: async () => {} });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RetryableError("transient", { retryable: true }))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, { maxAttempts: 3, sleep });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("stops after maxAttempts and rethrows the last error", async () => {
    const error = new RetryableError("always fails", { retryable: true });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxAttempts: 3, sleep: async () => {} })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error", async () => {
    const error = new RetryableError("bad request", { retryable: false });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxAttempts: 5, sleep: async () => {} })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honors a RetryableError's retryAfterMs instead of computed backoff", async () => {
    const error = new RetryableError("rate limited", { retryable: true, retryAfterMs: 1234 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry(fn, { maxAttempts: 3, sleep });

    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it("uses a custom isRetryable predicate over the default classification", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("plain error"));
    await expect(
      withRetry(fn, { maxAttempts: 5, isRetryable: () => false, sleep: async () => {} }),
    ).rejects.toThrow("plain error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
