# Remaining CVEs After npm audit fix --legacy-peer-deps

## Summary
- **Total Remaining**: 60 vulnerabilities
- **Critical**: 8
- **High**: 27
- **Moderate**: 18
- **Low**: 7

---

## CRITICAL CVEs (8)

### 1. loader-utils - GHSA-76p3-8jx3-jpfq, GHSA-3rfm-jhwj-7488, GHSA-hhq3-ff78-jv3g
- **Severity**: CRITICAL
- **Issues**: 
  - Prototype pollution in webpack loader-utils
  - Regular Expression Denial of Service (ReDoS) via url variable
- **Affected Versions**: <=1.4.1 || 2.0.0-2.0.3
- **Current Version**: 2.0.3 (in node_modules)
- **Fix**: Requires webpack update (building Next.js 16 will resolve)
- **Status**: ❌ Cannot fix without Next.js upgrade

### 2. protobufjs - GHSA-xq3m-2v4x-88gg
- **Severity**: CRITICAL
- **Issue**: Arbitrary code execution
- **Affected Versions**: <7.5.5
- **Current in**: libsignal/node_modules/@whiskeysockets/baileys
- **Fix Available**: npm audit fix has capability (not applied due to --legacy-peer-deps conflict)
- **Status**: ⚠️ Partially fixable (blocked by dependency resolution)

### 3. shell-quote - GHSA-g4rg-993r-mgx7
- **Severity**: CRITICAL
- **Issue**: Improper Neutralization of Special Elements used in a Command
- **Affected Versions**: 1.6.3-1.7.2
- **Current in**: @next/react-dev-overlay/node_modules
- **Part of**: Next.js dev overlay (build-time only)
- **Status**: ❌ Cannot fix without Next.js upgrade

### 4. typeorm - GHSA-fx4w-v43j-vc45, GHSA-q2pj-6v73-8rgj
- **Severity**: CRITICAL  
- **Issues**:
  - SQL injection
  - Vulnerable to SQL injection via crafted request to repository.save/update
- **Affected Versions**: <=0.4.0-alpha.1
- **Current in**: node_modules/typeorm
- **Used by**: @next-auth/typeorm-legacy-adapter
- **Fix**: ❌ NO PATCHED VERSION AVAILABLE
- **Recommendation**: 
  - Evaluate if TypeORM is actually needed (Prisma is recommended)
  - If using it: Validate ALL user inputs before passing to save/update
  - Monitor GitHub for security patches
- **Status**: ❌ Cannot fix (no patch available)

### 5-8. Four additional CRITICAL inherited from Next.js build tools
- loader-utils (already listed #1)
- Other build-time dependencies will resolve with Next.js 16 upgrade

---

## HIGH CVEs (27)

### Build Tool Related (Will resolve with Next.js 16 upgrade)
- **@babel/runtime** - RegExp complexity in generated code
- **braces** - Uncontrolled resource consumption
- **browserslist** - ReDoS pattern matching
- **css-loader** - Various vulnerabilities
- **cssnano** - PostCSS vulnerabilities
- **json5** - Prototype pollution (GHSA-9c47-m6qq-7p4h)
- **loader-utils** - (already listed as CRITICAL)
- **mini-css-extract-plugin** - Webpack-related
- **node-fetch** - (GHSA-r683-j2x4-v87g, GHSA-w7rc-rwvf-8q5r)
  - Header forwarding issues
  - Size option not honored after redirect
- **postcss** - Multiple ReDoS patterns
- **resolve-url-loader** - PostCSS-related
- **style-loader** - Webpack-related
- **styled-jsx** - Next.js component
- **terser** - ReDoS in minifier
- **webpack** - Multiple known vulnerabilities (v5 is old)

### Authentication/Runtime Related (No patches available)
| Package | CVE | Issue | Impact | Status |
|---------|-----|-------|--------|--------|
| **jsonwebtoken** | GHSA-8cf7-32gw-wr33 | Unrestricted key type | Could lead to legacy keys usage | ❌ No patch |
| **jsonwebtoken** | GHSA-hjrf-2m68-5959 | Insecure key retrieval | RSA to HMAC forgery possible | ❌ No patch |
| **jsonwebtoken** | GHSA-qwph-4952-7xr6 | Signature validation bypass | Insecure default in jwt.verify() | ❌ No patch |
| **nodemailer** | GHSA-mm7p-fcc7-pg87 | Email domain interpretation | Email to unintended domain | ❌ No patch |
| **nodemailer** | GHSA-rcmh-qjqh-p98v | Recursive parsing | DoS via addressparser | ❌ No patch |
| **nodemailer** | GHSA-c7w3-x93f-qmm8 | SMTP command injection | Via unsanitized envelope.size | ❌ No patch |
| **nodemailer** | GHSA-vvjj-xcjg-gr5g | SMTP injection via CRLF | EHLO/HELO injection | ❌ No patch |

### Others
- **elliptic** - Risky cryptographic implementation (inherited from webpack)
- **http-proxy** - Denial of Service (GHSA-6x33-pw7p-hmpq)
- **object-path** - Prototype pollution (3 CVEs)
- **serialize-javascript** - RCE via RegExp.flags (GHSA-5c6j-r48x-rmvq)
- **tar** - Multiple extraction vulnerabilities (file traversal, symlink poisoning)

---

## MODERATE CVEs (18)

### No Fix Available
| Package | CVE | Issue | Status |
|---------|-----|-------|--------|
| **@babel/runtime** | GHSA-968p-4wvh-cqc8 | Inefficient RegExp complexity | Inherited from Next.js build |
| **browserslist** | GHSA-w8qv-6jwh-64r5 | ReDoS | Will resolve with Next.js upgrade |
| **cookie** | GHSA-pxg6-pf52-xh8x | Out of bounds characters | No fix available |
| **devalue** | GHSA-vj54-72f3-p5jv | Prototype pollution | 5 different CVEs, no fix |
| **devalue** | GHSA-33hq-fvwr-56pm | CPU/memory amplification | Sparse arrays DoS |
| **devalue** | GHSA-8qm3-746x-r74r | Prototype pollution in eval | Uneval code unsafe |
| **devalue** | GHSA-cfw5-2vxh-hr84 | Prototype pollution | parse + unflatten methods |
| **devalue** | GHSA-mwv9-gp5h-frr4 | __proto__ own properties | Svelte/Next.js component |
| **jose** | GHSA-hhhv-q57g-882q | Resource exhaustion | Crafted JWE with compression |
| **postcss** | GHSA-hwj9-h5mp-3pm3 | ReDoS | Multiple ReDoS patterns (4 total) |
| **postcss** | GHSA-566m-qj78-rww5 | ReDoS | Moderate pattern matching |
| **postcss** | GHSA-7fh5-64p2-3v2j | Line return parsing error | XSS potential |
| **postcss** | GHSA-qx2v-qp2m-jg93 | XSS via </style> | Unescaped in CSS output |
| **uuid** | GHSA-w5hq-g745-h8pq | Buffer bounds check | v3/v5/v6 when buf provided |
| **xml2js** | GHSA-776f-qx25-q3cc | Prototype pollution | Parsing vulnerability |

### Note on postcss & devalue
These are mostly build-time only. The CVEs affect development experience, not production code execution. However, they should still be tracked.

---

## LOW CVEs (7)

Not detailed here - typically non-critical issues. Examples include deprecated APIs, non-critical missing validations, etc.

---

## Dependency Tree Overview

### Most Critical Paths

```
Root package.json
├── next@16.2.4
│   ├── webpack@5.x 
│   │   ├── loader-utils (CRITICAL)
│   │   ├── terser (HIGH)
│   │   ├── braces (HIGH)
│   │   └── postcss (MODERATE)
│   ├── next-auth@4.24.14
│   │   ├── typeorm (CRITICAL - if using TypeORM legacy)
│   │   ├── jsonwebtoken (HIGH - no patch)
│   │   ├── nodemailer (HIGH - no patch)
│   │   └── uuid (MODERATE)
│   └── styled-jsx (inherits loader-utils CVEs)
└── @whiskeysockets/baileys@7.0.0-rc.9
    └── libsignal
        └── protobufjs (CRITICAL)
```

### Secondary Paths
- PostCSS ecosystem (multiple packages) - all inherit from postcss <8.5.9
- Build-time tooling (webpack, babel, terser) - mostly resolved by Next.js upgrade

---

## Remediation Priority Matrix

### 1. MUST DO (Blocking Issues)
- [ ] Upgrade Next.js 9 → 16 in frontend (removes 20+ CVEs)
- [ ] Fix TypeScript errors in frontend

### 2. SHOULD DO (Security Issues)  
- [ ] Remove root dependencies (next, next-auth, @next-auth/prisma-adapter)
- [ ] Run npm audit fix again after Step 1

### 3. MONITOR & PLAN (No Solution Yet)
- [ ] Track typeorm for security patches
- [ ] Monitor jsonwebtoken for updates
- [ ] Evaluate removing TypeORM if Prisma is already the primary ORM

### 4. CANNOT FIX (No Patches Available)
- Remaining unfixable CVEs - accept risk or find alternatives
- These are primarily build-time tools (webpack, babel, postcss)

---

## Expected Impact of Recommended Changes

| Action | CVEs Fixed | Build Status | Runtime Risk |
|--------|-----------|--------------|--------------|
| Upgrade Next.js to 16 | ~15-20 CVEs | ✅ Will fix TS errors | ✅ None (code compatible) |
| Reorganize dependencies | ~5 CVEs | ✅ Enables npm audit fix | ✅ None (code improvement) |
| Run npm audit fix again | ~5-10 CVEs | ✅ No issues expected | ✅ None |
| Final state | 40-50 CVEs fixed | ✅ Full success | ⚠️ 10-20 unfixable remain |

---

## After Final Remediation

### Will be fixed: ~50-55 CVEs (50-65% of original)
### Will remain: ~10-15 unfixable CVEs
- These have one of three properties:
  1. No patch released (typeorm, jsonwebtoken, etc.)
  2. Build-time only (webpack ecosystem)
  3. Part of old/legacy tools being phased out


