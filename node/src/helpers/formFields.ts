/**
 * Mirror of Laravel App\\Helpers\\FieldsHelper.
 *
 * The Laravel version is ~1000 lines and pulls in many lookups + merchant
 * settings that depend on later-phase data. We port the *interface* faithfully
 * here, plus the concrete builders the Phase 3 controllers actually call:
 *
 *   - onboardingFormFields(user, step)   - registration / step-2 / step-3
 *   - beneficiaryFormFields(payload, user) - per (country, currency, type)
 *   - documentGroups(userType, countries)  - KYC document groups
 *   - updateProfileFormFields(user, type)  - profile updates (Phase 2 stub)
 *
 * Each field is shaped exactly like the Laravel `make()` output so the
 * frontend renderer is unchanged:
 *   {
 *     field_key, field_label, field_type, is_mandatory, is_editable,
 *     validation, category, values_supported, children, is_repeatable,
 *     field_value, parent_key, required_if_empty_of, required_if
 *   }
 */

import {
  EXTERNAL_TYPE_DIGININE,
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "./constants";
import { lookupsService } from "../services/lookups/lookupsService";
import { prisma } from "../db/prisma";
import { settingGet } from "../services/settings/settingsService";
import { PASSWORD_REGEX } from "./lookups";
import {
  LOOKUP_TYPE_DOCUMENT_TYPES,
  LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS,
  LOOKUP_TYPE_EEC_PAYMENT_PURPOSE,
  LOOKUP_TYPE_ID_TYPE,
  LOOKUP_TYPE_PROFESSION,
  LOOKUP_TYPE_PROOF_OF_ADDRESS,
  LOOKUP_TYPE_SOURCE_OF_FUNDS,
  LOOKUP_TYPE_SOURCE_OF_INCOME,
  LOOKUP_TYPE_ADDRESS_TYPES,
} from "./constants";

export interface FieldDef {
  field_key: string;
  field_label: string;
  field_type:
    | "string"
    | "number"
    | "email"
    | "date"
    | "file"
    | "group";
  is_mandatory: boolean;
  is_editable: boolean;
  validation: Record<string, unknown>;
  category: string;
  values_supported: {
    label: string;
    value: string;
    flag?: string;
    country_name?: string;
    parent_value?: string;
  }[];
  children: FieldDef[];
  is_repeatable: boolean;
  field_value: string | number | null;
  parent_key: string;
  required_if_empty_of: string;
  required_if: string;
}

interface MakeOpts {
  type?: FieldDef["field_type"];
  mandatory?: boolean;
  editable?: boolean;
  validation?: Record<string, unknown>;
  category?: string;
  values?: FieldDef["values_supported"];
  children?: FieldDef[];
  repeatable?: boolean;
  parent_key?: string;
  required_if_empty_of?: string;
  required_if?: string;
}

export function make(key: string, label: string, opts: MakeOpts = {}): FieldDef {
  return {
    field_key: key,
    field_label: label,
    field_type: opts.type ?? "string",
    is_mandatory: opts.mandatory ?? true,
    is_editable: opts.editable ?? true,
    validation: opts.validation ?? {},
    category: opts.category ?? "",
    values_supported: opts.values ?? [],
    children: opts.children ?? [],
    is_repeatable: opts.repeatable ?? false,
    field_value: "",
    parent_key: opts.parent_key ?? "",
    required_if_empty_of: opts.required_if_empty_of ?? "",
    required_if: opts.required_if ?? "",
  };
}

export const VALIDATION_PRESETS = {
  name: {
    min_length: 1,
    max_length: 100,
    regex: "/^(?=.{1,100}$)[A-Za-z]+(?:[ '-]+[A-Za-z]+)*$/",
  },
  business_name: {
    min_length: 2,
    max_length: 100,
    regex: "/^[A-Za-z0-9 .,&()-]{1,100}$/",
  },
  email: {
    min_length: 2,
    max_length: 100,
    regex:
      "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)*\\.[A-Za-z]{2,}$/",
  },
  swift: {
    min_length: 8,
    max_length: 11,
    regex: "/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/",
  },
  routing: { min_length: 9, max_length: 9, regex: "/^[0-9]{9}$/" },
  iban: {
    min_length: 15,
    max_length: 34,
    regex: "/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/",
  },
  text: { min_length: 2, max_length: 100 },
  website: {
    min_length: 2,
    max_length: 100,
    regex: "/^https:\\/\\/[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}.*$/",
  },
  mobile: { min_length: 6, max_length: 50, regex: "/^\\d{6,15}$/" },
  id_number: {
    min_length: 6,
    max_length: 20,
    regex: "/^[A-Za-z0-9]{6,20}$/",
  },
  ifsc: { min_length: 11, max_length: 11, regex: "/^[A-Z]{4}0[A-Z0-9]{6}$/" },
  postal_code: {
    min_length: 4,
    max_length: 10,
    regex: "/^[A-Za-z0-9][A-Za-z0-9\\s-]{3,9}$/",
  },
  bangladesh_account_number: {
    min_length: 10,
    max_length: 17,
    regex: "/^[0-9]{10,17}$/",
  },
  address: {
    min_length: 2,
    max_length: 85,
    regex: "/^[A-Za-z0-9\\s,.\\-\\/()#]{2,85}$/",
  },
  city: {
    min_length: 2,
    max_length: 50,
    regex: "/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/",
  },
  password: {
    min_length: 8,
    max_length: 20,
    regex: PASSWORD_REGEX.toString().slice(1, -1),
  },
  aba: { min_length: 9, max_length: 9, regex: "/^[0-9]{9}$/" },
} as const;

const FILE_VALIDATION = {
  accepted_extensions: ["image/jpeg", "image/png", "image/jpg", "application/pdf"],
  max_file_size: 5 * 1024 * 1024,
} as const;

interface FormBuildContext {
  countries: { label: string; value: string; flag: string }[];
  states: { label: string; value: string; parent_value: string }[];
  mobile_country_codes: {
    label: string;
    value: string;
    country_name: string;
    flag: string;
  }[];
  professions: { label: string; value: string }[];
  business_types: { label: string; value: string }[];
  id_types: { label: string; value: string }[];
  business_verification_types: { label: string; value: string }[];
  address_types: { label: string; value: string }[];
  proof_of_address: { label: string; value: string }[];
  source_of_funds: { label: string; value: string }[];
  purposes_of_transactions: { label: string; value: string }[];
  sources_of_income: { label: string; value: string }[];
  eec_payment_purposes: { label: string; value: string }[];
  document_types: { label: string; value: string }[];
}

async function buildContext(_countryCode?: string): Promise<FormBuildContext> {
  const [
    countries,
    mcc,
    states,
    professions,
    business_types,
    id_types,
    business_verification_types,
    address_types,
    proof_of_address,
    source_of_funds,
    purposes_of_transactions,
    sources_of_income,
    eec_payment_purposes,
    document_types,
  ] = await Promise.all([
    lookupsService.countries().then((rows) =>
      rows.map((r) => ({ label: r.label, value: r.value, flag: r.flag })),
    ),
    lookupsService.mobileCountryCodes().then((rows) =>
      rows.map((r) => ({
        label: r.label,
        value: r.value,
        country_name: r.country_name,
        flag: r.flag,
      })),
    ),
    lookupsService.states().then((rows) =>
      rows.map((r) => ({ label: r.label, value: r.value, parent_value: r.parent_value })),
    ),
    lookupsService.getLookups(LOOKUP_TYPE_PROFESSION),
    lookupsService.businessTypes(),
    lookupsService.getLookups(LOOKUP_TYPE_ID_TYPE),
    lookupsService.businessVerificationTypes(),
    lookupsService.getLookups(LOOKUP_TYPE_ADDRESS_TYPES),
    lookupsService.getLookups(LOOKUP_TYPE_PROOF_OF_ADDRESS),
    lookupsService.getLookups(LOOKUP_TYPE_SOURCE_OF_FUNDS),
    lookupsService.getLookups(LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS),
    lookupsService.getLookups(LOOKUP_TYPE_SOURCE_OF_INCOME),
    lookupsService.getLookups(LOOKUP_TYPE_EEC_PAYMENT_PURPOSE),
    lookupsService.getLookups(LOOKUP_TYPE_DOCUMENT_TYPES),
  ]);
  return {
    countries,
    states,
    mobile_country_codes: mcc,
    professions,
    business_types,
    id_types,
    business_verification_types,
    address_types,
    proof_of_address,
    source_of_funds,
    purposes_of_transactions,
    sources_of_income,
    eec_payment_purposes,
    document_types,
  };
}

function addressFields(prefix: string, ctx: FormBuildContext): FieldDef[] {
  const category =
    prefix === "receiver"
      ? "Address"
      : `${prefix.charAt(0).toUpperCase()}${prefix
          .slice(1)
          .replace(/_/g, " ")} Address`;
  return [
    make(`${prefix}_address_line_1`, `${category} Line 1`, {
      validation: VALIDATION_PRESETS.address,
      category,
    }),
    make(`${prefix}_address_line_2`, `${category} Line 2`, {
      mandatory: false,
      validation: VALIDATION_PRESETS.address,
      category,
    }),
    make(`${prefix}_country`, `${category} Country`, {
      category,
      values: ctx.countries,
    }),
    make(`${prefix}_state`, `${category} State`, {
      category,
      values: ctx.states,
      parent_key: `${prefix}_country`,
    }),
    make(`${prefix}_postal_code`, `${category} Postal Code`, {
      validation: VALIDATION_PRESETS.postal_code,
      category,
    }),
    make(`${prefix}_city`, `${category} City`, {
      validation: VALIDATION_PRESETS.city,
      category,
    }),
  ];
}

function baseIndividualFields(ctx: FormBuildContext): FieldDef[] {
  return [
    make("first_name", "First Name", { validation: VALIDATION_PRESETS.name }),
    make("middle_name", "Middle Name", {
      mandatory: false,
      validation: VALIDATION_PRESETS.name,
    }),
    make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
    make("email", "Email", { validation: VALIDATION_PRESETS.email }),
    make("mobile_country_code", "Mobile Country Code", {
      values: ctx.mobile_country_codes,
    }),
    make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
    ...addressFields("receiver", ctx),
  ];
}

function baseBusinessFields(ctx: FormBuildContext): FieldDef[] {
  return [
    make("business_name", "Business Name", {
      validation: VALIDATION_PRESETS.business_name,
    }),
    make("business_country", "Business Country", {
      values: ctx.countries,
    }),
    make("email", "Email", { validation: VALIDATION_PRESETS.email }),
    make("mobile_country_code", "Mobile Country Code", {
      values: ctx.mobile_country_codes,
    }),
    make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
    ...addressFields("receiver", ctx),
  ];
}

function registrationFormFields(ctx: FormBuildContext): FieldDef[] {
  return [
    make("user_type", "User Type", {
      values: [
        { label: "Individual", value: "Individual" },
        { label: "Business", value: "Business" },
      ],
    }),
    make("email", "Email", { validation: VALIDATION_PRESETS.email }),
    make("password", "Password", {
      validation: VALIDATION_PRESETS.password,
    }),
    make("mobile_country_code", "Mobile Country Code", {
      values: ctx.mobile_country_codes,
    }),
    make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
    make("device_type", "Device Type", {
      mandatory: false,
      values: [
        { label: "Android", value: "Android" },
        { label: "IOS", value: "IOS" },
        { label: "Web", value: "Web" },
      ],
    }),
  ];
}

function individualOnboardingFields(ctx: FormBuildContext): FieldDef[] {
  return [
    make("title", "Title", {
      values: [
        { label: "Mr", value: "Mr" },
        { label: "Mrs", value: "Mrs" },
        { label: "Miss", value: "Miss" },
      ],
    }),
    make("first_name", "First Name", { validation: VALIDATION_PRESETS.name }),
    make("middle_name", "Middle Name", {
      mandatory: false,
      validation: VALIDATION_PRESETS.name,
    }),
    make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
    make("dob", "Date of Birth", {
      type: "date",
      validation: {
        max_date: new Date(Date.now() - 18 * 365 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      },
    }),
    make("gender", "Gender", {
      values: [
        { label: "Male", value: "Male" },
        { label: "Female", value: "Female" },
        { label: "Others", value: "Others" },
      ],
    }),
    make("address_1", "Address Line 1", {
      validation: VALIDATION_PRESETS.address,
    }),
    make("address_2", "Address Line 2", {
      validation: VALIDATION_PRESETS.address,
    }),
    make("country", "Country", { values: ctx.countries }),
    make("state", "State / Province", { values: ctx.states, parent_key: "country" }),
    make("city", "City", { validation: VALIDATION_PRESETS.city }),
    make("postal_code", "Postal Code", {
      validation: VALIDATION_PRESETS.postal_code,
    }),
    make("purpose_of_transactions", "Purpose of Transactions", {
      values: ctx.purposes_of_transactions,
    }),
    make("id_type", "ID Type", { values: ctx.id_types }),
    make("id_number", "ID Number", {
      validation: VALIDATION_PRESETS.id_number,
    }),
    make("profession", "Profession", { values: ctx.professions }),
    make("source_of_income", "Source of Income", { values: ctx.sources_of_income }),
  ];
}

function businessOnboardingFields(ctx: FormBuildContext): FieldDef[] {
  return [
    make("legal_name", "Legal Name", {
      validation: VALIDATION_PRESETS.business_name,
    }),
    make("tax_id", "Tax ID Number", { validation: VALIDATION_PRESETS.id_number }),
    make("country_of_incorporation", "Country  of Incorporation", { values: ctx.countries }),
    make("formation_date", "Formation Date", {
      type: "date",
      validation: {
        max_date: new Date().toISOString().split("T")[0],
      },
    }),
    make("business_name", "Business Name", {
      validation: VALIDATION_PRESETS.business_name,
    }),
    make("type_of_business", "Type of Business", { values: ctx.business_types }),
    make("website", "Website", {
      validation: VALIDATION_PRESETS.website,
    }),
    make("address_1", "Address Line 1", {
      validation: VALIDATION_PRESETS.address,
    }),
    make("address_2", "Address Line 2", {
      validation: VALIDATION_PRESETS.address,
    }),
    make("country", "Country", { values: ctx.countries }),
    make("state", "State / Province", { values: ctx.states, parent_key: "country" }),
    make("city", "City", { validation: VALIDATION_PRESETS.city }),
    make("postal_code", "Postal Code", {
      validation: VALIDATION_PRESETS.postal_code,
    }),
    make("business_verification_type", "Business Verification Type", {
      values: ctx.business_verification_types,
    }),
    make("owners", "Business Owners", {
      type: "group",
      repeatable: true,
      validation: { min_length: 1, max_length: 10 },
      children: [
        make("first_name", "First Name", { validation: VALIDATION_PRESETS.name }),
        make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
        make("dob", "Date of Birth", {
          type: "date",
          validation: {
            max_date: new Date(Date.now() - 18 * 365 * 24 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          },
        }),
        make("id_type", "ID Type", { values: ctx.id_types }),
        make("id_number", "ID Number", { validation: VALIDATION_PRESETS.id_number }),
        make("email", "Email", { validation: VALIDATION_PRESETS.email }),
        make("mobile_country_code", "Mobile Country Code", { values: ctx.mobile_country_codes }),
        make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
        make("profession", "Profession", { values: ctx.professions }),
        make("address_1", "Address Line 1", { validation: VALIDATION_PRESETS.address }),
        make("address_2", "Address Line 2", { mandatory: false, validation: VALIDATION_PRESETS.address }),
        make("country", "Country", { values: ctx.countries }),
        make("state", "State", { values: ctx.states, parent_key: "country" }),
        make("city", "City", { validation: VALIDATION_PRESETS.city }),
        make("postal_code", "Postal Code", { validation: VALIDATION_PRESETS.postal_code }),
      ],
    }),
  ];
}

function documentGroup(
  key: string,
  label: string,
  countries: FormBuildContext["countries"] = [],
  types: { label: string; value: string }[] = [],
): FieldDef {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return make(key, label, {
    type: "group",
    repeatable: false,
    category: label,
    children: [
      ...(types.length > 0
        ? [make("document_type", "Document Type", { values: types })]
        : []),
      ...(countries.length > 0
        ? [
            make("document_country", "Document Issuing Country", {
              values: countries,
            }),
          ]
        : []),
      make("document_file", "Document Front File", {
        type: "file",
        validation: { ...FILE_VALIDATION },
      }),
      make("document_back_file", "Document Back File", {
        type: "file",
        mandatory: false,
        validation: { ...FILE_VALIDATION },
      }),
      make("document_expiry_date", "Document Expiry Date", {
        type: "date",
        mandatory: false,
        validation: { min_date: tomorrow },
      }),
    ],
  });
}

function getDocumentGroups(
  userType: number | bigint,
  ctx: FormBuildContext,
): FieldDef[] {
  const common = [
    documentGroup("proof_of_address", "Proof of Address", ctx.countries, ctx.proof_of_address),
    documentGroup("source_of_funds", "Source of Funds", [], ctx.source_of_funds),
  ];
  if (Number(userType) === USER_TYPE_INDIVIDUAL) {
    return [
      ...common,
      documentGroup("id_document", "Identity Document", ctx.countries, ctx.id_types),
    ];
  }
  if (Number(userType) === USER_TYPE_BUSINESS) {
    return [
      ...common,
      documentGroup("proof_of_ownership", "Proof of Ownership", ctx.countries),
    ];
  }
  return [];
}

/**
 * Mirror of FieldsHelper::onboardingFormFields. Returns the field definitions
 * for a given (user_type, step) combination.
 */
export async function onboardingFormFields(
  userType: number | bigint,
  step: number | bigint,
  countryCode?: string,
): Promise<FieldDef[]> {
  const ctx = await buildContext(countryCode);
  switch (step) {
    case 1:
      return Number(userType) === USER_TYPE_INDIVIDUAL || Number(userType) === USER_TYPE_BUSINESS
        ? registrationFormFields(ctx)
        : [];
    case 2:
      if (Number(userType) === USER_TYPE_INDIVIDUAL) return individualOnboardingFields(ctx);
      if (Number(userType) === USER_TYPE_BUSINESS) return businessOnboardingFields(ctx);
      return [];
    case 3:
      return getDocumentGroups(userType, ctx);
    default:
      return [];
  }
}

/**
 * Mirror of FieldsHelper::onboardingFormFields_new. The Laravel version layers
 * additional fields based on (user, validated) - typically country-of-
 * incorporation overrides. For Phase 3 it's a no-op extension hook so
 * callers can merge if needed.
 */
export async function onboardingFormFieldsNew(
  _userType: number,
  _payload: Record<string, unknown>,
): Promise<FieldDef[]> {
  return [];
}

/**
 * Mirror of FieldsHelper::beneficiary_form_fields. Returns the dynamic
 * payout-target form for (country, currency, type). Cached for 60 minutes
 * because lookups + supported-country rows are read-mostly.
 */
// Cache temporarily disabled — every request fetches fresh data from DB.
// const beneficiaryFormCache = new Map<string, { value: FieldDef[]; expiresAt: number }>();
// const BENEFICIARY_FORM_TTL_MS = 60 * 60 * 1000;

export async function beneficiaryFormFields(payload: {
  country: string;
  currency: string;
  type: number | bigint;
  merchantId?: bigint | null;
}): Promise<FieldDef[]> {
  // const cacheKey = `${payload.country}:${payload.currency}:${payload.type}`;
  // const hit = beneficiaryFormCache.get(cacheKey);
  // if (hit && hit.expiresAt > Date.now()) return hit.value;

  const supportedCountry = await prisma().supportedCountry.findFirst({
    where: { countryCode: payload.country, currency: payload.currency, status: 1 },
  });
  if (!supportedCountry) {
    return [];
  }
  const ctx = await buildContext(payload.country);
  const base =
    Number(payload.type) === USER_TYPE_BUSINESS
      ? baseBusinessFields(ctx)
      : baseIndividualFields(ctx);

  base.push(
    make("account_name", "Account Name", {
      validation: VALIDATION_PRESETS.business_name,
    }),
  );

  const additionalFields = bankFieldsByCountry(
    supportedCountry.countryCode,
    supportedCountry.currency,
    ctx,
  );

  if (supportedCountry.currency === "USD") {
    const intermediary: FieldDef[] = [
      make("intermediary_bank_name", "Intermediary Bank Name", {
        mandatory: false,
        validation: VALIDATION_PRESETS.name,
        required_if: "code",
      }),
      make("intermediary_bank_swift_code", "Intermediary Bank Swift Code", {
        mandatory: false,
        validation: VALIDATION_PRESETS.swift,
      }),
      make("intermediary_bank_aba", "Intermediary Bank ABA", {
        mandatory: false,
        validation: VALIDATION_PRESETS.aba,
        required_if: "code",
      }),
      make("intermediary_bank_address", "Intermediary Bank Address", {
        mandatory: false,
        validation: VALIDATION_PRESETS.address,
      }),
      make("intermediary_bank_city", "Intermediary Bank City", {
        mandatory: false,
        validation: VALIDATION_PRESETS.city,
      }),
      make("intermediary_bank_country", "Intermediary Bank Country", {
        mandatory: false,
        values: ctx.countries,
      }),
      make("intermediary_bank_state", "Intermediary Bank State", {
        mandatory: false,
        values: ctx.states,
        parent_key: "intermediary_bank_country",
      }),
      make("intermediary_bank_postal_code", "Intermediary Bank Postal Code", {
        mandatory: false,
        validation: VALIDATION_PRESETS.postal_code,
      }),
    ];
    additionalFields.push(...intermediary);
  }

  // Service bank vs free-form bank name (Laravel-style conditional).
  if (supportedCountry.externalType === EXTERNAL_TYPE_DIGININE) {
    const isRequired = ["NPL", "PAK"].includes(supportedCountry.countryCode);
    const banks = await lookupsService.serviceBanks(payload.country, payload.currency);
    additionalFields.push(make("service_bank", "Service Bank", { mandatory: isRequired, values: banks }));
  } else {
    additionalFields.push(
      make("bank_name", "Bank Name", {
        validation: VALIDATION_PRESETS.name,
      }),
    );
  }

  const purposeOfTransactionField = make("purpose_of_transaction", "Purpose of Transactions", {
    values: ctx.purposes_of_transactions,
  });
  additionalFields.push(purposeOfTransactionField);

  let fields = [...base, ...additionalFields];

  if (supportedCountry.currency === "USD") {
    fields = fields.map((f) => {
      if (f.field_key === "bank_name") {
        return { ...f, is_mandatory: true };
      }
      return f;
    });
  }

  if (payload.merchantId) {
    const setting = await prisma().merchantSetting.findFirst({
      where: {
        merchantId: payload.merchantId,
        key: "beneficiary_fields",
        status: 1,
      },
    });
    if (setting && setting.value) {
      try {
        const customMandatoryFields: string[] = JSON.parse(setting.value);
        if (Array.isArray(customMandatoryFields)) {
          fields = fields.map((f) => {
            const isMandatory = f.is_mandatory && !customMandatoryFields.includes(f.field_key);
            return { ...f, is_mandatory: isMandatory };
          });
        }
      } catch (e) {
        // ignore parsing errors
      }
    }
  }

  // beneficiaryFormCache.set(cacheKey, {
  //   value: fields,
  //   expiresAt: Date.now() + BENEFICIARY_FORM_TTL_MS,
  // });
  return fields;
}

function bankFieldsByCountry(country: string, currency: string, _ctx: FormBuildContext): FieldDef[] {
  const accountTypeField = make("account_type", "Account Type", {
    values: [
      { label: "Checking", value: "Checking" },
      { label: "Savings", value: "Savings" },
      { label: "General Ledger", value: "General Ledger" },
      { label: "Loan", value: "Loan" },
    ],
  });

  const isForeignCurrency = currency === "USD" && country !== "USA";

  switch (country.toUpperCase()) {
    case "HKG":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^[A-Za-z0-9]{4,34}$" } }),
        make("code", isForeignCurrency ? "SWIFT/BIC" : "Branch Code", {
          validation: isForeignCurrency ? VALIDATION_PRESETS.swift : { regex: "^\\d{3}$" },
        }),
      ];
    case "IND":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^[0-9]{9,18}$" } }),
        make("code", isForeignCurrency ? "SWIFT/BIC" : "IFSC Code", {
          validation: isForeignCurrency ? VALIDATION_PRESETS.swift : VALIDATION_PRESETS.ifsc,
        }),
      ];
    case "ARE":
      return [
        accountTypeField,
        make("account_number", "IBAN", { validation: VALIDATION_PRESETS.iban }),
        make("code", "SWIFT/BIC", { validation: VALIDATION_PRESETS.swift }),
      ];
    case "LKA":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^\\d{6,15}$" } }),
        make("code", isForeignCurrency ? "SWIFT/BIC" : "Bank Code", {
          validation: isForeignCurrency ? VALIDATION_PRESETS.swift : { regex: "^\\d{4}$" },
        }),
      ];
    case "NPL":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^[0-9]{10,18}$" } }),
        make("code", "SWIFT/BIC", {
          mandatory: false,
          validation: VALIDATION_PRESETS.swift,
        }),
      ];
    case "PAK":
      return [
        accountTypeField,
        make("account_number", "IBAN", {
          validation: { regex: "^[A-Z]{2}[0-9]{2}[A-Z]{4}[A-Z0-9]{16}$" },
        }),
        make("code", "Code", {
          mandatory: false,
          validation: VALIDATION_PRESETS.swift,
        }),
      ];
    case "BGD":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^[0-9]{10,17}$" } }),
        make("code", isForeignCurrency ? "SWIFT/BIC" : "Routing Number", {
          validation: isForeignCurrency ? VALIDATION_PRESETS.swift : { regex: "^[0-9]{9}$" },
        }),
      ];
    case "PHL":
      return [
        accountTypeField,
        make("account_number", "Account Number", { validation: { regex: "^\\d{6,18}$" } }),
        make("code", isForeignCurrency ? "SWIFT/BIC" : "BRSTN", {
          validation: isForeignCurrency ? VALIDATION_PRESETS.swift : { regex: "^[a-zA-Z0-9]{8,12}$" },
        }),
      ];
    case "USA":
      return [
        accountTypeField,
        make("account_number", "Account Number", {
          mandatory: false,
          validation: { regex: "/^[A-Za-z0-9]{4,34}$/" },
        }),
        make("iban", "IBAN", { mandatory: false, validation: VALIDATION_PRESETS.iban }),
        make("code", "SWIFT/BIC", { mandatory: false, validation: VALIDATION_PRESETS.swift }),
        make("routing_number", "Routing Number", {
          mandatory: false,
          validation: VALIDATION_PRESETS.routing,
          required_if_empty_of: "code",
        }),
        ...addressFields("bank", _ctx),
      ];
    default:
      return [
        accountTypeField,
        make("account_number", "Account Number / IBAN", {
          validation: { regex: "/^[A-Za-z0-9]{4,34}$/" },
        }),
        make("code", "SWIFT/BIC/Routing Number", { validation: VALIDATION_PRESETS.swift }),
        ...addressFields("bank", _ctx),
      ];
  }
}

/**
 * Mirror of FieldsHelper::updateProfileFormFields. Phase 2 stub returned [],
 * Phase 3 adds the FvBank-aware document groups (the most common path).
 */
export async function updateProfileFormFields(
  user: { userType: number | bigint },
  externalType: string,
): Promise<FieldDef[]> {
  void externalType; // FvBank/Caliza-specific overrides land in Phase 8.
  const ctx = await buildContext(); // Profile updates usually show all available countries/states for initial setup.
  return getDocumentGroups(user.userType, ctx);
}

/**
 * Default site_name fallback for places that need it (TFA QR, etc.).
 */
export async function siteName(): Promise<string> {
  return (await settingGet<string>("site_name", "Eficyent")) || "Eficyent";
}

/**
 * Mirror of FieldsHelper::transaction_form_fields. Returns the *transaction
 * level* fields a user fills in for a payout - amount, remarks, supporting
 * documents, payment purpose. The Laravel signature accepts an optional
 * (user, type, country) for per-corridor overrides; the simplified Phase 6
 * shape covers the canonical fields.
 */
export async function transactionFormFields(
  user?: any,
  type?: string,
  country?: string,
): Promise<FieldDef[]> {
  const isSupportingDocumentRequired = await merchantSettingEnabled(
    user,
    "is_supporting_document_required",
    true,
  );
  const isRemarksRequired = await merchantSettingEnabled(user, "is_remarks_required", true);
  const isPurposeOfPaymentRequired = await merchantSettingEnabled(
    user,
    "is_purpose_of_payment_required",
    false,
  );
  const isTransactionRefRequired = await merchantSettingEnabled(
    user,
    "is_transaction_reference_no_required",
    false,
  );

  const isB2B = type === "B2B";
  const isUSA = country?.toUpperCase() === "USA";

  const finalSupportingDocRequired = isSupportingDocumentRequired || isB2B || isUSA;

  const ctx = await buildContext(country);

  return [
    make("quote_id", "Quote ID"),
    make("remarks", "Remarks", {
      mandatory: isRemarksRequired,
      validation: { max_length: 255 },
    }),
    make("client_reference_id", "Client Reference ID", {
      mandatory: false,
      validation: { max_length: 255 },
    }),
    make("purpose_of_payment", "Purpose of Payment", {
      mandatory: isPurposeOfPaymentRequired,
      values: ctx.eec_payment_purposes,
    }),
    make("supporting_document", "Supporting Document", {
      type: "file",
      mandatory: finalSupportingDocRequired,
      validation: {
        accepted_extensions: ["image/jpeg", "image/png", "image/jpg", "application/pdf"],
        max_file_size: 5 * 1024 * 1024,
      },
    }),
    make("txn_ref_no", "Transaction Reference Number", {
      mandatory: isTransactionRefRequired,
      validation: { max_length: 64 },
    }),
  ];
}

async function merchantSettingEnabled(user: any, key: string, defaultValue: boolean): Promise<boolean> {
  if (!user?.merchantId) return defaultValue;
  const val = await prisma().merchantSetting.findFirst({
    where: { merchantId: BigInt(user.merchantId), key },
  });
  if (!val || val.value === null) return defaultValue;
  return val.value === "1";
}

/**
 * Mirror of FieldsHelper::QuoteFormFields - the static minimal quote fields
 * that drive instant + bulk payout uploads.
 */
export async function quoteFormFields(): Promise<FieldDef[]> {
  return [
    make("amount", "Amount", {
      type: "number",
      validation: { min_value: 1, max_value: 10_000_000 },
    }),
    make("remarks", "Remarks", {
      mandatory: false,
      validation: { max_length: 255 },
    }),
    make("txn_ref_no", "Transaction Reference Number", {
      mandatory: false,
      validation: { max_length: 64 },
    }),
  ];
}

/**
 * Mirror of FieldsHelper::sender_fields. Cached per-(type, merchantId,
 * deposit-on/off) tuple - matches the Laravel cache key exactly so two
 * deployments converge on the same shape.
 */
const senderFieldsCache = new Map<
  string,
  { value: FieldDef[]; expiresAt: number }
>();
const SENDER_FIELDS_TTL_MS = 6 * 60 * 60 * 1000;

interface SenderFieldsContext {
  type: number | bigint;
  merchantId: bigint | null;
  remitterDepositEnabled: boolean;
  country?: string;
}

export async function senderFields(ctx: SenderFieldsContext): Promise<FieldDef[]> {
  const cacheKey = `${ctx.type}:${ctx.merchantId?.toString() ?? "default"}:${
    ctx.remitterDepositEnabled ? "deposit_on" : "deposit_off"
  }`;
  const hit = senderFieldsCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const formCtx = await buildContext(ctx.country);

  const common: FieldDef[] = [
    make("email", "Email", { validation: VALIDATION_PRESETS.email }),
    make("mobile_country_code", "Mobile Country Code", {
      values: formCtx.mobile_country_codes,
    }),
    make("mobile", "Mobile", { validation: VALIDATION_PRESETS.mobile }),
    make("address_1", "Address", { validation: VALIDATION_PRESETS.address }),
    make("country", "Country", { values: formCtx.countries }),
    make("nationality", "Nationality", { values: formCtx.countries }),
    make("state", "State / Province", {
      values: formCtx.states,
      parent_key: "country",
    }),
    make("city", "City", { validation: VALIDATION_PRESETS.city }),
    make("postal_code", "Postal Code", {
      validation: VALIDATION_PRESETS.postal_code,
    }),
    make("source_of_funds", "Source of Funds", {
      values: [...formCtx.source_of_funds, ...formCtx.eec_payment_purposes],
    }),
    make("id_type", "ID Type", { values: formCtx.id_types }),
    make("id_number", "ID Number", { validation: VALIDATION_PRESETS.id_number }),
  ];
  if (ctx.remitterDepositEnabled) {
    common.push(make("client_reference_id", "Client Reference ID"));
  }

  let fields: FieldDef[] = [];
  if (Number(ctx.type) === USER_TYPE_INDIVIDUAL) {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    const maxDate = eighteenYearsAgo.toISOString().slice(0, 10);
    const individual: FieldDef[] = [
      make("first_name", "First Name", { validation: VALIDATION_PRESETS.name }),
      make("middle_name", "Middle Name", {
        mandatory: false,
        validation: VALIDATION_PRESETS.name,
      }),
      make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
      make("dob", "Date of Birth", { type: "date", validation: { max_date: maxDate } }),
    ];
    fields = [...individual, ...common];
  } else if (Number(ctx.type) === USER_TYPE_BUSINESS) {
    const business: FieldDef[] = [
      make("business_name", "Business Name", {
        validation: VALIDATION_PRESETS.business_name,
      }),
    ];

    const owners: FieldDef = make("owners", "Business Owners", {
      type: "group",
      repeatable: true,
      validation: { min_length: 1, max_length: 3 },
      children: [
        make("first_name", "First Name", { validation: VALIDATION_PRESETS.name }),
        make("last_name", "Last Name", { validation: VALIDATION_PRESETS.name }),
        make("id_type", "ID Type", { values: formCtx.id_types }),
        make("id_number", "ID Number", {
          validation: VALIDATION_PRESETS.id_number,
        }),
        make("email", "Email", {
          mandatory: false,
          validation: VALIDATION_PRESETS.email,
        }),
        make("mobile_country_code", "Mobile Country Code", {
          mandatory: false,
          values: formCtx.mobile_country_codes,
        }),
        make("mobile", "Mobile", {
          mandatory: false,
          validation: VALIDATION_PRESETS.mobile,
        }),
        make("address_1", "Address Line 1", {
          validation: VALIDATION_PRESETS.address,
        }),
        make("address_2", "Address Line 2", {
          mandatory: false,
          validation: VALIDATION_PRESETS.address,
        }),
        make("country", "Country", { values: formCtx.countries }),
        make("nationality", "Nationality", { values: formCtx.countries }),
        make("state", "State", {
          mandatory: false,
          values: formCtx.states,
          parent_key: "country",
        }),
        make("city", "City", {
          mandatory: false,
          validation: VALIDATION_PRESETS.city,
        }),
        make("postal_code", "Postal Code", {
          mandatory: false,
          validation: VALIDATION_PRESETS.postal_code,
        }),
        make("designation", "Designation", { values: formCtx.professions }),
      ],
    });

    const documents: FieldDef[] = [
      documentGroup("proofs", "Proofs", [], formCtx.document_types),
    ];

    fields = [...business, ...common, ...documents, owners];
  }

  if (ctx.merchantId) {
    const setting = await prisma().merchantSetting.findFirst({
      where: {
        merchantId: ctx.merchantId,
        key: "remitter_fields",
        status: 1,
      },
    });
    if (setting && setting.value) {
      try {
        const customNonMandatoryFields: string[] = JSON.parse(setting.value);
        if (Array.isArray(customNonMandatoryFields)) {
          const mapFields = (list: FieldDef[]): FieldDef[] => {
            return list.map((f) => {
              const isMandatory = f.is_mandatory && !customNonMandatoryFields.includes(f.field_key);
              const mapped: FieldDef = { ...f, is_mandatory: isMandatory };
              if (f.children && f.children.length > 0) {
                mapped.children = mapFields(f.children);
              }
              return mapped;
            });
          };
          fields = mapFields(fields);
        }
      } catch (e) {
        // ignore parsing errors
      }
    }
  }

  senderFieldsCache.set(cacheKey, {
    value: fields,
    expiresAt: Date.now() + SENDER_FIELDS_TTL_MS,
  });
  return fields;
}
