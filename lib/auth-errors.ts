/** Supabase error codes are stable; keep a fallback for older Auth responses. */
export function authErrorMessage(error: { code?: string; status?: number; message?: string }): { message: string; rateLimited: boolean } {
  if (error.code === 'over_email_send_rate_limit' || /email.*rate.*limit/i.test(error.message ?? '')) {
    return { message: 'Account confirmation emails are temporarily unavailable because the email sending limit was reached. Please try again later. If you already confirmed your account, you can sign in.', rateLimited: true };
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { message: 'Too many attempts. Please wait before trying again.', rateLimited: true };
  }
  return { message: error.message || 'Something went wrong. Please try again.', rateLimited: false };
}
