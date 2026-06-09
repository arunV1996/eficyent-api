import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { idempotency } from "../middleware/idempotency";
import { validate } from "../middleware/validateRequest";
import {
  authTeam,
  checkerAccess,
  makerAccess,
  ownerAccess,
  teamPasswordResetGate,
} from "../middleware/teamAuth";

// Team-specific controllers (Phase 7).
import { teamLoginController } from "../controllers/team/teamLoginController";
import { teamForgotPasswordController } from "../controllers/team/teamForgotPasswordController";
import { teamProfileController } from "../controllers/team/teamProfileController";
import { teamMemberCrudController } from "../controllers/team/teamMemberController";

// Shared controllers (Phases 2-6) - same handlers, gated behind authTeam.
import { lookupsController } from "../controllers/lookups/lookupsController";
import { virtualAccountsController } from "../controllers/virtualAccounts/virtualAccountsController";
import { beneficiaryAccountsController } from "../controllers/beneficiaryAccounts/beneficiaryAccountsController";
import { senderController } from "../controllers/senders/senderController";
import { quotesController } from "../controllers/quotes/quotesController";
import { walletController } from "../controllers/wallets/walletController";
import { depositController } from "../controllers/deposits/depositController";
import { ledgerController } from "../controllers/ledgers/ledgerController";
import { payoutController } from "../controllers/payout/payoutController";
import { teamDashboardController } from "../controllers/team/teamDashboardController";
import {
  ChartsDataQuerySchema,
  StatisticsQuerySchema,
} from "../validators/dashboard/dashboardValidators";

// Shared validators.
import {
  TeamChangePasswordSchema,
  TeamForgotPasswordSchema,
  TeamLoginSchema,
  TeamResetPasswordSchema,
  TeamVerifyCodeSchema,
  ForceResetPasswordSchema,
} from "../validators/team/teamAuthValidators";
import {
  TeamMemberCreateSchema,
  TeamMemberListSchema,
  TeamMemberShowSchema,
  TeamMemberUpdateSchema,
} from "../validators/team/teamMemberCrudValidators";
import {
  DepositLookupQuerySchema,
  GetBanksQuerySchema,
  ReceivingCountriesQuerySchema,
  RefreshRateBodySchema,
  StatesQuerySchema,
} from "../validators/lookups/lookupsValidators";
import {
  ActivateSchema,
  VirtualAccountIdSchema,
  VirtualAccountListSchema,
} from "../validators/virtualAccounts/virtualAccountValidators";
import {
  BeneficiaryListQuerySchema,
  BeneficiaryShowSchema,
  FormFieldsQuerySchema,
} from "../validators/beneficiaryAccounts/beneficiaryAccountValidators";
import {
  SenderFormFieldsQuerySchema,
  SenderListQuerySchema,
  SenderShowQuerySchema,
} from "../validators/senders/senderValidators";
import { QuoteStoreSchema } from "../validators/quotes/quoteValidators";
import {
  ConvertSchema,
  WalletListQuerySchema,
  WalletShowSchema,
  WalletTransactionShowSchema,
  WalletTransactionsQuerySchema,
} from "../validators/wallets/walletValidators";
import {
  DepositCreateSchema,
  DepositListQuerySchema,
  DepositQuoteSchema,
  DepositShowSchema,
} from "../validators/deposits/depositValidators";
import {
  LedgerListSchema,
  LedgerShowSchema,
} from "../validators/ledgers/ledgerValidators";
import {
  GetFormFieldsSchema,
  PayoutCancelSchema,
  PayoutListQuerySchema,
  PayoutShowSchema,
  PayoutStoreSchema,
  PayoutUpdateStatusSchema,
  SendMoneyDirectSchema,
  TransactionProofGetSchema,
  TransactionProofRequestSchema,
} from "../validators/payout/payoutValidators";

import {
  QUOTE_MODE_QUOTATION,
  QUOTE_MODE_RATE,
} from "../helpers/constants";

/**
 * Mirror of routes/team_members.php.
 *
 * All authenticated team-side endpoints share the same middleware stack:
 *   authTeam -> teamPasswordResetGate
 *
 * Every read/list endpoint uses the shared user-side controllers; the team
 * auth middleware sets req.user = teamMember.user, so the controllers run
 * unchanged. CORPORATE-role data scoping (filter by team_member_id) is
 * applied through req.teamMember in the underlying services as the
 * relevant Phase 6 / Phase 5 endpoints are extended in follow-up sessions.
 *
 * Money-moving endpoints use idempotency() + a maker/checker permission
 * gate where Laravel did. The Owner-only TeamMember CRUD group is gated
 * by ownerAccess.
 */

export async function teamPublicRoutes(): Promise<Router> {
  const r = Router();

  // /corporate/login
  r.post(
    "/corporate/login",
    validate({ body: TeamLoginSchema }),
    asyncHandler(teamLoginController.corporateLogin),
  );

  // /team/login
  r.post(
    "/team/login",
    validate({ body: TeamLoginSchema }),
    asyncHandler(teamLoginController.login),
  );

  // /team/force-reset-password (no auth - first-login only)
  r.post(
    "/team/force-reset-password",
    validate({ body: ForceResetPasswordSchema }),
    asyncHandler(teamForgotPasswordController.forceResetPassword),
  );

  // /team/get_settings (public)
  r.get("/team/get_settings", asyncHandler(teamProfileController.getAppSettings));

  // /team/lookups/* public
  r.get(
    "/team/lookups/mobile_country_codes",
    asyncHandler(lookupsController.mobileCountryCodes),
  );
  r.get("/team/lookups/countries", asyncHandler(lookupsController.countries));
  r.get(
    "/team/lookups/states",
    validate({ query: StatesQuerySchema }),
    asyncHandler(lookupsController.states),
  );
  r.get("/team/lookups/payment_rails", lookupsController.paymentRails);
  r.get(
    "/team/lookups/deposit_lookups",
    validate({ query: DepositLookupQuerySchema }),
    lookupsController.depositLookups,
  );
  r.get(
    "/team/lookups/deposit_wallets",
    asyncHandler(lookupsController.depositWallets),
  );

  // /team/forgot-password/*
  r.post(
    "/team/forgot-password/send-reset-link",
    validate({ body: TeamForgotPasswordSchema }),
    asyncHandler(teamForgotPasswordController.sendResetLink),
  );
  r.post(
    "/team/forgot-password/verify-code",
    validate({ body: TeamVerifyCodeSchema }),
    asyncHandler(teamForgotPasswordController.verifyCode),
  );
  r.post(
    "/team/forgot-password/reset-password",
    validate({ body: TeamResetPasswordSchema }),
    asyncHandler(teamForgotPasswordController.resetPassword),
  );

  return r;
}

export async function teamAuthedRoutes(): Promise<Router> {
  const r = Router();

  // /team/get-credentials sits in front of the password-reset gate (the
  // Laravel route puts it inside `auth:team` + `passwordReset` group).
  r.get(
    "/get-credentials",
    asyncHandler(authTeam),
    teamPasswordResetGate,
    asyncHandler(teamProfileController.getCredentials),
  );

  // From here on every route requires authTeam + passwordReset.
  r.use(asyncHandler(authTeam), teamPasswordResetGate);

  // ----- Profile + auth -----
  r.post("/logout", asyncHandler(teamLoginController.logout));
  r.get("/profile", asyncHandler(teamProfileController.profile));
  r.post(
    "/change-password",
    validate({ body: TeamChangePasswordSchema }),
    asyncHandler(teamProfileController.changePassword),
  );

  // ----- Virtual accounts -----
  r.get(
    "/accounts/list",
    validate({ query: VirtualAccountListSchema }),
    asyncHandler(virtualAccountsController.index),
  );
  r.get(
    "/accounts/show",
    validate({ query: VirtualAccountIdSchema }),
    asyncHandler(virtualAccountsController.show),
  );
  r.get(
    "/accounts/get_account_balance",
    validate({ query: VirtualAccountIdSchema }),
    asyncHandler(virtualAccountsController.getBalance),
  );
  r.post(
    "/accounts/activate",
    validate({ body: ActivateSchema }),
    asyncHandler(virtualAccountsController.activate),
  );
  r.get(
    "/accounts/get_virtual_Accounts",
    asyncHandler(virtualAccountsController.getVirtualAccounts),
  );

  // ----- Deposits -----
  r.get(
    "/deposits/list",
    validate({ query: DepositListQuerySchema }),
    asyncHandler(depositController.index),
  );
  r.get(
    "/deposits/quote",
    validate({ query: DepositQuoteSchema }),
    asyncHandler(depositController.quote),
  );
  r.post(
    "/deposits/store",
    idempotency(),
    validate({ body: DepositCreateSchema }),
    asyncHandler(depositController.store),
  );
  r.get(
    "/deposits/show",
    validate({ query: DepositShowSchema }),
    asyncHandler(depositController.show),
  );
  r.get("/deposits/export", depositController.export);

  // ----- Beneficiary accounts -----
  r.get(
    "/beneficiaries/get-form-fields",
    validate({ query: FormFieldsQuerySchema }),
    asyncHandler(beneficiaryAccountsController.getFormFields),
  );
  r.get(
    "/beneficiaries/list",
    validate({ query: BeneficiaryListQuerySchema }),
    asyncHandler(beneficiaryAccountsController.index),
  );
  r.post("/beneficiaries/store", asyncHandler(beneficiaryAccountsController.store));
  r.get(
    "/beneficiaries/show",
    validate({ query: BeneficiaryShowSchema }),
    asyncHandler(beneficiaryAccountsController.show),
  );
  r.delete(
    "/beneficiaries/delete",
    validate({ query: BeneficiaryShowSchema }),
    asyncHandler(beneficiaryAccountsController.destroy),
  );
  r.get("/beneficiaries/bulk/template", asyncHandler(beneficiaryAccountsController.bulkTemplate));
  r.post("/beneficiaries/bulk/store", asyncHandler(beneficiaryAccountsController.bulkStore));

  // ----- Senders -----
  r.get(
    "/remitters/get-form-fields",
    validate({ query: SenderFormFieldsQuerySchema }),
    asyncHandler(senderController.getFormFields),
  );
  r.get(
    "/remitters/list",
    validate({ query: SenderListQuerySchema }),
    asyncHandler(senderController.index),
  );
  r.post("/remitters/store", asyncHandler(senderController.store));
  r.post("/remitters/update", asyncHandler(senderController.update));
  r.get(
    "/remitters/show",
    validate({ query: SenderShowQuerySchema }),
    asyncHandler(senderController.show),
  );
  r.delete(
    "/remitters/delete",
    validate({ query: SenderShowQuerySchema }),
    asyncHandler(senderController.destroy),
  );
  r.get("/remitters/bulk/template", asyncHandler(senderController.bulkTemplate));
  r.post("/remitters/bulk/store", asyncHandler(senderController.bulkStore));

  // ----- Quotes -----
  r.post(
    "/quotes/store",
    validate({ body: QuoteStoreSchema }),
    asyncHandler(quotesController(QUOTE_MODE_QUOTATION).store),
  );
  r.get(
    "/quotes/exchange-rate",
    validate({ query: QuoteStoreSchema }),
    asyncHandler(quotesController(QUOTE_MODE_RATE).store),
  );

  // ----- Beneficiary transactions (the maker/checker dance) -----
  r.get(
    "/beneficiary-transactions/list",
    validate({ query: PayoutListQuerySchema }),
    asyncHandler(payoutController.index),
  );
  r.post(
    "/beneficiary-transactions/store",
    makerAccess,
    idempotency(),
    validate({ body: PayoutStoreSchema }),
    asyncHandler(payoutController.store),
  );
  r.get(
    "/beneficiary-transactions/show",
    validate({ query: PayoutShowSchema }),
    asyncHandler(payoutController.show),
  );
  r.get(
    "/beneficiary-transactions/check_transaction_status",
    validate({ query: PayoutShowSchema }),
    asyncHandler(payoutController.checkTransactionStatus),
  );
  r.post(
    "/beneficiary-transactions/update-status",
    checkerAccess,
    idempotency(),
    validate({ body: PayoutUpdateStatusSchema }),
    asyncHandler(payoutController.updateStatus),
  );
  r.post(
    "/beneficiary-transactions/cancel",
    idempotency(),
    validate({ body: PayoutCancelSchema }),
    asyncHandler(payoutController.cancel),
  );
  r.get(
    "/beneficiary-transactions/export",
    validate({ query: PayoutShowSchema }),
    payoutController.export,
  );
  r.get(
    "/beneficiary-transactions/get-form-fields",
    validate({ query: GetFormFieldsSchema }),
    asyncHandler(payoutController.getFormFields),
  );
  r.post(
    "/beneficiary-transactions/direct",
    idempotency(),
    validate({ body: SendMoneyDirectSchema }),
    asyncHandler(payoutController.direct),
  );
  r.get(
    "/beneficiary-transactions/download",
    payoutController.downloadList,
  );
  r.get(
    "/beneficiary-transactions/bulk/template",
    asyncHandler(payoutController.payoutTemplate),
  );
  r.post(
    "/beneficiary-transactions/bulk/store",
    asyncHandler(payoutController.bulkStore),
  );
  r.get(
    "/beneficiary-transactions/transaction-form-fields",
    asyncHandler(payoutController.transactionFormFields),
  );
  r.post(
    "/beneficiary-transactions/request-proof",
    validate({ body: TransactionProofRequestSchema }),
    asyncHandler(payoutController.requestProof),
  );
  r.get(
    "/beneficiary-transactions/get-proof",
    validate({ query: TransactionProofGetSchema }),
    asyncHandler(payoutController.getProof),
  );

  // ----- TeamMembers (Owner-only CRUD) -----
  r.get(
    "/team-members/list",
    ownerAccess,
    validate({ query: TeamMemberListSchema }),
    asyncHandler(teamMemberCrudController.index),
  );
  r.post(
    "/team-members/create",
    ownerAccess,
    validate({ body: TeamMemberCreateSchema }),
    asyncHandler(teamMemberCrudController.store),
  );
  r.get(
    "/team-members/show",
    ownerAccess,
    validate({ query: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.show),
  );
  r.post(
    "/team-members/update",
    ownerAccess,
    validate({ body: TeamMemberUpdateSchema }),
    asyncHandler(teamMemberCrudController.update),
  );
  r.post(
    "/team-members/update-status",
    ownerAccess,
    validate({ body: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.updateStatus),
  );
  r.delete(
    "/team-members/delete",
    ownerAccess,
    validate({ query: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.destroy),
  );

  // ----- Ledgers -----
  r.get(
    "/ledgers/list",
    validate({ query: LedgerListSchema }),
    asyncHandler(ledgerController.index),
  );
  r.get(
    "/ledgers/show",
    validate({ query: LedgerShowSchema }),
    asyncHandler(ledgerController.show),
  );
  r.get(
    "/ledgers/export",
    validate({ query: LedgerListSchema }),
    ledgerController.export,
  );

  // ----- Authenticated lookups -----
  r.get(
    "/lookups/receiving_countries",
    validate({ query: ReceivingCountriesQuerySchema }),
    asyncHandler(lookupsController.receivingCountries),
  );
  r.get("/lookups/get-rates", asyncHandler(lookupsController.getRates));
  r.post(
    "/lookups/refresh-rates",
    validate({ body: RefreshRateBodySchema }),
    asyncHandler(lookupsController.refreshRates),
  );
  // Authenticated lookups that the user-side mounts but team-side route
  // file does not actually expose (banks / receiving_currencies). Keep
  // the surface consistent with the user namespace by providing them.
  r.get(
    "/lookups/banks",
    validate({ query: GetBanksQuerySchema }),
    asyncHandler(lookupsController.banks),
  );

  // ----- Dashboard (Phase 10) -----
  r.get(
    "/dashboard/statistics",
    validate({ query: StatisticsQuerySchema }),
    asyncHandler(teamDashboardController.statistics),
  );
  r.get(
    "/dashboard/charts-data",
    validate({ query: ChartsDataQuerySchema }),
    asyncHandler(teamDashboardController.chartsData),
  );

  // ----- Wallets -----
  r.get(
    "/wallets/list",
    validate({ query: WalletListQuerySchema }),
    asyncHandler(walletController.index),
  );
  r.get(
    "/wallets/show",
    validate({ query: WalletShowSchema }),
    asyncHandler(walletController.show),
  );
  r.post(
    "/wallets/convert",
    ownerAccess,
    idempotency(),
    validate({ body: ConvertSchema }),
    asyncHandler(walletController.convert),
  );
  r.get(
    "/wallets/transactions/list",
    validate({ query: WalletTransactionsQuerySchema }),
    asyncHandler(walletController.transactions),
  );
  r.get(
    "/wallets/transactions/show",
    validate({ query: WalletTransactionShowSchema }),
    asyncHandler(walletController.showTransaction),
  );

  return r;
}
