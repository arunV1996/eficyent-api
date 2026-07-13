import { Request } from "express";

export interface PendingRequest {
  id: string;
  method: string;
  url: string;
  startTime: number;
  payload: any;
  req: Request;
}

// In-memory registry of targeted requests currently in progress
export const activeRequests = new Map<string, PendingRequest>();

/**
 * Redacts sensitive fields from request payloads before sending to Slack
 */
function scrubPayload(data: any): any {
  if (!data || typeof data !== "object") return data;
  const SENSITIVE_FIELDS = [
    "password",
    "pin",
    "token",
    "apiKey",
    "saltKey",
    "privateKey",
    "client_secret",
    "cvv",
    "card",
    "otp",
    "account_number",
    "routing_number",
    "iban",
    "ssn",
    "tax_id",
  ];
  const redacted = { ...data };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
      redacted[key] = scrubPayload(redacted[key]);
    }
  }
  return redacted;
}

/**
 * Dispatches an alert to Slack containing details of unresolved requests
 */
export async function sendSlackWebhook(payload: any): Promise<void> {
  const baseUrl = process.env.SLACK_BASE_URL;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!baseUrl || !channelId) {
    console.log("[SLACK ALERT NOTIFICATION (Local Console Fallback)]:\n", JSON.stringify(payload, null, 2));
    return;
  }

  const webhookUrl = baseUrl.endsWith("/") ? `${baseUrl}${channelId}` : `${baseUrl}/${channelId}`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Slack alert failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending Slack webhook", error);
  }
}

/**
 * Formats and sends a list of unfinished requests to Slack
 */
export async function notifyUnresolvedRequests(requests: PendingRequest[], reason: string): Promise<void> {
  if (requests.length === 0) return;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `⚠️ Alert: Unresolved Transactions Detected (${reason})`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The following *${requests.length}* critical transaction request(s) failed to receive a response before termination/abort:`,
      },
    },
  ];

  requests.slice(0, 5).forEach((req) => {
    const duration = Date.now() - req.startTime;
    const cleanPayload = req.payload ? JSON.stringify(scrubPayload(req.payload)) : "N/A";
    const triggeredAt = new Date(req.startTime).toString();
    
    // Resolve email dynamically from request context if authenticated
    const reqAny = req.req as any;
    const userEmail = reqAny.user?.email || reqAny.teamMember?.email || null;

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `• *[${req.method}]* \`${req.url}\`\n  *Request ID*: \`${req.id}\`\n  *User*: \`${userEmail || "Guest"}\`\n  *Triggered At*: \`${triggeredAt}\`\n  *In-flight Time*: \`${duration}ms\`\n  *Payload*: \`${cleanPayload.substring(0, 150)}\``,
      },
    } as any);
  });

  if (requests.length > 5) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_...and ${requests.length - 5} more request(s) omitted._`,
      },
    });
  }

  await sendSlackWebhook({ blocks });
}

/**
 * Formats and sends a request error alert to Slack
 */
export async function notifyRequestError(
  req: Request,
  error: unknown,
  reason: string = "Request Error",
): Promise<void> {
  const reqId = (req as any).id || "N/A";
  const duration = (req as any).startTime ? Date.now() - (req as any).startTime : 0;
  const cleanPayload = req.body ? JSON.stringify(scrubPayload(req.body)) : "N/A";

  // Resolve email dynamically
  const reqAny = req as any;
  const userEmail = reqAny.user?.email || reqAny.teamMember?.email || null;
  const triggeredAt = reqAny.startTime ? new Date(reqAny.startTime).toString() : new Date().toString();

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🔴 Alert: Transaction Error (${reason})`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error Message*: \`${errorMessage}\``,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `• *[${req.method}]* \`${req.originalUrl}\`\n  *Request ID*: \`${reqId}\`\n  *User*: \`${userEmail || "Guest"}\`\n  *Triggered At*: \`${triggeredAt}\`\n  *In-flight Time*: \`${duration}ms\`\n  *Payload*: \`${cleanPayload.substring(0, 150)}\``,
      },
    },
  ];

  if (errorStack) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Stack Trace*:\n\`\`\`${errorStack.substring(0, 500)}\`\`\``,
      },
    });
  }

  await sendSlackWebhook({ blocks });
}
