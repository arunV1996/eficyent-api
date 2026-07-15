import { Router } from "express";
import authRoutes from "./auth.route";
import beneficiaryAccountRoutes from "./beneficiary_account.route";
import beneficiaryTransactionRoutes from "./beneficiary_transaction.route";
import dashboardRoutes from "./dashboard.route";
import depositRoutes from "./deposit.route";
import ledgerRoutes from "./ledger.route";
import lookupRoutes from "./lookup.route";
import onboardingRoutes from "./onboarding.route";
import profileRoutes from "./profile.route";
import { publicRouter, userPublicRouter } from "./public.route";
import quoteRoutes from "./quote.route";
import senderRoutes from "./sender.route";
import settingRoutes from "./setting.route";
import statementRoutes from "./statement.route";
import staticPageRoutes from "./static_page.route";
import subuserRoutes from "./subuser.route";
import { teamAuthedRouter, teamPublicRouter } from "./team.route";
import teamMemberRoutes from "./team_member.route";
import virtualAccountRoutes from "./virtual_account.route";
import walletRoutes from "./wallet.route";
import webhookRoutes from "./webhook.route";

const router = Router();

// Path prefix `/user` matches the legacy /node routes/api.php grouping.
// Multiple sub-routers can share this prefix — Express walks them in order.
router.use("/user", authRoutes);
router.use("/user", settingRoutes);
router.use("/user/static-pages", staticPageRoutes);
router.use("/user/subusers", subuserRoutes);
router.use("/user", profileRoutes);
router.use("/user/lookups", lookupRoutes);
router.use("/user/onboarding", onboardingRoutes);
router.use("/user/beneficiaries", beneficiaryAccountRoutes);
router.use("/user/accounts", virtualAccountRoutes);
router.use("/user/remitters", senderRoutes);
router.use("/user/beneficiary-transactions", beneficiaryTransactionRoutes);
router.use("/user/quotes", quoteRoutes);
router.use("/user/wallets", walletRoutes);
router.use("/user/deposits", depositRoutes);
router.use("/user/ledgers", ledgerRoutes);
router.use("/user/dashboard", dashboardRoutes);
router.use("/user/statement", statementRoutes);
router.use("/user/team-members", teamMemberRoutes);
router.use("/", teamPublicRouter);
router.use("/team", teamAuthedRouter);
router.use("/user", userPublicRouter);
router.use("/public", publicRouter);
// Inbound provider webhooks live at the API root (flat paths already
// registered with the providers' dashboards) — mirror of the legacy
// `r.use("/", webhookRoutes())` mount.
router.use("/", webhookRoutes);

export default router;
