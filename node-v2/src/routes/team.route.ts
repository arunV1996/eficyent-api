import { Router } from "express";
import {
    banks,
    countries,
    depositLookups,
    depositWallets,
    mobileCountryCodes,
    paymentRails,
    states,
} from "../controller/lookup.controller";
import {
    corporateLogin,
    forceResetPassword,
    login,
    logout,
    resetPassword,
    sendResetLink,
    verifyCode,
} from "../controller/team_auth.controller";
import {
    destroy as teamMemberDestroy,
    index as teamMemberIndex,
    show as teamMemberShow,
    store as teamMemberStore,
    update as teamMemberUpdate,
    updateStatus as teamMemberUpdateStatus,
} from "../controller/team_member.controller";
import {
    changePassword,
    getAppSettings,
    getCredentials,
    profile,
} from "../controller/team_profile.controller";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { strictBody } from "../middleware/strictBody";
import {
    authTeam,
    ownerAccess,
    teamPasswordResetGate,
} from "../middleware/team_auth";
import {
    banksQueryValidator,
    depositLookupsQueryValidator,
    statesQueryValidator,
} from "../validators/lookup.validator";
import {
    FORCE_RESET_ALLOWED_KEYS,
    forceResetPasswordBodyValidator,
    TEAM_CHANGE_PASSWORD_ALLOWED_KEYS,
    TEAM_FORGOT_ALLOWED_KEYS,
    TEAM_LOGIN_ALLOWED_KEYS,
    TEAM_MEMBER_CREATE_ALLOWED_KEYS,
    TEAM_MEMBER_UPDATE_ALLOWED_KEYS,
    TEAM_RESET_PASSWORD_ALLOWED_KEYS,
    TEAM_VERIFY_CODE_ALLOWED_KEYS,
    teamChangePasswordBodyValidator,
    teamForgotPasswordBodyValidator,
    teamLoginBodyValidator,
    teamMemberCreateBodyValidator,
    teamMemberListQueryValidator,
    teamMemberShowBodyValidator,
    teamMemberShowQueryValidator,
    teamMemberUpdateBodyValidator,
    teamResetPasswordBodyValidator,
    teamVerifyCodeBodyValidator,
} from "../validators/team.validator";

/**
 * Mirror of routes/team_members.php (via the legacy team.routes.ts).
 * This tranche ships the team foundation: auth (login / corporate
 * login / force-reset / forgot-password), profile + credentials, the
 * public team lookups, and the Owner-only TeamMember CRUD.
 *
 * Deferred to the corporate-scoping tranche: the ~45 shared team-side
 * business mounts (accounts / deposits / beneficiaries / remitters /
 * quotes / beneficiary-transactions / ledgers / statement / wallets /
 * dashboard / authed lookups) — they reuse the user controllers but
 * require the CORPORATE req.teamMember narrowing threaded through the
 * underlying helpers first.
 */

// Mounted at "/" — paths carry their own /corporate + /team prefixes.
export const teamPublicRouter = Router();

teamPublicRouter.post(
    "/corporate/login",
    strictBody(TEAM_LOGIN_ALLOWED_KEYS),
    ...teamLoginBodyValidator,
    checkValidationErrors,
    corporateLogin,
);

teamPublicRouter.post(
    "/team/login",
    strictBody(TEAM_LOGIN_ALLOWED_KEYS),
    ...teamLoginBodyValidator,
    checkValidationErrors,
    login,
);

teamPublicRouter.post(
    "/team/force-reset-password",
    strictBody(FORCE_RESET_ALLOWED_KEYS),
    ...forceResetPasswordBodyValidator,
    checkValidationErrors,
    forceResetPassword,
);

teamPublicRouter.get("/team/get_settings", getAppSettings);

teamPublicRouter.get("/team/lookups/mobile_country_codes", mobileCountryCodes);
teamPublicRouter.get("/team/lookups/countries", countries);
teamPublicRouter.get(
    "/team/lookups/states",
    ...statesQueryValidator,
    checkValidationErrors,
    states,
);
teamPublicRouter.get("/team/lookups/payment_rails", paymentRails);
teamPublicRouter.get(
    "/team/lookups/deposit_lookups",
    ...depositLookupsQueryValidator,
    checkValidationErrors,
    depositLookups,
);
teamPublicRouter.get("/team/lookups/deposit_wallets", depositWallets);
teamPublicRouter.get(
    "/team/lookups/banks",
    ...banksQueryValidator,
    checkValidationErrors,
    banks,
);

teamPublicRouter.post(
    "/team/forgot-password/send-reset-link",
    strictBody(TEAM_FORGOT_ALLOWED_KEYS),
    ...teamForgotPasswordBodyValidator,
    checkValidationErrors,
    sendResetLink,
);
teamPublicRouter.post(
    "/team/forgot-password/verify-code",
    strictBody(TEAM_VERIFY_CODE_ALLOWED_KEYS),
    ...teamVerifyCodeBodyValidator,
    checkValidationErrors,
    verifyCode,
);
teamPublicRouter.post(
    "/team/forgot-password/reset-password",
    strictBody(TEAM_RESET_PASSWORD_ALLOWED_KEYS),
    ...teamResetPasswordBodyValidator,
    checkValidationErrors,
    resetPassword,
);

// Mounted at "/team" — everything requires team auth; get-credentials
// sits in front of the password-reset gate like the Laravel grouping.
export const teamAuthedRouter = Router();

teamAuthedRouter.get(
    "/get-credentials",
    authTeam,
    teamPasswordResetGate,
    getCredentials,
);

teamAuthedRouter.use(authTeam, teamPasswordResetGate);

teamAuthedRouter.post("/logout", logout);
teamAuthedRouter.get("/profile", profile);
teamAuthedRouter.post(
    "/change-password",
    strictBody(TEAM_CHANGE_PASSWORD_ALLOWED_KEYS),
    ...teamChangePasswordBodyValidator,
    checkValidationErrors,
    changePassword,
);

// Owner-only TeamMember CRUD.
teamAuthedRouter.get(
    "/team-members/list",
    ownerAccess,
    ...teamMemberListQueryValidator,
    checkValidationErrors,
    teamMemberIndex,
);
teamAuthedRouter.post(
    "/team-members/create",
    ownerAccess,
    strictBody(TEAM_MEMBER_CREATE_ALLOWED_KEYS),
    ...teamMemberCreateBodyValidator,
    checkValidationErrors,
    teamMemberStore,
);
teamAuthedRouter.get(
    "/team-members/show",
    ownerAccess,
    ...teamMemberShowQueryValidator,
    checkValidationErrors,
    teamMemberShow,
);
teamAuthedRouter.post(
    "/team-members/update",
    ownerAccess,
    strictBody(TEAM_MEMBER_UPDATE_ALLOWED_KEYS),
    ...teamMemberUpdateBodyValidator,
    checkValidationErrors,
    teamMemberUpdate,
);
teamAuthedRouter.post(
    "/team-members/update-status",
    ownerAccess,
    ...teamMemberShowBodyValidator,
    checkValidationErrors,
    teamMemberUpdateStatus,
);
teamAuthedRouter.delete(
    "/team-members/delete",
    ownerAccess,
    ...teamMemberShowQueryValidator,
    checkValidationErrors,
    teamMemberDestroy,
);
