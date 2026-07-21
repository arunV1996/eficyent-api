import {
    GetSecretValueCommand,
    SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

/**
 * AWS Secrets Manager integration.
 *
 * Secrets Manager stores each secret encrypted with a KMS key (the
 * account default aws/secretsmanager, or the key configured on the
 * secret). GetSecretValue transparently decrypts through KMS on read,
 * so no manual KMS Encrypt/Decrypt calls are required here — running on
 * AWS, the instance role only needs secretsmanager:GetSecretValue plus
 * kms:Decrypt on the secret's key.
 *
 * The integration is optional: when AWS_SECRETS_MANAGER_SECRET_NAME is
 * not configured (or the fetch fails), the application keeps running on
 * the .env file alone. When the secret bundle IS available, any key it
 * contains overrides the .env value; keys absent from the bundle keep
 * their .env value.
 */

let secretsManagerClient: SecretsManagerClient | null = null;

const getSecretsManagerClient = (): SecretsManagerClient => {
    if (!secretsManagerClient) {
        secretsManagerClient = new SecretsManagerClient({
            region:
                process.env.AWS_REGION ||
                process.env.AWS_DEFAULT_REGION ||
                "us-east-1",
        });
    }
    return secretsManagerClient;
};

/**
 * Fetches a secret bundle by name and parses it as a JSON key/value
 * map (the Secrets Manager "key/value pairs" format). Returns null on
 * any failure — missing secret, bad credentials, malformed JSON — so
 * callers can fall back to .env.
 */
export const fetchSecretBundle = async (
    secretName: string,
): Promise<Record<string, string> | null> => {
    try {
        const response = await getSecretsManagerClient().send(
            new GetSecretValueCommand({ SecretId: secretName }),
        );

        const secretPayload =
            response.SecretString ??
            (response.SecretBinary
                ? Buffer.from(response.SecretBinary).toString("utf-8")
                : null);
        if (!secretPayload) {
            return null;
        }

        const parsedBundle = JSON.parse(secretPayload) as Record<
            string,
            unknown
        >;
        const bundle: Record<string, string> = {};
        for (const [secretKey, secretValue] of Object.entries(parsedBundle)) {
            bundle[secretKey] = String(secretValue);
        }
        return bundle;
    } catch (fetchError) {
        const errorMessage =
            fetchError instanceof Error
                ? fetchError.message
                : String(fetchError);
        // eslint-disable-next-line no-console
        console.warn(
            `Secrets Manager: could not load secret "${secretName}" (${errorMessage}); falling back to .env values.`,
        );
        return null;
    }
};

/**
 * Loads the configured secret bundle into process.env. Every key
 * present in the bundle wins over the .env value; everything else keeps
 * its .env value. Must run before any module reads process.env at
 * import time (see src/index.ts).
 */
export const loadSecretsIntoEnv = async (): Promise<void> => {
    const secretName =
        process.env.AWS_SECRETS_MANAGER_SECRET_NAME ||
        process.env.AWS_SECRET_NAME;
    if (!secretName) {
        // eslint-disable-next-line no-console
        console.log(
            "Secrets Manager: no secret name configured; using .env values.",
        );
        return;
    }

    const bundle = await fetchSecretBundle(secretName);
    if (!bundle) {
        return;
    }

    const overriddenKeys = Object.keys(bundle);
    overriddenKeys.forEach((secretKey) => {
        process.env[secretKey] = bundle[secretKey];
    });
    // Key names only — never log the values.
    // eslint-disable-next-line no-console
    console.log(
        `Secrets Manager: loaded ${overriddenKeys.length} key(s) from "${secretName}": ${overriddenKeys.join(", ")}`,
    );
};
