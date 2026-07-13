// User account types (mirrors USER_TYPE_* in node/src/helpers/constants.ts)
export const USER_TYPE_PERSONAL = 1;
export const USER_TYPE_BUSINESS = 2;

export const USER_TYPES = [USER_TYPE_PERSONAL, USER_TYPE_BUSINESS] as const;

// User roles
export const USER_ROLE_USER = 1;
export const USER_ROLE_ADMIN = 2;
export const USER_ROLE_TEAM_MEMBER = 3;

// Personal access token abilities (Sanctum-style ability scopes)
export const TOKEN_ABILITY_AUTHENTICATION = "authentication";
export const TOKEN_ABILITY_TWO_FACTOR_PENDING = "two-factor-pending";

// Polymorphic tokenable_type value on personal_access_tokens.
// Kept as the Laravel model FQCN so tokens issued by the legacy service
// and the restructured service are interchangeable.
export const TOKENABLE_TYPE_USER = "App\\Models\\User";
