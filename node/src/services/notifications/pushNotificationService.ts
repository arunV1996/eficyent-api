import { initializeApp, cert, App } from "firebase-admin/app";
import { getMessaging, Message, MulticastMessage } from "firebase-admin/messaging";
import { logger } from "../../helpers/logger";
import serviceAccount from "./firebase-service-account.json";

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
}

let fcmApp: App | null = null;
let initialized = false;

/**
 * Initialize Firebase Admin SDK lazily using the local JSON service account credentials.
 */
async function getFCMApp(): Promise<App | null> {
  if (initialized) return fcmApp;

  try {
    const isPlaceholder =
      !serviceAccount.project_id ||
      serviceAccount.project_id.includes("REPLACE_WITH_YOUR_") ||
      !serviceAccount.private_key ||
      serviceAccount.private_key.includes("REPLACE_WITH_YOUR_") ||
      !serviceAccount.client_email ||
      serviceAccount.client_email.includes("REPLACE_WITH_YOUR_");

    if (isPlaceholder) {
      logger.warn(
        "Firebase credentials in firebase-service-account.json are not configured. Push notifications disabled."
      );
      initialized = true;
      return null;
    }

    fcmApp = initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
    }, "eficyent-push");

    logger.info({ projectId: serviceAccount.project_id }, "Firebase Admin SDK initialized successfully for push notifications");
  } catch (err) {
    logger.error({ err }, "Failed to initialize Firebase Admin SDK. Push notifications disabled.");
  }

  initialized = true;
  return fcmApp;
}

export const pushNotificationService = {
  /**
   * Send a push notification to a single device token.
   * Returns a boolean indicating if the dispatch was successful.
   */
  async sendToToken(deviceToken: string, payload: PushNotificationPayload): Promise<boolean> {
    const app = await getFCMApp();
    if (!app) {
      logger.info({ deviceToken, payload }, "FCM App not initialized, push notification logged instead");
      return false;
    }

    try {
      const sound = payload.sound || "phonepe.wav";
      const message: Message = {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        apns: {
          payload: {
            aps: {
              sound,
            },
          },
        },
        android: {
          notification: {
            sound,
          },
        },
      };

      const messaging = getMessaging(app);
      await messaging.send(message);
      logger.info({ deviceToken, title: payload.title }, "Push notification sent successfully");
      return true;
    } catch (err) {
      logger.error({ err, deviceToken, payload }, "Failed to send push notification to token");
      return false;
    }
  },

  /**
   * Send a push notification to multiple device tokens.
   * Returns the count of successfully sent notifications.
   */
  async sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<number> {
    if (tokens.length === 0) {
      logger.info("No tokens provided for push notification, skip sending");
      return 0;
    }

    const app = await getFCMApp();
    if (!app) {
      logger.info({ tokensCount: tokens.length, payload }, "FCM App not initialized, push notification logged instead");
      return 0;
    }

    try {
      const sound = payload.sound || "phonepe.wav";
      const message: MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        apns: {
          payload: {
            aps: {
              sound,
            },
          },
        },
        android: {
          notification: {
            sound,
          },
        },
      };

      const messaging = getMessaging(app);
      const response = await messaging.sendEachForMulticast(message);
      logger.info(
        {
          successCount: response.successCount,
          failureCount: response.failureCount,
        },
        "Multicast push notifications sent",
      );
      return response.successCount;
    } catch (err) {
      logger.error({ err, tokensCount: tokens.length, payload }, "Failed to send multicast push notifications");
      return 0;
    }
  }
};
