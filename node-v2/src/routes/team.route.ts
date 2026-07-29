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
    exportMultipleReceipts as transactionExportMultiple,
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
import {
    QUOTE_MODE_QUOTATION,
    QUOTE_MODE_RATE,
} from "../utils/constants";
import { teamApiRoutes, teamAuthApiRoutes } from "../utils/api.routes";

/**
 * Mirror of routes/team_members.php: team auth + profile + Owner-only
 * TeamMember CRUD, plus the shared business mounts that reuse the user
 * controllers (authTeam sets req.user to the parent business user;
 * req.teamMember drives the corporate scoping and the maker/checker
 * gates). Every path + middleware chain now lives in api.routes.ts
 * (teamAuthApiRoutes for the public routes, teamApiRoutes for the
 * authenticated ones); this file only binds the HTTP verb + handler.
 */

// Mounted at "/" — paths carry their own /corporate + /team prefixes.
export const teamPublicRouter = Router();

teamPublicRouter.post(
    teamAuthApiRoutes.CORPORATE_LOGIN.path,
    ...teamAuthApiRoutes.CORPORATE_LOGIN.middleware,
    corporateLogin,
);
teamPublicRouter.post(
    teamAuthApiRoutes.TEAM_LOGIN.path,
    ...teamAuthApiRoutes.TEAM_LOGIN.middleware,
    login,
);
teamPublicRouter.post(
    teamAuthApiRoutes.FORCE_RESET_PASSWORD.path,
    ...teamAuthApiRoutes.FORCE_RESET_PASSWORD.middleware,
    forceResetPassword,
);

teamPublicRouter.get(
    teamAuthApiRoutes.GET_SETTINGS.path,
    ...teamAuthApiRoutes.GET_SETTINGS.middleware,
    getAppSettings,
);

teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_MOBILE_COUNTRY_CODES.path,
    ...teamAuthApiRoutes.LOOKUP_MOBILE_COUNTRY_CODES.middleware,
    mobileCountryCodes,
);
teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_COUNTRIES.path,
    ...teamAuthApiRoutes.LOOKUP_COUNTRIES.middleware,
    countries,
);
teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_STATES.path,
    ...teamAuthApiRoutes.LOOKUP_STATES.middleware,
    states,
);
teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_PAYMENT_RAILS.path,
    ...teamAuthApiRoutes.LOOKUP_PAYMENT_RAILS.middleware,
    paymentRails,
);
teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_DEPOSIT_LOOKUPS.path,
    ...teamAuthApiRoutes.LOOKUP_DEPOSIT_LOOKUPS.middleware,
    depositLookups,
);
teamPublicRouter.get(
    teamAuthApiRoutes.LOOKUP_DEPOSIT_WALLETS.path,
    ...teamAuthApiRoutes.LOOKUP_DEPOSIT_WALLETS.middleware,
    depositWallets,
);

teamPublicRouter.post(
    teamAuthApiRoutes.FORGOT_SEND_RESET_LINK.path,
    ...teamAuthApiRoutes.FORGOT_SEND_RESET_LINK.middleware,
    sendResetLink,
);
teamPublicRouter.post(
    teamAuthApiRoutes.FORGOT_VERIFY_CODE.path,
    ...teamAuthApiRoutes.FORGOT_VERIFY_CODE.middleware,
    verifyCode,
);
teamPublicRouter.post(
    teamAuthApiRoutes.FORGOT_RESET_PASSWORD.path,
    ...teamAuthApiRoutes.FORGOT_RESET_PASSWORD.middleware,
    resetPassword,
);

// Mounted at "/team" — every route carries the shared team auth stack in
// its middleware chain; get-credentials stays registered first, matching
// the Laravel grouping where it sits in front of the password-reset gate.
export const teamAuthedRouter = Router();

teamAuthedRouter.get(
    teamApiRoutes.GET_CREDENTIALS.path,
    ...teamApiRoutes.GET_CREDENTIALS.middleware,
    getCredentials,
);

teamAuthedRouter.post(
    teamApiRoutes.LOGOUT.path,
    ...teamApiRoutes.LOGOUT.middleware,
    logout,
);
teamAuthedRouter.get(
    teamApiRoutes.PROFILE.path,
    ...teamApiRoutes.PROFILE.middleware,
    profile,
);
teamAuthedRouter.post(
    teamApiRoutes.CHANGE_PASSWORD.path,
    ...teamApiRoutes.CHANGE_PASSWORD.middleware,
    changePassword,
);

// Owner-only TeamMember CRUD.
teamAuthedRouter.get(
    teamApiRoutes.TEAM_MEMBERS_LIST.path,
    ...teamApiRoutes.TEAM_MEMBERS_LIST.middleware,
    teamMemberIndex,
);
teamAuthedRouter.post(
    teamApiRoutes.TEAM_MEMBERS_CREATE.path,
    ...teamApiRoutes.TEAM_MEMBERS_CREATE.middleware,
    teamMemberStore,
);
teamAuthedRouter.get(
    teamApiRoutes.TEAM_MEMBERS_SHOW.path,
    ...teamApiRoutes.TEAM_MEMBERS_SHOW.middleware,
    teamMemberShow,
);
teamAuthedRouter.post(
    teamApiRoutes.TEAM_MEMBERS_UPDATE.path,
    ...teamApiRoutes.TEAM_MEMBERS_UPDATE.middleware,
    teamMemberUpdate,
);
teamAuthedRouter.post(
    teamApiRoutes.TEAM_MEMBERS_UPDATE_STATUS.path,
    ...teamApiRoutes.TEAM_MEMBERS_UPDATE_STATUS.middleware,
    teamMemberUpdateStatus,
);
teamAuthedRouter.delete(
    teamApiRoutes.TEAM_MEMBERS_DELETE.path,
    ...teamApiRoutes.TEAM_MEMBERS_DELETE.middleware,
    teamMemberDestroy,
);

// ----- Shared business mounts (reuse the user controllers; authTeam
// sets req.user to the parent business user and req.teamMember drives
// the corporate scoping inside them). -----

// Virtual accounts
teamAuthedRouter.get(
    teamApiRoutes.ACCOUNTS_LIST.path,
    ...teamApiRoutes.ACCOUNTS_LIST.middleware,
    virtualAccountIndex,
);
teamAuthedRouter.get(
    teamApiRoutes.ACCOUNTS_SHOW.path,
    ...teamApiRoutes.ACCOUNTS_SHOW.middleware,
    virtualAccountShow,
);
teamAuthedRouter.get(
    teamApiRoutes.ACCOUNTS_GET_BALANCE.path,
    ...teamApiRoutes.ACCOUNTS_GET_BALANCE.middleware,
    virtualAccountGetBalance,
);
teamAuthedRouter.post(
    teamApiRoutes.ACCOUNTS_ACTIVATE.path,
    ...teamApiRoutes.ACCOUNTS_ACTIVATE.middleware,
    virtualAccountActivate,
);
teamAuthedRouter.get(
    teamApiRoutes.ACCOUNTS_GET_VIRTUAL_ACCOUNTS.path,
    ...teamApiRoutes.ACCOUNTS_GET_VIRTUAL_ACCOUNTS.middleware,
    getVirtualAccounts,
);

// Deposits
teamAuthedRouter.get(
    teamApiRoutes.DEPOSITS_LIST.path,
    ...teamApiRoutes.DEPOSITS_LIST.middleware,
    depositIndex,
);
teamAuthedRouter.get(
    teamApiRoutes.DEPOSITS_QUOTE.path,
    ...teamApiRoutes.DEPOSITS_QUOTE.middleware,
    depositQuote,
);
teamAuthedRouter.post(
    teamApiRoutes.DEPOSITS_STORE.path,
    ...teamApiRoutes.DEPOSITS_STORE.middleware,
    depositStore,
);
teamAuthedRouter.get(
    teamApiRoutes.DEPOSITS_SHOW.path,
    ...teamApiRoutes.DEPOSITS_SHOW.middleware,
    depositShow,
);
teamAuthedRouter.get(
    teamApiRoutes.DEPOSITS_EXPORT.path,
    ...teamApiRoutes.DEPOSITS_EXPORT.middleware,
    depositExport,
);

// Beneficiary accounts
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARIES_GET_FORM_FIELDS.path,
    ...teamApiRoutes.BENEFICIARIES_GET_FORM_FIELDS.middleware,
    beneficiaryGetFormFields,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARIES_LIST.path,
    ...teamApiRoutes.BENEFICIARIES_LIST.middleware,
    beneficiaryIndex,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARIES_STORE.path,
    ...teamApiRoutes.BENEFICIARIES_STORE.middleware,
    beneficiaryStore,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARIES_SHOW.path,
    ...teamApiRoutes.BENEFICIARIES_SHOW.middleware,
    beneficiaryShow,
);
teamAuthedRouter.delete(
    teamApiRoutes.BENEFICIARIES_DELETE.path,
    ...teamApiRoutes.BENEFICIARIES_DELETE.middleware,
    beneficiaryDestroy,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARIES_BULK_TEMPLATE.path,
    ...teamApiRoutes.BENEFICIARIES_BULK_TEMPLATE.middleware,
    beneficiaryBulkTemplate,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARIES_BULK_STORE.path,
    ...teamApiRoutes.BENEFICIARIES_BULK_STORE.middleware,
    beneficiaryBulkStore,
);

// Senders (remitters)
teamAuthedRouter.get(
    teamApiRoutes.REMITTERS_GET_FORM_FIELDS.path,
    ...teamApiRoutes.REMITTERS_GET_FORM_FIELDS.middleware,
    senderGetFormFields,
);
teamAuthedRouter.get(
    teamApiRoutes.REMITTERS_LIST.path,
    ...teamApiRoutes.REMITTERS_LIST.middleware,
    senderIndex,
);
teamAuthedRouter.post(
    teamApiRoutes.REMITTERS_STORE.path,
    ...teamApiRoutes.REMITTERS_STORE.middleware,
    senderStore,
);
teamAuthedRouter.post(
    teamApiRoutes.REMITTERS_UPDATE.path,
    ...teamApiRoutes.REMITTERS_UPDATE.middleware,
    senderUpdate,
);
teamAuthedRouter.get(
    teamApiRoutes.REMITTERS_SHOW.path,
    ...teamApiRoutes.REMITTERS_SHOW.middleware,
    senderShow,
);
teamAuthedRouter.delete(
    teamApiRoutes.REMITTERS_DELETE.path,
    ...teamApiRoutes.REMITTERS_DELETE.middleware,
    senderDestroy,
);
teamAuthedRouter.get(
    teamApiRoutes.REMITTERS_BULK_TEMPLATE.path,
    ...teamApiRoutes.REMITTERS_BULK_TEMPLATE.middleware,
    senderBulkTemplate,
);
teamAuthedRouter.post(
    teamApiRoutes.REMITTERS_BULK_STORE.path,
    ...teamApiRoutes.REMITTERS_BULK_STORE.middleware,
    senderBulkStore,
);

// Quotes
teamAuthedRouter.post(
    teamApiRoutes.QUOTES_STORE.path,
    ...teamApiRoutes.QUOTES_STORE.middleware,
    makeQuoteStore(QUOTE_MODE_QUOTATION),
);
teamAuthedRouter.get(
    teamApiRoutes.QUOTES_EXCHANGE_RATE.path,
    ...teamApiRoutes.QUOTES_EXCHANGE_RATE.middleware,
    makeQuoteStore(QUOTE_MODE_RATE),
);

// Beneficiary transactions (the maker/checker dance)
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_LIST.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_LIST.middleware,
    transactionIndex,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_STORE.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_STORE.middleware,
    transactionStore,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_SHOW.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_SHOW.middleware,
    transactionShow,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_CHECK_TRANSACTION_STATUS.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_CHECK_TRANSACTION_STATUS.middleware,
    checkTransactionStatus,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_UPDATE_STATUS.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_UPDATE_STATUS.middleware,
    transactionUpdateStatus,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_CANCEL.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_CANCEL.middleware,
    transactionCancel,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_GET_FORM_FIELDS.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_GET_FORM_FIELDS.middleware,
    transactionGetFormFields,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_DIRECT.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_DIRECT.middleware,
    transactionDirect,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_EXPORT.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_EXPORT.middleware,
    transactionExportReceipt,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_EXPORT_MULTIPLE.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_EXPORT_MULTIPLE.middleware,
    transactionExportMultiple,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_DOWNLOAD.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_DOWNLOAD.middleware,
    transactionDownloadList,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_TRANSACTION_FORM_FIELDS.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_TRANSACTION_FORM_FIELDS.middleware,
    transactionFormFields,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_REQUEST_PROOF.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_REQUEST_PROOF.middleware,
    requestProof,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_GET_PROOF.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_GET_PROOF.middleware,
    getProof,
);
teamAuthedRouter.get(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_BULK_TEMPLATE.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_BULK_TEMPLATE.middleware,
    transactionPayoutTemplate,
);
teamAuthedRouter.post(
    teamApiRoutes.BENEFICIARY_TRANSACTIONS_BULK_STORE.path,
    ...teamApiRoutes.BENEFICIARY_TRANSACTIONS_BULK_STORE.middleware,
    transactionBulkStore,
);

// Ledgers
teamAuthedRouter.get(
    teamApiRoutes.LEDGERS_LIST.path,
    ...teamApiRoutes.LEDGERS_LIST.middleware,
    ledgerIndex,
);
teamAuthedRouter.get(
    teamApiRoutes.LEDGERS_SHOW.path,
    ...teamApiRoutes.LEDGERS_SHOW.middleware,
    ledgerShow,
);
teamAuthedRouter.get(
    teamApiRoutes.LEDGERS_EXPORT.path,
    ...teamApiRoutes.LEDGERS_EXPORT.middleware,
    ledgerExport,
);

// Statements
teamAuthedRouter.get(
    teamApiRoutes.STATEMENT_EXPORT.path,
    ...teamApiRoutes.STATEMENT_EXPORT.middleware,
    exportStatement,
);

// Authenticated lookups
teamAuthedRouter.get(
    teamApiRoutes.LOOKUPS_RECEIVING_COUNTRIES.path,
    ...teamApiRoutes.LOOKUPS_RECEIVING_COUNTRIES.middleware,
    receivingCountries,
);
teamAuthedRouter.get(
    teamApiRoutes.LOOKUPS_GET_RATES.path,
    ...teamApiRoutes.LOOKUPS_GET_RATES.middleware,
    getRates,
);
teamAuthedRouter.post(
    teamApiRoutes.LOOKUPS_REFRESH_RATES.path,
    ...teamApiRoutes.LOOKUPS_REFRESH_RATES.middleware,
    refreshRates,
);
teamAuthedRouter.get(
    teamApiRoutes.LOOKUPS_BANKS.path,
    ...teamApiRoutes.LOOKUPS_BANKS.middleware,
    banks,
);

// Dashboard
teamAuthedRouter.get(
    teamApiRoutes.DASHBOARD_STATISTICS.path,
    ...teamApiRoutes.DASHBOARD_STATISTICS.middleware,
    teamStatistics,
);
teamAuthedRouter.get(
    teamApiRoutes.DASHBOARD_CHARTS_DATA.path,
    ...teamApiRoutes.DASHBOARD_CHARTS_DATA.middleware,
    teamChartsData,
);

// Wallets
teamAuthedRouter.get(
    teamApiRoutes.WALLETS_LIST.path,
    ...teamApiRoutes.WALLETS_LIST.middleware,
    walletIndex,
);
teamAuthedRouter.get(
    teamApiRoutes.WALLETS_SHOW.path,
    ...teamApiRoutes.WALLETS_SHOW.middleware,
    walletShow,
);
teamAuthedRouter.post(
    teamApiRoutes.WALLETS_CONVERT.path,
    ...teamApiRoutes.WALLETS_CONVERT.middleware,
    walletConvert,
);
teamAuthedRouter.get(
    teamApiRoutes.WALLETS_TRANSACTIONS_LIST.path,
    ...teamApiRoutes.WALLETS_TRANSACTIONS_LIST.middleware,
    walletTransactions,
);
teamAuthedRouter.get(
    teamApiRoutes.WALLETS_TRANSACTIONS_SHOW.path,
    ...teamApiRoutes.WALLETS_TRANSACTIONS_SHOW.middleware,
    walletShowTransaction,
);
