import { Redis } from '@upstash/redis';
import { logger } from './logger';
import { env } from '../env';

export const resend = async () => {
  if (!env.RESEND_API_KEY) {
    return { emails: { send: async (...args: unknown[]) => logger.info(args) } };
  }
  // Kept out of the isolate's static import graph; only loaded when an email is sent.
  const { Resend } = await import('resend');
  return new Resend(env.RESEND_API_KEY);
};

export const redis = () => new Redis({ url: env.REDIS_URL, token: env.REDIS_TOKEN });

export const twilio = () => {
  //   if (env.NODE_ENV === 'development' && !forceUseRealService) {
  //     return {
  //       messages: {
  //         send: async (to: string, body: string) =>
  //           logger.info(`[TWILIO:MOCK] Sending message to ${to}: ${body}`),
  //       },
  //     };
  //   }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    // Devlab: Twilio is optional in self-host — phone-OTP login is unused.
    // Fall back to a mock sender instead of breaking the whole auth flow.
    return {
      messages: {
        send: async (to: string, body: string) =>
          logger.info(`[TWILIO:MOCK] Would send SMS to ${to}: ${body}`),
      },
    };
  }

  const send = async (to: string, body: string) => {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        },
        body: new URLSearchParams({
          To: to,
          From: env.TWILIO_PHONE_NUMBER,
          Body: body,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send OTP: ${error}`);
    }
  };

  return {
    messages: {
      send,
    },
  };
};
