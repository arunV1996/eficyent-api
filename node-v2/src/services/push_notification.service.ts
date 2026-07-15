/**
 * FCM push-notification sender (mirror of the legacy
 * services/notifications/pushNotificationService.ts).
 *
 * The legacy service imports `firebase-admin` and a local
 * firebase-service-account.json. Neither is provisioned in the legacy
 * repo (the dependency is absent from package.json and the JSON file
 * is an empty placeholder), so the service degrades to logging the
 * notification instead of sending it. This port keeps that exact
 * behavior while making the degradation explicit:
 *
 *   - `firebase-admin` is resolved lazily via require(); when the
 *     module is not installed, pushes are logged and skipped.
 *   - Credentials come from the environment instead of a JSON file
 *     baked into the source tree:
 *       FIREBASE_PROJECT_ID
 *       FIREBASE_CLIENT_EMAIL
 *       FIREBASE_PRIVATE_KEY   (\n-escaped newlines supported)
 *
 * Payload/message shape (notification + data + phonepe.wav sound on
 * both platforms) is byte-identical to the legacy sender.
 */

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    sound?: string;
}

interface FirebaseMessaging {
    send(message: Record<string, unknown>): Promise<string>;
    sendEachForMulticast(message: Record<string, unknown>): Promise<{
        successCount: number;
        failureCount: number;
    }>;
}

let cachedMessaging: FirebaseMessaging | null = null;
let initialized = false;

const getMessagingClient = (): FirebaseMessaging | null => {
    if (initialized) {
        return cachedMessaging;
    }
    initialized = true;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n",
    );

    if (!projectId || !clientEmail || !privateKey) {
        // eslint-disable-next-line no-console
        console.warn(
            "Firebase credentials are not configured. Push notifications disabled.",
        );
        return null;
    }

    try {
        // Resolved lazily so the API runs without the optional
        // firebase-admin dependency installed (mirror of the legacy
        // not-configured fallback).
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const firebaseApp = require("firebase-admin/app") as {
            initializeApp: (
                options: Record<string, unknown>,
                name?: string,
            ) => unknown;
            cert: (credential: Record<string, unknown>) => unknown;
        };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const firebaseMessaging = require("firebase-admin/messaging") as {
            getMessaging: (app: unknown) => FirebaseMessaging;
        };

        const app = firebaseApp.initializeApp(
            {
                credential: firebaseApp.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            },
            "eficyent-push",
        );
        cachedMessaging = firebaseMessaging.getMessaging(app);
        // eslint-disable-next-line no-console
        console.info(
            `Firebase Admin SDK initialized successfully for push notifications (${projectId})`,
        );
    } catch (initError) {
        // eslint-disable-next-line no-console
        console.error(
            "Failed to initialize Firebase Admin SDK. Push notifications disabled.",
            initError,
        );
        cachedMessaging = null;
    }

    return cachedMessaging;
};

const buildMessageBody = (
    payload: PushNotificationPayload,
): Record<string, unknown> => {
    const sound = payload.sound || "phonepe.wav";
    return {
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
};

/**
 * Send a push notification to a single device token. Returns whether
 * the dispatch succeeded; failures are logged, never thrown.
 */
export const sendToToken = async (
    deviceToken: string,
    payload: PushNotificationPayload,
): Promise<boolean> => {
    const messaging = getMessagingClient();
    if (!messaging) {
        // eslint-disable-next-line no-console
        console.info(
            "FCM App not initialized, push notification logged instead",
            { deviceToken, payload },
        );
        return false;
    }

    try {
        await messaging.send({
            token: deviceToken,
            ...buildMessageBody(payload),
        });
        return true;
    } catch (sendError) {
        // eslint-disable-next-line no-console
        console.error("Failed to send push notification to token", sendError);
        return false;
    }
};

/**
 * Send a push notification to multiple device tokens. Returns the
 * count of successfully sent notifications.
 */
export const sendToTokens = async (
    deviceTokens: string[],
    payload: PushNotificationPayload,
): Promise<number> => {
    if (deviceTokens.length === 0) {
        return 0;
    }

    const messaging = getMessagingClient();
    if (!messaging) {
        // eslint-disable-next-line no-console
        console.info(
            "FCM App not initialized, push notification logged instead",
            { tokensCount: deviceTokens.length, payload },
        );
        return 0;
    }

    try {
        const response = await messaging.sendEachForMulticast({
            tokens: deviceTokens,
            ...buildMessageBody(payload),
        });
        return response.successCount;
    } catch (sendError) {
        // eslint-disable-next-line no-console
        console.error("Failed to send multicast push notifications", sendError);
        return 0;
    }
};
