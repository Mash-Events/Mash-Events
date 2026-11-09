import nextVitals from 'eslint-config-next/core-web-vitals';

// Boundary rules from docs/system-design.md §2.1 and §12.4:
// - core/ never imports from sites/;
// - a site never imports another site (enforced per site when sites exist);
// - only the privileged module may touch the service-role client.
const SERVICE_ROLE_MODULES = [
  '@/lib/supabase-admin',
  '@core/db/privileged/*',
  '**/core/db/privileged/*',
];

const config = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    files: ['core/**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sites/*', '**/sites/*'],
              message: 'core/ must not import from sites/.',
            },
          ],
        },
      ],
    },
  },
  {
    // Admin code runs as the signed-in user with RLS; it never gets the
    // service-role client (design §12.4).
    files: [
      'src/app/admin/**/*.{js,jsx,ts,tsx}',
      'src/app/api/admin/**/*.{js,jsx,ts,tsx}',
      'src/app/auth/**/*.{js,jsx,ts,tsx}',
      'src/components/**/*.{js,jsx,ts,tsx}',
      'core/auth/**/*.{js,jsx,ts,tsx}',
      'core/http/**/*.{js,jsx,ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SERVICE_ROLE_MODULES,
              message:
                'Admin code must use the event-pinned client, not the service-role client.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['sites/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SERVICE_ROLE_MODULES,
              message:
                'Sites must not use the service-role client. Use core data loaders.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
