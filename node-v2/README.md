# eficyent-api-v2 (pilot)

Restructured Node.js API following the layout and conventions of
`sample-project/` in this repository.

## Scope

This directory is a **pilot** demonstrating the new structure end-to-end
for one module: **auth** (register, login, logout + auth middleware).
Once the pilot pattern is approved, the remaining modules from `node/`
will be ported here one at a time.

The existing `node/` project continues to run unchanged in production
during the migration.

## Layout

```
node-v2/
├── package.json
├── tsconfig.json
├── .sequelizerc
└── src/
    ├── app.ts                         # bootstrap
    ├── config/
    │   ├── config.js                  # sequelize-cli config
    │   └── database.ts                # Sequelize instance
    ├── controller/
    │   └── auth.controller.ts         # register / login / logout
    ├── locales/
    │   ├── en/{error,success}.json
    │   └── hi/{error,success}.json
    ├── middleware/
    │   ├── auth.ts                    # authSanctum: verify bearer token
    │   ├── checkValidationErrors.ts
    │   ├── locales.ts
    │   └── responseHelpers.ts         # res.sendResponse / sendError / handleError
    ├── migrations/
    │   ├── 20260629000001-create-users.js
    │   └── 20260629000002-create-personal-access-tokens.js
    ├── models/
    │   ├── personal_access_token.model.ts
    │   └── user.model.ts
    ├── resources/
    │   └── user.resource.ts
    ├── routes/
    │   ├── auth.route.ts
    │   └── index.ts
    ├── utils/
    │   ├── api.routes.ts              # path + middleware bundles
    │   ├── common.utils.ts            # password / token helpers
    │   └── constants.ts
    └── validators/
        └── auth.validator.ts
```

## API contract preserved

The response envelope emitted by `res.sendResponse` / `res.sendError`
matches the existing Laravel-mirror shape used in `node/`:

```json
{
    "status": true,
    "code": 104,
    "message": "Login successful",
    "data": { ... }
}
```

Locale codes (e.g. `"104"`, `"125"`) are the same numeric strings that
the current `helpers/messages.ts` uses.

## Coding conventions

- 4-space indentation.
- Snake_case for filenames (`auth.controller.ts`, `user.model.ts`,
  `personal_access_token.model.ts`).
- Descriptive variable names — no single-letter locals.
- Sequelize models with `underscored: true` so TS attributes stay
  camelCase but DB columns are snake_case.

## Running

```bash
cd node-v2
npm install
cp ../node/.env .env   # or provide DB_HOST, DB_USER, DB_PASS, DB_NAME
npx sequelize-cli db:migrate
npm run dev
```

The pilot serves auth endpoints at:

- `POST /api/user/register`
- `POST /api/user/login`
- `POST /api/user/logout` (Bearer token)
