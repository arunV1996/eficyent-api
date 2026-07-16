import { Router } from "express";
import {
    bulkStore as beneficiaryBulkStore,
    bulkTemplate as beneficiaryBulkTemplate,
    destroy as beneficiaryDestroy,
    getFormFields as beneficiaryGetFormFields,
    index as beneficiaryIndex,
    show as beneficiaryShow,
    store as beneficiaryStore,
} from "../controller/beneficiary_account.controller";
import {
    bulkStore as transactionBulkStore,
    cancel as transactionCancel,
    checkTransactionStatus,
    direct as transactionDirect,
    downloadList as transactionDownloadList,
    exportReceipt as transactionExportReceipt,
    getFormFields as transactionGetFormFields,
    getProof,
    index as transactionIndex,
    payoutTemplate as transactionPayoutTemplate,
    requestProof,
    show as transactionShow,
    store as transactionStore,
    transactionFormFields,
    updateStatus as transactionUpdateStatus,
} from "../controller/beneficiary_transaction.controller";
import {
    exportDeposits as depositExport,
    index as depositIndex,
    quote as depositQuote,
    show as depositShow,
    store as depositStore,
} from "../controller/deposit.controller";
import {
    exportLedgers as ledgerExport,
    index as ledgerIndex,
    show as ledgerShow,
} from "../controller/ledger.controller";
import {
    banks,
    countries,
    depositLookups,
    depositWallets,
    getRates,
    mobileCountryCodes,
    paymentRails,
    receivingCountries,
    refreshRates,
    states,
} from "../controller/lookup.controller";
import { makeQuoteStore } from "../controller/quote.controller";
import {
    bulkStore as senderBulkStore,
    bulkTemplate as senderBulkTemplate,
    destroy as senderDestroy,
    getFormFields as senderGetFormFields,
    index as senderIndex,
    show as senderShow,
    store as senderStore,
    update as senderUpdate,
} from "../controller/sender.controller";
import { exportStatement } from "../controller/statement.controller";
import {
    chartsData as teamChartsData,
    statistics as teamStatistics,
} from "../controller/team_dashboard.controller";
import {
    activate as virtualAccountActivate,
    getBalance as virtualAccountGetBalance,
    getVirtualAccounts,
    index as virtualAccountIndex,
    show as virtualAccountShow,
} from "../controller/virtual_account.controller";
import { index as walletIndex,
    convert as walletConvert,
    show as walletShow,
    showTransaction as walletShowTransaction,
    transactions as walletTransactions,
} from "../controller/wallet.controller";
import { idempotency } from "../middleware/idempotency";
import {
    beneficiaryFormFieldsQueryValidator,
    beneficiaryListQueryValidator,
    beneficiaryShowQueryValidator,
} from "../validators/beneficiary_account.validator";
import {
    DIRECT_ALLOWED_KEYS,
    payoutFormFieldsQueryValidator,
    PROOF_REQUEST_ALLOWED_KEYS,
    proofGetQueryValidator,
    proofRequestBodyValidator,
    sendMoneyDirectBodyValidator,
    TRANSACTION_CANCEL_ALLOWED_KEYS,
    TRANSACTION_STORE_ALLOWED_KEYS,
    TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS,
    transactionCancelBodyValidator,
    transactionListQueryValidator,
    transactionShowQueryValidator,
    transactionStoreBodyValidator,
    transactionUpdateStatusBodyValidator,
} from "../validators/beneficiary_transaction.validator";
import {
    dashboardChartsDataQueryValidator,
    dashboardStatisticsQueryValidator,
} from "../validators/dashboard.validator";
import {
    DEPOSIT_STORE_ALLOWED_KEYS,
    depositListQueryValidator,
    depositQuoteQueryValidator,
    depositShowQueryValidator,
    depositStoreBodyValidator,
} from "../validators/deposit.validator";
import {
    ledgerListQueryValidator,
    ledgerShowQueryValidator,
} from "../validators/ledger.validator";
import { receivingCountriesQueryValidator } from "../validators/lookup.validator";
import {
    quoteStoreCrossFieldRules,
    quoteStoreValidator,
    refreshRatesBodyValidator,
} from "../validators/quote.validator";
import {
    senderFormFieldsQueryValidator,
    senderListQueryValidator,
    senderShowQueryValidator,
    senderUpdateBodyValidator,
} from "../validators/sender.validator";
import { statementExportQueryValidator } from "../validators/statement.validator";
import {
    ACTIVATE_ALLOWED_KEYS,
    activateBodyValidator,
    virtualAccountIdQueryValidator,
    virtualAccountListQueryValidator,
} from "../validators/virtual_account.validator";
import {
    WALLET_CONVERT_ALLOWED_KEYS,
    walletConvertBodyValidator,
    walletListQueryValidator,
    walletShowQueryValidator,
    walletTransactionShowQueryValidator,
    walletTransactionsQueryValidator,
} from "../validators/wallet.validator";
import {
    QUOTE_MODE_QUOTATION,
    QUOTE_MODE_RATE,
} from "../utils/constants";
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
    checkerAccess,
    makerAccess,
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
 * Mirror of routes/team_members.php (via the legacy team.routes.ts):
 * team auth + profile + Owner-only TeamMember CRUD, plus the shared
 * business mounts that reuse the user controllers (authTeam sets
 * req.user to the parent business user; req.teamMember drives the
 * corporate scoping and the maker/checker gates).
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

// ----- Shared business mounts (reuse the user controllers; authTeam
// sets req.user to the parent business user and req.teamMember drives
// the corporate scoping inside them). -----

// Virtual accounts
teamAuthedRouter.get(
    "/accounts/list",
    ...virtualAccountListQueryValidator,
    checkValidationErrors,
    virtualAccountIndex,
);
teamAuthedRouter.get(
    "/accounts/show",
    ...virtualAccountIdQueryValidator,
    checkValidationErrors,
    virtualAccountShow,
);
teamAuthedRouter.get(
    "/accounts/get_account_balance",
    ...virtualAccountIdQueryValidator,
    checkValidationErrors,
    virtualAccountGetBalance,
);
teamAuthedRouter.post(
    "/accounts/activate",
    strictBody(ACTIVATE_ALLOWED_KEYS),
    ...activateBodyValidator,
    checkValidationErrors,
    virtualAccountActivate,
);
teamAuthedRouter.get(
    "/accounts/get_virtual_Accounts",
    getVirtualAccounts,
);

// Deposits
teamAuthedRouter.get(
    "/deposits/list",
    ...depositListQueryValidator,
    checkValidationErrors,
    depositIndex,
);
teamAuthedRouter.get(
    "/deposits/quote",
    ...depositQuoteQueryValidator,
    checkValidationErrors,
    depositQuote,
);
teamAuthedRouter.post(
    "/deposits/store",
    idempotency(),
    strictBody(DEPOSIT_STORE_ALLOWED_KEYS),
    ...depositStoreBodyValidator,
    checkValidationErrors,
    depositStore,
);
teamAuthedRouter.get(
    "/deposits/show",
    ...depositShowQueryValidator,
    checkValidationErrors,
    depositShow,
);
// No validator — mirror of the legacy team mount.
teamAuthedRouter.get("/deposits/export", depositExport);

// Beneficiary accounts
teamAuthedRouter.get(
    "/beneficiaries/get-form-fields",
    ...beneficiaryFormFieldsQueryValidator,
    checkValidationErrors,
    beneficiaryGetFormFields,
);
teamAuthedRouter.get(
    "/beneficiaries/list",
    ...beneficiaryListQueryValidator,
    checkValidationErrors,
    beneficiaryIndex,
);
teamAuthedRouter.post("/beneficiaries/store", beneficiaryStore);
teamAuthedRouter.get(
    "/beneficiaries/show",
    ...beneficiaryShowQueryValidator,
    checkValidationErrors,
    beneficiaryShow,
);
teamAuthedRouter.delete(
    "/beneficiaries/delete",
    ...beneficiaryShowQueryValidator,
    checkValidationErrors,
    beneficiaryDestroy,
);
teamAuthedRouter.get(
    "/beneficiaries/bulk/template",
    beneficiaryBulkTemplate,
);
teamAuthedRouter.post(
    "/beneficiaries/bulk/store",
    beneficiaryBulkStore,
);

// Senders
teamAuthedRouter.get(
    "/remitters/get-form-fields",
    ...senderFormFieldsQueryValidator,
    checkValidationErrors,
    senderGetFormFields,
);
teamAuthedRouter.get(
    "/remitters/list",
    ...senderListQueryValidator,
    checkValidationErrors,
    senderIndex,
);
teamAuthedRouter.post("/remitters/store", senderStore);
teamAuthedRouter.post(
    "/remitters/update",
    ...senderUpdateBodyValidator,
    checkValidationErrors,
    senderUpdate,
);
teamAuthedRouter.get(
    "/remitters/show",
    ...senderShowQueryValidator,
    checkValidationErrors,
    senderShow,
);
teamAuthedRouter.delete(
    "/remitters/delete",
    ...senderShowQueryValidator,
    checkValidationErrors,
    senderDestroy,
);
teamAuthedRouter.get("/remitters/bulk/template", senderBulkTemplate);
teamAuthedRouter.post(
    "/remitters/bulk/store",
    senderBulkStore,
);

// Quotes
teamAuthedRouter.post(
    "/quotes/store",
    ...quoteStoreValidator,
    checkValidationErrors,
    quoteStoreCrossFieldRules,
    makeQuoteStore(QUOTE_MODE_QUOTATION),
);
teamAuthedRouter.get(
    "/quotes/exchange-rate",
    ...quoteStoreValidator,
    checkValidationErrors,
    quoteStoreCrossFieldRules,
    makeQuoteStore(QUOTE_MODE_RATE),
);

// Beneficiary transactions (the maker/checker dance)
teamAuthedRouter.get(
    "/beneficiary-transactions/list",
    ...transactionListQueryValidator,
    checkValidationErrors,
    transactionIndex,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/store",
    makerAccess,
    idempotency(),
    strictBody(TRANSACTION_STORE_ALLOWED_KEYS),
    ...transactionStoreBodyValidator,
    checkValidationErrors,
    transactionStore,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/show",
    ...transactionShowQueryValidator,
    checkValidationErrors,
    transactionShow,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/check_transaction_status",
    ...transactionShowQueryValidator,
    checkValidationErrors,
    checkTransactionStatus,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/update-status",
    checkerAccess,
    idempotency(),
    strictBody(TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS),
    ...transactionUpdateStatusBodyValidator,
    checkValidationErrors,
    transactionUpdateStatus,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/cancel",
    idempotency(),
    strictBody(TRANSACTION_CANCEL_ALLOWED_KEYS),
    ...transactionCancelBodyValidator,
    checkValidationErrors,
    transactionCancel,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/get-form-fields",
    ...payoutFormFieldsQueryValidator,
    checkValidationErrors,
    transactionGetFormFields,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/direct",
    idempotency(),
    strictBody(DIRECT_ALLOWED_KEYS),
    ...sendMoneyDirectBodyValidator,
    checkValidationErrors,
    transactionDirect,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/export",
    ...transactionShowQueryValidator,
    checkValidationErrors,
    transactionExportReceipt,
);
// No validator — mirror of the legacy team mount.
teamAuthedRouter.get(
    "/beneficiary-transactions/download",
    transactionDownloadList,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/transaction-form-fields",
    transactionFormFields,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/request-proof",
    strictBody(PROOF_REQUEST_ALLOWED_KEYS),
    ...proofRequestBodyValidator,
    checkValidationErrors,
    requestProof,
);
teamAuthedRouter.get(
    "/beneficiary-transactions/get-proof",
    ...proofGetQueryValidator,
    checkValidationErrors,
    getProof,
);
// Bulk payout template/store — no maker gate (mirror of the legacy
// team routes, which wrap only authTeam around these two).
teamAuthedRouter.get(
    "/beneficiary-transactions/bulk/template",
    transactionPayoutTemplate,
);
teamAuthedRouter.post(
    "/beneficiary-transactions/bulk/store",
    transactionBulkStore,
);

// Ledgers
teamAuthedRouter.get(
    "/ledgers/list",
    ...ledgerListQueryValidator,
    checkValidationErrors,
    ledgerIndex,
);
teamAuthedRouter.get(
    "/ledgers/show",
    ...ledgerShowQueryValidator,
    checkValidationErrors,
    ledgerShow,
);
teamAuthedRouter.get(
    "/ledgers/export",
    ...ledgerListQueryValidator,
    checkValidationErrors,
    ledgerExport,
);

// Statements
teamAuthedRouter.get(
    "/statement/export",
    ...statementExportQueryValidator,
    checkValidationErrors,
    exportStatement,
);

// Authenticated lookups
teamAuthedRouter.get(
    "/lookups/receiving_countries",
    ...receivingCountriesQueryValidator,
    checkValidationErrors,
    receivingCountries,
);
teamAuthedRouter.get("/lookups/get-rates", getRates);
teamAuthedRouter.post(
    "/lookups/refresh-rates",
    ...refreshRatesBodyValidator,
    checkValidationErrors,
    refreshRates,
);
teamAuthedRouter.get(
    "/lookups/banks",
    ...banksQueryValidator,
    checkValidationErrors,
    banks,
);

// Dashboard
teamAuthedRouter.get(
    "/dashboard/statistics",
    ...dashboardStatisticsQueryValidator,
    checkValidationErrors,
    teamStatistics,
);
teamAuthedRouter.get(
    "/dashboard/charts-data",
    ...dashboardChartsDataQueryValidator,
    checkValidationErrors,
    teamChartsData,
);

// Wallets
teamAuthedRouter.get(
    "/wallets/list",
    ...walletListQueryValidator,
    checkValidationErrors,
    walletIndex,
);
teamAuthedRouter.get(
    "/wallets/show",
    ...walletShowQueryValidator,
    checkValidationErrors,
    walletShow,
);
teamAuthedRouter.post(
    "/wallets/convert",
    ownerAccess,
    idempotency(),
    strictBody(WALLET_CONVERT_ALLOWED_KEYS),
    ...walletConvertBodyValidator,
    checkValidationErrors,
    walletConvert,
);
teamAuthedRouter.get(
    "/wallets/transactions/list",
    ...walletTransactionsQueryValidator,
    checkValidationErrors,
    walletTransactions,
);
teamAuthedRouter.get(
    "/wallets/transactions/show",
    ...walletTransactionShowQueryValidator,
    checkValidationErrors,
    walletShowTransaction,
);
