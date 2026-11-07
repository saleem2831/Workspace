# Language configuration — English / Arabic and future locales

## Implemented in v6.2

- English (`en`) and Arabic (`ar`) language selector on login and in the authenticated topbar.
- HTML `lang` and `dir` updated when the user switches language, with CSS support for right-to-left layout.
- Translated navigation, sign-in labels, Platform Console migration planner, and shared UI component labels with a reusable React localization context.
- Tenant provisioning accepts `defaultLocale` (`en` or `ar`). When a user has not explicitly selected a language, the tenant's preference is used.
- Locale formatting utilities (`formatNumber`, `formatDate`) built with `Intl`, ready to be used in deeper modules.

## Not finished; do not advertise full Arabic localization yet

- Many long, specialized field descriptions, error strings and workflow labels in Learning, Advisory, Finance, Reports and Settings remain English. These need a reviewed Arabic translation catalog.
- Date/number formatting must be applied consistently to **all** reports, invoices, PDFs, exports, email templates and notification text. Financial decimal storage must remain locale-independent.
- Imported client records are not machine-translated. Data content stays exactly as stored.
- Printed documents and generated PDFs need Arabic fonts and bidirectional-text QA on each document template.

## Adding a new language (example: French)

1. Update the `Locale` union in `frontend/src/i18n.tsx` to include `fr`.
2. Add a translated `fr` dictionary and a `<option value="fr">Français</option>` in `LocalePicker`.
3. Extend `Tenant.defaultLocale` schema enum, provisioning validators and locale fallback.
4. Add locale-aware formats with `Intl.NumberFormat` and `Intl.DateTimeFormat`.
5. Localize page titles, form labels, emails, PDFs, errors, and help content. Run translation quality and accessibility tests with real users.
6. Use RTL only for appropriate locales; French, Hindi and English remain LTR.

## Acceptance scenarios

- On login, users may select Arabic; logout and login retain explicit browser language selection.
- Select Arabic: sidebar is on the right, navigation items translate, text alignment is RTL, email/URL inputs remain readable LTR.
- Tenant default Arabic applies to a browser with no saved manual override.
- Switching company never grants extra module permissions or leaks data.
- Search results and company names remain those entered by customers, not automatically rewritten.
