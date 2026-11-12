# File tree — every tracked file (`git ls-files`)

636 files are tracked. 469 of them are source, config, tests and docs — that is
the review surface, listed below. The other 167 are reference material, not
code: 100 under `Documents/` (PRD, TRD, BSD, AFD, IPD, UXDS) and 67 under
`stitch_coop_design_system_foundation/` (design exports), listed at the end.

Untracked and therefore absent here: `node_modules/`, `dist/`, `build/`,
`.venv/`, `__pycache__/` and lockfiles. That is deliberate — nothing generated
is worth a reviewer's attention.

## Source and configuration

```
.claude/agents/backend.md
.claude/agents/cybersecurity.md
.claude/agents/database.md
.claude/agents/debugger.md
.claude/agents/designer.md
.claude/agents/devops.md
.claude/agents/frontend.md
.claude/agents/orchestrator.md
.claude/agents/qa_engineer.md
.claude/agents/red_team.md
.claude/agents/review_board.md
.claude/agents/technical_writer.md
.claude/helpers/auto-memory-hook.mjs
.claude/helpers/hook-handler.cjs
.claude/helpers/intelligence.cjs
.claude/helpers/memory.js
.claude/helpers/post-commit
.claude/helpers/pre-commit
.claude/helpers/router.js
.claude/helpers/session.js
.claude/helpers/statusline.cjs
.claude/settings.json
.claude/skills/banner-design/SKILL.md
.claude/skills/brand/SKILL.md
.claude/skills/design-system/SKILL.md
.claude/skills/design/SKILL.md
.claude/skills/slides/SKILL.md
.claude/skills/ui-styling/LICENSE.txt
.claude/skills/ui-styling/SKILL.md
.claude/skills/ui-ux-pro-max/SKILL.md
.commitlintrc.json
.dockerignore
.editorconfig
.env.example
.github/workflows/ci.yml
.github/workflows/desktop.yml
.gitignore
.gitleaks.toml
.husky/commit-msg
.husky/pre-commit
.mcp.json
.pre-commit-config.yaml
.prettierrc
CLAUDE.md
CONTRIBUTING.md
LICENSE
README.md
alembic.ini
backend/Dockerfile
backend/__init__.py
backend/ai/__init__.py
backend/ai/actions.py
backend/ai/context.py
backend/ai/forecast.py
backend/ai/history.py
backend/ai/lessons.py
backend/ai/prompts.py
backend/ai/providers/__init__.py
backend/ai/providers/openrouter.py
backend/ai/ratelimit.py
backend/ai/schemas.py
backend/ai/service.py
backend/ai/usage.py
backend/alembic/env.py
backend/alembic/script.py.mako
backend/alembic/versions/0001_postgres_baseline.py
backend/alembic/versions/0002_import_provenance.py
backend/alembic/versions/0003_source_order_ref.py
backend/alembic/versions/0004_ai_usage.py
backend/alembic/versions/0005_subscriptions.py
backend/alembic/versions/0006_client_id_idempotency.py
backend/alembic/versions/0007_ai_history.py
backend/alembic/versions/0008_audit_business_id.py
backend/alembic/versions/0009_ai_response_style.py
backend/alembic/versions/0010_team_model.py
backend/alembic/versions/0011_payments.py
backend/alembic/versions/0011_subscription_trial.py
backend/alembic/versions/0012_licenses.py
backend/alembic/versions/0013_invoices.py
backend/alembic/versions/0014_rls.py
backend/alembic/versions/0015_feedback.py
backend/alembic/versions/0016_merge_heads.py
backend/alembic/versions/0017_issue_reports.py
backend/alembic/versions/0018_integer_pk_sequences.py
backend/alembic/versions/0019_business_logo.py
backend/alembic/versions/0020_order_payments.py
backend/alembic/versions/0021_tax.py
backend/alembic/versions/0022_zeno_lessons.py
backend/alembic/versions/0023_invoice_compliance.py
backend/alembic/versions/0024_tax_defaults.py
backend/audit.py
backend/backups.py
backend/billing.py
backend/briefing.py
backend/clerk_auth.py
backend/config.py
backend/csvsafe.py
backend/database.py
backend/demo.py
backend/exports/__init__.py
backend/exports/renderers.py
backend/exports/service.py
backend/feedback.py
backend/importer.py
backend/investor_metrics.py
backend/invoicing.py
backend/licensing.py
backend/main.py
backend/models.py
backend/notifications/__init__.py
backend/notifications/daily_summary.py
backend/notifications/delivery.py
backend/notifications/schemas.py
backend/payments.py
backend/paystack.py
backend/platform_admin.py
backend/pull.py
backend/ratelimits.py
backend/receivables.py
backend/redact.py
backend/reports/__init__.py
backend/reports/filters.py
backend/reports/service.py
backend/requirements.txt
backend/rls.py
backend/schemas.py
backend/security_events.py
backend/services.py
backend/storage.py
backend/support.py
backend/sync.py
backend/team.py
backend/tests/conftest.py
backend/tests/smoke_import.py
backend/tests/test_ai.py
backend/tests/test_ai_history.py
backend/tests/test_ai_style.py
backend/tests/test_audit.py
backend/tests/test_backup.py
backend/tests/test_billing.py
backend/tests/test_config_auth.py
backend/tests/test_contract.py
backend/tests/test_cors.py
backend/tests/test_customer_email_reuse.py
backend/tests/test_daily_summary.py
backend/tests/test_export_safety.py
backend/tests/test_feedback.py
backend/tests/test_forecast.py
backend/tests/test_import_fixtures.py
backend/tests/test_investor_metrics.py
backend/tests/test_invoicing.py
backend/tests/test_licensing.py
backend/tests/test_low_stock_consistency.py
backend/tests/test_migrations.py
backend/tests/test_onboarding.py
backend/tests/test_openrouter_provider.py
backend/tests/test_order_lifecycle.py
backend/tests/test_order_search.py
backend/tests/test_paystack.py
backend/tests/test_paystack_live.py
backend/tests/test_platform_admin.py
backend/tests/test_product_crud.py
backend/tests/test_public_surface.py
backend/tests/test_ratelimit.py
backend/tests/test_ratelimits.py
backend/tests/test_receivables.py
backend/tests/test_reports.py
backend/tests/test_rls.py
backend/tests/test_security_baseline.py
backend/tests/test_security_hardening.py
backend/tests/test_security_headers.py
backend/tests/test_stock_concurrency.py
backend/tests/test_storage.py
backend/tests/test_summary_delivery.py
backend/tests/test_supabase_snapshot.py
backend/tests/test_support_issues.py
backend/tests/test_sync.py
backend/tests/test_sync_cursor.py
backend/tests/test_team.py
backend/tests/test_tenant_isolation.py
backend/tests/test_timezone_bucketing.py
backend/tests/test_zeno_lessons.py
backend/timezones.py
config/development.json
config/production.json
config/testing.json
docs/APP_OVERVIEW.md
docs/BRANCH_PROTECTION.md
docs/BUSINESS_PLAN.md
docs/CODE_REVIEW_PACKET.md
docs/DEPLOY_POSTGRES.md
docs/FEATURE_INVENTORY.md
docs/FILE_TREE.md
docs/GO_LIVE_COSTS.md
docs/LAUNCH_CHECKLIST.md
docs/LAUNCH_READINESS.md
docs/PAYMENTS.md
docs/PRODUCT_MARKET_FIT_AUDIT.md
docs/PRODUCT_READINESS.md
docs/RELEASE.md
docs/RUN_LOCAL.md
docs/SECURITY_AUDIT.md
docs/SECURITY_AUDIT_2026-10-22_OWASP.md
docs/SECURITY_CHECKLIST_STATUS.md
docs/SECURITY_FIXES_2026-10-23.md
docs/SUPABASE_PROVISIONING.md
docs/TEST_INVENTORY.md
docs/YC_APPLICATION.md
docs/ZENO_LEARNING.md
docs/architecture/adr-001-layered-architecture.md
docs/architecture/adr-002-offline-first-data-layer.md
docs/standards/CODING_STANDARDS.md
electron/apiOrigin.js
electron/coop-icon.png
electron/dataLayerApp.js
electron/db/backup.js
electron/db/database.js
electron/db/driver.js
electron/db/ids.js
electron/db/index.js
electron/db/migrate.js
electron/db/migrations/0001_init.js
electron/db/migrations/0002_id_map.js
electron/db/repositories.js
electron/db/syncQueue.js
electron/e2e/app-process.js
electron/e2e/build-renderer.js
electron/e2e/run-e2e.js
electron/main.js
electron/package-lock.json
electron/package.json
electron/platform.js
electron/preload.js
electron/scripts/check-node.js
electron/scripts/copy-renderer.js
electron/scripts/release.js
electron/security.js
electron/sync.js
electron/test/apiOrigin.test.js
electron/test/backup.test.js
electron/test/checkNode.test.js
electron/test/db.test.js
electron/test/security.test.js
electron/test/sync.test.js
electron/test/updater.test.js
electron/test/windows.test.js
electron/updater.js
frontend/.gitignore
frontend/Dockerfile
frontend/eslint.config.js
frontend/index.html
frontend/nginx.conf
frontend/package.json
frontend/public/coop-mark.svg
frontend/public/sw.js
frontend/scripts/run-tests.mjs
frontend/src/App.tsx
frontend/src/ai/ask.ts
frontend/src/ai/client.ts
frontend/src/ai/data.ts
frontend/src/ai/insights.ts
frontend/src/ai/types.ts
frontend/src/ai/useConversation.ts
frontend/src/analytics/localBriefing.ts
frontend/src/analytics/localDashboard.ts
frontend/src/analytics/localData.ts
frontend/src/analytics/localReports.ts
frontend/src/analytics/localTypes.ts
frontend/src/auth/ClerkErrorBoundary.tsx
frontend/src/auth/CoopOfflineBanner.tsx
frontend/src/auth/appearance.ts
frontend/src/auth/index.ts
frontend/src/billing/checkout.ts
frontend/src/billing/plans.ts
frontend/src/billing/useBilling.ts
frontend/src/billing/useLicensing.ts
frontend/src/brand/coop-lockup-dark.svg
frontend/src/brand/coop-lockup.svg
frontend/src/brand/coop-mark-mono.svg
frontend/src/brand/coop-mark.svg
frontend/src/components/ai/AnswerCard.tsx
frontend/src/components/ai/DraftCard.tsx
frontend/src/components/ai/ForecastCard.tsx
frontend/src/components/ai/HistoryCard.tsx
frontend/src/components/ai/InvoiceDocument.tsx
frontend/src/components/ai/MiniChart.tsx
frontend/src/components/brand/CoopLogo.tsx
frontend/src/components/dashboard/AiInsightsCard.tsx
frontend/src/components/dashboard/BriefingBanner.tsx
frontend/src/components/dashboard/ChartCard.tsx
frontend/src/components/dashboard/InventoryBreakdownCard.tsx
frontend/src/components/dashboard/KpiCard.tsx
frontend/src/components/dashboard/LazyChart.tsx
frontend/src/components/dashboard/QuickActionsCard.tsx
frontend/src/components/dashboard/RecentOrdersTable.tsx
frontend/src/components/dashboard/Sparkline.tsx
frontend/src/components/dashboard/TopProductsCard.tsx
frontend/src/components/dashboard/chart.ts
frontend/src/components/feedback/FeedbackModal.tsx
frontend/src/components/layout/AppShell.tsx
frontend/src/components/layout/CommandPalette.tsx
frontend/src/components/layout/NotificationsPopover.tsx
frontend/src/components/layout/PageHeader.tsx
frontend/src/components/layout/Sidebar.tsx
frontend/src/components/layout/SyncIndicator.tsx
frontend/src/components/layout/TopBar.tsx
frontend/src/components/layout/index.ts
frontend/src/components/layout/nav.tsx
frontend/src/components/ui/AiNoticeBox.tsx
frontend/src/components/ui/CoopBadge.tsx
frontend/src/components/ui/CoopButton.tsx
frontend/src/components/ui/CoopCard.tsx
frontend/src/components/ui/CoopEmptyState.tsx
frontend/src/components/ui/CoopErrorState.tsx
frontend/src/components/ui/CoopInput.tsx
frontend/src/components/ui/CoopLoader.tsx
frontend/src/components/ui/CoopLoading.tsx
frontend/src/components/ui/CoopModal.tsx
frontend/src/components/ui/CoopSelect.tsx
frontend/src/components/ui/CoopTable.tsx
frontend/src/components/ui/CustomerAvatar.tsx
frontend/src/components/ui/ProductCardList.tsx
frontend/src/components/ui/icons.tsx
frontend/src/components/ui/index.ts
frontend/src/hooks/useMediaQuery.ts
frontend/src/hooks/usePlatformAdmin.ts
frontend/src/hooks/useTeamRole.ts
frontend/src/imports/components/FilePreview.tsx
frontend/src/imports/components/ImportComplete.tsx
frontend/src/imports/components/ImportDropzone.tsx
frontend/src/imports/components/MappingTable.tsx
frontend/src/imports/components/ValidationSummary.tsx
frontend/src/imports/pages/ImportPage.tsx
frontend/src/imports/services/importer.ts
frontend/src/imports/types.ts
frontend/src/invoices/useInvoices.ts
frontend/src/lib/orderStatus.ts
frontend/src/lib/stock.ts
frontend/src/main.tsx
frontend/src/notifications/prefs.ts
frontend/src/notifications/useDailySummary.ts
frontend/src/pages/Admin/index.tsx
frontend/src/pages/Billing/PricingView.tsx
frontend/src/pages/Billing/index.tsx
frontend/src/pages/Briefing/index.tsx
frontend/src/pages/CoopAi/index.tsx
frontend/src/pages/Customers/CustomerCardList.tsx
frontend/src/pages/Customers/CustomerFormModal.tsx
frontend/src/pages/Customers/CustomerProfilePage.tsx
frontend/src/pages/Customers/index.tsx
frontend/src/pages/Customers/useCustomerStats.ts
frontend/src/pages/Customers/useCustomers.ts
frontend/src/pages/Dashboard/DashboardHeader.tsx
frontend/src/pages/Dashboard/index.tsx
frontend/src/pages/Dashboard/kpiConfig.tsx
frontend/src/pages/Dashboard/useDashboardData.ts
frontend/src/pages/Inventory/StockAdjustModal.tsx
frontend/src/pages/Inventory/index.tsx
frontend/src/pages/Inventory/useInventory.ts
frontend/src/pages/Invoices/index.tsx
frontend/src/pages/NotFound.tsx
frontend/src/pages/Orders/CreateOrderPage.tsx
frontend/src/pages/Orders/OrderDetailsPage.tsx
frontend/src/pages/Orders/index.tsx
frontend/src/pages/Orders/useCatalog.ts
frontend/src/pages/Orders/useOrders.ts
frontend/src/pages/Products/ProductFormModal.tsx
frontend/src/pages/Products/index.tsx
frontend/src/pages/Products/useProducts.ts
frontend/src/pages/Receivables/index.tsx
frontend/src/pages/Reports/ExportMenu.tsx
frontend/src/pages/Reports/ReportAiSummary.tsx
frontend/src/pages/Reports/ReportChart.tsx
frontend/src/pages/Reports/ReportFilters.tsx
frontend/src/pages/Reports/ReportKpis.tsx
frontend/src/pages/Reports/ReportTable.tsx
frontend/src/pages/Reports/index.tsx
frontend/src/pages/Reports/reportConfig.ts
frontend/src/pages/Reports/useReport.ts
frontend/src/pages/Settings/index.tsx
frontend/src/pages/Settings/sections/AboutSection.tsx
frontend/src/pages/Settings/sections/AiPreferencesSection.tsx
frontend/src/pages/Settings/sections/AppearanceSection.tsx
frontend/src/pages/Settings/sections/AuditLogSection.tsx
frontend/src/pages/Settings/sections/BackupRestoreSection.tsx
frontend/src/pages/Settings/sections/CompanySection.tsx
frontend/src/pages/Settings/sections/LicenceSection.tsx
frontend/src/pages/Settings/sections/NotificationsSection.tsx
frontend/src/pages/Settings/sections/SecuritySection.tsx
frontend/src/pages/Settings/sections/SyncSection.tsx
frontend/src/pages/Settings/sections/TeamSection.tsx
frontend/src/pages/Settings/useSettings.ts
frontend/src/pages/Support/index.tsx
frontend/src/pages/Sync/ConflictCard.tsx
frontend/src/pages/Sync/index.tsx
frontend/src/pages/Team/InviteJoinCard.tsx
frontend/src/pages/Welcome/index.tsx
frontend/src/repositories/customers.ts
frontend/src/repositories/identity.ts
frontend/src/repositories/index.ts
frontend/src/repositories/inventory.ts
frontend/src/repositories/localMode.ts
frontend/src/repositories/orders.ts
frontend/src/repositories/products.ts
frontend/src/services/api/client.ts
frontend/src/services/currency.ts
frontend/src/styles.css
frontend/src/sync/connectivity.ts
frontend/src/sync/engine.ts
frontend/src/sync/localDb.ts
frontend/src/sync/resolutions.ts
frontend/src/sync/syncStatus.ts
frontend/src/sync/types.ts
frontend/src/theme-provider.tsx
frontend/src/theme.ts
frontend/src/theme/colors.ts
frontend/src/theme/dark.ts
frontend/src/theme/index.ts
frontend/src/theme/motion.ts
frontend/src/theme/tokens.ts
frontend/src/theme/typography.ts
frontend/test/analytics.test.ts
frontend/test/checkout.test.ts
frontend/test/crosscheck_local.ts
frontend/test/theme.test.ts
frontend/tsconfig.json
frontend/vite.config.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
podman-compose.yml
pyproject.toml
pytest.ini
samples/imports/README.md
samples/imports/customers-clean.csv
samples/imports/customers-storefront-export.csv
samples/imports/make_fixtures.py
samples/imports/orders-accounting-export.csv
samples/imports/orders-clean.csv
samples/imports/orders-with-errors.csv
samples/imports/products-clean.csv
samples/imports/products-messy-export.csv
samples/imports/products-with-errors.csv
samples/imports/products.xlsx
scripts/audit_ui_links.py
scripts/paystack_live_smoke.py
scripts/seed_demo.py
scripts/stress_test.py
supabase/README.md
supabase/config.toml
supabase/migrations/20261022000000_coop_schema.sql
supabase/migrations/20261022010000_storage_bucket.sql
supabase/scripts/check_connection.py
supabase/scripts/export_schema.py
tools/generate_license.py
tools/inspect_db_schema.py
website/README.md
website/index.html
website/package.json
website/public/README.md
website/public/logo.png
website/public/screenshots/.gitkeep
website/public/videos/.gitkeep
website/src/App.tsx
website/src/main.tsx
website/src/styles.css
website/src/theme.ts
website/tsconfig.json
website/vite.config.ts
```

## Reference material (not source)

```
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 1.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 10.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 11.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 12.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 13.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 14.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 15.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 16.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 17.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 18.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 2.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 3.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 4.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 5.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 6.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 7.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 8.txt
Documents/AFD/Co-op Application Flow Document (AFD) Chapter 9.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 1.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 10.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 11.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 12.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 13.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 14.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 15.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 16.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 17.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 18.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 2.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 3.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 4.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 5.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 6.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 7.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 8.txt
Documents/BSD/Co-op Backend Schema Document (BSD) Chapter 9.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 1.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 10.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 11.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 12.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 13.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 14.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 15.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 16.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 17.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 18.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 2.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 3.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 4.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 5.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 6.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 7.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 8.txt
Documents/IPD/Co-op Implementation Plan (IPD) Chapter 9.txt
Documents/PRD/Co-op Product Requirements Document Chapter 1.txt
Documents/PRD/Co-op Product Requirements Document Chapter 10.txt
Documents/PRD/Co-op Product Requirements Document Chapter 2.txt
Documents/PRD/Co-op Product Requirements Document Chapter 3.txt
Documents/PRD/Co-op Product Requirements Document Chapter 4.txt
Documents/PRD/Co-op Product Requirements Document Chapter 5.txt
Documents/PRD/Co-op Product Requirements Document Chapter 6.txt
Documents/PRD/Co-op Product Requirements Document Chapter 7.txt
Documents/PRD/Co-op Product Requirements Document Chapter 8.txt
Documents/PRD/Co-op Product Requirements Document Chapter 9.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 1.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 10.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 11.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 12.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 13.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 14.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 15.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 16.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 17.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 18.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 2.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 3.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 4.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 5.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 6.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 7.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 8.txt
Documents/TRD/Co-op Technical Requirements Document (TRD) Chapter 9.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 1.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 10.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 11.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 12.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 13.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 14.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 15.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 16.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 17.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 18.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 2.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 3.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 4.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 5.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 6.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 7.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 8.txt
Documents/UXDS/Co-op UXDS (User Experience Design Specification) Chapter 9.txt
stitch_coop_design_system_foundation/coop_adjust_stock_workflow/code.html
stitch_coop_design_system_foundation/coop_adjust_stock_workflow/screen.png
stitch_coop_design_system_foundation/coop_ai_business_assistant/code.html
stitch_coop_design_system_foundation/coop_ai_business_assistant/screen.png
stitch_coop_design_system_foundation/coop_ai_mobile/code.html
stitch_coop_design_system_foundation/coop_ai_mobile/screen.png
stitch_coop_design_system_foundation/coop_app_shell/code.html
stitch_coop_design_system_foundation/coop_app_shell/screen.png
stitch_coop_design_system_foundation/coop_billing_subscription_qa_polished/code.html
stitch_coop_design_system_foundation/coop_billing_subscription_qa_polished/screen.png
stitch_coop_design_system_foundation/coop_business_dashboard_qa_polished/code.html
stitch_coop_design_system_foundation/coop_business_dashboard_qa_polished/screen.png
stitch_coop_design_system_foundation/coop_ci_qa_audit_r7.md
stitch_coop_design_system_foundation/coop_component_library_documentation.md
stitch_coop_design_system_foundation/coop_create_order_workflow/code.html
stitch_coop_design_system_foundation/coop_create_order_workflow/screen.png
stitch_coop_design_system_foundation/coop_create_product/code.html
stitch_coop_design_system_foundation/coop_create_product/screen.png
stitch_coop_design_system_foundation/coop_customer_catalog_refactored/code.html
stitch_coop_design_system_foundation/coop_customer_catalog_refactored/screen.png
stitch_coop_design_system_foundation/coop_customer_details_qa_polished/code.html
stitch_coop_design_system_foundation/coop_customer_details_qa_polished/screen.png
stitch_coop_design_system_foundation/coop_customer_workflows_modals/code.html
stitch_coop_design_system_foundation/coop_customer_workflows_modals/screen.png
stitch_coop_design_system_foundation/coop_customers_mobile/code.html
stitch_coop_design_system_foundation/coop_customers_mobile/screen.png
stitch_coop_design_system_foundation/coop_dashboard_mobile_refactored/code.html
stitch_coop_design_system_foundation/coop_dashboard_mobile_refactored/screen.png
stitch_coop_design_system_foundation/coop_inventory_management_refactored/code.html
stitch_coop_design_system_foundation/coop_inventory_management_refactored/screen.png
stitch_coop_design_system_foundation/coop_inventory_mobile_refactored/code.html
stitch_coop_design_system_foundation/coop_inventory_mobile_refactored/screen.png
stitch_coop_design_system_foundation/coop_notification_center_global_alerts/code.html
stitch_coop_design_system_foundation/coop_notification_center_global_alerts/screen.png
stitch_coop_design_system_foundation/coop_notifications_refactored/code.html
stitch_coop_design_system_foundation/coop_notifications_refactored/screen.png
stitch_coop_design_system_foundation/coop_order_details_refactored/code.html
stitch_coop_design_system_foundation/coop_order_details_refactored/screen.png
stitch_coop_design_system_foundation/coop_orders_catalog_refactored/code.html
stitch_coop_design_system_foundation/coop_orders_catalog_refactored/screen.png
stitch_coop_design_system_foundation/coop_orders_mobile_refactored/code.html
stitch_coop_design_system_foundation/coop_orders_mobile_refactored/screen.png
stitch_coop_design_system_foundation/coop_payment_success_failure/code.html
stitch_coop_design_system_foundation/coop_payment_success_failure/screen.png
stitch_coop_design_system_foundation/coop_plan_comparison/code.html
stitch_coop_design_system_foundation/coop_plan_comparison/screen.png
stitch_coop_design_system_foundation/coop_pricing_plans_qa_polished/code.html
stitch_coop_design_system_foundation/coop_pricing_plans_qa_polished/screen.png
stitch_coop_design_system_foundation/coop_product_management_states/code.html
stitch_coop_design_system_foundation/coop_product_management_states/screen.png
stitch_coop_design_system_foundation/coop_products_catalog_refactored/code.html
stitch_coop_design_system_foundation/coop_products_catalog_refactored/screen.png
stitch_coop_design_system_foundation/coop_products_mobile_refactored/code.html
stitch_coop_design_system_foundation/coop_products_mobile_refactored/screen.png
stitch_coop_design_system_foundation/coop_purple/DESIGN.md
stitch_coop_design_system_foundation/coop_recover_account_refactored/code.html
stitch_coop_design_system_foundation/coop_recover_account_refactored/screen.png
stitch_coop_design_system_foundation/coop_shared_component_library/code.html
stitch_coop_design_system_foundation/coop_shared_component_library/screen.png
stitch_coop_design_system_foundation/coop_sign_in_mobile_refactored/code.html
stitch_coop_design_system_foundation/coop_sign_in_mobile_refactored/screen.png
stitch_coop_design_system_foundation/coop_sign_in_refactored/code.html
stitch_coop_design_system_foundation/coop_sign_in_refactored/screen.png
stitch_coop_design_system_foundation/coop_sign_up_refactored/code.html
stitch_coop_design_system_foundation/coop_sign_up_refactored/screen.png
stitch_coop_design_system_foundation/coop_system_error_states_polished/code.html
stitch_coop_design_system_foundation/coop_system_error_states_polished/screen.png
```
